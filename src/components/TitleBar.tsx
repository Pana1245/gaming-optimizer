import { type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useI18n } from "../lib/i18n";

const win = getCurrentWindow();

const WinBtn = ({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) => (
  <button
    onClick={onClick}
    className={`w-[46px] h-full grid place-items-center text-text-mute transition-colors ${danger ? "hover:bg-[#e81123] hover:text-white" : "hover:bg-white/[0.06] hover:text-text"}`}
  >
    {children}
  </button>
);

/** Barra superior del área de contenido: se arrastra para mover la ventana, tiene el
 *  buscador (Ctrl+K) y los controles de ventana. El logo vive en el menú lateral. */
export default function TitleBar() {
  const { t } = useI18n();
  return (
    <div data-tauri-drag-region className="h-10 shrink-0 flex items-center justify-end select-none relative z-20">
      <button
        onClick={() => window.dispatchEvent(new Event("open-palette"))}
        className="mr-2 h-7 pl-2.5 pr-1.5 rounded-md border border-line bg-white/[0.02] hover:bg-white/[0.05] hover:border-line-2 transition-colors flex items-center gap-2 text-[12px] text-text-mute"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span>{t("cmd.placeholder")}</span>
        <kbd className="ml-3 px-1.5 h-[18px] grid place-items-center rounded border border-line-2 text-[10px] font-sans text-text-mute">Ctrl K</kbd>
      </button>
      <div className="flex h-full">
        <WinBtn onClick={() => win.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1" /></svg>
        </WinBtn>
        <WinBtn onClick={() => win.toggleMaximize()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
        </WinBtn>
        <WinBtn danger onClick={() => win.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.1" /><line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.1" /></svg>
        </WinBtn>
      </div>
    </div>
  );
}
