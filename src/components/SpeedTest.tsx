import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import NeonCard from "./NeonCard";
import { useI18n } from "../lib/i18n";

// Test de velocidad real (backend Rust: src-tauri/src/speedtest.rs). El estado vive a
// nivel de módulo: si cambiás de sección mientras corre, al volver seguís viéndolo.
interface Result {
  ok: boolean; cancelled: boolean; error: string;
  down_mbps: number; up_mbps: number;
  ping_ms: number; down_loaded_ms: number; up_loaded_ms: number;
  bytes_used: number; colo: string; country: string;
}
interface St { running: boolean; phase: string; mbps: number; pct: number; result: Result | null; }

let st: St = { running: false, phase: "", mbps: 0, pct: 0, result: null };
const subs = new Set<(s: St) => void>();
const set = (p: Partial<St>) => { st = { ...st, ...p }; subs.forEach((f) => f(st)); };
let wired = false;
const wire = () => {
  if (wired) return;
  wired = true;
  listen<{ phase: string; mbps: number; pct: number }>("speed-progress", (e) => set({ ...e.payload, running: true }));
  listen<Result>("speed-done", (e) => set({ running: false, result: e.payload, phase: "", mbps: 0, pct: 0 }));
};

const fmtMbps = (v: number) => (v >= 100 ? Math.round(v).toString() : v.toFixed(1));
const fmtBytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${Math.round(b / 1e6)} MB`);

export default function SpeedTest() {
  const { t } = useI18n();
  const [s, setS] = useState<St>(st);

  useEffect(() => {
    wire();
    subs.add(setS);
    return () => { subs.delete(setS); };
  }, []);

  const start = async () => {
    set({ running: true, phase: "ping", mbps: 0, pct: 0, result: null });
    const started = await invoke<boolean>("speed_test").catch(() => false);
    // false = ya había uno corriendo (p. ej. se inició desde otra visita a la sección).
    if (!started && !st.running) set({ running: false });
  };
  const cancel = () => { invoke("speed_cancel").catch(() => {}); };

  const r = s.result;
  const bloat = r && r.ok ? Math.max(r.down_loaded_ms, r.up_loaded_ms) - r.ping_ms : 0;
  const bloatKey = bloat < 30 ? "net.st.bloatLow" : bloat < 100 ? "net.st.bloatMid" : "net.st.bloatHigh";
  const bloatColor = bloat < 30 ? "#00e676" : bloat < 100 ? "#ffd24a" : "#ff5470";
  const phaseLabel = s.phase === "download" ? t("net.st.down") : s.phase === "upload" ? t("net.st.up") : t("net.st.pinging");

  return (
    <NeonCard className="mb-4 shrink-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-text">{t("net.st.title")}</div>
          <div className="text-[12.5px] text-text-mute mt-0.5">
            {r && r.ok && r.colo
              ? `${t("net.st.server")} Cloudflare · ${r.colo}${r.country ? ` (${r.country})` : ""} · ${t("net.st.used")} ${fmtBytes(r.bytes_used)}`
              : t("net.st.desc")}
          </div>
        </div>
        {s.running ? (
          <button onClick={cancel} className="btn btn-ghost shrink-0">{t("common.cancel")}</button>
        ) : (
          <button onClick={start} className="btn btn-primary shrink-0">{r ? t("net.ct.again") : t("net.st.start")}</button>
        )}
      </div>

      {s.running && (
        <div className="mt-4">
          <div className="flex items-baseline gap-3">
            <span className="text-[12px] uppercase tracking-wider text-text-mute w-[92px]">{phaseLabel}</span>
            {s.phase !== "ping" && (
              <span className="font-mono font-bold text-[30px] leading-none text-accent tabular-nums">
                {fmtMbps(s.mbps)}<span className="text-[13px] font-normal text-text-mute"> Mbps</span>
              </span>
            )}
          </div>
          <div className="h-[3px] rounded-full bg-line overflow-hidden mt-3">
            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${Math.round(s.pct * 100)}%` }} />
          </div>
        </div>
      )}

      {!s.running && r && !r.ok && (
        <p className="text-[12.5px] mt-3" style={{ color: r.cancelled ? "#8a8a8f" : "#ff5470" }}>
          {r.cancelled ? t("net.st.cancelled") : t(r.error || "net.st.errNoData")}
        </p>
      )}

      {!s.running && r && r.ok && (
        <div className="mt-4">
          <div className="grid grid-cols-4 gap-3">
            <Stat label={`⬇ ${t("net.st.down")}`} value={fmtMbps(r.down_mbps)} unit="Mbps" big />
            <Stat label={`⬆ ${t("net.st.up")}`} value={fmtMbps(r.up_mbps)} unit="Mbps" big />
            <Stat label={t("net.st.pingIdle")} value={String(Math.round(r.ping_ms))} unit="ms" />
            <Stat label={t("net.st.pingLoaded")} value={`${Math.round(r.down_loaded_ms)} / ${Math.round(r.up_loaded_ms)}`} unit="ms" />
          </div>
          <p className="text-[12.5px] pt-3" style={{ color: bloatColor }}>
            ▸ {t(bloatKey).replace("{ms}", String(Math.round(bloat)))}
          </p>
        </div>
      )}
    </NeonCard>
  );
}

const Stat = ({ label, value, unit, big }: { label: string; value: string; unit: string; big?: boolean }) => (
  <div className="rounded-lg border border-line bg-white/[0.015] px-3 py-2.5">
    <div className="text-[11px] uppercase tracking-wider text-text-mute">{label}</div>
    <div className={`font-mono font-semibold mt-1 tabular-nums ${big ? "text-[22px] text-text" : "text-[16px] text-text-dim"}`}>
      {value}<span className="text-[11px] font-normal text-text-mute"> {unit}</span>
    </div>
  </div>
);
