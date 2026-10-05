import { useEffect, useState } from "react";
import { BG_CATALOG, RUNNING_PROCS, type BgGroup } from "../bgApps";
import { runPowershell } from "../lib/api";
import { useI18n, pick } from "../lib/i18n";
import { Badge } from "./ui";
import PickerPanel from "./PickerPanel";

const GROUPS: BgGroup[] = ["browsers", "apps", "launchers", "sync"];
const ORDER = BG_CATALOG.map((x) => x.id);

/** Menú de Auto Game-Mode: qué apps de fondo se frenan mientras jugás. Marca las que
 *  están abiertas ahora. */
export default function BgPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { t, lang } = useI18n();
  const [running, setRunning] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    runPowershell(RUNNING_PROCS)
      .then((r) => alive && setRunning(new Set(r.output.trim().split("|").filter(Boolean))))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const groups = GROUPS.map((g) => ({
    id: g,
    label: t(`gm.bg.group.${g}`),
    items: BG_CATALOG.filter((x) => x.group === g).map((x) => ({
      id: x.id, label: pick(lang, x.name, x.nameEn, x.namePt), rec: x.rec,
      badge: running.has(x.id) ? <Badge tone="ok">{t("gm.bg.open")}</Badge> : undefined,
    })),
  }));

  return <PickerPanel compact groups={groups} selected={selected} onChange={onChange} order={ORDER} hint={t("gm.bg.hint")} />;
}
