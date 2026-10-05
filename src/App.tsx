import { lazy, Suspense, useEffect, useState } from "react";
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
import AccountWarning from "./components/AccountWarning";
import { ensureNotify } from "./lib/notify";
import { dedupePowerPlansOnce } from "./lib/powerDedupe";
// Cada sección se carga recién cuando se abre: antes todo iba en un solo archivo de
// ~1,2 MB que se procesaba entero al arrancar (gráficos, test de velocidad, guía…).
const Optimizaciones = lazy(() => import("./pages/Optimizaciones"));
const Motor = lazy(() => import("./pages/Motor"));
const GameMode = lazy(() => import("./pages/GameMode"));
const Limpieza = lazy(() => import("./pages/Limpieza"));
const Inicio = lazy(() => import("./pages/Inicio"));
const AppsPage = lazy(() => import("./pages/AppsPage"));
const Desinstalar = lazy(() => import("./pages/Desinstalar"));
const RestaurarPage = lazy(() => import("./pages/RestaurarPage"));
const Reparar = lazy(() => import("./pages/Reparar"));
const Sistema = lazy(() => import("./pages/Sistema"));
const Guia = lazy(() => import("./pages/Guia"));
const Panel = lazy(() => import("./pages/Panel"));
const Chequeo = lazy(() => import("./pages/Chequeo"));
const Drivers = lazy(() => import("./pages/Drivers"));
const Perfiles = lazy(() => import("./pages/Perfiles"));
const Red = lazy(() => import("./pages/Red"));
const Graficos = lazy(() => import("./pages/Graficos"));
const Herramientas = lazy(() => import("./pages/Herramientas"));
const Reactivar = lazy(() => import("./pages/Reactivar"));
import {
  IconRocket, IconShieldCheck, IconGamepad, IconBroom, IconPower, IconApps, IconTrash, IconReset, IconWrench, IconChart, IconBook, IconGauge, IconLayers, IconGlobe, IconGpu, IconTools, IconLifeRing, IconPulse, IconChip,
} from "./components/icons";

// Menú agrupado: arriba lo general; después rendimiento, limpieza/apps y control/reparación.
const GROUPS: NavGroup[] = [
  { items: [
    { id: "panel", label: "nav.panel", icon: <IconGauge /> },
    { id: "health", label: "nav.health", icon: <IconPulse /> },
    { id: "drivers", label: "nav.drivers", icon: <IconChip /> },
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
    case "drivers": return <Drivers />;
    case "panel": return <Panel onNavigate={go} />;
    case "profiles": return <Perfiles />;
    case "network": return <Red />;
    case "gpu": return <Graficos onNavigate={go} />;
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
  // Limpieza única de planes de energía duplicados que dejaban versiones viejas.
  useEffect(() => { dedupePowerPlansOnce(); }, []);
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
        <AccountWarning />
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
              <Suspense fallback={null}>{renderPage(page, setPage)}</Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
