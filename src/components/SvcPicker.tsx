import { useEffect, useState } from "react";
import { SVCS, SVCS_STATE, type SvcGroup } from "../services";
import { runPowershell } from "../lib/api";
import { useI18n, pick } from "../lib/i18n";
import { Badge, Spinner } from "./ui";
import PickerPanel from "./PickerPanel";

const GROUPS: SvcGroup[] = ["perf", "features", "gaming"];
const ORDER = SVCS.map((x) => x.id);

/** Menú "Elegir cuáles" de servicios: oculta los que no existen en esta PC (ej. Fax en
 *  Windows Home) y marca los que ya están deshabilitados. */
export default function SvcPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { t, lang } = useI18n();
  const [state, setState] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let alive = true;
    runPowershell(SVCS_STATE).then((r) => {
      if (!alive) return;
      const st: Record<string, string> = {};
      for (const m of r.output.matchAll(/^([\w.]+)=(\w+)\s*$/gm)) st[m[1]] = m[2];
      setState(st);
    }).catch(() => alive && setState({}));
    return () => { alive = false; };
  }, []);

  // Al terminar la lectura, lo elegido que no existe en este Windows (ej. Fax en Home) se
  // saca: si no, el botón contaba más servicios de los que se ven en el menú.
  useEffect(() => {
    if (!state || !Object.keys(state).length) return;
    const ok = selected.filter((id) => SVCS.find((x) => x.id === id)?.services.some((n) => state[n] && state[n] !== "NONE"));
    if (ok.length !== selected.length) onChange(ok);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Sin lectura (todavía o si falló) se muestran todos.
  const known = !!state && Object.keys(state).length > 0;
  const exists = (x: (typeof SVCS)[number]) => !known || x.services.some((n) => state![n] && state![n] !== "NONE");
  const disabled = (x: (typeof SVCS)[number]) => known && x.services.every((n) => state![n] === "Disabled" || state![n] === "NONE");

  const groups = GROUPS.map((g) => ({
    id: g,
    label: t(`svc.group.${g}`),
    items: SVCS.filter((x) => x.group === g && exists(x)).map((x) => ({
      id: x.id, label: pick(lang, x.name, x.nameEn, x.namePt), rec: x.rec,
      sub: x.warn ? `${t("perms.breaks")} ${pick(lang, x.warn, x.warnEn, x.warnPt)}` : undefined,
      badge: disabled(x) ? <Badge>{t("svc.disabled")}</Badge> : undefined,
    })),
  }));

  return (
    <PickerPanel groups={groups} selected={selected} onChange={onChange} order={ORDER} hint={t("svc.hint")}
      toolbarRight={state === null ? <><Spinner size={12} />{t("perms.reading")}</> : undefined} />
  );
}
