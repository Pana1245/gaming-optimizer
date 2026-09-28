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
 *  (W11 / Avanzado) y un "?" con la explicación del tweak. */
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
          {/* Siempre visible: el "?" invita a leer qué hace cada ajuste. Clic acá no toca la casilla. */}
          <span onClick={(e) => e.stopPropagation()}
            className="w-[18px] h-[18px] rounded-full grid place-items-center text-[11px] font-bold leading-none cursor-help text-accent bg-accent/10 border border-accent/35 hover:bg-accent/20 hover:border-accent/60 transition-colors">?</span>
        </Tooltip>
      )}
      <span className="ml-auto flex items-center gap-1.5 shrink-0">
        {badge && <Badge>{badge}</Badge>}
        {risk === "advanced" && <Badge tone="warn">{t("common.advancedBadge")}</Badge>}
      </span>
    </div>
  );
}
