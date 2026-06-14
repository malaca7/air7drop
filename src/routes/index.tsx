import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Zap, Lock, Wifi, Smartphone, QrCode, Infinity as InfinityIcon, ArrowRight, Cloud, ShieldCheck, Gauge } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FlashDrop — Envio instantâneo de arquivos via QR Code" },
      { name: "description", content: "Transferência P2P direta entre dispositivos. Até 50 GB, criptografia ponta a ponta, sem upload em servidor." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <Hero />
      <Features />
      <HowItWorks />
      <Cta />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 hero-bg pointer-events-none" />
      <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-24 sm:pt-28 sm:pb-32 text-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" /> P2P · WebRTC · E2E Encrypted
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.6 }}
          className="mt-6 text-balance text-5xl sm:text-7xl font-bold tracking-tight font-display">
          O <span className="gradient-text">AirDrop</span> da<br className="hidden sm:block" /> web moderna.
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }}
          className="mx-auto mt-6 max-w-2xl text-pretty text-base sm:text-lg text-muted-foreground">
          Escaneie um QR Code e envie qualquer arquivo, de qualquer tamanho, direto entre dois dispositivos.
          Sem upload em servidor. Sem limite artificial. Sem espera.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.6 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="gradient-primary text-white border-0 shadow-glow rounded-full h-12 px-7 text-base">
            <Link to="/send">Enviar arquivo <ArrowRight className="size-4" /></Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full h-12 px-7 text-base">
            <Link to="/auth">Criar conta grátis</Link>
          </Button>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.7 }}
          className="relative mx-auto mt-16 max-w-3xl">
          <div className="glass shadow-elevated rounded-3xl p-6 sm:p-10 noise">
            <div className="grid sm:grid-cols-[1fr_auto_1fr] items-center gap-6">
              <DeviceCard icon={<Smartphone className="size-6" />} label="iPhone de Lucas" sub="Pronto para enviar" />
              <div className="hidden sm:flex flex-col items-center gap-2">
                <div className="grid size-14 place-items-center rounded-full gradient-primary text-white shadow-glow pulse-ring">
                  <Zap className="size-6" fill="currentColor" />
                </div>
                <span className="text-xs text-muted-foreground">82 MB/s</span>
              </div>
              <DeviceCard icon={<QrCode className="size-6" />} label="MacBook Pro" sub="Recebendo · 64%" progress={64} />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function DeviceCard({ icon, label, sub, progress }: { icon: React.ReactNode; label: string; sub: string; progress?: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-secondary text-foreground">{icon}</div>
        <div className="min-w-0">
          <div className="font-medium truncate">{label}</div>
          <div className="text-xs text-muted-foreground truncate">{sub}</div>
        </div>
      </div>
      {progress != null && (
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full gradient-primary" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

function Features() {
  const items = [
    { icon: Lock, title: "Ponta a ponta", desc: "Criptografia WebRTC nativa. Só o destinatário lê os dados." },
    { icon: Cloud, title: "Zero servidor", desc: "Arquivos não tocam nossa infraestrutura. Apenas metadados." },
    { icon: InfinityIcon, title: "Até 50 GB", desc: "Chunking inteligente para arquivos enormes sem travar o navegador." },
    { icon: Gauge, title: "Velocidade real", desc: "Roda na velocidade da sua rede local ou da sua banda." },
    { icon: ShieldCheck, title: "Senha opcional", desc: "Proteja o envio com PIN, aprovação manual e expiração automática." },
    { icon: Wifi, title: "Funciona em qualquer lugar", desc: "Wi-Fi, 4G ou diferentes redes — basta ter internet." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="text-center">
        <h2 className="text-3xl sm:text-4xl font-bold">Por que FlashDrop?</h2>
        <p className="mt-3 text-muted-foreground">Desenhado para velocidade, simplicidade e privacidade.</p>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((f) => (
          <div key={f.title} className="glass rounded-2xl p-6 transition-all hover:-translate-y-0.5 hover:shadow-elevated">
            <div className="grid size-11 place-items-center rounded-xl gradient-primary text-white shadow-glow">
              <f.icon className="size-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Solte os arquivos", d: "Arraste, selecione pastas ou múltiplos arquivos." },
    { n: "02", t: "Compartilhe o QR", d: "Mostre o código ou envie o link. Códigos curtos também funcionam." },
    { n: "03", t: "Pronto", d: "O destinatário recebe direto. Acompanhe progresso e velocidade em tempo real." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="text-center">
        <h2 className="text-3xl sm:text-4xl font-bold">Em três passos.</h2>
      </div>
      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="rounded-2xl border border-border p-6">
            <div className="font-mono text-sm text-muted-foreground">{s.n}</div>
            <h3 className="mt-2 text-xl font-semibold">{s.t}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24">
      <div className="relative overflow-hidden rounded-3xl gradient-primary p-10 sm:p-16 text-center text-white shadow-elevated">
        <div className="absolute inset-0 noise opacity-30" />
        <h2 className="relative text-3xl sm:text-5xl font-bold">Pronto para enviar?</h2>
        <p className="relative mx-auto mt-3 max-w-xl text-white/85">Comece agora. Sem instalação, sem cartão, sem espera.</p>
        <div className="relative mt-7">
          <Button asChild size="lg" className="bg-white text-foreground hover:bg-white/90 rounded-full h-12 px-7 text-base font-semibold">
            <Link to="/send">Abrir o FlashDrop</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
        <div>© {new Date().getFullYear()} FlashDrop</div>
        <div className="flex gap-4">
          <Link to="/auth">Entrar</Link>
          <a href="#" className="hover:text-foreground">Privacidade</a>
        </div>
      </div>
    </footer>
  );
}
