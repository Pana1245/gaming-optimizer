import { motion } from "framer-motion";

export const Spinner = ({ size = 14 }: { size?: number }) => (
  <motion.span
    className="inline-block rounded-full border-2 border-accent border-t-transparent shrink-0"
    style={{ width: size, height: size }}
    animate={{ rotate: 360 }}
    transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
  />
);

export const IndeterminateBar = ({ className = "" }: { className?: string }) => (
  <div className={`h-[3px] rounded-full bg-line overflow-hidden relative ${className}`}>
    <motion.div
      className="absolute top-0 h-full w-1/3 bg-accent rounded-full"
      animate={{ left: ["-35%", "100%"] }}
      transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
    />
  </div>
);

/** Línea de estado uniforme: spinner cuando trabaja + texto. */
export const StatusLine = ({ working, text }: { working: boolean; text: string }) =>
  (text || working) ? (
    <div className="mt-4 pt-4 border-t border-line text-[13px] font-mono text-text-dim flex items-center gap-2">
      {working && <Spinner />}
      <span className="truncate">{text}</span>
    </div>
  ) : null;
