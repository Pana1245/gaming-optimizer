import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import NeonCard, { HudTitle } from "../components/NeonCard";
import { getStats, clearStandbyRam, type Stats } from "../lib/api";
import { readScore, readTemps, type ScoreResult, type Temps } from "../lib/metrics";
import { useGameMode } from "../lib/gameMode";
import { useI18n } from "../lib/i18n";

function Ring({ pct, color }: { pct: number; color: string }) {
  const { t } = useI18n();
  const R = 52, C = 2 * Math.PI * R;
  return (
    <svg width="128" height="128" viewBox="0 0 128 128">
      <circle cx="64" cy="64" r={R} fill="none" stroke="#1c1c1f" strokeWidth="10" />
      <motion.circle
        cx="64" cy="64" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={C} transform="rotate(-90 64 64)"
        initial={{ strokeDashoffset: C }}
        animate={{ strokeDashoffset: C - (C * pct) / 100 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      <text x="64" y="60" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="700">{pct}%</text>
      <text x="64" y="78" textAnchor="middle" fill="#8a8a8f" fontSize="10">{t("panel.optimized")}</text>
    </svg>
  );
}

function TempCard({ label, value, color, cpuHint }: { label: string; value: number | null; color: string; cpuHint?: boolean }) {
  const { t, lang } = useI18n();
  const status = value === null
    ? (cpuHint ? (lang === "en" ? "No sensor · needs LibreHardwareMonitor" : "Sin sensor · requiere LibreHardwareMonitor") : t("panel.tempNA"))
    : value < 70 ? t("panel.tempHealthy")
    : value < 85 ? t("panel.tempWarm") : t("panel.tempHot");
  return (
    <NeonCard className="flex-1">
      <div className="text-[12px] uppercase tracking-wider text-text-mute mb-1">{label}</div>
      <div className="text-[28px] font-bold leading-none" style={{ color: value !== null ? color : "#55555a" }}>
        {value !== null ? `${value}°C` : "N/D"}
      </div>
      <div className="text-[11.5px] text-text-mute mt-1.5">{status}</div>
    </NeonCard>
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
    const ti = setInterval(loadTemps, 5000);
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
            <TempCard label="CPU temp" value={temps.cpu} color="#ff8a65" cpuHint />
            <TempCard label="GPU temp" value={temps.gpu} color="#3b9eff" />
          </div>
          <NeonCard>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-text-mute">{t("panel.liveUsage")}</span>
              <span className="font-mono text-text-dim">
                CPU <span style={{ color: "#ff8a65" }}>{stats.cpu.toFixed(0)}%</span> · RAM <span style={{ color: "#00e676" }}>{stats.ram.toFixed(0)}%</span> · SSD <span style={{ color: "#3b9eff" }}>{stats.disk.toFixed(0)}%</span>
              </span>
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
