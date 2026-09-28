// Kit de piezas comunes del diseño "limpio / premium". Todas las secciones usan
// estas piezas para verse iguales: encabezado con acciones, listas con filas,
// interruptores, casillas, etiquetas, registro, estados vacíos y tarjetas de acción.
import { type ReactNode, forwardRef } from "react";
import { motion } from "framer-motion";
import { useI18n } from "../lib/i18n";

/** Página: encabezado (título, subtítulo, acciones a la derecha) + contenido.
 *  `scroll` = la página entera scrollea; si no, el contenido maneja su propio scroll. */
export function Page({ tkey, title, sub, actions, children, scroll = false }: {
  tkey?: string; title?: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode; scroll?: boolean;
}) {
  const { t } = useI18n();
  const tt = tkey ? t(`${tkey}.title`) : title;
  const ss = sub ?? (tkey ? t(`${tkey}.sub`) : undefined);
  return (
    <div className={`h-full flex flex-col px-8 pt-3 pb-6 ${scroll ? "overflow-y-auto" : "overflow-hidden"}`}>
      <header className="flex items-end justify-between gap-6 mb-6 shrink-0">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold text-text tracking-[-0.02em]">{tt}</h1>
          {ss && <p className="text-text-mute text-[13.5px] mt-1.5">{ss}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

/** Título chico de un bloque, con contador o acción opcional a la derecha. */
export function SectionTitle({ children, right, dot }: { children: ReactNode; right?: ReactNode; dot?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 min-h-[22px]">
      {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />}
      <h2 className="text-[12px] font-medium text-text-dim">{children}</h2>
      {right && <div className="ml-auto flex items-center gap-2 text-[12px] text-text-mute">{right}</div>}
    </div>
  );
}

/** Contenedor de filas con separadores. */
export function List({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden ${className}`}>{children}</div>;
}

/** Fila de lista: ícono opcional, título, descripción y control a la derecha. */
export function Row({ icon, title, desc, right, onClick, muted, active, className = "" }: {
  icon?: ReactNode; title: ReactNode; desc?: ReactNode; right?: ReactNode;
  onClick?: () => void; muted?: boolean; active?: boolean; className?: string;
}) {
  return (
    <div onClick={onClick}
      className={`group flex items-center gap-3 px-4 py-2.5 min-h-[44px] transition-colors
        ${onClick ? "cursor-pointer hover:bg-white/[0.025]" : ""} ${active ? "bg-accent/[0.04]" : ""} ${className}`}>
      {icon && <div className="shrink-0 flex items-center">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className={`text-[13.5px] truncate ${muted ? "text-text-mute" : "text-text"}`}>{title}</div>
        {desc && <div className="text-[12px] text-text-mute truncate mt-0.5">{desc}</div>}
      </div>
      {right && <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>{right}</div>}
    </div>
  );
}

/** Interruptor on/off. */
export function Switch({ on, onChange, disabled, size = "md", label }: {
  on: boolean; onChange: (v: boolean) => void; disabled?: boolean; size?: "sm" | "md"; label?: string;
}) {
  const w = size === "sm" ? 34 : 40, h = size === "sm" ? 20 : 22, k = h - 6;
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative rounded-full transition-colors shrink-0 disabled:opacity-40 ${on ? "bg-accent" : "bg-line-2"}`}
      style={{ width: w, height: h }}>
      <motion.span className="absolute top-[3px] rounded-full bg-white shadow-sm"
        style={{ width: k, height: k }} initial={false}
        animate={{ left: on ? w - k - 3 : 3, backgroundColor: on ? "#0a0a0c" : "#d4d4d8" }}
        transition={{ type: "spring", stiffness: 600, damping: 36 }} />
    </button>
  );
}

/** Casilla (sólo visual: el clic lo maneja la fila). */
export function Check({ on }: { on: boolean }) {
  return (
    <span className={`w-[17px] h-[17px] rounded-[5px] border shrink-0 grid place-items-center transition-colors duration-150
      ${on ? "bg-accent border-accent" : "border-line-2 bg-white/[0.02]"}`}>
      {on && <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </span>
  );
}

const TONES = {
  neutral: "bg-white/[0.05] text-text-dim border-line-2",
  accent: "bg-accent/[0.1] text-accent border-accent/25",
  ok: "bg-[#00e676]/[0.09] text-[#3ddc84] border-[#00e676]/20",
  warn: "bg-[#ffb74d]/[0.09] text-[#ffb74d] border-[#ffb74d]/25",
  danger: "bg-[#ff5470]/[0.09] text-[#ff6b84] border-[#ff5470]/25",
  info: "bg-[#3b9eff]/[0.09] text-[#6cb6ff] border-[#3b9eff]/25",
} as const;
export type Tone = keyof typeof TONES;

/** Etiqueta chica (avanzado, W11, instalado, activo…). */
export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={`inline-flex items-center h-[19px] px-1.5 rounded-[5px] border text-[10.5px] font-medium tracking-[0.01em] whitespace-nowrap ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** Registro / salida de comandos (monoespaciado, discreto). */
export const LogPanel = forwardRef<HTMLDivElement, { children: ReactNode; label?: ReactNode; className?: string }>(
  function LogPanel({ children, label, className = "" }, ref) {
    return (
      <div className={`flex flex-col min-h-0 ${className}`}>
        {label && <SectionTitle>{label}</SectionTitle>}
        <div ref={ref}
          className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-line bg-[#0b0b0d] px-4 py-3 font-mono text-[12.5px] leading-relaxed text-text-dim whitespace-pre-wrap">
          {children}
        </div>
      </div>
    );
  },
);

/** Estado vacío o de carga. */
export function Empty({ children, loading }: { children: ReactNode; loading?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-[13px] text-text-mute">
      {loading && <Spinner />}
      {children}
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <motion.span className="rounded-full border-2 border-white/15 border-t-accent inline-block shrink-0"
      style={{ width: size, height: size }}
      animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} />
  );
}

/** Tarjeta de acción: ícono, título, descripción y botón (Restaurar, Reparar, Reactivar…). */
export function ActionCard({ icon, title, desc, action, footer }: {
  icon?: ReactNode; title: ReactNode; desc?: ReactNode; action?: ReactNode; footer?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface hover:border-line-2 transition-colors p-4">
      <div className="flex items-center gap-3.5">
        {icon && (
          <span className="w-10 h-10 rounded-lg bg-white/[0.04] border border-line grid place-items-center text-[19px] text-text-dim shrink-0 [&_svg]:w-[18px] [&_svg]:h-[18px]">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-text">{title}</div>
          {desc && <div className="text-[12.5px] text-text-mute mt-0.5 leading-snug">{desc}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {footer && <div className="mt-3 pt-3 border-t border-line text-[12.5px]">{footer}</div>}
    </div>
  );
}

/** Barra de progreso fina. */
export function Progress({ value }: { value: number }) {
  return (
    <div className="h-[3px] rounded-full bg-line overflow-hidden">
      <motion.div className="h-full bg-accent" animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} transition={{ ease: "easeOut", duration: 0.3 }} />
    </div>
  );
}

/** Pestañas segmentadas. */
export function Tabs<T extends string>({ value, onChange, items }: {
  value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[];
}) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/[0.03] border border-line w-fit shrink-0">
      {items.map((it) => (
        <button key={it.id} onClick={() => onChange(it.id)}
          className={`relative px-3 h-7 rounded-md text-[13px] font-medium transition-colors ${value === it.id ? "text-text" : "text-text-mute hover:text-text-dim"}`}>
          {value === it.id && <motion.span layoutId={`tabs-${items.map((i) => i.id).join("-")}`} className="absolute inset-0 rounded-md bg-white/[0.08]" transition={{ type: "spring", stiffness: 520, damping: 42 }} />}
          <span className="relative">{it.label}</span>
        </button>
      ))}
    </div>
  );
}
