import { useEffect, useState } from "react";
import { PERMS, PERMS_STATE, type PermGroup } from "../perms";
import { runPowershell } from "../lib/api";
import { useI18n, pick } from "../lib/i18n";
import { Badge, Spinner } from "./ui";
import PickerPanel from "./PickerPanel";

const GROUPS: PermGroup[] = ["personal", "devices", "files"];
const ORDER = PERMS.map((x) => x.id);

/** Menú "Elegir cuáles" de permisos de apps: muestra cuáles ya están bloqueados. */
export default function PermsPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { t, lang } = useI18n();
  const [denied, setDenied] = useState<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    runPowershell(PERMS_STATE).then((r) => {
      if (!alive) return;
      const d = new Set<string>();
      for (const m of r.output.matchAll(/^(\w+)=Deny\s*$/gm)) d.add(m[1]);
      setDenied(d);
    }).catch(() => alive && setDenied(new Set()));
    return () => { alive = false; };
  }, []);

  const groups = GROUPS.map((g) => ({
    id: g,
    label: t(`perms.group.${g}`),
    items: PERMS.filter((x) => x.group === g).map((x) => ({
      id: x.id, label: pick(lang, x.name, x.nameEn, x.namePt), rec: x.rec,
      sub: x.warn ? `${t("perms.breaks")} ${pick(lang, x.warn, x.warnEn, x.warnPt)}` : undefined,
      badge: denied?.has(x.id) ? <Badge>{t("perms.blocked")}</Badge> : undefined,
    })),
  }));

  return (
    <PickerPanel groups={groups} selected={selected} onChange={onChange} order={ORDER} hint={t("perms.hint")}
      toolbarRight={denied === null ? <><Spinner size={12} />{t("perms.reading")}</> : undefined} />
  );
}
