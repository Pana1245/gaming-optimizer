import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar, { type NavItem } from "./components/Sidebar";
import Splash from "./components/Splash";
import UpdateBanner from "./components/UpdateBanner";
import TitleBar from "./components/TitleBar";
import { ensureNotify } from "./lib/notify";
import StatusBar from "./components/StatusBar";
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
import Perfiles from "./pages/Perfiles";
import Red from "./pages/Red";
import Graficos from "./pages/Graficos";
import Herramientas from "./pages/Herramientas";
import Reactivar from "./pages/Reactivar";
import {
  IconRocket, IconShieldCheck, IconGamepad, IconBroom, IconPower, IconApps, IconTrash, IconReset, IconWrench, IconChart, IconBook, IconGauge, IconLayers, IconGlobe, IconGpu, IconTools, IconLifeRing,
} from "./components/icons";

const MAIN: NavItem[] = [
  { id: "panel", label: "nav.panel", icon: <IconGauge /> },
  { id: "profiles", label: "nav.profiles", icon: <IconLayers /> },
  { id: "opt", label: "nav.opt", icon: <IconRocket /> },
  { id: "gpu", label: "nav.gpu", icon: <IconGpu /> },
  { id: "engine", label: "nav.engine", icon: <IconShieldCheck /> },
  { id: "gamemode", label: "nav.gamemode", icon: <IconGamepad /> },
  { id: "network", label: "nav.network", icon: <IconGlobe /> },
  { id: "clean", label: "nav.clean", icon: <IconBroom /> },
  { id: "startup", label: "nav.startup", icon: <IconPower /> },
  { id: "apps", label: "nav.apps", icon: <IconApps /> },
  { id: "uninstall", label: "nav.uninstall", icon: <IconTrash /> },
  { id: "restore", label: "nav.restore", icon: <IconReset /> },
  { id: "repair", label: "nav.repair", icon: <IconWrench /> },
  { id: "reactivate", label: "nav.reactivate", icon: <IconLifeRing /> },
  { id: "tools", label: "nav.tools", icon: <IconTools /> },
];
const FOOTER: NavItem[] = [
  { id: "guide", label: "nav.guide", icon: <IconBook /> },
  { id: "system", label: "nav.system", icon: <IconChart /> },
];

function renderPage(page: string) {
  switch (page) {
    case "panel": return <Panel />;
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
  useEffect(() => { ensureNotify(); }, []);

  return (
    <div className="flex flex-col h-full bg-black">
      <AnimatePresence>
        {loading && <Splash key="splash" onDone={() => setLoading(false)} />}
      </AnimatePresence>
      <TitleBar />
      <UpdateBanner />
      <div className="flex flex-1 min-h-0">
        <Sidebar items={MAIN} footer={FOOTER} active={page} onSelect={setPage} />
        <main className="flex-1 min-w-0 relative overflow-hidden content-bg">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 14, scale: 0.985, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, scale: 0.99, filter: "blur(2px)" }}
              transition={{ duration: 0.28, ease: [0.22, 0.7, 0.2, 1] }}
              className="h-full relative z-10"
            >
              {renderPage(page)}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
