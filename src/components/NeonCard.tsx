import { type ReactNode } from "react";

export default function NeonCard({
  children, className = "",
}: { children: ReactNode; className?: string; glow?: string }) {
  return (
    <div className={`neon-card rounded-xl border border-line p-5 ${className}`}>
      {children}
    </div>
  );
}
