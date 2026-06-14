import { Zap } from "lucide-react";

export function Logo({ size = 28, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="grid place-items-center rounded-xl gradient-primary shadow-glow"
        style={{ width: size + 8, height: size + 8 }}
      >
        <Zap className="text-white" size={size - 8} strokeWidth={2.5} fill="white" />
      </div>
      {withText && (
        <span className="font-display text-lg font-bold tracking-tight">
          Flash<span className="gradient-text">Drop</span>
        </span>
      )}
    </div>
  );
}
