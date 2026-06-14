import { Link, useRouter } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, LayoutDashboard, Upload, History, ShieldCheck } from "lucide-react";

export function AppHeader() {
  const { user, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const initials = (user?.user_metadata?.full_name as string | undefined)?.split(" ").map(p => p[0]).slice(0,2).join("") ?? user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <header className="sticky top-0 z-40 glass">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/"><Logo /></Link>
        <nav className="hidden items-center gap-1 md:flex">
          {user && (<>
            <Button asChild variant="ghost" size="sm"><Link to="/dashboard"><LayoutDashboard className="size-4" />Dashboard</Link></Button>
            <Button asChild variant="ghost" size="sm"><Link to="/send"><Upload className="size-4" />Enviar</Link></Button>
            <Button asChild variant="ghost" size="sm"><Link to="/history"><History className="size-4" />Histórico</Link></Button>
            {isAdmin && <Button asChild variant="ghost" size="sm"><Link to="/admin"><ShieldCheck className="size-4" />Admin</Link></Button>}
          </>)}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full outline-none ring-ring focus-visible:ring-2">
                  <Avatar className="size-9 border border-border">
                    <AvatarImage src={user.user_metadata?.avatar_url} />
                    <AvatarFallback className="gradient-primary text-white text-xs font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/dashboard"><LayoutDashboard className="size-4" /> Dashboard</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/send"><Upload className="size-4" /> Enviar</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/history"><History className="size-4" /> Histórico</Link></DropdownMenuItem>
                {isAdmin && <DropdownMenuItem asChild><Link to="/admin"><ShieldCheck className="size-4" /> Admin</Link></DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => { await signOut(); router.navigate({ to: "/" }); }}>
                  <LogOut className="size-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm" className="gradient-primary text-white border-0 shadow-glow">
              <Link to="/auth">Entrar</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
