import { type ReactNode } from "react";
import { motion } from "framer-motion";
import SidebarMonitor from "./SidebarMonitor";
import { useI18n } from "../lib/i18n";

export interface NavItem { id: string; label: string; icon: ReactNode; }

interface Props {
  items: NavItem[];
  footer: NavItem[];
  active: string;
  onSelect: (id: string) => void;
}

export default function Sidebar({ items, footer, active, onSelect }: Props) {
  const { t } = useI18n();
  const Row = (item: NavItem) => {
    const isActive = item.id === active;
    return (
      <motion.button
        key={item.id}
        onClick={() => onSelect(item.id)}
        whileHover={{ x: isActive ? 0 : 2 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={`group relative flex items-center gap-3 w-full h-9 px-3 rounded-md text-[13px]
          ${isActive ? "text-text" : "text-text-dim hover:text-text"}`}
      >
        {isActive && (
          <motion.span
            layoutId="nav-active-bg"
            className="absolute inset-0 rounded-md bg-white/[0.05]"
            transition={{ type: "spring", stiffness: 500, damping: 38 }}
          />
        )}
        {isActive && (
          <motion.span
            layoutId="nav-active-bar"
            className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-accent"
            transition={{ type: "spring", stiffness: 500, damping: 38 }}
          />
        )}
        <span className={`relative z-10 ${isActive ? "text-accent" : "text-text-mute group-hover:text-text-dim"}`}>
          {item.icon}
        </span>
        <span className="relative z-10 font-medium">{t(item.label)}</span>
      </motion.button>
    );
  };

  return (
    <aside className="w-[212px] shrink-0 h-full bg-[#050505] border-r border-line flex flex-col py-4 px-3">
      <div className="flex items-center gap-2.5 px-2 pb-5 mb-2">
        <motion.img
          src="/wolf.png" alt="" className="w-10 h-10"
          initial={{ rotate: -8, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-text">Gaming Optimizer</div>
          <div className="text-[10px] text-text-mute">v2.0</div>
        </div>
      </div>
      <nav className="flex-1 flex flex-col gap-0.5 overflow-y-auto min-h-0 pr-0.5">{items.map(Row)}</nav>
      <SidebarMonitor />
      <nav className="flex flex-col gap-0.5 pt-2 border-t border-line">{footer.map(Row)}</nav>
    </aside>
  );
}
