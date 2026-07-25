import { useEffect, useRef, useState } from "react";
import NeonCard, { HudTitle } from "../components/NeonCard";
import EnergyCheckbox from "../components/EnergyCheckbox";
import { getSystemInfo, runPowershell } from "../lib/api";
import { applyOp, loadLedger, saveLedger } from "../lib/engine";
import { GPU_OPS, isNvidia, isAmd, getNvInfo, NV_MAXPERF, NV_RESTORE, AMD_MAXPERF, AMD_RESTORE, type NvInfo } from "../lib/gpu";
import { notify } from "../lib/notify";
import { useI18n } from "../lib/i18n";

function Metric({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="flex-1 rounded-lg bg-surface border border-line px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-text-mute">{label}</div>
      <div className="text-[19px] font-bold leading-tight mt-0.5" style={{ color }}>
        {value}<span className="text-[11px] font-normal text-text-mute ml-0.5">{unit}</span>
      </div>
    </div>
  );
}

export default function Graficos() {
  const { t, lang } = useI18n();
  const [gpu, setGpu] = useState("");
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

  const nvidia = isNvidia(gpu);
  const amd = isAmd(gpu);

  useEffect(() => {
    mounted.current = true;
    getSystemInfo().then((i) => mounted.current && setGpu(i.gpu)).catch(() => {});
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!nvidia) return;
    const tick = () => getNvInfo().then((i) => mounted.current && i && setNv(i)).catch(() => {});
    tick();
    const id = setInterval(tick, 2500);
    return () => clearInterval(id);
  }, [nvidia]);

  const applyUniversal = async () => {
    const ops = GPU_OPS.filter((o) => sel[o.id]);
    if (ops.length === 0) return;
    setBusy(true);
    addLog(`\n${t("gpu.applyingN")}`);
    try {
      const ledger = await loadLedger();
      let ok = 0;
      for (const op of ops) {
        const e = await applyOp(op);
        ledger.push(e);
        addLog(`${e.verified ? "✓" : "✗"} ${lang === "en" ? t(`gpu.op.${op.id}.name`) : op.name}`);
        if (e.verified) ok++;
      }
      await saveLedger(ledger);
      addLog(`${ok}/${ops.length} ${t("gpu.verified")}`);
      notify(t("gpu.notifyTitle"), `${ok} ${t("gpu.notifyBody")}`);
    } catch (err) {
      addLog(`✗ ${t("gpu.applyErr")} ${err instanceof Error ? err.message : String(err)}`);
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
      addLog(`✗ ${t("gpu.errPrefix")} ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setVendorBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col px-8 py-7 overflow-y-auto">
      <HudTitle tkey="page.gpu" />

      {/* GPU detectada + monitor NVIDIA */}
      <NeonCard className="mb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="section-label">{t("gpu.detected")}</span>
        </div>
        <div className="text-[15px] font-semibold text-text">{gpu || t("gpu.detecting")}</div>
        {nvidia && nv && (
          <div className="flex gap-2.5 mt-3">
            <Metric label={t("gpu.m.temp")} value={nv.temp} unit="°C" color={nv.temp < 70 ? "#00e676" : nv.temp < 84 ? "#ffd24a" : "#ff5470"} />
            <Metric label={t("gpu.m.usage")} value={nv.util} unit="%" color="#3b9eff" />
            <Metric label={t("gpu.m.clock")} value={nv.clock} unit="MHz" color="#c084fc" />
            <Metric label={t("gpu.m.power")} value={Math.round(nv.power)} unit="W" color="#ff8a65" />
            <Metric label="VRAM" value={Math.round(nv.memUsed / 1024 * 10) / 10} unit={`/ ${Math.round(nv.memTotal / 1024)} GB`} color="#00e676" />
          </div>
        )}
        {nvidia && !nv && <p className="text-[12.5px] text-text-mute mt-2">{t("gpu.readingNv")}</p>}
        {amd && <p className="text-[12.5px] text-text-mute mt-2">{t("gpu.amdNote")}</p>}
        {!nvidia && !amd && gpu && <p className="text-[12.5px] text-text-mute mt-2">{t("gpu.otherNote")}</p>}
      </NeonCard>

      {/* Optimizaciones universales */}
      <NeonCard className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="section-label">{t("gpu.universal")}</span>
          <button onClick={applyUniversal} disabled={busy} className="btn btn-primary">
            {busy ? t("gpu.applying") : t("gpu.applySelected")}
          </button>
        </div>
        <div className="space-y-0.5">
          {GPU_OPS.map((o) => (
            <EnergyCheckbox key={o.id} checked={!!sel[o.id]} onChange={(v) => setSel((s) => ({ ...s, [o.id]: v }))}
              label={lang === "en" ? t(`gpu.op.${o.id}.name`) : o.name} desc={lang === "en" ? t(`gpu.op.${o.id}.desc`) : o.desc} risk={o.risk === "advanced" ? "advanced" : "safe"}
              badge={o.risk === "advanced" ? t("gpu.advanced") : undefined} />
          ))}
        </div>
      </NeonCard>

      {/* NVIDIA específico */}
      {nvidia && (
        <NeonCard className="mb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[14px] font-semibold text-text flex items-center gap-2">
                <span style={{ color: "#76b900" }}>▲</span> {t("gpu.nvMax")}
              </div>
              <p className="text-[12.5px] text-text-mute mt-1 max-w-[440px]">
                {t("gpu.nvDesc")}
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button onClick={() => runVendor(NV_MAXPERF(lang === "en"), t("gpu.nvApply"))} disabled={vendorBusy} className="btn btn-primary">
                {vendorBusy ? "…" : t("common.apply")}
              </button>
              <button onClick={() => runVendor(NV_RESTORE(lang === "en"), t("gpu.nvRestore"))} disabled={vendorBusy} className="btn btn-ghost">
                {t("common.restore")}
              </button>
            </div>
          </div>
        </NeonCard>
      )}

      {/* AMD específico */}
      {amd && (
        <NeonCard className="mb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[14px] font-semibold text-text flex items-center gap-2">
                <span style={{ color: "#ed1c24" }}>●</span> {t("gpu.amdMax")}
              </div>
              <p className="text-[12.5px] text-text-mute mt-1 max-w-[440px]">
                {t("gpu.amdDesc")}
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button onClick={() => runVendor(AMD_MAXPERF(lang === "en"), t("gpu.amdApply"))} disabled={vendorBusy} className="btn btn-primary">
                {vendorBusy ? "…" : t("common.apply")}
              </button>
              <button onClick={() => runVendor(AMD_RESTORE(lang === "en"), t("gpu.amdRestore"))} disabled={vendorBusy} className="btn btn-ghost">
                {t("common.restore")}
              </button>
            </div>
          </div>
        </NeonCard>
      )}

      {/* registro */}
      <div ref={logRef} className="flex-1 min-h-[88px] overflow-y-auto rounded-xl bg-[#08080a] border border-line p-3.5 font-mono text-[12.5px] leading-relaxed text-text-dim whitespace-pre-wrap">
        {log.join("\n")}
      </div>
    </div>
  );
}
