import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "../lib/i18n";

export interface CmdItem { id: string; label: string; icon?: ReactNode; }

/** Paleta de comandos estilo Ctrl+K: buscar y saltar a cualquier sección.
 *  Se abre/cierra con Ctrl/Cmd+K, navega con flechas, entra con ↵, cierra con Esc. */
export default function CommandPalette({ items, onSelect }: { items: CmdItem[]; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) { setQ(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 40); }
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => i.label.toLowerCase().includes(s)) : items;
  }, [q, items]);

  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const go = (id?: string) => {
    const target = id ?? filtered[idx]?.id;
    if (target) { onSelect(target); setOpen(false); }
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4"
          style={{ background: "rgba(0,0,0,.5)", backdropFilter: "blur(6px)" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <motion.div
            className="w-full max-w-[520px] rounded-2xl border border-line overflow-hidden"
            style={{ background: "linear-gradient(180deg,#16161b,#0e0e12)", boxShadow: "0 30px 80px -20px rgba(0,0,0,.85)" }}
            initial={{ opacity: 0, y: -14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-mute shrink-0">
                <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey}
                placeholder={t("cmd.placeholder")}
                className="flex-1 bg-transparent outline-none text-[14px] text-text placeholder:text-text-mute"
              />
              <kbd className="text-[10px] text-text-mute border border-line rounded px-1.5 py-0.5 font-mono">ESC</kbd>
            </div>
            <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1.5">
              {filtered.length === 0 && (
                <div className="px-4 py-6 text-center text-[13px] text-text-mute">{t("cmd.empty")}</div>
              )}
              {filtered.map((it, i) => (
                <button
                  key={it.id} data-i={i} onMouseEnter={() => setIdx(i)} onClick={() => go(it.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-[13.5px] transition-colors ${i === idx ? "bg-accent/10 text-text" : "text-text-dim hover:bg-white/[0.03]"}`}
                >
                  <span className={i === idx ? "text-accent" : "text-text-mute"}>{it.icon}</span>
                  <span>{it.label}</span>
                  {i === idx && <span className="ml-auto text-[10px] text-text-mute font-mono">↵</span>}
                </button>
              ))}
            </div>
            <div className="px-4 py-2 border-t border-line text-[11px] text-text-mute">{t("cmd.hint")}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
