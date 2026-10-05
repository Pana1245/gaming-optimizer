import { useEffect, useRef, useState } from "react";
import { Badge, Spinner } from "./ui";
import Tooltip from "./Tooltip";
import { useI18n } from "../lib/i18n";
import { notify } from "../lib/notify";
import { driverRun, isOptimized, type DrvItem, type DrvState, type Vendor } from "../lib/gpuDriver";

const COLOR: Record<Vendor, string> = { nvidia: "#76b900", amd: "#ed1c24" };
const TEXQ: Record<number, string> = { 4294967286: "hq", 0: "q", 10: "p", 20: "hp" };
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/** "Optimizar el driver en 1 clic": lo mismo que se toca a mano en el Panel de control de
 *  NVIDIA o en AMD Software, con el estado actual de cada ajuste y vuelta atrás exacta. */
export default function GpuDriverPanel({ vendors, onLog, onNavigate }: {
  vendors: Vendor[]; onLog: (s: string) => void; onNavigate?: (page: string) => void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<Partial<Record<Vendor, DrvState>>>({});
  const [busy, setBusy] = useState<Vendor | "all" | null>(null);
  const mounted = useRef(true);
  const key = vendors.join(",");

  useEffect(() => {
    mounted.current = true;
    for (const v of key.split(",").filter(Boolean) as Vendor[]) {
      driverRun(v, "status")
        .then((d) => mounted.current && setState((s) => ({ ...s, [v]: d })))
        .catch(() => {});
    }
    return () => { mounted.current = false; };
  }, [key]);

  const name = (v: Vendor) => (v === "nvidia" ? "NVIDIA" : "AMD");
  const usable = (d?: DrvState) => !!d && (d.reason === "" || d.reason === "nobackup");

  const run = async (v: Vendor, mode: "apply" | "restore") => {
    const d = await driverRun(v, mode);
    if (!mounted.current) return d;
    setState((s) => ({ ...s, [v]: d }));
    const vars = { v: name(v), n: d.done, t: d.total, e: d.reason };
    if (d.reason === "nobackup") onLog(fill(t("gpu.oc.nobackup"), vars));
    else if (d.reason) onLog("✗ " + fill(t("gpu.oc.failed"), vars));
    else onLog(`${d.done === d.total ? "✓" : "✗"} ${fill(t(mode === "apply" ? "gpu.oc.applied" : "gpu.oc.restored"), vars)}`);
    return d;
  };

  const one = async (v: Vendor, mode: "apply" | "restore") => {
    setBusy(v);
    try {
      const d = await run(v, mode);
      if (mode === "apply" && !d.reason) { onLog(t("gpu.oc.reopen")); notify(t("gpu.oc.notify"), fill(t("gpu.oc.applied"), { v: name(v), n: d.done, t: d.total })); }
    } finally { if (mounted.current) setBusy(null); }
  };

  const all = async () => {
    setBusy("all");
    try {
      let ok = 0;
      for (const v of vendors) if (usable(state[v])) { const d = await run(v, "apply"); if (!d.reason) ok++; }
      if (ok) { onLog(t("gpu.oc.reopen")); notify(t("gpu.oc.notify"), t("gpu.oc.notifyAll")); }
    } finally { if (mounted.current) setBusy(null); }
  };

  const label = (v: Vendor, k: string, cur: number | null) => {
    if (cur === null) return v === "nvidia" ? t("gpu.oc.default") : t("gpu.oc.na");
    switch (k) {
      case "pstate": return t(`gpu.oc.v.pstate.${cur}`);
      case "lowlat": return cur === 0 ? t("gpu.oc.off") : cur === 1 ? t("gpu.oc.on") : fill(t("gpu.oc.frames"), { n: cur });
      case "texq": return TEXQ[cur] ? t(`gpu.oc.v.texq.${TEXQ[cur]}`) : String(cur);
      case "shader": return cur === 4294967295 ? t("gpu.oc.v.unlimited") : t("gpu.oc.v.custom");
      case "vsync": return t(`gpu.oc.v.vsync.${cur}`);
      default: return cur ? t("gpu.oc.on") : t("gpu.oc.off");
    }
  };

  const rows = (v: Vendor, items: DrvItem[]) => items.map((it) => {
    const ok = it.cur === null ? v === "amd" : it.cur === it.want;
    const na = v === "amd" && it.cur === null;
    return (
      <div key={it.key} className="flex items-center gap-2 py-2 px-4 text-[13px]">
        <span className={`w-4 text-center ${na ? "text-text-mute" : ok ? "text-[#3ddc84]" : "text-[#ffb74d]"}`}>{na ? "–" : ok ? "✓" : "•"}</span>
        <span className={na ? "text-text-mute" : "text-text"}>{t(`gpu.oc.k.${it.key}`)}</span>
        <Tooltip content={t(`gpu.oc.d.${it.key}`)}>
          <span className="w-[18px] h-[18px] rounded-full grid place-items-center text-[11px] font-bold leading-none cursor-help text-accent bg-accent/10 border border-accent/35 hover:bg-accent/20 hover:border-accent/60 transition-colors">?</span>
        </Tooltip>
        <span className="ml-auto text-right text-[12.5px] tabular-nums">
          {na ? <span className="text-text-mute">{t("gpu.oc.na")}</span>
            : ok ? <span className="text-text-dim">{label(v, it.key, it.cur)}</span>
            : <><span className="text-text-mute">{label(v, it.key, it.cur)}</span><span className="text-text-mute mx-1.5">→</span><span className="text-text">{label(v, it.key, it.want)}</span></>}
        </span>
      </div>
    );
  });

  const card = (v: Vendor) => {
    const d = state[v];
    const items = d ? (v === "nvidia" ? d.items ?? [] : (d.gpus ?? []).flatMap((g) => g.items)) : [];
    const done = usable(d) && items.length > 0 && isOptimized(v, items);
    return (
      <div key={v} className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
          <span className="w-2 h-2 rounded-full" style={{ background: COLOR[v] }} />
          <span className="text-[14px] font-medium text-text">{t(v === "nvidia" ? "gpu.oc.nv" : "gpu.oc.amd")}</span>
          {usable(d) && items.length > 0 && <Badge tone={done ? "ok" : "warn"}>{t(done ? "gpu.oc.optimized" : "gpu.oc.improvable")}</Badge>}
        </div>
        {!d && <div className="flex items-center gap-2 px-4 pb-4 text-[12.5px] text-text-mute"><Spinner size={14} />{t("gpu.oc.reading")}</div>}
        {d && !usable(d) && (
          <div className="px-4 pb-4 text-[12.5px] text-text-mute leading-relaxed">
            {d.reason === "nonv" || d.reason === "noadlx" ? t(`gpu.oc.${d.reason}`) : fill(t("gpu.oc.err"), { e: d.reason })}
            {(d.reason === "nonv" || d.reason === "noadlx") && onNavigate && (
              <button onClick={() => onNavigate("drivers")} className="block mt-2 text-[12.5px] font-medium text-accent hover:underline">{t("gpu.oc.goDrivers")}</button>
            )}
          </div>
        )}
        {usable(d) && (
          <>
            {v === "nvidia" ? <div className="border-t border-line">{rows(v, d!.items ?? [])}</div>
              : (d!.gpus ?? []).map((g) => (
                <div key={g.name} className="border-t border-line">
                  <div className="flex items-center gap-2 px-4 pt-2.5 text-[12px] text-text-mute">
                    <span className="text-text-dim">{g.name}</span>
                    <Badge>{g.type === 1 ? t("gpu.integrated") : t("gpu.dedicated")}</Badge>
                  </div>
                  {rows(v, g.items)}
                </div>
              ))}
            <div className="flex gap-2 px-4 py-3 border-t border-line">
              <button onClick={() => one(v, "apply")} disabled={!!busy} className="btn btn-primary">{busy === v ? "…" : t("gpu.oc.apply")}</button>
              <button onClick={() => one(v, "restore")} disabled={!!busy || !d!.backup} className="btn btn-ghost">{t("gpu.oc.restore")}</button>
            </div>
          </>
        )}
      </div>
    );
  };

  const canAll = vendors.some((v) => usable(state[v]));
  return (
    <div>
      <div className="flex items-start gap-4 mb-3">
        <div className="flex-1">
          <div className="text-[15px] font-semibold text-text tracking-[-0.01em]">{t("gpu.oc.title")}</div>
          <p className="text-[12.5px] text-text-mute mt-1 leading-relaxed max-w-[640px]">{t("gpu.oc.sub")}</p>
        </div>
        {vendors.length > 1 && (
          <button onClick={all} disabled={!!busy || !canAll} className="btn btn-primary shrink-0">{busy === "all" ? "…" : t("gpu.oc.all")}</button>
        )}
      </div>
      <div className={`grid gap-4 items-start ${vendors.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{vendors.map(card)}</div>
    </div>
  );
}
