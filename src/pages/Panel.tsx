import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, animate } from "framer-motion";
import NeonCard from "../components/NeonCard";
import Sparkline from "../components/Sparkline";
import { getStats, getSystemInfo, clearStandbyRam, type Stats } from "../lib/api";
import { readScore, readTemps, type ScoreResult, type Temps } from "../lib/metrics";
import { useGameMode } from "../lib/gameMode";
import { useI18n } from "../lib/i18n";
import { useAppVisible } from "../lib/useAppVisible";
import { opName } from "../lib/opNames";
import { IconGamepad, IconGlobe, IconLayers } from "../components/icons";

/** Número que anima desde su valor previo hasta el objetivo. */
function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [d, setD] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const controls = animate(prev.current, value, { duration: 0.9, ease: "easeOut", onUpdate: (v) => setD(v) });
    prev.current = value;
    return () => controls.stop();
  }, [value]);
  return <>{d.toFixed(decimals)}</>;
}

function Ring({ pct, color }: { pct: number; color: string }) {
  const R = 46, C = 2 * Math.PI * R;
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" className="shrink-0">
      <circle cx="56" cy="56" r={R} fill="none" stroke="#1e1e23" strokeWidth="7" />
      <motion.circle cx="56" cy="56" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={C} transform="rotate(-90 56 56)"
        initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C - (C * pct) / 100 }}
        transition={{ duration: 1, ease: "easeOut" }} />
      <text x="56" y="63" textAnchor="middle" fill="#ededef" fontSize="24" fontWeight="600" letterSpacing="-0.5">
        <AnimatedNumber value={pct} />%
      </text>
    </svg>
  );
}

function Meter({ label, value, color, spark }: { label: string; value: number; color: string; spark?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12px] text-text-mute">{label}</span>
        <span className="text-[13px] font-medium tabular-nums text-text">{value.toFixed(0)}%</span>
      </div>
      {spark ? (
        <div className="[&_svg]:w-full"><Sparkline value={value} color={color} width={400} height={30} /></div>
      ) : (
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div className="h-full rounded-full" style={{ background: color }} animate={{ width: `${Math.min(100, value)}%` }} transition={{ duration: 0.6 }} />
        </div>
      )}
    </div>
  );
}

function Temp({ label, value }: { label: string; value: number | null }) {
  const { t } = useI18n();
  const color = value === null ? "#6c6c75" : value < 70 ? "#ededef" : value < 85 ? "#ffd24a" : "#ff5470";
  const status = value === null ? t("panel.tempNA") : value < 70 ? t("panel.tempHealthy") : value < 85 ? t("panel.tempWarm") : t("panel.tempHot");
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[12px] text-text-mute">{label}</div>
      <div className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] mt-0.5" style={{ color }}>
        {value !== null ? <><AnimatedNumber value={value} />°C</> : t("panel.na")}
      </div>
      <div className="text-[11.5px] text-text-mute truncate">{status}</div>
    </div>
  );
}

/** Acceso rápido: tarjeta clicable con ícono, título, detalle y flecha. */
function Quick({ icon, title, detail, onClick, busy, tone }: {
  icon: ReactNode; title: string; detail: string; onClick: () => void; busy?: boolean; tone?: string;
}) {
  return (
    <button onClick={onClick} disabled={busy}
      className="group text-left rounded-xl border border-line bg-surface hover:border-line-2 hover:bg-surface-2 transition-colors p-4 flex flex-col gap-3 disabled:opacity-60">
      <div className="flex items-center justify-between">
        <span className="w-9 h-9 rounded-lg grid place-items-center bg-white/[0.04] border border-line text-text-dim group-hover:text-accent transition-colors [&_svg]:w-[18px] [&_svg]:h-[18px]">{icon}</span>
        <span className="text-text-mute group-hover:text-text-dim group-hover:translate-x-0.5 transition-all">→</span>
      </div>
      <div>
        <div className="text-[13.5px] font-medium text-text">{title}</div>
        <div className="text-[12px] mt-0.5 leading-snug" style={{ color: tone ?? "#6c6c75" }}>{detail}</div>
      </div>
    </button>
  );
}

const RamIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="7" width="18" height="10" rx="1.5" /><path d="M7 7v10M11 7v10M15 7v10M19 17v2M5 17v2" />
  </svg>
);

export default function Panel({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [temps, setTemps] = useState<Temps>({ cpu: null, gpu: null });
  const [stats, setStats] = useState<Stats>({ cpu: 0, ram: 0, disk: 0 });
  const [sys, setSys] = useState("");
  const [ramMsg, setRamMsg] = useState<string | null>(null);
  const [boosting, setBoosting] = useState(false);
  const { enabled, playing } = useGameMode();
  const { t, lang } = useI18n();
  const mounted = useRef(true);
  const visible = useAppVisible();

  useEffect(() => {
    mounted.current = true;
    readScore().then((s) => mounted.current && setScore(s)).catch(() => {});
    getSystemInfo().then((i) => mounted.current && setSys(
      [i.windows, i.cpu, i.gpus?.length ? i.gpus.map((g) => g.name).join(" + ") : i.gpu, `${Math.round(i.ram_gb)} GB RAM`].filter(Boolean).join("  ·  "),
    )).catch(() => {});
    return () => { mounted.current = false; };
  }, []);

  // Lecturas periódicas, sólo con la ventana a la vista (en la bandeja o minimizada se
  // pausan y al volver se leen enseguida). Temperaturas cada 15 s: cada lectura abre un
  // PowerShell que carga el driver de sensores; el uso (CPU/RAM/disco) es barato.
  useEffect(() => {
    if (!visible) return;
    // Una lectura por vez: en PCs lentas puede tardar más que el intervalo.
    let reading = false;
    const loadTemps = () => {
      if (reading) return;
      reading = true;
      readTemps().then((tp) => mounted.current && setTemps(tp)).catch(() => {}).finally(() => { reading = false; });
    };
    loadTemps();
    const ti = setInterval(loadTemps, 15000);
    const tick = () => getStats().then((s) => mounted.current && setStats(s)).catch(() => {});
    tick();
    const si = setInterval(tick, 2000);
    return () => { clearInterval(ti); clearInterval(si); };
  }, [visible]);

  const boost = async () => {
    setBoosting(true);
    setRamMsg(null);
    try {
      const r = await clearStandbyRam(lang);
      if (mounted.current) setRamMsg(r.ok ? `✓ ${r.output}` : `✗ ${r.output}`);
    } catch (err) {
      if (mounted.current) setRamMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (mounted.current) setBoosting(false);
    }
  };

  const scoreColor = !score ? "#6c6c75" : score.pct >= 80 ? "#00e676" : score.pct >= 45 ? "#ffd24a" : "#ff8a65";
  const gmStatus = !enabled ? t("panel.gmOffHint") : playing ? `${t("gm.playingPre")} ${playing}` : t("gm.watching").replace(/^●\s*/, "");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1100px] mx-auto px-8 pt-3 pb-8">
        <div className="mb-7">
          <h1 className="text-[24px] font-semibold text-text tracking-[-0.02em]">{t("page.panel.title")}</h1>
          <p className="text-text-mute text-[13px] mt-1.5 truncate">{sys || t("page.panel.sub")}</p>
        </div>

        <div className="grid grid-cols-[1.35fr_1fr] gap-4 mb-4">
          {/* Estado de optimización */}
          <NeonCard className="flex items-center gap-6">
            <Ring pct={score?.pct ?? 0} color={scoreColor} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-text">{t("panel.statusTitle")}</div>
              {score ? (
                score.missing.length === 0 ? (
                  <p className="text-[13px] text-text-dim mt-1">{t("panel.allApplied")}</p>
                ) : (
                  <p className="text-[13px] text-text-dim mt-1 leading-relaxed">
                    {score.applied}/{score.total} {t("panel.keyApplied")}{" "}
                    <span className="text-text-mute">{score.missing.slice(0, 2).map((m) => opName(m, lang)).join(" · ")}{score.missing.length > 2 ? ` ${t("common.and")} ${score.missing.length - 2} ${t("common.more")}` : ""}</span>
                  </p>
                )
              ) : (
                <p className="text-[13px] text-text-mute mt-1">{t("panel.reading")}</p>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={() => onNavigate("opt")} className="btn btn-primary">{t("panel.optimizeNow")}</button>
                <button onClick={() => onNavigate("health")} className="btn btn-ghost">{t("nav.health")}</button>
              </div>
            </div>
          </NeonCard>

          {/* En vivo */}
          <NeonCard>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[13px] font-medium text-text">{t("panel.liveUsage")}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            </div>
            <div className="space-y-3.5">
              <Meter label="CPU" value={stats.cpu} color="#ff8a65" spark />
              <Meter label="RAM" value={stats.ram} color="var(--color-accent)" />
              <Meter label={t("panel.disk")} value={stats.disk} color="#3b9eff" />
            </div>
            <div className="flex gap-4 mt-4 pt-4 border-t border-line">
              <Temp label={t("panel.cpuTemp")} value={temps.cpu} />
              <Temp label={t("panel.gpuTemp")} value={temps.gpu} />
            </div>
          </NeonCard>
        </div>

        {/* Accesos rápidos */}
        <div className="text-[12px] font-medium text-text-mute mb-2.5">{t("panel.quick")}</div>
        <div className="grid grid-cols-4 gap-4">
          <Quick icon={<RamIcon />} title={t("panel.freeRam")} busy={boosting}
            detail={boosting ? t("panel.freeing") : ramMsg ? ramMsg.replace(/^[✓✗]\s*/, "") : t("panel.qa.ram")}
            tone={ramMsg ? (ramMsg.startsWith("✓") ? "#00e676" : "#ff5470") : undefined} onClick={boost} />
          <Quick icon={<IconGlobe />} title={t("net.tab.speed")} detail={t("panel.qa.speed")} onClick={() => onNavigate("network")} />
          <Quick icon={<IconGamepad />} title="Auto Game-Mode" detail={gmStatus} tone={playing ? "#00e676" : undefined} onClick={() => onNavigate("gamemode")} />
          <Quick icon={<IconLayers />} title={t("nav.profiles")} detail={t("panel.qa.profiles")} onClick={() => onNavigate("profiles")} />
        </div>
      </div>
    </div>
  );
}
