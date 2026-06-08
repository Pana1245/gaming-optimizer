import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HudTitle } from "../components/NeonCard";

interface Item { id: string; icon: string; title: string; desc: string; points: string[]; }

const GUIDE: Item[] = [
  {
    id: "intro", icon: "🛡️", title: "Antes de empezar (importante)",
    desc: "Cómo trabaja la app en general.",
    points: [
      "Corre como administrador (te pide permiso UAC al abrir) — lo necesita para tocar el sistema.",
      "Antes de aplicar optimizaciones crea un backup del registro + un punto de restauración automático.",
      "Funciona en Windows 10 y 11; los tweaks que son solo de W11 aparecen con la etiqueta [W11].",
      "Cada tweak tiene un punto de color: 🟢 seguro · 🟡 avanzado (modifica ajustes más sensibles).",
    ],
  },
  {
    id: "opt", icon: "🚀", title: "Optimizaciones",
    desc: "Aplica tweaks para mejorar rendimiento, red y privacidad.",
    points: [
      "Elegís los tweaks (vienen agrupados: Gaming, Red, Privacidad, Visual, Servicios, WinUtil…).",
      "“Modo Gamer” selecciona solo los tweaks críticos de rendimiento.",
      "Pasá el mouse sobre un tweak para ver qué hace exactamente (tooltip).",
      "Al terminar te ofrece reiniciar para aplicar todos los cambios.",
    ],
  },
  {
    id: "engine", icon: "🛡️", title: "Motor de Cambios",
    desc: "La forma más segura de aplicar tweaks: auditada y reversible.",
    points: [
      "Por cada cambio: LEE el valor previo → lo APLICA → RE-LEE para VERIFICAR que realmente quedó.",
      "Todo queda en un historial persistente (sobrevive reinicios).",
      "En la pestaña Historial podés DESHACER cada cambio uno por uno, volviendo al valor exacto que tenías.",
      "Ideal si querés probar cosas sin miedo: siempre podés revertir con precisión.",
    ],
  },
  {
    id: "gamemode", icon: "🎮", title: "Auto Game-Mode",
    desc: "Activa el modo gamer solo cuando abrís un juego.",
    points: [
      "Un servicio en segundo plano vigila los procesos cada 3 segundos.",
      "Detecta un juego de tu lista → activa plan de energía máximo + responsiveness gamer y te notifica.",
      "Cerrás el juego → revierte todo solo y te avisa.",
      "La lista de juegos es editable (agregás el nombre del .exe). Para probar: agregá notepad.exe.",
    ],
  },
  {
    id: "clean", icon: "🧹", title: "Limpieza",
    desc: "Libera espacio borrando archivos basura.",
    points: [
      "“Analizar” primero estima cuántos MB vas a liberar por categoría (sin borrar nada).",
      "Limpia temporales, prefetch, caché de Windows Update, miniaturas, navegadores, shader cache, papelera…",
      "No toca tus documentos ni programas.",
      "Al terminar te dice el total liberado.",
    ],
  },
  {
    id: "startup", icon: "⏻", title: "Inicio",
    desc: "Controla qué arranca con Windows.",
    points: [
      "Lista los programas que se abren al encender la PC.",
      "Con el interruptor de cada uno los activás/desactivás.",
      "Desactivar los que no usás acelera notablemente el arranque.",
      "Es reversible: el programa sigue instalado, solo no arranca solo.",
    ],
  },
  {
    id: "apps", icon: "📦", title: "Instalar Apps",
    desc: "Instala aplicaciones automáticamente con winget.",
    points: [
      "Catálogo de ~96 apps en categorías (navegadores, gaming, multimedia, dev…).",
      "Las que ya tenés instaladas aparecen con un ✓.",
      "Marcás las que querés y se instalan solas, sin asistentes.",
      "Muestra el progreso de cada instalación.",
    ],
  },
  {
    id: "uninstall", icon: "🗑️", title: "Desinstalar",
    desc: "Quita programas y borra sus restos (estilo Geek Uninstaller).",
    points: [
      "Lista tus programas (clásicos + de la Store) con tamaño y fecha. Tiene buscador.",
      "“Quitar” corre el desinstalador del programa.",
      "“Forzar” borra los restos que quedan: carpetas y claves de registro huérfanas.",
      "Botones rápidos para quitar bloatware de Microsoft y de terceros.",
    ],
  },
  {
    id: "restore", icon: "↩️", title: "Restaurar",
    desc: "Volvé atrás si algo no te gustó.",
    points: [
      "“Restaurar último backup” reimporta el registro guardado antes de optimizar.",
      "Crear un punto de restauración del sistema cuando quieras.",
      "Abrir la herramienta nativa de Windows (rstrui).",
      "Muestra la lista de backups disponibles.",
    ],
  },
  {
    id: "repair", icon: "🔧", title: "Reparar",
    desc: "Herramientas para cuando Windows falla.",
    points: [
      "SFC y DISM reparan archivos del sistema — vas viendo el avance EN VIVO.",
      "Reset de red (winsock + DNS + IP) para problemas de conexión.",
      "Reiniciar el Explorador y reconstruir la caché de iconos.",
      "Cada acción te resume el resultado al final.",
    ],
  },
  {
    id: "system", icon: "📊", title: "Sistema",
    desc: "Monitor en tiempo real de tu PC.",
    points: [
      "Gráficas en vivo de CPU y RAM.",
      "Información del equipo: Windows, procesador, núcleos, GPU y memoria.",
      "El mini-monitor del sidebar (CPU/RAM/SSD) está siempre a la vista.",
    ],
  },
];

export default function Guia() {
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
                  <div className="text-[14px] font-medium text-text">{g.title}</div>
                  <div className="text-[12px] text-text-mute truncate">{g.desc}</div>
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
                      {g.points.map((p, i) => (
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
