import { motion } from "framer-motion";
import Tooltip from "./Tooltip";

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  badge?: string;
  risk?: "safe" | "advanced";
  desc?: string;
}

export default function EnergyCheckbox({ checked, onChange, label, badge, risk, desc }: Props) {
  return (
    <div
      className="flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-md cursor-pointer hover:bg-white/[0.025] transition-colors"
      onClick={() => onChange(!checked)}
    >
      <motion.div
        animate={{
          backgroundColor: checked ? "#00e676" : "rgba(0,0,0,0)",
          borderColor: checked ? "#00e676" : "#262629",
          scale: checked ? [1, 1.18, 1] : 1,
        }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative w-[18px] h-[18px] rounded-[5px] border shrink-0 flex items-center justify-center"
      >
        <svg viewBox="0 0 16 16" className="w-3 h-3">
          <motion.path
            d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
            fill="none" stroke="#000" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          />
        </svg>
      </motion.div>
      {risk && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: risk === "advanced" ? "#ffb74d" : "#00e676" }}
        />
      )}
      {desc ? (
        <Tooltip
          className="flex-1 min-w-0"
          content={
            <>
              {desc}
              {risk === "advanced" && (
                <span className="block mt-1 text-[#ffb74d]">⚠ Avanzado — modifica ajustes del sistema</span>
              )}
            </>
          }
        >
          <span className={`text-[13px] truncate transition-colors ${checked ? "text-text" : "text-text-dim"}`}>
            {label}
          </span>
        </Tooltip>
      ) : (
        <span className={`text-[13px] flex-1 transition-colors ${checked ? "text-text" : "text-text-dim"}`}>
          {label}
        </span>
      )}
      {badge && (
        <span className="text-[10px] font-medium text-text-mute border border-line-2 rounded px-1.5 py-0.5">
          {badge}
        </span>
      )}
    </div>
  );
}
