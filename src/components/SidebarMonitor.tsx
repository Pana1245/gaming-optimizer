import { useEffect, useState } from "react";
import { getStats } from "../lib/api";

const Bar = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] font-medium text-text-mute w-7">{label}</span>
    <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${Math.min(100, value)}%`, background: color }}
      />
    </div>
    <span className="text-[10px] text-text-dim tabular-nums w-8 text-right">{value.toFixed(0)}%</span>
  </div>
);

export default function SidebarMonitor() {
  const [s, setS] = useState({ cpu: 0, ram: 0, disk: 0 });

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const r = await getStats(); if (alive) setS(r); } catch {}
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="mx-1 mb-1 p-3 rounded-lg bg-white/[0.02] border border-line space-y-2.5">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold tracking-wider text-text-mute uppercase">Rendimiento</span>
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
      </div>
      <Bar label="CPU" value={s.cpu} color="#ff8a65" />
      <Bar label="RAM" value={s.ram} color="#00e676" />
      <Bar label="SSD" value={s.disk} color="#3b9eff" />
    </div>
  );
}
