import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar, { type NavItem } from "./components/Sidebar";
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
import {
  IconRocket, IconShieldCheck, IconGamepad, IconBroom, IconPower, IconApps, IconTrash, IconReset, IconWrench, IconChart, IconBook,
} from "./components/icons";

const MAIN: NavItem[] = [
  { id: "opt", label: "nav.opt", icon: <IconRocket /> },
  { id: "engine", label: "nav.engine", icon: <IconShieldCheck /> },
  { id: "gamemode", label: "nav.gamemode", icon: <IconGamepad /> },
  { id: "clean", label: "nav.clean", icon: <IconBroom /> },
  { id: "startup", label: "nav.startup", icon: <IconPower /> },
  { id: "apps", label: "nav.apps", icon: <IconApps /> },
  { id: "uninstall", label: "nav.uninstall", icon: <IconTrash /> },
  { id: "restore", label: "nav.restore", icon: <IconReset /> },
  { id: "repair", label: "nav.repair", icon: <IconWrench /> },
];
const FOOTER: NavItem[] = [
  { id: "guide", label: "nav.guide", icon: <IconBook /> },
  { id: "system", label: "nav.system", icon: <IconChart /> },
];

function renderPage(page: string) {
  switch (page) {
    case "opt": return <Optimizaciones />;
    case "engine": return <Motor />;
    case "gamemode": return <GameMode />;
    case "clean": return <Limpieza />;
    case "startup": return <Inicio />;
    case "apps": return <AppsPage />;
    case "uninstall": return <Desinstalar />;
    case "restore": return <RestaurarPage />;
    case "repair": return <Reparar />;
    case "system": return <Sistema />;
    case "guide": return <Guia />;
    default: return null;
  }
}

export default function App() {
  const [page, setPage] = useState("opt");
  useEffect(() => { ensureNotify(); }, []);

  return (
    <div className="flex flex-col h-full bg-black">
      <TitleBar />
      <UpdateBanner />
      <div className="flex flex-1 min-h-0">
        <Sidebar items={MAIN} footer={FOOTER} active={page} onSelect={setPage} />
        <main className="flex-1 min-w-0 relative overflow-hidden content-bg">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="h-full"
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
