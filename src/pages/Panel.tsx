import { useEffect, useRef, useState } from "react";
import { motion, animate } from "framer-motion";
import NeonCard, { HudTitle } from "../components/NeonCard";
import Sparkline from "../components/Sparkline";
import { getStats, clearStandbyRam, type Stats } from "../lib/api";
import { readScore, readTemps, type ScoreResult, type Temps } from "../lib/metrics";
import { useGameMode } from "../lib/gameMode";
import { useI18n } from "../lib/i18n";

/** Número que anima desde 0 (o desde su valor previo) hasta el objetivo. */
function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [d, setD] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.9, ease: "easeOut", onUpdate: (v) => setD(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);
  return <>{d.toFixed(decimals)}</>;
}

function Ring({ pct, color }: { pct: number; color: string }) {
  const { t } = useI18n();
  const R = 52, C = 2 * Math.PI * R;
  const gid = `ring-grad-${color.replace("#", "")}`;
  return (
    <svg width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.65" />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
      </defs>
      <circle cx="64" cy="64" r={R} fill="none" stroke="#1c1c1f" strokeWidth="10" />
      <motion.circle
        cx="64" cy="64" r={R} fill="none" stroke={`url(#${gid})`} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={C} transform="rotate(-90 64 64)"
        style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
        initial={{ strokeDashoffset: C }}
        animate={{ strokeDashoffset: C - (C * pct) / 100 }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
      <text x="64" y="60" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="700">
        <AnimatedNumber value={pct} />%
      </text>
      <text x="64" y="78" textAnchor="middle" fill="#8a8a8f" fontSize="10">{t("panel.optimized")}</text>
    </svg>
  );
}

function TempCard({ label, value, color }: { label: string; value: number | null; color: string }) {
  const { t } = useI18n();
  const status = value === null ? t("panel.tempNA")
    : value < 70 ? t("panel.tempHealthy")
    : value < 85 ? t("panel.tempWarm") : t("panel.tempHot");
  return (
    <NeonCard className="flex-1">
      <div className="text-[12px] uppercase tracking-wider text-text-mute mb-1">{label}</div>
      <div className="text-[28px] font-bold leading-none" style={{ color: value !== null ? color : "#55555a" }}>
        {value !== null ? <><AnimatedNumber value={value} />°C</> : "N/D"}
      </div>
      <div className="text-[11.5px] text-text-mute mt-1.5">{status}</div>
    </NeonCard>
  );
}

function LiveStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-medium text-text-mute">{label}</span>
        <span className="text-[15px] font-semibold tabular-nums" style={{ color }}>{value.toFixed(0)}%</span>
      </div>
      <Sparkline value={value} color={color} width={150} height={38} />
    </div>
  );
}

export default function Panel() {
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [temps, setTemps] = useState<Temps>({ cpu: null, gpu: null });
  const [stats, setStats] = useState<Stats>({ cpu: 0, ram: 0, disk: 0 });
  const [ramMsg, setRamMsg] = useState<string | null>(null);
  const [boosting, setBoosting] = useState(false);
  const { enabled, playing } = useGameMode();
  const { t, lang } = useI18n();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    readScore().then((s) => mounted.current && setScore(s)).catch(() => {});
    const loadTemps = () => readTemps().then((t) => mounted.current && setTemps(t)).catch(() => {});
    loadTemps();
    const ti = setInterval(loadTemps, 10000);
    const si = setInterval(() => getStats().then((s) => mounted.current && setStats(s)).catch(() => {}), 2000);
    return () => { mounted.current = false; clearInterval(ti); clearInterval(si); };
  }, []);

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

  const scoreColor = !score ? "#3b9eff" : score.pct >= 80 ? "#00e676" : score.pct >= 45 ? "#ffd24a" : "#ff8a65";

  const gmStatus = !enabled ? t("panel.gmOffHint")
    : playing ? `🎮 ${t("gm.playingPre")} ${playing} — ${t("gm.gamerActive")}`
    : t("gm.watching");

  return (
    <div className="h-full flex flex-col px-8 py-7 overflow-y-auto">
      <HudTitle tkey="page.panel" />

      <div className="grid grid-cols-[auto_1fr] gap-6 mb-5 items-stretch">
        {/* Puntaje */}
        <NeonCard className="flex items-center gap-6 px-7">
          <Ring pct={score?.pct ?? 0} color={scoreColor} />
          <div className="max-w-[260px]">
            <div className="text-[14px] font-semibold text-text mb-1">{t("panel.statusTitle")}</div>
            {score ? (
              score.missing.length === 0 ? (
                <p className="text-[13px] text-text-dim">{t("panel.allApplied")}</p>
              ) : (
                <p className="text-[13px] text-text-dim leading-relaxed">
                  {score.applied}/{score.total} {t("panel.keyApplied")}{" "}
                  <span className="text-text-mute">{score.missing.slice(0, 3).join(" · ")}{score.missing.length > 3 ? ` ${t("common.and")} ${score.missing.length - 3} ${t("common.more")}` : ""}</span>
                </p>
              )
            ) : (
              <p className="text-[13px] text-text-mute">{t("panel.reading")}</p>
            )}
            <p className="text-[11.5px] text-text-mute mt-2">{t("panel.scoreHint")}</p>
          </div>
        </NeonCard>

        {/* Estado en vivo */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <TempCard label="CPU temp" value={temps.cpu} color="#ff8a65" />
            <TempCard label="GPU temp" value={temps.gpu} color="#3b9eff" />
          </div>
          <NeonCard>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] uppercase tracking-wider text-text-mute">{t("panel.liveUsage")}</span>
              <span className="text-[12px] font-mono text-text-mute">SSD <span style={{ color: "#3b9eff" }}>{stats.disk.toFixed(0)}%</span></span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <LiveStat label="CPU" value={stats.cpu} color="#ff8a65" />
              <LiveStat label="RAM" value={stats.ram} color="#00e676" />
            </div>
          </NeonCard>
        </div>
      </div>

      {/* RAM Booster + Game-Mode */}
      <div className="grid grid-cols-2 gap-6">
        <NeonCard>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[14px] font-semibold text-text">RAM Booster</div>
              <p className="text-[12.5px] text-text-mute mt-1">{t("panel.ramHint")}</p>
              {ramMsg && <p className="text-[12.5px] mt-2" style={{ color: ramMsg.startsWith("✓") ? "#00e676" : "#ff5470" }}>{ramMsg}</p>}
            </div>
            <button onClick={boost} disabled={boosting} className="btn btn-primary shrink-0">
              {boosting ? t("panel.freeing") : t("panel.freeRam")}
            </button>
          </div>
        </NeonCard>

        <NeonCard>
          <div className="text-[14px] font-semibold text-text">Auto Game-Mode</div>
          <p className="text-[13px] mt-1" style={{ color: playing ? "#00e676" : "#8a8a8f" }}>{gmStatus}</p>
        </NeonCard>
      </div>
    </div>
  );
}
