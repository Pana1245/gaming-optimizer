import { useEffect, useRef, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import {
  AreaChart, Area, ResponsiveContainer, YAxis, Tooltip,
} from "recharts";
import { getStats, getSystemInfo, runPowershell, type SysInfo } from "../lib/api";
import NeonCard from "../components/NeonCard";
import { Page } from "../components/ui";
import { useI18n } from "../lib/i18n";
import { useAppVisible } from "../lib/useAppVisible";
import { useAccent, ACCENTS } from "../lib/theme";

interface Pt { t: number; v: number; }

// Estado REAL (no el registro): VirtualizationBasedSecurityStatus 2 = corriendo;
// SecurityServicesRunning contiene 2 = Integridad de memoria (HVCI) activa.
const VBS_PS = String.raw`$d = Get-CimInstance -Namespace root\Microsoft\Windows\DeviceGuard -ClassName Win32_DeviceGuard -ErrorAction SilentlyContinue
"vbs=$([int]$d.VirtualizationBasedSecurityStatus);hvci=$([int](@($d.SecurityServicesRunning) -contains 2))"`;
const MAX = 40;

function AnimatedNumber({ value }: { value: number }) {
  const spring = useSpring(value, { stiffness: 140, damping: 22 });
  const text = useTransform(spring, (v) => Math.round(v).toString());
  useEffect(() => { spring.set(value); }, [value, spring]);
  return <motion.span>{text}</motion.span>;
}

const itemV = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

function Graph({ data, color, label, value }: { data: Pt[]; color: string; label: string; value: number; }) {
  const id = `grad-${color.replace("#", "")}`;
  return (
    <motion.div className="flex-1" variants={itemV}>
      <NeonCard>
        <div className="flex items-center justify-between mb-1">
          <span className="section-label">{label}</span>
          <span className="text-[26px] font-semibold text-text tabular-nums tracking-tight">
            <AnimatedNumber value={value} /><span className="text-text-mute text-[16px]">%</span>
          </span>
        </div>
        <div className="h-[110px] -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis domain={[0, 100]} hide />
              <Tooltip
                contentStyle={{ background: "#111113", border: "1px solid #262629", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ display: "none" }}
                formatter={(v: unknown) => [`${Number(v).toFixed(0)}%`, label]}
              />
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.8}
                fill={`url(#${id})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </NeonCard>
    </motion.div>
  );
}

export default function Sistema() {
  const { t } = useI18n();
  // Mismos colores que el Panel: CPU naranja, RAM con el acento elegido.
  const { name: accent } = useAccent();
  const [cpu, setCpu] = useState<Pt[]>([]);
  const [ram, setRam] = useState<Pt[]>([]);
  const [cpuV, setCpuV] = useState(0);
  const [ramV, setRamV] = useState(0);
  const [info, setInfo] = useState<SysInfo | null>(null);
  const [vbs, setVbs] = useState<{ vbs: boolean; hvci: boolean } | null>(null);

  const visible = useAppVisible();
  const tRef = useRef(0);

  // Gráfico en vivo cada 1 s, sólo con la ventana a la vista (oculta en la bandeja se pausa).
  useEffect(() => {
    if (!visible) return;
    const tick = async () => {
      try {
        const s = await getStats();
        setCpuV(s.cpu); setRamV(s.ram);
        const t = tRef.current++;
        setCpu((d) => [...d, { t, v: s.cpu }].slice(-MAX));
        setRam((d) => [...d, { t, v: s.ram }].slice(-MAX));
      } catch { /* sin datos esta vez: el próximo tick reintenta */ }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [visible]);

  useEffect(() => {
    getSystemInfo().then(setInfo).catch(() => {});
    runPowershell(VBS_PS).then((r) => {
      const m = r.output.match(/vbs=(\d+);hvci=(\d+)/);
      if (m) setVbs({ vbs: m[1] === "2", hvci: m[2] === "1" });
    }).catch(() => {});
  }, []);

  return (
    <Page tkey="page.system" scroll>

      <motion.div initial="hidden" animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
        <div className="flex gap-4 mb-4">
          <Graph data={cpu} color="#ff8a65" label="CPU" value={cpuV} />
          <Graph data={ram} color={ACCENTS[accent].accent} label="RAM" value={ramV} />
        </div>

        <motion.div variants={itemV}>
          <NeonCard>
            <span className="section-label">{t("sys.info")}</span>
            {info ? (
              <div className="mt-4 grid grid-cols-[120px_1fr] gap-y-2.5 text-[13px]">
                <Row k="Windows" v={`${info.windows} (W${info.win_ver})`} />
                <Row k="CPU" v={info.cpu} />
                <Row k={t("sys.cores")} v={t("sys.coresVal").replace("{p}", String(info.cores)).replace("{l}", String(info.threads))} />
                <Row k="GPU" v={(info.gpus?.length ? info.gpus.map((g) => g.name).join("  +  ") : info.gpu) || "—"} />
                <Row k="RAM" v={`${info.ram_gb} GB`} />
                {vbs && (
                  <Row k="VBS" v={vbs.vbs
                    ? `${t("sys.vbsOn")}${vbs.hvci ? ` · ${t("sys.hvciOn")}` : ""} — ${t("sys.vbsHint")}`
                    : t("sys.vbsOff")} />
                )}
              </div>
            ) : (
              <div className="text-text-mute text-sm mt-3">{t("sys.loading")}</div>
            )}
          </NeonCard>
        </motion.div>
      </motion.div>
    </Page>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <>
    <span className="text-text-mute">{k}</span>
    <span className="text-text">{v}</span>
  </>
);
