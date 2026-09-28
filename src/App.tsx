import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar, { type NavItem, type NavGroup } from "./components/Sidebar";
import Splash from "./components/Splash";
import CommandPalette from "./components/CommandPalette";
import { useI18n } from "./lib/i18n";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { notify } from "./lib/notify";
import UpdateBanner from "./components/UpdateBanner";
import TitleBar from "./components/TitleBar";
import { ensureNotify } from "./lib/notify";
import Optimizaciones from "./pages/Optimizaciones";
import Motor from "./pages/Motor";
import GameMode from "./pages/GameMode";
import Limpieza from "./pages/Limpieza";
import Inicio from "./pages/Inicio";
import AppsPage from "./pages/AppsPage";
import Desinstalar from "./pages/Desinstalar";
import RestaurarPage from "./pages/RestaurarPage";
import Reparar from "./pages/Reparar";
import Sistema from "./pages/Sistema";
import Guia from "./pages/Guia";
import Panel from "./pages/Panel";
import Chequeo from "./pages/Chequeo";
import Perfiles from "./pages/Perfiles";
import Red from "./pages/Red";
import Graficos from "./pages/Graficos";
import Herramientas from "./pages/Herramientas";
import Reactivar from "./pages/Reactivar";
import {
  IconRocket, IconShieldCheck, IconGamepad, IconBroom, IconPower, IconApps, IconTrash, IconReset, IconWrench, IconChart, IconBook, IconGauge, IconLayers, IconGlobe, IconGpu, IconTools, IconLifeRing, IconPulse,
} from "./components/icons";

// Menú agrupado: arriba lo general; después rendimiento, limpieza/apps y control/reparación.
const GROUPS: NavGroup[] = [
  { items: [
    { id: "panel", label: "nav.panel", icon: <IconGauge /> },
    { id: "health", label: "nav.health", icon: <IconPulse /> },
    { id: "system", label: "nav.system", icon: <IconChart /> },
  ] },
  { label: "nav.group.perf", items: [
    { id: "profiles", label: "nav.profiles", icon: <IconLayers /> },
    { id: "opt", label: "nav.opt", icon: <IconRocket /> },
    { id: "gpu", label: "nav.gpu", icon: <IconGpu /> },
    { id: "gamemode", label: "nav.gamemode", icon: <IconGamepad /> },
    { id: "network", label: "nav.network", icon: <IconGlobe /> },
  ] },
  { label: "nav.group.clean", items: [
    { id: "clean", label: "nav.clean", icon: <IconBroom /> },
    { id: "startup", label: "nav.startup", icon: <IconPower /> },
    { id: "apps", label: "nav.apps", icon: <IconApps /> },
    { id: "uninstall", label: "nav.uninstall", icon: <IconTrash /> },
  ] },
  { label: "nav.group.control", items: [
    { id: "engine", label: "nav.engine", icon: <IconShieldCheck /> },
    { id: "restore", label: "nav.restore", icon: <IconReset /> },
    { id: "repair", label: "nav.repair", icon: <IconWrench /> },
    { id: "reactivate", label: "nav.reactivate", icon: <IconLifeRing /> },
    { id: "tools", label: "nav.tools", icon: <IconTools /> },
  ] },
];
const FOOTER: NavItem[] = [
  { id: "guide", label: "nav.guide", icon: <IconBook /> },
];

function renderPage(page: string, go: (p: string) => void) {
  switch (page) {
    case "health": return <Chequeo onNavigate={go} />;
    case "panel": return <Panel onNavigate={go} />;
    case "profiles": return <Perfiles />;
    case "network": return <Red />;
    case "gpu": return <Graficos />;
    case "opt": return <Optimizaciones />;
    case "engine": return <Motor />;
    case "gamemode": return <GameMode />;
    case "clean": return <Limpieza />;
    case "startup": return <Inicio />;
    case "apps": return <AppsPage />;
    case "uninstall": return <Desinstalar />;
    case "restore": return <RestaurarPage />;
    case "repair": return <Reparar />;
    case "tools": return <Herramientas />;
    case "reactivate": return <Reactivar />;
    case "system": return <Sistema />;
    case "guide": return <Guia />;
    default: return null;
  }
}

export default function App() {
  const [page, setPage] = useState("panel");
  const [loading, setLoading] = useState(true);
  const { t, lang } = useI18n();
  useEffect(() => { ensureNotify(); }, []);
  // Menú de la bandeja en el idioma de la interfaz.
  useEffect(() => {
    invoke("tray_labels", { open: t("tray.open"), quit: t("tray.quit"), tooltip: t("tray.tooltip") }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
  // Primera vez que cerrar la ventana la manda a la bandeja: avisar dónde quedó.
  useEffect(() => {
    const un = listen("hidden-to-tray", () => {
      try {
        if (localStorage.getItem("trayHintShown")) return;
        localStorage.setItem("trayHintShown", "1");
      } catch { /* sin storage: avisar igual */ }
      notify(t("tray.hiddenTitle"), t("tray.hiddenBody"));
    });
    return () => { un.then((f) => f()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cmdItems = [...GROUPS.flatMap((g) => g.items), ...FOOTER].map((n) => ({ id: n.id, label: t(n.label), icon: n.icon }));

  return (
    <div className="flex h-full bg-bg">
      <AnimatePresence>
        {loading && <Splash key="splash" onDone={() => setLoading(false)} />}
      </AnimatePresence>
      <CommandPalette items={cmdItems} onSelect={setPage} />
      <UpdateBanner />
      <Sidebar groups={GROUPS} footer={FOOTER} active={page} onSelect={setPage} />
      <div className="flex-1 min-w-0 flex flex-col content-bg">
        <TitleBar />
        <main className="flex-1 min-h-0 relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="h-full relative z-10"
            >
              {renderPage(page, setPage)}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
