import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { detectDevice, formatBytes, formatEta, formatSpeed } from "@/lib/format";
import { CHUNK_SIZE, createSignalingChannel, makePeer, type ControlMessage, type FileMeta, type SignalingMessage } from "@/lib/webrtc";
import { toast } from "sonner";
import { Download, Loader2, Lock, ShieldX, Wifi, Zap, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/r/$code")({
  head: () => ({ meta: [{ title: "Receber — FlashDrop" }] }),
  component: ReceivePage,
});

type Phase = "loading" | "expired" | "locked" | "ready" | "connecting" | "transferring" | "done" | "failed";

function ReceivePage() {
  const { code } = useParams({ from: "/_authenticated/r/$code" });
  const { user } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [transfer, setTransfer] = useState<any>(null);
  const [pin, setPin] = useState("");
  const [manifest, setManifest] = useState<FileMeta[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [transferred, setTransferred] = useState(0);
  const [received, setReceived] = useState<{ name: string; url: string; size: number }[]>([]);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const sigRef = useRef<ReturnType<typeof createSignalingChannel> | null>(null);
  const currentFileRef = useRef<{ meta: FileMeta; chunks: ArrayBuffer[]; bytes: number } | null>(null);
  const startTimeRef = useRef(0);
  const totalRef = useRef(0);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("air7drop_transfers").select("*").eq("short_code", code).maybeSingle();
      if (error || !data) { setPhase("failed"); return; }
      setTransfer(data);
      if (new Date(data.expires_at) < new Date()) { setPhase("expired"); return; }
      if (data.status === "completed") { setPhase("expired"); return; }
      setPhase(data.password_hash ? "locked" : "ready");
    })();
    return () => cleanup();
  }, [code]);

  async function unlock() {
    if (pin !== transfer.password_hash) return toast.error("PIN incorreto");
    setPhase("ready");
  }

  async function connect() {
    setPhase("connecting");
    try {
      // Claim as receiver
      await supabase.from("air7drop_transfers").update({ receiver_id: user!.id, receiver_device: detectDevice(), status: "connected" }).eq("id", transfer.id);
      await supabase.from("air7drop_transfer_logs").insert({ transfer_id: transfer.id, user_id: user!.id, event: "receiver_joined", metadata: { device: detectDevice() } });

      const sig = createSignalingChannel(code);
      sigRef.current = sig;
      sig.on("broadcast", { event: "msg" }, ({ payload }: any) => handleSignal(payload));
      await sig.subscribe(async (status) => {
        if (status === "SUBSCRIBED") sendSig({ type: "hello", role: "receiver", device: detectDevice() });
      });
    } catch (e: any) {
      console.error(e);
      toast.error("Falha ao conectar", { description: e.message });
      setPhase("failed");
    }
  }

  function sendSig(msg: SignalingMessage) {
    sigRef.current?.send({ type: "broadcast", event: "msg", payload: msg });
  }

  async function handleSignal(msg: SignalingMessage) {
    if (msg.type === "offer") {
      const pc = makePeer();
      peerRef.current = pc;
      pc.onicecandidate = (e) => { if (e.candidate) sendSig({ type: "ice", candidate: e.candidate.toJSON() }); };
      pc.ondatachannel = (ev) => {
        const dc = ev.channel;
        dc.binaryType = "arraybuffer";
        channelRef.current = dc;
        dc.onopen = () => { startTimeRef.current = performance.now(); };
        dc.onmessage = onChannelMessage;
      };
      await pc.setRemoteDescription(msg.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSig({ type: "answer", sdp: answer });
    } else if (msg.type === "ice") {
      try { await peerRef.current?.addIceCandidate(msg.candidate); } catch {}
    }
  }

  let lastTick = 0, lastBytes = 0;
  function onChannelMessage(ev: MessageEvent) {
    if (typeof ev.data === "string") {
      try {
        const m = JSON.parse(ev.data);
        if (!m.__ctrl) return;
        const ctrl = m as ControlMessage;
        if (ctrl.type === "manifest") {
          setManifest(ctrl.files); setTotalBytes(ctrl.totalSize); setPhase("transferring");
          // auto-accept (approval handled on sender side via require_approval flag)
          channelRef.current?.send(JSON.stringify({ __ctrl: true, type: "accept" }));
        } else if (ctrl.type === "file-start") {
          const meta = manifest.find(f => f.id === ctrl.id) ?? null;
          if (meta) currentFileRef.current = { meta, chunks: [], bytes: 0 };
        } else if (ctrl.type === "file-end") {
          const cur = currentFileRef.current;
          if (cur) {
            const blob = new Blob(cur.chunks, { type: cur.meta.type });
            const url = URL.createObjectURL(blob);
            setReceived(prev => [...prev, { name: cur.meta.name, url, size: cur.meta.size }]);
            // trigger automatic download
            const a = document.createElement("a"); a.href = url; a.download = cur.meta.name; document.body.appendChild(a); a.click(); a.remove();
            currentFileRef.current = null;
          }
        } else if (ctrl.type === "all-done") {
          const duration = performance.now() - startTimeRef.current;
          supabase.from("air7drop_transfers").update({ status: "completed", completed_at: new Date().toISOString(), duration_ms: Math.round(duration) }).eq("id", transfer.id).then();
          supabase.from("air7drop_transfer_logs").insert({ transfer_id: transfer.id, user_id: user!.id, event: "completed_receiver" }).then();
          setProgress(100);
          setPhase("done");
        }
      } catch {}
      return;
    }
    // binary chunk
    const buf = ev.data as ArrayBuffer;
    const cur = currentFileRef.current;
    if (cur) {
      cur.chunks.push(buf);
      cur.bytes += buf.byteLength;
    }
    totalRef.current += buf.byteLength;
    setTransferred(totalRef.current);

    const now = performance.now();
    if (now - lastTick > 250) {
      const delta = totalRef.current - lastBytes;
      const sp = (delta * 1000) / (now - lastTick);
      setSpeed(sp);
      setProgress((totalRef.current / totalBytes) * 100);
      setEta((totalBytes - totalRef.current) / Math.max(sp, 1));
      lastBytes = totalRef.current; lastTick = now;
    }
  }

  function cleanup() {
    channelRef.current?.close();
    peerRef.current?.close();
    sigRef.current && supabase.removeChannel(sigRef.current);
  }

  if (phase === "loading") return <main className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></main>;

  if (phase === "expired" || phase === "failed") return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <ShieldX className="mx-auto size-12 text-destructive" />
      <h1 className="mt-4 text-2xl font-bold">{phase === "expired" ? "Sessão expirada" : "Não foi possível abrir"}</h1>
      <p className="mt-2 text-muted-foreground">Peça ao remetente para gerar um novo código.</p>
      <Button className="mt-6" onClick={() => navigate({ to: "/dashboard" })}>Voltar</Button>
    </main>
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Card className="glass border-glass-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wifi className="size-5 text-primary" /> Receber arquivos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            Código: <span className="font-mono font-bold gradient-text text-base">{code}</span>
          </div>

          {phase === "locked" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm"><Lock className="size-4" /> Esta transferência exige um PIN.</div>
              <div className="space-y-1.5">
                <Label htmlFor="pin">PIN</Label>
                <Input id="pin" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g,""))} />
              </div>
              <Button onClick={unlock} className="gradient-primary text-white border-0 w-full">Desbloquear</Button>
            </div>
          )}

          {phase === "ready" && (
            <div className="space-y-4">
              <p className="text-sm">Pronto para receber {transfer.file_count} arquivo(s) · {formatBytes(Number(transfer.total_bytes))}</p>
              <Button onClick={connect} className="gradient-primary text-white border-0 w-full h-11 shadow-glow"><Zap className="size-4" /> Conectar e receber</Button>
            </div>
          )}

          {(phase === "connecting" || phase === "transferring" || phase === "done") && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {phase === "connecting" && <Badge variant="secondary" className="gap-1.5"><Loader2 className="size-3 animate-spin" /> Conectando…</Badge>}
                {phase === "transferring" && <Badge className="gap-1.5 gradient-primary border-0"><Zap className="size-3" /> Recebendo</Badge>}
                {phase === "done" && <Badge className="bg-success text-success-foreground gap-1.5"><CheckCircle2 className="size-3" /> Concluído</Badge>}
              </div>
              <Progress value={progress} className="h-2" />
              <div className="grid grid-cols-3 gap-3 text-sm">
                <Stat label="Progresso" value={`${progress.toFixed(1)}%`} />
                <Stat label="Velocidade" value={formatSpeed(speed)} />
                <Stat label="Restante" value={formatEta(eta)} />
              </div>
              <div className="text-xs text-muted-foreground">Recebido: {formatBytes(transferred)} / {formatBytes(totalBytes)}</div>

              {received.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Arquivos baixados</h4>
                  <ul className="space-y-1.5">
                    {received.map((f, i) => (
                      <li key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                        <span className="truncate">{f.name}</span>
                        <a href={f.url} download={f.name} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Download className="size-3.5" /> {formatBytes(f.size)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}
