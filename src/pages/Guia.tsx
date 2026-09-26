import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HudTitle } from "../components/NeonCard";
import { useI18n } from "../lib/i18n";

type L = { es: string; en: string };
interface Item { id: string; icon: string; title: L; desc: L; points: { es: string[]; en: string[] }; }

const GUIDE: Item[] = [
  {
    id: "intro", icon: "🛡️",
    title: { es: "Antes de empezar (importante)", en: "Before you start (important)" },
    desc: { es: "Cómo trabaja la app en general.", en: "How the app works in general." },
    points: {
      es: [
        "Corre como administrador (te pide permiso UAC al abrir) — lo necesita para tocar el sistema.",
        "Antes de aplicar optimizaciones crea un backup del registro + un punto de restauración automático.",
        "Funciona en Windows 10 y 11; los tweaks que son solo de W11 aparecen con la etiqueta [W11].",
        "Cada tweak tiene un punto de color: 🟢 seguro · 🟡 avanzado (modifica ajustes más sensibles).",
        "Atajos: Ctrl+K abre el buscador de secciones. En la barra inferior elegís el color de acento y el idioma (ES/EN).",
      ],
      en: [
        "It runs as administrator (it asks for UAC permission on launch) — it needs that to change system settings.",
        "Before applying optimizations it creates a registry backup + an automatic restore point.",
        "Works on Windows 10 and 11; tweaks that are Windows 11-only show the [W11] tag.",
        "Each tweak has a colored dot: 🟢 safe · 🟡 advanced (changes more sensitive settings).",
        "Shortcuts: Ctrl+K opens the section search. In the bottom bar you pick the accent color and the language (ES/EN).",
      ],
    },
  },
  {
    id: "panel", icon: "📊",
    title: { es: "Panel", en: "Dashboard" },
    desc: { es: "Tu PC de un vistazo: puntaje, temperaturas y RAM.", en: "Your PC at a glance: score, temperatures and RAM." },
    points: {
      es: [
        "El puntaje se calcula LEYENDO el registro real: cuántos tweaks clave (Gaming + Privacidad) están aplicados.",
        "Temperaturas reales de CPU y GPU, leídas de los sensores del hardware.",
        "Gráfico en vivo de uso de CPU y RAM, más el uso del SSD.",
        "RAM Booster: libera la memoria standby (archivos cacheados) — útil antes de abrir un juego pesado.",
        "También muestra el estado del Auto Game-Mode.",
      ],
      en: [
        "The score is calculated by READING the actual registry: how many key tweaks (Gaming + Privacy) are applied.",
        "Real CPU and GPU temperatures, read from the hardware sensors.",
        "Live graph of CPU and RAM usage, plus SSD usage.",
        "RAM Booster: frees standby memory (cached files) — useful before launching a heavy game.",
        "It also shows the Auto Game-Mode status.",
      ],
    },
  },
  {
    id: "profiles", icon: "📚",
    title: { es: "Perfiles", en: "Profiles" },
    desc: { es: "Configuraciones completas con un solo clic.", en: "Complete setups with a single click." },
    points: {
      es: [
        "Competitivo: FPS y latencia al máximo (plan máximo, HAGS, CPU sin reserva, sin transparencias).",
        "Streaming: igual de rápido pero dejando CPU para el encoder de OBS.",
        "Equilibrado: valores estándar de Windows — usalo si algo anda raro.",
        "Ahorro: para notebooks o PCs encendidas todo el día.",
        "Todos los cambios pasan por el Motor: quedan en el Historial y se pueden deshacer.",
      ],
      en: [
        "Competitive: max FPS and lowest latency (max power plan, HAGS, no CPU reserve, no transparency).",
        "Streaming: just as fast, but leaves CPU for the OBS encoder.",
        "Balanced: standard Windows values — use it if something acts up.",
        "Power Saver: for laptops or PCs that stay on all day.",
        "Every change goes through the Change Engine: it's logged in the History and can be undone.",
      ],
    },
  },
  {
    id: "opt", icon: "🚀",
    title: { es: "Optimizaciones", en: "Optimizations" },
    desc: { es: "Aplica tweaks para mejorar rendimiento, red y privacidad.", en: "Applies tweaks to improve performance, network and privacy." },
    points: {
      es: [
        "Elegís los tweaks (vienen agrupados: Gaming, Red, Bloatware, Privacidad, Visual, Servicios, WinUtil…).",
        "“Modo Gamer” selecciona solo los tweaks críticos de rendimiento.",
        "La limpieza de bloatware está acá. Nunca toca Xbox / Game Pass, la Microsoft Store ni tus juegos (Minecraft, Roblox).",
        "Pasá el mouse sobre un tweak para ver qué hace exactamente (tooltip).",
        "Al terminar te ofrece reiniciar para aplicar todos los cambios.",
      ],
      en: [
        "You pick the tweaks (grouped: Gaming, Network, Bloatware, Privacy, Visual, Services, WinUtil…).",
        "“Gamer Mode” selects only the critical performance tweaks.",
        "Bloatware removal lives here. It never touches Xbox / Game Pass, the Microsoft Store or your games (Minecraft, Roblox).",
        "Hover over a tweak to see exactly what it does (tooltip).",
        "When it finishes it offers to restart so every change takes effect.",
      ],
    },
  },
  {
    id: "gpu", icon: "🖥️",
    title: { es: "Gráficos", en: "Graphics" },
    desc: { es: "Tu placa de video: detección, monitor y ajustes.", en: "Your graphics card: detection, monitor and tweaks." },
    points: {
      es: [
        "Detecta todas tus placas (NVIDIA, AMD e integradas) con su VRAM real.",
        "Monitor en vivo para NVIDIA: temperatura, uso, frecuencia, consumo y VRAM.",
        "Ajustes avanzados: TDR (evita reinicios del driver bajo carga) y MPO (arregla parpadeos/stutter).",
        "Máximo rendimiento para NVIDIA y AMD, con botón para restaurar.",
        "HAGS y Game DVR están en Optimizaciones → Gaming Performance.",
      ],
      en: [
        "Detects all your graphics cards (NVIDIA, AMD and integrated) with their real VRAM.",
        "Live monitor for NVIDIA: temperature, usage, clock, power draw and VRAM.",
        "Advanced tweaks: TDR (prevents driver resets under load) and MPO (fixes flicker/stutter).",
        "Maximum performance for NVIDIA and AMD, with a restore button.",
        "HAGS and Game DVR are in Optimizations → Gaming Performance.",
      ],
    },
  },
  {
    id: "engine", icon: "🛡️",
    title: { es: "Motor de Cambios", en: "Change Engine" },
    desc: { es: "La forma más segura de aplicar tweaks: auditada y reversible.", en: "The safest way to apply tweaks: audited and reversible." },
    points: {
      es: [
        "Por cada cambio: LEE el valor previo → lo APLICA → RE-LEE para VERIFICAR que realmente quedó.",
        "Todo queda en un historial persistente (sobrevive reinicios).",
        "En la pestaña Historial podés DESHACER cada cambio uno por uno, volviendo al valor exacto que tenías.",
        "Tiene ajustes que no están en Optimizaciones (Explorador, Privacidad, Sistema).",
      ],
      en: [
        "For each change it READS the previous value → APPLIES it → RE-READS it to VERIFY it actually stuck.",
        "Everything goes into a persistent history (survives restarts).",
        "In the History tab you can UNDO each change one by one, back to the exact value you had.",
        "It has tweaks that aren't in Optimizations (File Explorer, Privacy, System).",
      ],
    },
  },
  {
    id: "gamemode", icon: "🎮",
    title: { es: "Auto Game-Mode", en: "Auto Game-Mode" },
    desc: { es: "Activa el modo gamer solo cuando abrís un juego.", en: "Turns on gamer mode only when you launch a game." },
    points: {
      es: [
        "Un servicio en segundo plano vigila los procesos cada 3 segundos (funciona estés en la sección que estés).",
        "Detecta un juego de tu lista → guarda tu plan actual, activa el plan máximo + responsiveness gamer y te notifica.",
        "Modo Pro ⚡: además pone el juego en prioridad Alta, baja apps de fondo (Spotify, Chrome…) y libera RAM standby.",
        "Cerrás el juego → restaura TU plan anterior y las prioridades, y te avisa.",
        "“Detectar instalados” escanea Steam, Epic y Riot y llena la lista solo. También podés agregar .exe a mano.",
      ],
      en: [
        "A background service checks running processes every 3 seconds (it works whichever section you're in).",
        "It detects a game from your list → saves your current plan, enables the max plan + gamer responsiveness and notifies you.",
        "Pro Mode ⚡: also sets the game to High priority, lowers background apps (Spotify, Chrome…) and frees standby RAM.",
        "You close the game → it restores YOUR previous plan and priorities, and lets you know.",
        "“Detect installed” scans Steam, Epic and Riot and fills in the list for you. You can also add .exe files by hand.",
      ],
    },
  },
  {
    id: "network", icon: "🌐",
    title: { es: "Red", en: "Network" },
    desc: { es: "DNS más rápido y test de ping.", en: "Faster DNS and ping test." },
    points: {
      es: [
        "Cambiá el DNS a Cloudflare (1.1.1.1) o Google (8.8.8.8) con un clic — o volvé al automático del router.",
        "Un DNS rápido acelera la resolución de nombres (webs, login de juegos), no el ping dentro de la partida.",
        "El test de ping mide tu latencia real a Cloudflare, Google y Steam.",
        "Verde < 35 ms · amarillo < 80 ms · rojo: revisá tu conexión.",
      ],
      en: [
        "Switch DNS to Cloudflare (1.1.1.1) or Google (8.8.8.8) with one click — or go back to your router's automatic DNS.",
        "A fast DNS speeds up name resolution (websites, game logins), not the in-match ping.",
        "The ping test measures your real latency to Cloudflare, Google and Steam.",
        "Green < 35 ms · yellow < 80 ms · red: check your connection.",
      ],
    },
  },
  {
    id: "clean", icon: "🧹",
    title: { es: "Limpieza", en: "Cleanup" },
    desc: { es: "Libera espacio borrando archivos basura.", en: "Frees space by deleting junk files." },
    points: {
      es: [
        "“Analizar” primero estima cuántos MB vas a liberar por categoría (sin borrar nada).",
        "Limpia temporales, prefetch, caché de Windows Update, miniaturas, navegadores, shader cache, papelera…",
        "No toca tus documentos ni programas.",
        "Al terminar te dice el total liberado.",
      ],
      en: [
        "“Analyze” first estimates how many MB you'll free per category (without deleting anything).",
        "Cleans temp files, prefetch, Windows Update cache, thumbnails, browsers, shader cache, recycle bin…",
        "It doesn't touch your documents or programs.",
        "When it finishes it tells you the total space freed.",
      ],
    },
  },
  {
    id: "startup", icon: "⏻",
    title: { es: "Inicio", en: "Startup" },
    desc: { es: "Controla qué arranca con Windows.", en: "Control what starts with Windows." },
    points: {
      es: [
        "Lista los programas que se abren al encender la PC.",
        "Con el interruptor de cada uno los activás/desactivás.",
        "Desactivar los que no usás acelera notablemente el arranque.",
        "Es reversible: el programa sigue instalado, solo no arranca solo.",
      ],
      en: [
        "Lists the programs that open when you turn on your PC.",
        "Use each one's switch to turn it on or off.",
        "Disabling the ones you don't use makes startup noticeably faster.",
        "It's reversible: the program stays installed, it just doesn't start on its own.",
      ],
    },
  },
  {
    id: "apps", icon: "📦",
    title: { es: "Instalar Apps", en: "Install Apps" },
    desc: { es: "Instala aplicaciones automáticamente con winget.", en: "Installs apps automatically with winget." },
    points: {
      es: [
        "Catálogo de 87 apps en categorías (navegadores, gaming, multimedia, dev…), todas verificadas en winget.",
        "Las que ya tenés instaladas aparecen marcadas.",
        "Marcás las que querés y se instalan solas, sin asistentes.",
        "Si una app no admite instalarse como administrador (ej. Spotify), se instala en modo usuario automáticamente.",
      ],
      en: [
        "A catalog of 87 apps in categories (browsers, gaming, media, dev…), all verified on winget.",
        "The ones you already have installed are marked.",
        "Tick the ones you want and they install on their own, no setup wizards.",
        "If an app can't be installed as administrator (e.g. Spotify), it's installed in user mode automatically.",
      ],
    },
  },
  {
    id: "uninstall", icon: "🗑️",
    title: { es: "Desinstalar", en: "Uninstall" },
    desc: { es: "Quita programas y borra sus restos (estilo Geek Uninstaller).", en: "Removes programs and cleans up their leftovers (Geek Uninstaller style)." },
    points: {
      es: [
        "Lista tus programas (clásicos + de la Store) con su icono, tamaño y fecha. Tiene buscador.",
        "“Quitar” corre el desinstalador del programa.",
        "“Forzar” lo desinstala y después busca los restos (carpetas y claves de registro) para que elijas cuáles borrar.",
        "Para limpiar bloatware en masa, usá Optimizaciones → Eliminar Bloatware.",
      ],
      en: [
        "Lists your programs (classic + Store) with their icon, size and date. It has a search box.",
        "“Remove” runs the program's own uninstaller.",
        "“Force” uninstalls it and then scans for leftovers (folders and registry keys) so you choose which to delete.",
        "To remove bloatware in bulk, use Optimizations → Remove Bloatware.",
      ],
    },
  },
  {
    id: "restore", icon: "↩️",
    title: { es: "Restaurar", en: "Restore" },
    desc: { es: "Volvé atrás si algo no te gustó.", en: "Go back if you didn't like something." },
    points: {
      es: [
        "“Restaurar último backup” reimporta el registro guardado antes de optimizar.",
        "Crear un punto de restauración del sistema cuando quieras.",
        "Abrir la herramienta nativa de Windows (rstrui).",
        "Muestra la lista de backups disponibles.",
      ],
      en: [
        "“Restore last backup” re-imports the registry saved before optimizing.",
        "Create a system restore point whenever you want.",
        "Open Windows' built-in tool (rstrui).",
        "Shows the list of available backups.",
      ],
    },
  },
  {
    id: "reactivate", icon: "🛟",
    title: { es: "Reactivar", en: "Re-enable" },
    desc: { es: "Volvé a activar con un clic algo que se apagó al optimizar.", en: "Turn back on, with one click, something that got disabled while optimizing." },
    points: {
      es: [
        "Pensado para el usuario no técnico: cada botón deshace un tipo de cambio.",
        "Bluetooth, impresora, búsqueda de Windows, antivirus (Defender), permisos de apps, plan de energía y OneDrive.",
        "Útil si después de optimizar algo dejó de funcionar y no sabés qué fue.",
      ],
      en: [
        "Designed for non-technical users: each button undoes one type of change.",
        "Bluetooth, printer, Windows search, antivirus (Defender), app permissions, power plan and OneDrive.",
        "Handy if something stopped working after optimizing and you don't know why.",
      ],
    },
  },
  {
    id: "repair", icon: "🔧",
    title: { es: "Reparar", en: "Repair" },
    desc: { es: "Herramientas para cuando Windows falla.", en: "Tools for when Windows misbehaves." },
    points: {
      es: [
        "SFC y DISM reparan archivos del sistema — vas viendo el avance EN VIVO.",
        "Reset de red (winsock + DNS + IP) para problemas de conexión.",
        "Reiniciar el Explorador y reconstruir la caché de iconos.",
        "Cada acción te resume el resultado al final.",
      ],
      en: [
        "SFC and DISM repair system files — you see the progress LIVE.",
        "Network reset (winsock + DNS + IP) for connection problems.",
        "Restart File Explorer and rebuild the icon cache.",
        "Each action sums up the result at the end.",
      ],
    },
  },
  {
    id: "tools", icon: "🔨",
    title: { es: "Herramientas", en: "Tools" },
    desc: { es: "Control de Windows Update y archivos bloqueados.", en: "Windows Update control and locked files." },
    points: {
      es: [
        "Windows Update: pausarlo por un tiempo, desactivarlo o volver a activarlo.",
        "Desbloquear archivos: te dice qué programa tiene un archivo en uso y te deja cerrarlo.",
      ],
      en: [
        "Windows Update: pause it for a while, turn it off or turn it back on.",
        "Unlock files: tells you which program has a file in use and lets you close it.",
      ],
    },
  },
  {
    id: "system", icon: "📈",
    title: { es: "Sistema", en: "System" },
    desc: { es: "Monitor en tiempo real de tu PC.", en: "Real-time monitor of your PC." },
    points: {
      es: [
        "Gráficas en vivo de CPU y RAM.",
        "Información del equipo: Windows, procesador, núcleos, placas de video y memoria.",
        "El mini-monitor de la barra lateral (CPU/RAM/SSD) está siempre a la vista.",
      ],
      en: [
        "Live CPU and RAM graphs.",
        "System info: Windows, processor, cores, graphics cards and memory.",
        "The mini-monitor in the sidebar (CPU/RAM/SSD) is always in view.",
      ],
    },
  },
];

export default function Guia() {
  const { lang } = useI18n();
  const L = lang === "en" ? "en" : "es";
  const [open, setOpen] = useState<Set<string>>(new Set(["intro"]));
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.guide" />
      <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-2.5 max-w-3xl">
        {GUIDE.map((g) => {
          const isOpen = open.has(g.id);
          return (
            <div key={g.id} className="rounded-xl border border-line bg-surface overflow-hidden">
              <button onClick={() => toggle(g.id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.02] transition">
                <span className="text-[18px]">{g.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-text">{g.title[L]}</div>
                  <div className="text-[13px] text-text-mute truncate">{g.desc[L]}</div>
                </div>
                <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}
                  className="text-text-mute shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}
                    className="overflow-hidden">
                    <ul className="px-4 pb-4 pt-1 space-y-1.5 border-t border-line/60">
                      {g.points[L].map((p, i) => (
                        <li key={i} className="flex gap-2.5 text-[13px] text-text-dim leading-relaxed">
                          <span className="text-accent mt-[3px] shrink-0">·</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
