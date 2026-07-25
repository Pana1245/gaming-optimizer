import { createContext, useContext, useState, type ReactNode } from "react";

export type Lang = "es" | "en";

// Diccionario: clave → { es, en }. Cubre navegación y encabezados de página.
const STR: Record<string, { es: string; en: string }> = {
  // ── Navegación ──
  "nav.panel": { es: "Panel", en: "Dashboard" },
  "nav.profiles": { es: "Perfiles", en: "Profiles" },
  "nav.network": { es: "Red", en: "Network" },
  "nav.gpu": { es: "Gráficos", en: "Graphics" },
  "nav.opt": { es: "Optimizaciones", en: "Optimizations" },
  "nav.engine": { es: "Motor de Cambios", en: "Change Engine" },
  "nav.gamemode": { es: "Auto Game-Mode", en: "Auto Game-Mode" },
  "nav.clean": { es: "Limpieza", en: "Cleanup" },
  "nav.startup": { es: "Inicio", en: "Startup" },
  "nav.apps": { es: "Instalar Apps", en: "Install Apps" },
  "nav.uninstall": { es: "Desinstalar", en: "Uninstall" },
  "nav.restore": { es: "Restaurar", en: "Restore" },
  "nav.repair": { es: "Reparar", en: "Repair" },
  "nav.tools": { es: "Herramientas", en: "Tools" },
  "nav.system": { es: "Sistema", en: "System" },
  "nav.guide": { es: "Guía", en: "Guide" },

  // ── Encabezados de página ──
  "page.panel.title": { es: "Panel", en: "Dashboard" },
  "page.panel.sub": { es: "Estado de tu PC de un vistazo: optimización, temperaturas y memoria.", en: "Your PC at a glance: optimization, temperatures and memory." },
  "page.profiles.title": { es: "Perfiles", en: "Profiles" },
  "page.profiles.sub": { es: "Configuraciones completas con un clic. Todo queda reversible en el Motor.", en: "Full setups in one click. Everything stays reversible in the Engine." },
  "page.network.title": { es: "Red", en: "Network" },
  "page.network.sub": { es: "Cambiá el DNS y medí tu ping a servidores clave.", en: "Switch DNS and measure your ping to key servers." },
  "page.gpu.title": { es: "Gráficos", en: "Graphics" },
  "page.gpu.sub": { es: "Optimizá tu placa de video y, si es NVIDIA, forzá el máximo rendimiento.", en: "Optimize your graphics card and, if NVIDIA, force maximum performance." },
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
  "page.tools.title": { es: "Herramientas", en: "Tools" },
  "page.tools.sub": { es: "Utilidades: controlar Windows Update y desbloquear archivos en uso.", en: "Utilities: control Windows Update and unlock files in use." },
  "page.system.title": { es: "Sistema", en: "System" },
  "page.system.sub": { es: "Uso de hardware en tiempo real", en: "Real-time hardware usage" },
  "page.guide.title": { es: "Guía", en: "Guide" },
  "page.guide.sub": { es: "Qué hace cada sección y cómo funciona por dentro.", en: "What each section does and how it works under the hood." },

  // ── Comunes ──
  "common.and": { es: "y", en: "and" },
  "common.more": { es: "más", en: "more" },
  "mon.performance": { es: "Rendimiento", en: "Performance" },

  // ── Panel ──
  "panel.optimized": { es: "optimizado", en: "optimized" },
  "panel.statusTitle": { es: "Estado de optimización", en: "Optimization status" },
  "panel.allApplied": { es: "Todos los tweaks clave están aplicados. 🎉", en: "All key tweaks are applied. 🎉" },
  "panel.keyApplied": { es: "tweaks clave aplicados. Faltan:", en: "key tweaks applied. Missing:" },
  "panel.reading": { es: "Leyendo el registro…", en: "Reading the registry…" },
  "panel.scoreHint": { es: "Se mide leyendo el estado real del registro (Gaming + Privacidad). Aplicalos desde Optimizaciones o el Motor.", en: "Measured from the actual registry state (Gaming + Privacy). Apply them from Optimizations or the Engine." },
  "panel.tempNA": { es: "sensor no disponible", en: "sensor unavailable" },
  "panel.tempHealthy": { es: "temperatura sana", en: "healthy temperature" },
  "panel.tempWarm": { es: "caliente bajo carga", en: "warm under load" },
  "panel.tempHot": { es: "¡muy caliente!", en: "very hot!" },
  "panel.liveUsage": { es: "Uso en vivo", en: "Live usage" },
  "panel.ramHint": { es: "Libera la memoria standby (archivos cacheados). Útil justo antes de abrir un juego pesado.", en: "Frees standby memory (cached files). Handy right before opening a heavy game." },
  "panel.freeRam": { es: "Liberar RAM", en: "Free RAM" },
  "panel.freeing": { es: "Liberando…", en: "Freeing…" },
  "panel.freed": { es: "Liberado · RAM", en: "Freed · RAM" },
  "panel.gmOffHint": { es: "Desactivado — activalo en su sección.", en: "Disabled — turn it on in its section." },

  // ── Auto Game-Mode (compartido) ──
  "gm.off": { es: "Desactivado", en: "Disabled" },
  "gm.playingPre": { es: "Jugando a", en: "Playing" },
  "gm.gamerActive": { es: "modo gamer activo", en: "game mode active" },
  "gm.watching": { es: "● Vigilando juegos en segundo plano…", en: "● Watching games in the background…" },
  "gm.proTitle": { es: "Modo Pro ⚡", en: "Pro Mode ⚡" },
  "gm.proHint": { es: "Además del plan de energía: prioridad Alta al juego, baja apps de fondo (Spotify, Chrome…) y libera RAM standby. Todo se restaura al cerrar.", en: "Beyond the power plan: High priority for the game, lowers background apps (Spotify, Chrome…) and frees standby RAM. Everything is restored on exit." },
  "gm.bgHint": { es: "Funciona en segundo plano: aunque cambies de sección o cierres esta pantalla, el modo gamer se activa solo.", en: "Runs in the background: even if you change sections or close this screen, game mode kicks in on its own." },
  "gm.addPlaceholder": { es: "agregar juego (ej: juego.exe)", en: "add game (e.g. game.exe)" },
  "gm.add": { es: "Agregar", en: "Add" },
  "gm.detect": { es: "🔍 Detectar instalados", en: "🔍 Detect installed" },
  "gm.scanning": { es: "Buscando…", en: "Scanning…" },
  "gm.foundNone": { es: "No encontré juegos en Steam/Epic/Riot. Agregá el .exe a mano.", en: "No games found in Steam/Epic/Riot. Add the .exe manually." },
  "gm.foundPre": { es: "Encontré", en: "Found" },
  "gm.gamesWord": { es: "juegos", en: "games" },
  "gm.newWord": { es: "nuevos", en: "new" },
  "gm.allThere": { es: "(ya estaban todos)", en: "(all already added)" },
  "gm.addAll": { es: "+ Agregar todos", en: "+ Add all" },
  "gm.already": { es: "ya está", en: "added" },
  "gm.addOne": { es: "agregar", en: "add" },
  "gm.remove": { es: "Quitar", en: "Remove" },
  "gm.noGames": { es: "Sin juegos. Agregá alguno arriba.", en: "No games. Add one above." },
  "gm.activity": { es: "Actividad", en: "Activity" },
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
