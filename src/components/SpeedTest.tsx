import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion } from "framer-motion";
import { useI18n } from "../lib/i18n";

// Test de velocidad estilo "speedtest": velocímetro con aguja, botón INICIAR y gráfico
// en vivo. Backend: src-tauri/src/speedtest.rs. El estado vive a nivel de módulo: si
// cambiás de sección mientras corre, al volver seguís viendo el test.
interface Result {
  ok: boolean; cancelled: boolean; error: string;
  down_mbps: number; up_mbps: number;
  ping_ms: number; jitter_ms: number; down_loaded_ms: number; up_loaded_ms: number;
  bytes_used: number; down_server: string; retry_min: number; colo: string; country: string;
}
interface St {
  running: boolean; phase: string; mbps: number; pct: number;
  ping: number | null; jitter: number | null; down: number | null; up: number | null;
  server: string; downPts: number[]; upPts: number[]; result: Result | null;
}
const EMPTY: St = { running: false, phase: "", mbps: 0, pct: 0, ping: null, jitter: null, down: null, up: null, server: "", downPts: [], upPts: [], result: null };

let st: St = EMPTY;
const subs = new Set<(s: St) => void>();
const set = (p: Partial<St>) => { st = { ...st, ...p }; subs.forEach((f) => f(st)); };
// Solo en desarrollo: permite mover el velocímetro a mano para revisar el diseño.
if (import.meta.env.DEV) (window as unknown as { __speedDemo: typeof set }).__speedDemo = set;
let wired = false;
const wire = () => {
  if (wired) return;
  wired = true;
  listen<{ phase: string; mbps: number; pct: number }>("speed-progress", ({ payload: p }) => {
    const pts = p.phase === "download" ? { downPts: [...st.downPts, p.mbps] } : p.phase === "upload" ? { upPts: [...st.upPts, p.mbps] } : {};
    set({ ...p, ...pts, running: true });
  });
  listen<{ kind: string; value: number; extra: number; text: string }>("speed-stage", ({ payload: s }) => {
    if (s.kind === "server") {
      // "colo|país|respaldo": si Cloudflare limitó la bajada, se indica el servidor usado.
      const [colo, cc, alt] = s.text.split("|");
      set({ server: `${colo ? `Cloudflare · ${colo}${cc ? ` (${cc})` : ""}` : ""}${alt ? ` · ⬇ ${alt}` : ""}` });
    }
    if (s.kind === "ping") set({ ping: s.value, jitter: s.extra });
    if (s.kind === "download") set({ down: s.value });
  });
  listen<Result>("speed-done", ({ payload: r }) => set({ running: false, result: r, phase: "", mbps: 0, pct: 0, up: r.ok ? r.up_mbps : st.up }));
};

// ── Velocímetro ─────────────────────────────────────────────────────────────
// Escala no lineal (como la de Ookla): cada tramo ocupa lo mismo del arco.
const TICKS = [0, 5, 10, 50, 100, 250, 500, 750, 1000];
const SWEEP = 270; // grados, de -135 (abajo-izq) a +135 (abajo-der)
const frac = (v: number) => {
  if (v <= 0) return 0;
  for (let i = 0; i < TICKS.length - 1; i++)
    if (v <= TICKS[i + 1]) return (i + (v - TICKS[i]) / (TICKS[i + 1] - TICKS[i])) / (TICKS.length - 1);
  return 1;
};
const CX = 160, CY = 160, R = 128;
const pt = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
};
const arc = (from: number, to: number, r: number) => {
  const [x1, y1] = pt(from, r), [x2, y2] = pt(to, r);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

/** Suaviza el valor mostrado (la aguja no salta, se desliza). */
function useSmooth(target: number) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    let raf = 0;
    const step = () => {
      cur.current += (target - cur.current) * 0.12;
      if (Math.abs(target - cur.current) < 0.05) cur.current = target;
      setV(cur.current);
      if (cur.current !== target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

const DOWN_C = "#24c8db", UP_C = "#b36bff";
const fmt = (v: number) => (v >= 100 ? Math.round(v).toString() : v.toFixed(1));

function Gauge({ value, color, label }: { value: number; color: string; label: string }) {
  const v = useSmooth(value);
  const a = -135 + frac(v) * SWEEP;
  return (
    <svg viewBox="0 0 320 272" className="w-[320px] h-[272px]">
      <defs>
        <linearGradient id="gFill" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
        <filter id="gGlow"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      {/* pista + arco lleno (con brillo) */}
      <path d={arc(-135, 135, R)} fill="none" stroke="#1c1c1f" strokeWidth="14" strokeLinecap="round" />
      {v > 0.05 && <path d={arc(-135, a, R)} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" opacity="0.45" filter="url(#gGlow)" />}
      {v > 0.05 && <path d={arc(-135, a, R)} fill="none" stroke="url(#gFill)" strokeWidth="14" strokeLinecap="round" />}
      {/* marcas */}
      {TICKS.map((tk, i) => {
        const d = -135 + (i / (TICKS.length - 1)) * SWEEP;
        const [lx, ly] = pt(d, R - 30);
        return (
          <text key={tk} x={lx} y={ly + 4} textAnchor="middle" fontSize="11"
            fill={frac(v) >= i / (TICKS.length - 1) - 0.001 && v > 0 ? "#ededed" : "#5a5a60"} fontFamily="ui-monospace, monospace">
            {tk}
          </text>
        );
      })}
      {/* aguja */}
      <g transform={`rotate(${a} ${CX} ${CY})`}>
        <polygon points={`${CX - 4},${CY} ${CX},${CY - R + 22} ${CX + 4},${CY}`} fill={color} />
        <polygon points={`${CX - 4},${CY} ${CX},${CY - R + 22} ${CX + 4},${CY}`} fill={color} opacity="0.5" filter="url(#gGlow)" />
      </g>
      <circle cx={CX} cy={CY} r="9" fill="#0d0d10" stroke={color} strokeWidth="2.5" />
      {/* número central */}
      <text x={CX} y={CY + 58} textAnchor="middle" fontSize="40" fontWeight="700" fill="#ededed" fontFamily="ui-monospace, monospace">{fmt(v)}</text>
      <text x={CX} y={CY + 78} textAnchor="middle" fontSize="12" fill="#8a8a8f">Mbps · {label}</text>
    </svg>
  );
}

// Eje de tiempo fijo: una muestra cada 250 ms durante los 12 s de cada fase (~48),
// así la curva avanza de izquierda a derecha en tiempo real.
const SAMPLES = 48;
const xOf = (i: number) => Math.min(100, (i / (SAMPLES - 1)) * 100);

function Chart({ down, up }: { down: number[]; up: number[] }) {
  const max = Math.max(10, ...down, ...up);
  const line = (pts: number[]) =>
    pts.map((p, i) => `${xOf(i)},${40 - (p / max) * 36}`).join(" ");
  const area = (pts: number[]) => (pts.length > 1 ? `0,40 ${line(pts)} ${xOf(pts.length - 1)},40` : "");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-[70px]">
      {down.length > 1 && <><polygon points={area(down)} fill={DOWN_C} opacity="0.12" /><polyline points={line(down)} fill="none" stroke={DOWN_C} strokeWidth="0.8" vectorEffect="non-scaling-stroke" /></>}
      {up.length > 1 && <><polygon points={area(up)} fill={UP_C} opacity="0.12" /><polyline points={line(up)} fill="none" stroke={UP_C} strokeWidth="0.8" vectorEffect="non-scaling-stroke" /></>}
    </svg>
  );
}

function Metric({ label, value, unit, color, active }: { label: string; value: string; unit: string; color?: string; active?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 transition-colors ${active ? "border-white/15 bg-white/[0.04]" : "border-line bg-white/[0.015]"}`}>
      <div className="text-[12px] flex items-center gap-1.5" style={{ color: color ?? "#6c6c75" }}>{label}</div>
      <div className="font-mono font-semibold text-[24px] leading-tight mt-1 tabular-nums text-text">
        {value}<span className="text-[12px] font-normal text-text-mute"> {unit}</span>
      </div>
    </div>
  );
}

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
    set({ ...EMPTY, running: true, phase: "ping" });
    const started = await invoke<boolean>("speed_test").catch(() => false);
    if (!started && !st.running) set({ running: false });
  };
  const cancel = () => { invoke("speed_cancel").catch(() => {}); };

  const r = s.result;
  const up = s.phase === "upload";
  const bloat = r && r.ok ? Math.max(r.down_loaded_ms, r.up_loaded_ms) - r.ping_ms : 0;
  const bloatKey = bloat < 30 ? "net.st.bloatLow" : bloat < 100 ? "net.st.bloatMid" : "net.st.bloatHigh";
  const bloatColor = bloat < 30 ? "#00e676" : bloat < 100 ? "#ffd24a" : "#ff5470";
  const dash = "—";

  return (
    <div className="rounded-2xl border border-line bg-surface/80 p-5">
      {/* métricas */}
      <div className="grid grid-cols-4 gap-3">
        <Metric label={t("net.st.ping")} value={s.ping != null ? String(Math.round(s.ping)) : dash} unit="ms" active={s.phase === "ping"} />
        <Metric label={t("net.st.jitter")} value={s.jitter != null ? s.jitter.toFixed(1) : dash} unit="ms" active={s.phase === "ping"} />
        <Metric label={`⬇ ${t("net.st.down")}`} color={DOWN_C} value={s.down != null ? fmt(s.down) : s.phase === "download" ? fmt(s.mbps) : dash} unit="Mbps" active={s.phase === "download"} />
        <Metric label={`⬆ ${t("net.st.up")}`} color={UP_C} value={s.up != null ? fmt(s.up) : up ? fmt(s.mbps) : dash} unit="Mbps" active={up} />
      </div>

      {/* centro: botón INICIAR / velocímetro */}
      <div className="flex flex-col items-center justify-center min-h-[284px] mt-2">
        {s.running ? (
          s.phase === "download" || s.phase === "upload" ? (
            <Gauge value={s.mbps} color={up ? UP_C : DOWN_C} label={up ? t("net.st.up") : t("net.st.down")} />
          ) : (
            <div className="flex flex-col items-center gap-3 text-text-mute text-[13px]">
              <motion.div className="w-16 h-16 rounded-full border-2 border-accent/30 border-t-accent"
                animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} />
              {t("net.st.pinging")}
            </div>
          )
        ) : (
          <button onClick={start} className="relative w-[170px] h-[170px] rounded-full group" aria-label={t("net.st.start")}>
            <motion.span className="absolute inset-0 rounded-full border-2 border-accent"
              animate={{ scale: [1, 1.18], opacity: [0.55, 0] }} transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut" }} />
            <span className="absolute inset-0 rounded-full"
              style={{ background: "conic-gradient(from 0deg, var(--color-accent), #24c8db, #b36bff, var(--color-accent))", padding: 3, WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))" }} />
            <span className="absolute inset-[10px] rounded-full bg-[#0b0b0e] group-hover:bg-[#101014] transition-colors flex flex-col items-center justify-center">
              <span className={`${r ? "text-[20px]" : "text-[28px]"} whitespace-nowrap font-bold tracking-[0.12em] text-text group-hover:text-accent transition-colors`}>{r ? t("net.st.again") : t("net.st.go")}</span>
            </span>
          </button>
        )}
      </div>

      {/* gráfico en vivo */}
      {[...s.downPts, ...s.upPts].some((p) => p > 0) && (
        <div className="rounded-lg bg-[#08080a] border border-line/70 px-2 pt-1">
          <Chart down={s.downPts} up={s.upPts} />
        </div>
      )}

      {/* pie: servidor, datos, bufferbloat, cancelar */}
      <div className="flex items-center justify-between gap-4 mt-3 text-[12.5px]">
        <span className="text-text-mute truncate">
          {s.server ? `${t("net.st.server")} ${s.server}` : t("net.st.desc")}
          {r && r.ok ? ` · ${t("net.st.used")} ${fmtBytes(r.bytes_used)}` : ""}
        </span>
        {s.running && <button onClick={cancel} className="btn btn-ghost shrink-0">{t("common.cancel")}</button>}
      </div>
      {!s.running && r && r.ok && (
        <p className="text-[12.5px] mt-2" style={{ color: bloatColor }}>
          ▸ {t("net.st.pingLoaded")}: {Math.round(r.down_loaded_ms)} / {Math.round(r.up_loaded_ms)} ms — {t(bloatKey).replace("{ms}", String(Math.round(bloat)))}
        </p>
      )}
      {!s.running && r && r.ok && r.retry_min > 0 && (
        <p className="text-[12.5px] mt-1.5 text-[#ffd24a]">▸ {t("net.st.upLimited").replace("{min}", String(r.retry_min))}</p>
      )}
      {!s.running && r && !r.ok && (
        <p className="text-[12.5px] mt-2" style={{ color: r.cancelled ? "#8a8a8f" : "#ff5470" }}>
          {r.cancelled ? t("net.st.cancelled") : t(r.error || "net.st.errNoData").replace("{min}", String(r.retry_min || 60))}
        </p>
      )}
    </div>
  );
}
