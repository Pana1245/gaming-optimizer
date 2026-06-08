import { useEffect, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import {
  AreaChart, Area, ResponsiveContainer, YAxis, Tooltip,
} from "recharts";
import { getStats, getSystemInfo, type SysInfo } from "../lib/api";
import NeonCard, { HudTitle } from "../components/NeonCard";

interface Pt { t: number; v: number; }
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
                formatter={(v: any) => [`${Number(v).toFixed(0)}%`, label]}
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
  const [cpu, setCpu] = useState<Pt[]>([]);
  const [ram, setRam] = useState<Pt[]>([]);
  const [cpuV, setCpuV] = useState(0);
  const [ramV, setRamV] = useState(0);
  const [info, setInfo] = useState<SysInfo | null>(null);

  useEffect(() => {
    let t = 0;
    const tick = async () => {
      try {
        const s = await getStats();
        setCpuV(s.cpu); setRamV(s.ram);
        setCpu((d) => [...d, { t, v: s.cpu }].slice(-MAX));
        setRam((d) => [...d, { t, v: s.ram }].slice(-MAX));
        t++;
      } catch {}
    };
    const id = setInterval(tick, 1000);
    tick();
    getSystemInfo().then(setInfo).catch(() => {});
    return () => clearInterval(id);
  }, []);

  return (
    <div className="h-full flex flex-col px-8 py-7 overflow-y-auto">
      <HudTitle tkey="page.system" />

      <motion.div initial="hidden" animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
        <div className="flex gap-4 mb-4">
          <Graph data={cpu} color="#00e676" label="CPU" value={cpuV} />
          <Graph data={ram} color="#3b9eff" label="RAM" value={ramV} />
        </div>

        <motion.div variants={itemV}>
          <NeonCard>
            <span className="section-label">Información del equipo</span>
            {info ? (
              <div className="mt-4 grid grid-cols-[120px_1fr] gap-y-2.5 text-[13px]">
                <Row k="Windows" v={`${info.windows} (W${info.win_ver})`} />
                <Row k="CPU" v={info.cpu} />
                <Row k="Núcleos" v={`${info.cores} físicos · ${info.threads} lógicos`} />
                <Row k="GPU" v={info.gpu || "—"} />
                <Row k="RAM" v={`${info.ram_gb} GB`} />
              </div>
            ) : (
              <div className="text-text-mute text-sm mt-3">Cargando…</div>
            )}
          </NeonCard>
        </motion.div>
      </motion.div>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <>
    <span className="text-text-mute">{k}</span>
    <span className="text-text">{v}</span>
  </>
);
