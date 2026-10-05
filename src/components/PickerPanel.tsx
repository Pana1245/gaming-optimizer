import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { useI18n } from "../lib/i18n";
import { Check } from "./ui";

export interface PickerItem { id: string; label: string; rec: boolean; sub?: string; badge?: ReactNode }
export interface PickerGroup { id: string; label: string; items: PickerItem[] }

/** Menú desplegable de elección (bloatware, permisos…): barra con "Marcar recomendados",
 *  "Todas" y "Ninguna", una ayuda y los ítems por grupo en dos columnas. Los botones
 *  actúan sobre lo que se ve. `order` = todos los ids en orden de catálogo (así se guarda). */
export default function PickerPanel({ groups, selected, onChange, order, hint, toolbarRight, status }: {
  groups: PickerGroup[]; selected: string[]; onChange: (ids: string[]) => void; order: string[];
  hint: string; toolbarRight?: ReactNode; status?: ReactNode;
}) {
  const { t } = useI18n();
  const visible = groups.flatMap((g) => g.items);
  const sel = new Set(selected);
  const set = (ids: Iterable<string>) => { const s = new Set(ids); onChange(order.filter((id) => s.has(id))); };
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); set(n); };
  const chosen = visible.filter((a) => sel.has(a.id)).length;

  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={{ duration: 0.18 }}
      className="overflow-hidden bg-white/[0.012]">
      <div className="px-4 pt-3 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => set(visible.filter((a) => a.rec).map((a) => a.id))} className="btn btn-primary h-8 px-3 text-[12.5px]">★ {t("pick.recommended")}</button>
          <button onClick={() => set(visible.map((a) => a.id))} className="btn btn-ghost h-8 px-3 text-[12.5px]">{t("pick.all")}</button>
          <button onClick={() => set([])} className="btn btn-ghost h-8 px-3 text-[12.5px]">{t("pick.none")}</button>
          <span className="text-[12px] text-text-mute tabular-nums ml-1">{t("pick.selectedN").replace("{n}", String(chosen))}</span>
          {toolbarRight && <div className="ml-auto flex items-center gap-2 text-[12px] text-text-dim">{toolbarRight}</div>}
        </div>
        <p className="text-[11.5px] text-text-mute leading-relaxed mt-2.5"><span className="text-accent">★</span> {hint}</p>
        {status}

        {groups.map((g) => {
          if (!g.items.length) return null;
          const n = g.items.filter((a) => sel.has(a.id)).length;
          return (
            <div key={g.id} className="mt-3.5">
              <div className="flex items-center gap-2 mb-1.5 text-[11.5px] font-medium text-text-dim">
                {g.label}
                <span className="text-text-mute tabular-nums font-normal">{n}/{g.items.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {g.items.map((a) => (
                  <button key={a.id} onClick={() => toggle(a.id)} title={a.sub}
                    className="flex items-center gap-2 min-w-0 px-2 py-1.5 rounded-md text-left hover:bg-white/[0.035] transition-colors">
                    <Check on={sel.has(a.id)} />
                    <span className="min-w-0">
                      <span className={`block text-[12.5px] truncate ${sel.has(a.id) ? "text-text" : "text-text-dim"}`}>{a.label}</span>
                      {a.sub && <span className="block text-[11px] text-text-mute truncate">{a.sub}</span>}
                    </span>
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      {a.rec && <span title={t("pick.recBadge")} aria-label={t("pick.recBadge")} className="text-accent text-[12px] leading-none">★</span>}
                      {a.badge}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
