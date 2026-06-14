import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "@/hooks/use-dropzone";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { detectDevice, formatBytes, formatEta, formatSpeed, shortCode } from "@/lib/format";
import { CHUNK_SIZE, BUFFER_HIGH, BUFFER_LOW, createSignalingChannel, makePeer, type ControlMessage, type FileMeta, type SignalingMessage } from "@/lib/webrtc";
import { toast } from "sonner";
import { Copy, FileUp, Link2, QrCode as QrIcon, Trash2, UploadCloud, X, Zap } from "lucide-react";
import QRCode from "qrcode";

export const Route = createFileRoute("/_authenticated/send")({
  head: () => ({ meta: [{ title: "Enviar — FlashDrop" }] }),
  component: SendPage,
});

type Phase = "idle" | "waiting" | "connecting" | "transferring" | "done" | "failed";

function SendPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [pin, setPin] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [expiry, setExpiry] = useState("900"); // seconds
  const [phase, setPhase] = useState<Phase>("idle");
  const [code, setCode] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [transferred, setTransferred] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [receiverDevice, setReceiverDevice] = useState<string | null>(null);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const sigRef = useRef<ReturnType<typeof createSignalingChannel> | null>(null);
  const transferIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const totalRef = useRef(0);

  const totalBytes = files.reduce((a, f) => a + f.size, 0);

  const onDrop = useCallback((dropped: File[]) => {
    setFiles((prev) => [...prev, ...dropped]);
  }, []);
  const { getRootProps, getInputProps, isDragActive, openPicker } = useDropzone({ onDrop });

  async function startSession() {
    if (files.length === 0) return toast.error("Adicione pelo menos um arquivo");
    setPhase("waiting");
    try {
      const sc = shortCode(6);
      const expires_at = new Date(Date.now() + Number(expiry) * 1000).toISOString();
      const { data: row, error } = await supabase.from("air7drop_transfers").insert({
        short_code: sc, sender_id: user!.id, status: "pending",
        total_bytes: totalBytes, file_count: files.length,
        password_hash: pin ? pin : null, // demo: stored in cleartext metadata; real impl would hash
        require_approval: requireApproval, expires_at,
        sender_device: detectDevice(),
      }).select().single();
      if (error) throw error;
      transferIdRef.current = row.id;

      const fileRows = files.map((f) => ({
        transfer_id: row.id, name: f.name, mime_type: f.type, size_bytes: f.size, status: "pending",
      }));
      await supabase.from("air7drop_transfer_files").insert(fileRows);
      await supabase.from("air7drop_transfer_logs").insert({ transfer_id: row.id, user_id: user!.id, event: "session_created", metadata: { device: detectDevice() } });

      setCode(sc);
      const link = `${window.location.origin}/r/${sc}`;
      setShareLink(link);
      setQrUrl(await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 1, width: 320, color: { dark: "#0a0a14", light: "#ffffff" } }));

      // Open signaling channel
      const sig = createSignalingChannel(sc);
      sigRef.current = sig;
      sig.on("broadcast", { event: "msg" }, ({ payload }: any) => handleSignal(payload, sc));
      await sig.subscribe();
    } catch (e: any) {
      console.error(e);
      toast.error("Falha ao criar sessão", { description: e.message });
      setPhase("idle");
    }
  }

  async function handleSignal(msg: SignalingMessage, sc: string) {
    if (msg.type === "hello" && msg.role === "receiver") {
      setReceiverDevice(msg.device ?? "Dispositivo");
      setPhase("connecting");
      // Create peer + channel as sender
      const pc = makePeer();
      peerRef.current = pc;
      const dc = pc.createDataChannel("flashdrop", { ordered: true });
      dc.binaryType = "arraybuffer";
      dc.bufferedAmountLowThreshold = BUFFER_LOW;
      channelRef.current = dc;
      dc.onopen = () => startTransfer();
      dc.onerror = (e) => { console.error(e); setPhase("failed"); toast.error("Erro no canal"); };
      pc.onicecandidate = (e) => { if (e.candidate) sendSig({ type: "ice", candidate: e.candidate.toJSON() }); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSig({ type: "offer", sdp: offer });
    } else if (msg.type === "answer") {
      await peerRef.current?.setRemoteDescription(msg.sdp);
    } else if (msg.type === "ice") {
      try { await peerRef.current?.addIceCandidate(msg.candidate); } catch {}
    } else if (msg.type === "bye") {
      cleanup();
    }
  }

  function sendSig(msg: SignalingMessage) {
    sigRef.current?.send({ type: "broadcast", event: "msg", payload: msg });
  }

  async function startTransfer() {
    const dc = channelRef.current!;
    setPhase("transferring");
    startTimeRef.current = performance.now();
    totalRef.current = 0;

    const fileMetas: FileMeta[] = files.map((f, i) => ({ id: `f${i}`, name: f.name, type: f.type, size: f.size }));
    sendCtrl({ type: "manifest", files: fileMetas, totalSize: totalBytes });

    // Wait for accept if required
    if (requireApproval) {
      await waitFor((m: ControlMessage) => m.type === "accept" || m.type === "reject");
    }

    let lastTick = performance.now();
    let lastBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = fileMetas[i];
      sendCtrl({ type: "file-start", id: meta.id });
      setCurrentFile(file.name);

      let offset = 0;
      while (offset < file.size) {
        if (dc.bufferedAmount > BUFFER_HIGH) {
          await new Promise<void>((r) => { dc.onbufferedamountlow = () => { dc.onbufferedamountlow = null; r(); }; });
        }
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buf = await slice.arrayBuffer();
        dc.send(buf);
        offset += buf.byteLength;
        totalRef.current += buf.byteLength;
        setTransferred(totalRef.current);

        const now = performance.now();
        if (now - lastTick > 250) {
          const delta = totalRef.current - lastBytes;
          const sp = (delta * 1000) / (now - lastTick);
          setSpeed(sp);
          setProgress((totalRef.current / totalBytes) * 100);
          const remaining = (totalBytes - totalRef.current) / Math.max(sp, 1);
          setEta(remaining);
          lastBytes = totalRef.current;
          lastTick = now;
        }
      }
      sendCtrl({ type: "file-end", id: meta.id });
    }
    sendCtrl({ type: "all-done" });

    const duration = performance.now() - startTimeRef.current;
    const avgSpeed = (totalBytes * 1000) / duration;

    await supabase.from("air7drop_transfers").update({
      status: "completed",
      transferred_bytes: totalBytes,
      duration_ms: Math.round(duration),
      avg_speed_bps: Math.round(avgSpeed),
      completed_at: new Date().toISOString(),
      receiver_device: receiverDevice,
    }).eq("id", transferIdRef.current!);
    await supabase.from("air7drop_transfer_logs").insert({ transfer_id: transferIdRef.current!, user_id: user!.id, event: "completed", metadata: { duration_ms: Math.round(duration), bytes: totalBytes } });

    setProgress(100);
    setPhase("done");
  }

  function sendCtrl(msg: ControlMessage) {
    channelRef.current?.send(JSON.stringify({ __ctrl: true, ...msg }));
  }

  const ctrlListeners = useRef<((m: ControlMessage) => void)[]>([]);
  function waitFor(predicate: (m: ControlMessage) => boolean) {
    return new Promise<ControlMessage>((resolve) => {
      const fn = (m: ControlMessage) => { if (predicate(m)) { ctrlListeners.current = ctrlListeners.current.filter(x => x !== fn); resolve(m); } };
      ctrlListeners.current.push(fn);
    });
  }
  useEffect(() => {
    const dc = channelRef.current;
    if (!dc) return;
    const onMsg = (ev: MessageEvent) => {
      if (typeof ev.data === "string") {
        try { const m = JSON.parse(ev.data); if (m.__ctrl) ctrlListeners.current.forEach(fn => fn(m as ControlMessage)); } catch {}
      }
    };
    dc.addEventListener("message", onMsg);
    return () => dc.removeEventListener("message", onMsg);
  }, [phase]);

  function cleanup() {
    channelRef.current?.close();
    peerRef.current?.close();
    sigRef.current && supabase.removeChannel(sigRef.current);
    channelRef.current = null;
    peerRef.current = null;
    sigRef.current = null;
  }

  useEffect(() => () => cleanup(), []);

  function reset() {
    cleanup();
    setFiles([]); setPin(""); setRequireApproval(false);
    setPhase("idle"); setCode(null); setQrUrl(null); setShareLink(null);
    setProgress(0); setSpeed(0); setEta(0); setTransferred(0); setCurrentFile(null); setReceiverDevice(null);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Enviar arquivos</h1>
        <p className="text-sm text-muted-foreground">Direto, criptografado e sem upload em servidor.</p>
      </div>

      {phase === "idle" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card className="glass border-glass-border">
            <CardHeader><CardTitle>1. Seus arquivos</CardTitle></CardHeader>
            <CardContent>
              <div {...getRootProps()}
                className={`relative grid place-items-center rounded-2xl border-2 border-dashed p-10 text-center transition-all ${isDragActive ? "border-primary bg-primary/5" : "border-border"}`}>
                <input {...getInputProps()} />
                <UploadCloud className="size-10 text-muted-foreground" />
                <p className="mt-3 font-medium">Arraste arquivos ou pastas</p>
                <p className="text-xs text-muted-foreground">ou clique para selecionar — até 50 GB no total</p>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={openPicker}>Selecionar</Button>
              </div>
              {files.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{files.length} arquivo(s) · {formatBytes(totalBytes)}</span>
                    <Button size="sm" variant="ghost" onClick={() => setFiles([])}><Trash2 className="size-4" /> Limpar</Button>
                  </div>
                  <ul className="max-h-64 space-y-1 overflow-auto rounded-xl border border-border p-2">
                    {files.map((f, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                        <span className="truncate">{f.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                          <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>2. Segurança</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pin">PIN (opcional)</Label>
                <Input id="pin" inputMode="numeric" maxLength={8} placeholder="ex.: 4828" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="approval">Aprovação manual</Label>
                  <p className="text-xs text-muted-foreground">Confirmar antes do envio</p>
                </div>
                <Switch id="approval" checked={requireApproval} onCheckedChange={setRequireApproval} />
              </div>
              <div className="space-y-1.5">
                <Label>Expira em</Label>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="300">5 minutos</SelectItem>
                    <SelectItem value="900">15 minutos</SelectItem>
                    <SelectItem value="3600">1 hora</SelectItem>
                    <SelectItem value="86400">24 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={startSession} disabled={files.length === 0} className="w-full gradient-primary text-white border-0 shadow-glow h-11 rounded-xl">
                <Zap className="size-4" /> Gerar QR Code
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {phase !== "idle" && (
        <Card className="glass border-glass-border">
          <CardContent className="p-8">
            <div className="grid gap-8 lg:grid-cols-[auto_1fr] items-start">
              <div className="flex flex-col items-center">
                {qrUrl && (
                  <div className="rounded-2xl bg-white p-3 shadow-elevated">
                    <img src={qrUrl} width={260} height={260} alt="QR Code" className="rounded-xl" />
                  </div>
                )}
                <div className="mt-4 font-mono text-3xl font-bold tracking-widest gradient-text">{code}</div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  {phase === "waiting" && <Badge variant="secondary" className="gap-1.5"><span className="size-1.5 animate-pulse rounded-full bg-primary" /> Aguardando destinatário</Badge>}
                  {phase === "connecting" && <Badge className="gap-1.5 gradient-primary border-0"><span className="size-1.5 animate-pulse rounded-full bg-white" /> Conectando…</Badge>}
                  {phase === "transferring" && <Badge className="gap-1.5 gradient-primary border-0"><Zap className="size-3" /> Transferindo</Badge>}
                  {phase === "done" && <Badge className="bg-success text-success-foreground">Concluído</Badge>}
                  {phase === "failed" && <Badge variant="destructive">Falhou</Badge>}
                </div>

                <h2 className="mt-3 text-2xl font-semibold">{phase === "done" ? "Tudo enviado!" : "Compartilhe para começar"}</h2>
                <p className="text-sm text-muted-foreground">Escaneie o QR Code no outro dispositivo ou use o link/código abaixo.</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(shareLink!); toast.success("Link copiado"); }}>
                    <Link2 className="size-4" /> Copiar link
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(code!); toast.success("Código copiado"); }}>
                    <Copy className="size-4" /> Copiar código
                  </Button>
                </div>

                {receiverDevice && <p className="mt-4 text-sm">Destinatário: <span className="font-medium">{receiverDevice}</span></p>}
                {currentFile && <p className="mt-1 text-sm text-muted-foreground truncate">Enviando: {currentFile}</p>}

                {(phase === "transferring" || phase === "done") && (
                  <div className="mt-5 space-y-3">
                    <Progress value={progress} className="h-2" />
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <Stat label="Progresso" value={`${progress.toFixed(1)}%`} />
                      <Stat label="Velocidade" value={formatSpeed(speed)} />
                      <Stat label="Restante" value={formatEta(eta)} />
                      <Stat label="Enviado" value={formatBytes(transferred)} />
                      <Stat label="Total" value={formatBytes(totalBytes)} />
                      <Stat label="Arquivos" value={files.length} />
                    </div>
                  </div>
                )}

                <div className="mt-6 flex gap-2">
                  {phase === "done" && <Button onClick={reset} className="gradient-primary text-white border-0"><FileUp className="size-4" /> Nova transferência</Button>}
                  {phase !== "done" && <Button variant="outline" onClick={reset}>Cancelar</Button>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}
