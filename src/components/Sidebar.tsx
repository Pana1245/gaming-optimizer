import { type ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getVersion } from "@tauri-apps/api/app";
import { useI18n, LANGS } from "../lib/i18n";
import { useAccent, ACCENTS, type AccentName } from "../lib/theme";
import { useUpdater, type UpdStatus } from "../lib/updater";

export interface NavItem { id: string; label: string; icon: ReactNode; }
export interface NavGroup { label?: string; items: NavItem[]; }

interface Props {
  groups: NavGroup[];
  footer: NavItem[];
  active: string;
  onSelect: (id: string) => void;
}

/** Menú lateral a altura completa: logo (arrastra la ventana), grupos con título,
 *  y abajo Guía + Ajustes (acento, idioma, actualizaciones). */
export default function Sidebar({ groups, footer, active, onSelect }: Props) {
  const { t } = useI18n();
  const [settings, setSettings] = useState(false);

  const Row = (item: NavItem) => {
    const isActive = item.id === active;
    return (
      <button
        key={item.id}
        onClick={() => onSelect(item.id)}
        className={`group relative flex items-center gap-2.5 w-full h-[30px] px-2.5 rounded-md text-[13px] transition-colors
          ${isActive ? "text-text" : "text-text-dim hover:text-text hover:bg-white/[0.035]"}`}
      >
        {isActive && (
          <motion.span layoutId="nav-active" className="absolute inset-0 rounded-md bg-white/[0.07]"
            transition={{ type: "spring", stiffness: 520, damping: 42 }} />
        )}
        <span className={`relative z-10 [&_svg]:w-[17px] [&_svg]:h-[17px] transition-colors ${isActive ? "text-accent" : "text-text-mute group-hover:text-text-dim"}`}>
          {item.icon}
        </span>
        <span className="relative z-10 font-medium truncate">{t(item.label)}</span>
      </button>
    );
  };

  return (
    <aside className="w-[220px] shrink-0 h-full bg-sidebar border-r border-line flex flex-col select-none">
      {/* Logo: también es zona para arrastrar la ventana */}
      <div data-tauri-drag-region className="h-[52px] shrink-0 flex items-center gap-2.5 px-4">
        <img src="/wolf.png" alt="" className="w-7 h-7 pointer-events-none" />
        <span className="text-[13.5px] font-semibold text-text tracking-[-0.01em] pointer-events-none">Gaming Optimizer</span>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-3">
        {groups.map((g, gi) => (
          <div key={gi} className={gi > 0 ? "mt-4" : "mt-1"}>
            {g.label && <div className="px-2.5 mb-1 text-[11px] font-medium text-text-mute/80">{t(g.label)}</div>}
            <div className="flex flex-col gap-px">{g.items.map(Row)}</div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line px-2.5 py-2.5 flex flex-col gap-px relative">
        {footer.map(Row)}
        <button
          onClick={() => setSettings((s) => !s)}
          className={`group flex items-center gap-2.5 w-full h-[30px] px-2.5 rounded-md text-[13px] transition-colors
            ${settings ? "text-text bg-white/[0.07]" : "text-text-dim hover:text-text hover:bg-white/[0.035]"}`}
        >
          <span className="text-text-mute group-hover:text-text-dim [&_svg]:w-[17px] [&_svg]:h-[17px]"><GearIcon /></span>
          <span className="font-medium">{t("settings.title")}</span>
        </button>
        <AnimatePresence>{settings && <SettingsMenu onClose={() => setSettings(false)} />}</AnimatePresence>
      </div>
    </aside>
  );
}

function SettingsMenu({ onClose }: { onClose: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { name: accent, set: setAccent } = useAccent();
  const { status, checkNow } = useUpdater();
  const [ver, setVer] = useState("");
  const [msg, setMsg] = useState<UpdStatus | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { getVersion().then(setVer).catch(() => {}); }, []);
  // Cerrar con clic afuera o Esc.
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const id = setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(id); window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const onCheck = async () => {
    const s = await checkNow();
    if (s === "none" || s === "error") { setMsg(s); setTimeout(() => setMsg(null), 4000); }
  };

  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.14 }}
      className="absolute left-2.5 right-[-120px] bottom-[calc(100%+6px)] z-50 rounded-xl border border-line-2 bg-surface-2 p-4 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.8)]">
      <div className="text-[11px] font-medium text-text-mute mb-2">{t("theme.accent")}</div>
      <div className="flex gap-2 mb-4">
        {(Object.keys(ACCENTS) as AccentName[]).map((n) => (
          <button key={n} onClick={() => setAccent(n)} title={ACCENTS[n].label}
            className={`w-7 h-7 rounded-full grid place-items-center transition-transform hover:scale-105 ${accent === n ? "ring-2 ring-offset-2 ring-offset-[#17171b]" : ""}`}
            style={{ background: ACCENTS[n].accent, ...(accent === n ? { ["--tw-ring-color" as string]: ACCENTS[n].accent } : {}) }}>
            {accent === n && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" fill="none" stroke="#000" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
        ))}
      </div>

      <div className="text-[11px] font-medium text-text-mute mb-2">{t("settings.language")}</div>
      <div className="flex p-0.5 rounded-lg bg-black/30 border border-line mb-4">
        {LANGS.map((l) => (
          <button key={l} onClick={() => setLang(l)}
            className={`flex-1 h-7 rounded-md text-[12px] font-medium uppercase transition-colors ${lang === l ? "bg-white/[0.09] text-text" : "text-text-mute hover:text-text-dim"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-line">
        <div className="text-[12px] text-text-mute">
          Gaming Optimizer {ver && <span className="tabular-nums">v{ver}</span>}
          {msg === "none" && <div className="text-accent mt-0.5">{t("update.upToDate")}</div>}
          {msg === "error" && <div className="text-[#ff8a65] mt-0.5">{t("update.error")}</div>}
        </div>
        <button onClick={onCheck} disabled={status === "checking"} className="btn btn-ghost h-8 px-3 text-[12px] shrink-0">
          {status === "checking" ? t("update.checking") : t("settings.checkUpdates")}
        </button>
      </div>
    </motion.div>
  );
}

const GearIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
