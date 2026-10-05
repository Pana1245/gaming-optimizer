import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BLOAT_APPS, BLOAT_DETECT, bloatInstalled, type BloatGroup } from "../bloat";
import { runPowershell } from "../lib/api";
import { useI18n, pick } from "../lib/i18n";
import { Check, Badge, Switch, Spinner } from "./ui";

const GROUPS: BloatGroup[] = ["ms", "third", "extra"];

// Lo último que se detectó: al volver a abrir el menú se muestra al instante mientras
// se vuelve a escanear (una desinstalación pudo cambiarlo).
let lastInstalled: Set<string> | null = null;

/** Menú desplegable de "Eliminar bloatware": todas las apps del catálogo agrupadas, con
 *  cuáles están en esta PC, "Marcar recomendados", "Todas" y "Ninguna". */
export default function BloatPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { t, lang } = useI18n();
  const [installed, setInstalled] = useState<Set<string> | null>(lastInstalled);
  const [scanning, setScanning] = useState(true);
  const [scanFail, setScanFail] = useState(false);
  const [onlyInstalled, setOnlyInstalled] = useState(true);

  useEffect(() => {
    let alive = true;
    runPowershell(BLOAT_DETECT).then((r) => {
      if (!alive) return;
      try {
        const d = JSON.parse(r.output.trim().split("\n").pop() || "");
        const names = (Array.isArray(d) ? d : [d]).filter((x): x is string => typeof x === "string");
        lastInstalled = bloatInstalled(names);
        setInstalled(lastInstalled);
      } catch { setScanFail(true); }
    }).catch(() => alive && setScanFail(true)).finally(() => alive && setScanning(false));
    return () => { alive = false; };
  }, []);

  // Sin detección (falló o todavía no hay datos) se muestra todo.
  const filterOn = onlyInstalled && !!installed && !scanFail;
  const visible = useMemo(
    () => BLOAT_APPS.filter((a) => !filterOn || installed!.has(a.id)),
    [filterOn, installed],
  );
  const sel = new Set(selected);
  // Se guarda en el orden del catálogo.
  const set = (ids: Iterable<string>) => { const s = new Set(ids); onChange(BLOAT_APPS.filter((a) => s.has(a.id)).map((a) => a.id)); };
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); set(n); };
  // Los botones actúan sobre lo que se ve (con el filtro: sólo lo que está en la PC).
  const markRec = () => set(visible.filter((a) => a.rec).map((a) => a.id));
  const markAll = () => set(visible.map((a) => a.id));
  const markNone = () => set([]);
  const chosen = visible.filter((a) => sel.has(a.id)).length;

  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={{ duration: 0.18 }}
      className="overflow-hidden bg-white/[0.012]">
      <div className="px-4 pt-3 pb-4">
        {/* Barra de acciones */}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={markRec} className="btn btn-primary h-8 px-3 text-[12.5px]">★ {t("bloat.recommended")}</button>
          <button onClick={markAll} className="btn btn-ghost h-8 px-3 text-[12.5px]">{t("bloat.all")}</button>
          <button onClick={markNone} className="btn btn-ghost h-8 px-3 text-[12.5px]">{t("bloat.none")}</button>
          <span className="text-[12px] text-text-mute tabular-nums ml-1">{t("bloat.selectedN").replace("{n}", String(chosen))}</span>
          <label className="ml-auto flex items-center gap-2 text-[12px] text-text-dim">
            {scanning && <Spinner size={12} />}
            {t("bloat.onlyInstalled")}
            <Switch size="sm" on={onlyInstalled} onChange={setOnlyInstalled} disabled={scanFail} label={t("bloat.onlyInstalled")} />
          </label>
        </div>
        <p className="text-[11.5px] text-text-mute leading-relaxed mt-2.5"><span className="text-accent">★</span> {t("bloat.hint")}</p>
        {scanning && !installed && <p className="text-[12px] text-text-mute mt-3">{t("bloat.scanning")}</p>}
        {scanFail && <p className="text-[12px] text-[#ffb74d] mt-3">{t("bloat.scanFail")}</p>}
        {!scanning && filterOn && visible.length === 0 && <p className="text-[12.5px] text-text-dim mt-3">{t("bloat.noneInstalled")}</p>}

        {/* Apps por grupo */}
        {(installed || scanFail) && GROUPS.map((g) => {
          const apps = visible.filter((a) => a.group === g);
          if (!apps.length) return null;
          const n = apps.filter((a) => sel.has(a.id)).length;
          return (
            <div key={g} className="mt-3.5">
              <div className="flex items-center gap-2 mb-1.5 text-[11.5px] font-medium text-text-dim">
                {t(`bloat.group.${g}`)}
                <span className="text-text-mute tabular-nums font-normal">{n}/{apps.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {apps.map((a) => (
                  <button key={a.id} onClick={() => toggle(a.id)}
                    className="flex items-center gap-2 min-w-0 px-2 py-1.5 rounded-md text-left hover:bg-white/[0.035] transition-colors">
                    <Check on={sel.has(a.id)} />
                    <span className={`text-[12.5px] truncate ${sel.has(a.id) ? "text-text" : "text-text-dim"}`}>{pick(lang, a.name, a.nameEn, a.namePt)}</span>
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      {a.rec && <span title={t("bloat.recBadge")} aria-label={t("bloat.recBadge")} className="text-accent text-[12px] leading-none">★</span>}
                      {!filterOn && installed?.has(a.id) && <Badge tone="ok">{t("bloat.installed")}</Badge>}
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
