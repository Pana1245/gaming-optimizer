import Tooltip from "./Tooltip";
import { Check, Badge } from "./ui";
import { useI18n } from "../lib/i18n";

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  badge?: string;
  risk?: "safe" | "advanced";
  desc?: string;
}

/** Fila con casilla (Optimizaciones, Motor, Gráficos, Limpieza): nombre, etiquetas
 *  (W11 / Avanzado) y un ⓘ con la explicación del tweak. */
export default function EnergyCheckbox({ checked, onChange, label, badge, risk, desc }: Props) {
  const { t } = useI18n();
  return (
    <div
      className="group flex items-center gap-3 py-2.5 px-4 cursor-pointer hover:bg-white/[0.025] transition-colors"
      onClick={() => onChange(!checked)}
    >
      <Check on={checked} />
      <span className={`text-[13.5px] truncate transition-colors ${checked ? "text-text" : "text-text-dim"}`}>{label}</span>
      {desc && (
        <Tooltip
          content={
            <>
              {desc}
              {risk === "advanced" && <span className="block mt-1 text-[#ffb74d]">{t("common.advancedWarn")}</span>}
            </>
          }
        >
          <span className="w-4 h-4 rounded-full border border-line-2 grid place-items-center text-[9.5px] font-semibold text-text-mute opacity-0 group-hover:opacity-100 transition-opacity">i</span>
        </Tooltip>
      )}
      <span className="ml-auto flex items-center gap-1.5 shrink-0">
        {badge && <Badge>{badge}</Badge>}
        {risk === "advanced" && <Badge tone="warn">{t("common.advancedBadge")}</Badge>}
      </span>
    </div>
  );
}
