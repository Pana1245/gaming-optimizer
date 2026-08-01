import { useState } from "react";

export type AccentName = "green" | "cyan" | "violet" | "orange";

/** Presets de color de acento. `accent` es el principal, `dim` el apagado y
 *  `bright` el brillante (hover). Se aplican como variables CSS en :root, así
 *  todas las utilidades `*-accent` de Tailwind y los glows los siguen en vivo. */
export const ACCENTS: Record<AccentName, { label: string; accent: string; dim: string; bright: string }> = {
  green:  { label: "Verde",   accent: "#00e676", dim: "#00b85f", bright: "#19ff8c" },
  cyan:   { label: "Cyan",    accent: "#24c8db", dim: "#1a9aab", bright: "#5fe0ef" },
  violet: { label: "Violeta", accent: "#a855f7", dim: "#8b3fd6", bright: "#c084fc" },
  orange: { label: "Naranja", accent: "#ff8a3d", dim: "#e0702a", bright: "#ffab6b" },
};

const KEY = "go_accent";

export function currentAccent(): AccentName {
  const v = localStorage.getItem(KEY);
  return v && v in ACCENTS ? (v as AccentName) : "green";
}

export function applyAccent(name: AccentName) {
  const a = ACCENTS[name] ?? ACCENTS.green;
  const s = document.documentElement.style;
  s.setProperty("--color-accent", a.accent);
  s.setProperty("--color-accent-dim", a.dim);
  s.setProperty("--color-accent-2", a.bright);
  localStorage.setItem(KEY, name);
}

/** Llamar una vez al arrancar (antes de renderizar) para aplicar el guardado. */
export function initAccent() {
  applyAccent(currentAccent());
}

export function useAccent() {
  const [name, setName] = useState<AccentName>(currentAccent());
  const set = (n: AccentName) => { applyAccent(n); setName(n); };
  return { name, set };
}
