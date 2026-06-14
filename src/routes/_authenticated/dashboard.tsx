import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBytes, formatSpeed } from "@/lib/format";
import { ArrowRight, FileUp, History, Activity, HardDrive, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — FlashDrop" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const { data: stats } = useQuery({
    queryKey: ["stats", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("air7drop_transfers")
        .select("status,total_bytes,file_count,avg_speed_bps,duration_ms")
        .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`);
      if (error) throw error;
      const completed = data.filter((d) => d.status === "completed");
      const totalBytes = completed.reduce((a, d) => a + Number(d.total_bytes ?? 0), 0);
      const totalFiles = completed.reduce((a, d) => a + (d.file_count ?? 0), 0);
      const avgSpeed = completed.length
        ? completed.reduce((a, d) => a + Number(d.avg_speed_bps ?? 0), 0) / completed.length
        : 0;
      return {
        transfers: data.length,
        completed: completed.length,
        totalBytes,
        totalFiles,
        avgSpeed,
      };
    },
    enabled: !!user,
  });

  const greeting = (user?.user_metadata?.full_name as string)?.split(" ")[0] ?? "olá";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Bem-vindo de volta,</p>
          <h1 className="text-3xl sm:text-4xl font-bold capitalize">{greeting} 👋</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild className="gradient-primary text-white border-0 shadow-glow rounded-full">
            <Link to="/send"><FileUp className="size-4" /> Enviar agora</Link>
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Activity className="size-5" />} label="Transferências" value={stats?.transfers ?? 0} />
        <StatCard icon={<HardDrive className="size-5" />} label="Total transferido" value={formatBytes(stats?.totalBytes ?? 0)} />
        <StatCard icon={<FileUp className="size-5" />} label="Arquivos enviados" value={stats?.totalFiles ?? 0} />
        <StatCard icon={<Zap className="size-5" />} label="Velocidade média" value={formatSpeed(stats?.avgSpeed ?? 0)} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card className="glass border-glass-border lg:col-span-2">
          <CardHeader>
            <CardTitle>Comece uma transferência</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Crie uma sessão e mostre o QR Code para o outro dispositivo. Tudo flui direto entre vocês — nada passa por nossos servidores.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild className="gradient-primary text-white border-0"><Link to="/send"><FileUp className="size-4" /> Nova sessão</Link></Button>
              <Button asChild variant="outline"><Link to="/history"><History className="size-4" /> Ver histórico <ArrowRight className="size-4" /></Link></Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Economia</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold gradient-text">{formatBytes(stats?.totalBytes ?? 0)}</div>
            <p className="mt-1 text-sm text-muted-foreground">de espaço economizado em nuvem com transferência direta P2P.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card className="glass border-glass-border">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl gradient-primary text-white shadow-glow">{icon}</div>
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-xl font-semibold">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
