import { type ReactNode } from "react";
import { useI18n } from "../lib/i18n";

export default function NeonCard({
  children, className = "",
}: { children: ReactNode; className?: string; glow?: string }) {
  return (
    <div
      className={`rounded-xl border border-line p-5 ${className}`}
      style={{
        background: "linear-gradient(180deg, #131316 0%, #0d0d10 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.045), 0 1px 2px rgba(0,0,0,0.4)",
      }}
    >
      {children}
    </div>
  );
}

export function HudTitle({ title, sub, tkey }: { title?: string; sub?: string; tkey?: string; width?: number }) {
  const { t } = useI18n();
  const tt = tkey ? t(`${tkey}.title`) : title;
  const ss = tkey ? t(`${tkey}.sub`) : sub;
  return (
    <div className="mb-6">
      <h1 className="text-[22px] font-semibold text-text tracking-tight">{tt}</h1>
      {ss && <p className="text-text-dim text-[13px] mt-1">{ss}</p>}
    </div>
  );
}
