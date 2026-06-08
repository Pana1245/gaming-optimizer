import { createContext, useContext, useState, type ReactNode } from "react";

export type Lang = "es" | "en";

// Diccionario: clave → { es, en }. Cubre navegación y encabezados de página.
const STR: Record<string, { es: string; en: string }> = {
  // ── Navegación ──
  "nav.opt": { es: "Optimizaciones", en: "Optimizations" },
  "nav.engine": { es: "Motor de Cambios", en: "Change Engine" },
  "nav.gamemode": { es: "Auto Game-Mode", en: "Auto Game-Mode" },
  "nav.clean": { es: "Limpieza", en: "Cleanup" },
  "nav.startup": { es: "Inicio", en: "Startup" },
  "nav.apps": { es: "Instalar Apps", en: "Install Apps" },
  "nav.uninstall": { es: "Desinstalar", en: "Uninstall" },
  "nav.restore": { es: "Restaurar", en: "Restore" },
  "nav.repair": { es: "Reparar", en: "Repair" },
  "nav.system": { es: "Sistema", en: "System" },
  "nav.guide": { es: "Guía", en: "Guide" },

  // ── Encabezados de página ──
  "page.opt.title": { es: "Optimizaciones", en: "Optimizations" },
  "page.opt.sub": { es: "Seleccioná las mejoras y aplicá. Se crea un backup automático antes.", en: "Pick the tweaks and apply. An automatic backup is created first." },
  "page.engine.title": { es: "Motor de Cambios", en: "Change Engine" },
  "page.engine.sub": { es: "Cada cambio se lee, se aplica, se verifica y se puede deshacer uno por uno.", en: "Every change is read, applied, verified and can be undone one by one." },
  "page.gamemode.title": { es: "Auto Game-Mode", en: "Auto Game-Mode" },
  "page.gamemode.sub": { es: "Detecta cuándo abrís un juego, activa el modo gamer y revierte solo al cerrarlo.", en: "Detects when you launch a game, enables game mode and reverts on exit." },
  "page.clean.title": { es: "Limpieza", en: "Cleanup" },
  "page.clean.sub": { es: "Analizá y liberá espacio borrando temporales, cachés y archivos basura.", en: "Scan and free space by removing temp files, caches and junk." },
  "page.startup.title": { es: "Inicio", en: "Startup" },
  "page.startup.sub": { es: "Programas que arrancan con Windows. Desactivá los que no necesites para acelerar el encendido.", en: "Apps that start with Windows. Disable the ones you don't need to speed up boot." },
  "page.apps.title": { es: "Instalar Apps", en: "Install Apps" },
  "page.apps.sub": { es: "Elegí aplicaciones y se instalan automáticamente con winget.", en: "Pick apps and they install automatically with winget." },
  "page.uninstall.title": { es: "Desinstalar", en: "Uninstall" },
  "page.uninstall.sub": { es: "Quitá programas y borrá sus restos (estilo Geek Uninstaller).", en: "Remove programs and wipe their leftovers (Geek Uninstaller style)." },
  "page.restore.title": { es: "Restaurar", en: "Restore" },
  "page.restore.sub": { es: "Revertí cambios con puntos de restauración o backups del registro.", en: "Roll back changes with restore points or registry backups." },
  "page.repair.title": { es: "Reparar", en: "Repair" },
  "page.repair.sub": { es: "Herramientas para reparar Windows cuando algo falla.", en: "Tools to repair Windows when something breaks." },
  "page.system.title": { es: "Sistema", en: "System" },
  "page.system.sub": { es: "Uso de hardware en tiempo real", en: "Real-time hardware usage" },
  "page.guide.title": { es: "Guía", en: "Guide" },
  "page.guide.sub": { es: "Qué hace cada sección y cómo funciona por dentro.", en: "What each section does and how it works under the hood." },
};

interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string; }
const I18nCtx = createContext<Ctx>({ lang: "es", setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangS] = useState<Lang>(() => (localStorage.getItem("lang") as Lang) || "es");
  const setLang = (l: Lang) => { localStorage.setItem("lang", l); setLangS(l); };
  const t = (k: string) => STR[k]?.[lang] ?? k;
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
