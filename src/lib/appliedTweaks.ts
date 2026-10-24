// Qué optimizaciones se aplicaron y desde dónde ("opt" = Optimizaciones, o el id del perfil),
// para marcarlas en Optimizaciones. Restaurar vuelve al respaldo original y las borra.
// shortcut: es lo que la app aplicó, no una lectura del sistema; si alguien lo cambia a mano no se entera.
const KEY = "opt_applied";
export type Applied = Record<string, string>;

export const loadApplied = (): Applied => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
};
export const markApplied = (name: string, from: string) => {
  try { localStorage.setItem(KEY, JSON.stringify({ ...loadApplied(), [name]: from })); } catch { /* sin storage: no se marca */ }
};
export const clearApplied = () => { try { localStorage.removeItem(KEY); } catch { /* nada */ } };
