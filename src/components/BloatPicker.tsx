import { useEffect, useState } from "react";
import { BLOAT_APPS, BLOAT_DETECT, bloatInstalled, type BloatGroup } from "../bloat";
import { runPowershell } from "../lib/api";
import { useI18n, pick } from "../lib/i18n";
import { Badge, Switch, Spinner } from "./ui";
import PickerPanel from "./PickerPanel";

const GROUPS: BloatGroup[] = ["ms", "third", "extra"];
const ORDER = BLOAT_APPS.map((a) => a.id);

// Lo último que se detectó: al volver a abrir el menú se muestra al instante mientras
// se vuelve a escanear (una desinstalación pudo cambiarlo).
let lastInstalled: Set<string> | null = null;

/** Menú "Elegir apps" de bloatware: detecta qué apps del catálogo están en la PC y por
 *  defecto muestra sólo esas. */
export default function BloatPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { t, lang } = useI18n();
  const [installed, setInstalled] = useState<Set<string> | null>(lastInstalled);
  const [scanning, setScanning] = useState(true);
  const [scanFail, setScanFail] = useState(false);
  const [onlyInstalled, setOnlyInstalled] = useState(true);

  useEffect(() => {
    let alive = true;
    runPowershell(BLOAT_DETECT).then((r) => {
      if (!alive) return;
      try {
        const d = JSON.parse(r.output.trim().split("\n").pop() || "");
        const names = (Array.isArray(d) ? d : [d]).filter((x): x is string => typeof x === "string");
        lastInstalled = bloatInstalled(names);
        setInstalled(lastInstalled);
      } catch { setScanFail(true); }
    }).catch(() => alive && setScanFail(true)).finally(() => alive && setScanning(false));
    return () => { alive = false; };
  }, []);

  // Sin detección (falló o todavía no hay datos) se muestra todo.
  const filterOn = onlyInstalled && !!installed && !scanFail;
  const ready = !!installed || scanFail;
  const groups = ready ? GROUPS.map((g) => ({
    id: g,
    label: t(`bloat.group.${g}`),
    items: BLOAT_APPS.filter((a) => a.group === g && (!filterOn || installed!.has(a.id))).map((a) => ({
      id: a.id, label: pick(lang, a.name, a.nameEn, a.namePt), rec: a.rec,
      badge: !filterOn && installed?.has(a.id) ? <Badge tone="ok">{t("bloat.installed")}</Badge> : undefined,
    })),
  })) : [];
  const empty = ready && filterOn && groups.every((g) => !g.items.length);

  return (
    <PickerPanel groups={groups} selected={selected} onChange={onChange} order={ORDER} hint={t("bloat.hint")}
      toolbarRight={<label className="flex items-center gap-2">
        {scanning && <Spinner size={12} />}
        {t("bloat.onlyInstalled")}
        <Switch size="sm" on={onlyInstalled} onChange={setOnlyInstalled} disabled={scanFail} label={t("bloat.onlyInstalled")} />
      </label>}
      status={<>
        {scanning && !installed && <p className="text-[12px] text-text-mute mt-3">{t("bloat.scanning")}</p>}
        {scanFail && <p className="text-[12px] text-[#ffb74d] mt-3">{t("bloat.scanFail")}</p>}
        {!scanning && empty && <p className="text-[12.5px] text-text-dim mt-3">{t("bloat.noneInstalled")}</p>}
      </>} />
  );
}
