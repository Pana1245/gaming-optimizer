import { useEffect, useRef, useState } from "react";
import { Page, Badge, SectionTitle, List, LogPanel } from "../components/ui";
import EnergyCheckbox from "../components/EnergyCheckbox";
import { getSystemInfo, runPowershell } from "../lib/api";
import { applyOp, loadLedger, saveLedger } from "../lib/engine";
import { GPU_OPS, isNvidia, isAmd, isIntegrated, getNvInfo, NV_MAXPERF, NV_RESTORE, AMD_MAXPERF, AMD_RESTORE, type NvInfo } from "../lib/gpu";
import { notify } from "../lib/notify";
import { useI18n } from "../lib/i18n";
import { useAppVisible } from "../lib/useAppVisible";
import { trLog } from "../lib/logI18n";

function Metric({ label, value, unit, color }: { label: string; value: number; unit: string; color?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.025] border border-line px-3.5 py-2.5">
      <div className="text-[12px] text-text-mute">{label}</div>
      <div className="text-[20px] font-semibold tracking-[-0.02em] tabular-nums mt-0.5" style={{ color: color ?? "#ededef" }}>
        {value}<span className="text-[11.5px] font-normal text-text-mute ml-1">{unit}</span>
      </div>
    </div>
  );
}

/** Ajuste propio de la marca (NVIDIA / AMD): aplicar o restaurar el driver. */
function VendorCard({ title, desc, color, busy, onApply, onRestore }: {
  title: string; desc: string; color: string; busy: boolean; onApply: () => void; onRestore: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-line bg-surface p-5 flex flex-col">
      <div className="flex items-center gap-2 text-[14px] font-medium text-text">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />{title}
      </div>
      <p className="text-[12.5px] text-text-mute mt-1.5 leading-relaxed flex-1">{desc}</p>
      <div className="flex gap-2 mt-4">
        <button onClick={onApply} disabled={busy} className="btn btn-primary">{busy ? "…" : t("common.apply")}</button>
        <button onClick={onRestore} disabled={busy} className="btn btn-ghost">{t("common.restore")}</button>
      </div>
    </div>
  );
}

export default function Graficos() {
  const { t, lang } = useI18n();
  const [gpus, setGpus] = useState<{ name: string; vram_gb: number }[] | null>(null);
  const [nv, setNv] = useState<NvInfo | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GPU_OPS.map((o) => [o.id, o.risk !== "advanced"])));
  const [busy, setBusy] = useState(false);
  const [vendorBusy, setVendorBusy] = useState(false);
  const [log, setLog] = useState<string[]>(() => [t("gpu.logReady")]);
  const logRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);

  const addLog = (s: string) => {
    setLog((l) => [...l, s]);
    queueMicrotask(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight));
  };

  // Todas las placas físicas: una PC con Ryzen (integrada AMD) + NVIDIA tiene que
  // mostrar las DOS secciones, no sólo la de la placa "con más memoria".
  const list = gpus ?? [];
  const nvidia = list.some((g) => isNvidia(g.name));
  const amd = list.some((g) => isAmd(g.name));

  useEffect(() => {
    mounted.current = true;
    getSystemInfo()
      .then((i) => mounted.current && setGpus(i.gpus?.length ? i.gpus : i.gpu ? [{ name: i.gpu, vram_gb: 0 }] : []))
      .catch(() => mounted.current && setGpus([]));
    return () => { mounted.current = false; };
  }, []);

  // Monitor NVIDIA (abre nvidia-smi en cada lectura): sólo con la ventana a la vista.
  const visible = useAppVisible();
  useEffect(() => {
    if (!nvidia || !visible) return;
    const tick = () => getNvInfo().then((i) => mounted.current && i && setNv(i)).catch(() => {});
    tick();
    const id = setInterval(tick, 2500);
    return () => clearInterval(id);
  }, [nvidia, visible]);

  const applyUniversal = async () => {
    const ops = GPU_OPS.filter((o) => sel[o.id]);
    if (ops.length === 0) return;
    setBusy(true);
    addLog(`\n${t("gpu.applyingN")}`);
    try {
      const ledger = await loadLedger();
      let ok = 0;
      // Cada op por separado: un fallo a mitad ya no deja las anteriores aplicadas
      // pero sin guardar en el Historial (imposibles de deshacer).
      for (const op of ops) {
        const label = lang === "es" ? op.name : t(`gpu.op.${op.id}.name`);
        try {
          const e = await applyOp(op);
          ledger.push(e);
          addLog(`${e.verified ? "✓" : "✗"} ${label}`);
          if (e.verified) ok++;
        } catch (err) {
          addLog(`✗ ${label} — ${t(err instanceof Error ? err.message : String(err))}`);
        }
      }
      await saveLedger(ledger);
      addLog(`${ok}/${ops.length} ${t("gpu.verified")}`);
      notify(t("gpu.notifyTitle"), `${ok} ${t("gpu.notifyBody")}`);
    } catch (err) {
      addLog(`✗ ${t("gpu.applyErr")} ${t(err instanceof Error ? err.message : String(err))}`);
    } finally {
      setBusy(false);
    }
  };

  const runVendor = async (script: string, label: string) => {
    setVendorBusy(true);
    addLog(`\n— ${label} —`);
    try {
      const r = await runPowershell(script);
      addLog(r.output.trim());
    } catch (err) {
      addLog(`✗ ${t("gpu.errPrefix")} ${t(err instanceof Error ? err.message : String(err))}`);
    } finally {
      setVendorBusy(false);
    }
  };

  return (
    <Page tkey="page.gpu" scroll>
      <div className="space-y-4 pb-2">
        {/* Placa(s) detectada(s) + monitor NVIDIA */}
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="text-[12px] text-text-mute mb-2">{t("gpu.detected")}</div>
          {gpus === null && <div className="text-[15px] font-semibold text-text">{t("gpu.detecting")}</div>}
          {gpus !== null && list.length === 0 && <div className="text-[15px] font-semibold text-text">{t("gpu.none")}</div>}
          <div className="space-y-2">
            {list.map((g) => {
              const vendor = isNvidia(g.name) ? { c: "#76b900", n: "NVIDIA" } : isAmd(g.name) ? { c: "#ed1c24", n: "AMD" } : null;
              return (
                <div key={g.name} className="flex items-center gap-2 flex-wrap">
                  <span className="text-[17px] font-semibold text-text tracking-[-0.01em]">{g.name}</span>
                  {vendor && <span className="inline-flex items-center h-[19px] px-1.5 rounded-[5px] text-[10.5px] font-semibold" style={{ color: vendor.c, background: `${vendor.c}14`, border: `1px solid ${vendor.c}40` }}>{vendor.n}</span>}
                  <Badge>{isIntegrated(g.name) ? t("gpu.integrated") : t("gpu.dedicated")}</Badge>
                  {g.vram_gb >= 1 && <span className="text-[12px] text-text-mute tabular-nums">{g.vram_gb} GB VRAM</span>}
                </div>
              );
            })}
          </div>
          {nvidia && nv && (
            <div className="grid grid-cols-5 gap-2.5 mt-4">
              <Metric label={t("gpu.m.temp")} value={nv.temp} unit="°C" color={nv.temp < 70 ? undefined : nv.temp < 84 ? "#ffd24a" : "#ff5470"} />
              <Metric label={t("gpu.m.usage")} value={nv.util} unit="%" />
              <Metric label={t("gpu.m.clock")} value={nv.clock} unit="MHz" />
              <Metric label={t("gpu.m.power")} value={Math.round(nv.power)} unit="W" />
              <Metric label="VRAM" value={Math.round(nv.memUsed / 1024 * 10) / 10} unit={`/ ${Math.round(nv.memTotal / 1024)} GB`} />
            </div>
          )}
          {nvidia && !nv && <p className="text-[12.5px] text-text-mute mt-3">{t("gpu.readingNv")}</p>}
          {amd && <p className="text-[12.5px] text-text-mute mt-3">{t("gpu.amdNote")}</p>}
          {!nvidia && !amd && list.length > 0 && <p className="text-[12.5px] text-text-mute mt-3">{t("gpu.otherNote")}</p>}
        </div>

        <div className={`grid gap-4 items-start ${nvidia || amd ? "grid-cols-[1.4fr_1fr]" : "grid-cols-1"}`}>
          {/* Ajustes universales */}
          <div>
            <SectionTitle right={<button onClick={applyUniversal} disabled={busy} className="text-[12.5px] font-medium text-accent hover:underline disabled:opacity-50">{busy ? t("gpu.applying") : t("gpu.applySelected")}</button>}>
              {t("gpu.universal")}
            </SectionTitle>
            <List>
              {GPU_OPS.map((o) => (
                <EnergyCheckbox key={o.id} checked={!!sel[o.id]} onChange={(v) => setSel((s) => ({ ...s, [o.id]: v }))}
                  label={lang === "es" ? o.name : t(`gpu.op.${o.id}.name`)} desc={lang === "es" ? o.desc : t(`gpu.op.${o.id}.desc`)}
                  risk={o.risk === "advanced" ? "advanced" : "safe"} />
              ))}
            </List>
            <p className="text-[12px] text-text-mute mt-2">{t("gpu.movedHint")}</p>
          </div>

          {/* Ajuste propio de la marca */}
          {(nvidia || amd) && (
            <div>
              <SectionTitle>{t("gpu.vendorTitle")}</SectionTitle>
              <div className="space-y-4">
              {nvidia && <VendorCard title={t("gpu.nvMax")} desc={t("gpu.nvDesc")} color="#76b900" busy={vendorBusy}
                onApply={() => runVendor(NV_MAXPERF(lang === "en"), t("gpu.nvApply"))} onRestore={() => runVendor(NV_RESTORE(lang === "en"), t("gpu.nvRestore"))} />}
              {amd && <VendorCard title={t("gpu.amdMax")} desc={t("gpu.amdDesc")} color="#ed1c24" busy={vendorBusy}
                onApply={() => runVendor(AMD_MAXPERF(lang === "en"), t("gpu.amdApply"))} onRestore={() => runVendor(AMD_RESTORE(lang === "en"), t("gpu.amdRestore"))} />}
              </div>
            </div>
          )}
        </div>

        <LogPanel ref={logRef} label={t("common.log")} className="h-[150px]">{trLog(log.join("\n"), lang)}</LogPanel>
      </div>
    </Page>
  );
}
