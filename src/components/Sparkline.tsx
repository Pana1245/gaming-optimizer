import { useEffect, useRef, useState } from "react";

/** Mini-gráfico en vivo: mantiene un buffer rodante y dibuja línea + área.
 *  `value` es 0-100; se agrega al historial cada vez que cambia. */
export default function Sparkline({
  value, color, width = 132, height = 40, points = 48,
}: { value: number; color: string; width?: number; height?: number; points?: number }) {
  const [buf, setBuf] = useState<number[]>(() => Array(points).fill(value));
  const last = useRef(value);

  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    setBuf((b) => [...b.slice(1), value]);
  }, [value]);

  const stepX = width / (points - 1);
  const toY = (v: number) => height - (Math.max(0, Math.min(100, v)) / 100) * (height - 2) - 1;
  const line = buf.map((v, i) => `${(i * stepX).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const gid = `sk-${Math.abs(hash(color))}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}
