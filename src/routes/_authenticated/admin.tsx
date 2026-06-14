import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes, formatSpeed } from "@/lib/format";
import { ShieldAlert, Users, Activity, HardDrive } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — FlashDrop" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [profiles, transfers, logs] = await Promise.all([
        supabase.from("air7drop_profiles").select("id", { count: "exact", head: true }),
        supabase.from("air7drop_transfers").select("status,total_bytes,avg_speed_bps,file_count"),
        supabase.from("air7drop_transfer_logs").select("event,created_at").order("created_at",{ascending:false}).limit(20),
      ]);
      const all = transfers.data ?? [];
      return {
        users: profiles.count ?? 0,
        transfers: all.length,
        completed: all.filter((t: any) => t.status === "completed").length,
        totalBytes: all.reduce((a: number, t: any) => a + Number(t.total_bytes ?? 0), 0),
        avgSpeed: all.length ? all.reduce((a: number, t: any) => a + Number(t.avg_speed_bps ?? 0), 0) / all.length : 0,
        logs: logs.data ?? [],
      };
    },
    enabled: isAdmin,
  });

  if (loading) return null;
  if (!isAdmin) return (
    <main className="mx-auto max-w-3xl px-4 py-20 text-center">
      <ShieldAlert className="mx-auto size-12 text-muted-foreground" />
      <h1 className="mt-4 text-2xl font-bold">Acesso restrito</h1>
      <p className="mt-2 text-muted-foreground">Apenas administradores podem ver essa página.</p>
    </main>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold">Painel admin</h1>
      <p className="text-sm text-muted-foreground">Métricas globais e logs do sistema.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Users className="size-5"/>} label="Usuários" value={stats?.users ?? 0} />
        <Stat icon={<Activity className="size-5"/>} label="Transferências" value={stats?.transfers ?? 0} />
        <Stat icon={<HardDrive className="size-5"/>} label="Total transferido" value={formatBytes(stats?.totalBytes ?? 0)} />
        <Stat icon={<Activity className="size-5"/>} label="Vel. média" value={formatSpeed(stats?.avgSpeed ?? 0)} />
      </div>
      <Card className="mt-8">
        <CardHeader><CardTitle>Eventos recentes</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {stats?.logs?.map((l: any, i: number) => (
              <li key={i} className="flex justify-between border-b border-border pb-1">
                <span className="font-mono">{l.event}</span>
                <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card className="glass border-glass-border"><CardContent className="p-5 flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-xl gradient-primary text-white shadow-glow">{icon}</div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold">{value}</div></div>
    </CardContent></Card>
  );
}
