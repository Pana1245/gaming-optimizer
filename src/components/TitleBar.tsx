import { type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const win = getCurrentWindow();

const Btn = ({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) => (
  <button
    onClick={onClick}
    className={`w-12 h-full grid place-items-center text-text-dim transition-colors ${danger ? "hover:bg-[#e81123] hover:text-white" : "hover:bg-white/[0.07] hover:text-text"}`}
  >
    {children}
  </button>
);

export default function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="h-9 shrink-0 flex items-center justify-between bg-[#050505] border-b border-line select-none"
    >
      <div data-tauri-drag-region className="flex items-center gap-2 px-3 pointer-events-none">
        <img src="/wolf.png" alt="" className="w-5 h-5" />
        <span className="text-[12px] font-medium text-text-dim tracking-wide">Gaming Optimizer</span>
      </div>
      <div className="flex h-full">
        <Btn onClick={() => win.minimize()}>
          <svg width="11" height="11" viewBox="0 0 11 11"><line x1="1.5" y1="5.5" x2="9.5" y2="5.5" stroke="currentColor" strokeWidth="1" /></svg>
        </Btn>
        <Btn onClick={() => win.toggleMaximize()}>
          <svg width="11" height="11" viewBox="0 0 11 11"><rect x="2" y="2" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
        </Btn>
        <Btn danger onClick={() => win.close()}>
          <svg width="11" height="11" viewBox="0 0 11 11"><line x1="2" y1="2" x2="9" y2="9" stroke="currentColor" strokeWidth="1.1" /><line x1="9" y1="2" x2="2" y2="9" stroke="currentColor" strokeWidth="1.1" /></svg>
        </Btn>
      </div>
    </div>
  );
}
