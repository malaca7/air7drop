import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatDuration, formatSpeed } from "@/lib/format";
import { ArrowDownToLine, ArrowUpFromLine, Files } from "lucide-react";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Histórico — FlashDrop" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("air7drop_transfers")
        .select("*, transfer_files(name,size_bytes)")
        .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Histórico</h1>
        <p className="text-sm text-muted-foreground">Suas últimas 100 transferências.</p>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card className="glass border-glass-border"><CardContent className="p-10 text-center">
          <Files className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma transferência ainda. Crie sua primeira!</p>
        </CardContent></Card>
      )}
      <div className="space-y-3">
        {data?.map((t: any) => {
          const isSender = t.sender_id === user?.id;
          return (
            <Card key={t.id}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {isSender ? <ArrowUpFromLine className="size-4 text-primary" /> : <ArrowDownToLine className="size-4 text-success" />}
                  <span>{isSender ? "Enviado" : "Recebido"}</span>
                  <span className="font-mono text-xs text-muted-foreground">{t.short_code}</span>
                </CardTitle>
                <StatusBadge status={t.status} />
              </CardHeader>
              <CardContent className="pt-2">
                <div className="grid gap-2 sm:grid-cols-4 text-sm">
                  <Field label="Arquivos" value={t.file_count} />
                  <Field label="Tamanho" value={formatBytes(Number(t.total_bytes))} />
                  <Field label="Velocidade" value={t.avg_speed_bps ? formatSpeed(Number(t.avg_speed_bps)) : "—"} />
                  <Field label="Duração" value={formatDuration(t.duration_ms ?? 0)} />
                </div>
                {t.transfer_files?.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {t.transfer_files.slice(0, 5).map((f: any, i: number) => (
                      <li key={i} className="flex justify-between gap-3 truncate">
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0">{formatBytes(Number(f.size_bytes))}</span>
                      </li>
                    ))}
                    {t.transfer_files.length > 5 && <li>+ {t.transfer_files.length - 5} arquivos</li>}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString("pt-BR")}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    completed: { label: "Concluído", variant: "default" },
    pending: { label: "Pendente", variant: "secondary" },
    connected: { label: "Em transferência", variant: "secondary" },
    failed: { label: "Falhou", variant: "destructive" },
    expired: { label: "Expirado", variant: "outline" },
    cancelled: { label: "Cancelado", variant: "outline" },
  };
  const m = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
