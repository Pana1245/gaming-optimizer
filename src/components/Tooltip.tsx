import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function Tooltip({ content, children, className = "" }: { content?: ReactNode; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const enter = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, y: r.top });
  };

  return (
    <span ref={ref} className={`inline-flex items-center ${className}`} onMouseEnter={enter} onMouseLeave={() => setPos(null)}>
      {children}
      {pos && content && createPortal(
        <div
          style={{ position: "fixed", left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)" }}
          className="z-[100] w-max max-w-[280px] px-2.5 py-1.5 rounded-lg bg-surface-2 border border-line-2 text-[11.5px] text-text-dim leading-snug pointer-events-none shadow-xl"
        >
          {content}
        </div>,
        document.body
      )}
    </span>
  );
}
