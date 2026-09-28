import { useEffect, useState } from "react";
import { runPowershell } from "../lib/api";
import { useScrollMemory } from "../lib/useScrollMemory";
import { Page, List, Row, Badge, Switch, Empty } from "../components/ui";
import { StatusLine } from "../components/Feedback";
import { useI18n } from "../lib/i18n";
import { trLog } from "../lib/logI18n";

interface Entry { name: string; cmd: string; scope: "HKCU" | "HKLM"; enabled: boolean; }

const LIST = String.raw`$out=@()
$keys=@(
 @{p='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; a='HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'; s='HKCU'},
 @{p='HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'; a='HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'; s='HKLM'}
)
foreach($k in $keys){
 if(Test-Path $k.p){
  foreach($name in (Get-Item $k.p).Property){
   $cmd=(Get-ItemProperty $k.p).$name
   $enabled=$true
   if(Test-Path $k.a){ $b=(Get-ItemProperty -Path $k.a -Name $name -EA SilentlyContinue).$name; if($b){ $enabled = ($b[0] -ne 3) } }
   $out += [pscustomobject]@{name=$name; cmd="$cmd"; scope=$k.s; enabled=$enabled}
  }
 }
}
if($out.Count -eq 0){ '[]' } else { $out | ConvertTo-Json -Compress -Depth 3 }`;

const toggleScript = (e: Entry, enable: boolean) => {
  const name = e.name.replace(/'/g, "''");
  const appr = e.scope === "HKCU"
    ? String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`
    : String.raw`HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`;
  const bytes = enable ? "2,0,0,0,0,0,0,0,0,0,0,0" : "3,0,0,0,0,0,0,0,0,0,0,0";
  return `$a='${appr}'\nif(!(Test-Path $a)){ New-Item $a -Force | Out-Null }\nSet-ItemProperty -Path $a -Name '${name}' -Value ([byte[]](${bytes})) -Type Binary -Force\nWrite-Output OK`;
};

export default function Inicio() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const scrollRef = useScrollMemory<HTMLDivElement>("startup");

  const load = async () => {
    setLoading(true);
    const r = await runPowershell(LIST);
    try {
      const data = JSON.parse(r.output.trim() || "[]");
      setItems(Array.isArray(data) ? data : [data]);
    } catch { setItems([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (e: Entry) => {
    setBusy(e.name);
    setStatus(`${e.enabled ? t("startup.disabling") : t("startup.enabling")} ${e.name}…`);
    const r = await runPowershell(toggleScript(e, !e.enabled));
    if (!r.ok) {
      // No invertir el switch ni cantar éxito si StartupApproved no cambió.
      setStatus(`✗ ${e.enabled ? t("startup.failDisable") : t("startup.failEnable")} ${e.name}`);
      setBusy(null);
      return;
    }
    setItems((list) => list.map((x) => (x.name === e.name && x.scope === e.scope ? { ...x, enabled: !x.enabled } : x)));
    setStatus(`✓ ${e.name} ${e.enabled ? t("startup.disabled") : t("startup.enabled")}`);
    setBusy(null);
  };

  const enabledCount = items.filter((i) => i.enabled).length;

  return (
    <Page tkey="page.startup" actions={<button onClick={load} className="btn btn-ghost">{t("common.refresh")}</button>}>
      <div className="flex items-center justify-between gap-4 mb-3 -mt-1 shrink-0">
        <span className="text-[12.5px] text-text-dim">
          <span className="text-text font-medium tabular-nums">{enabledCount}</span> {t("startup.active")} · {items.length} {t("startup.total")}
        </span>
        <span className="text-[12px] text-text-mute truncate">{t("startup.scope")}</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-2 -mr-2 pb-2">
        {loading ? (
          <Empty loading>{t("startup.loading")}</Empty>
        ) : items.length === 0 ? (
          <Empty>{t("startup.none")}</Empty>
        ) : (
          <List>
            {items.map((e) => (
              <Row key={e.scope + e.name} muted={!e.enabled}
                title={e.name}
                desc={<span className="font-mono">{e.cmd}</span>}
                right={<>
                  <Badge>{e.scope}</Badge>
                  <Switch on={e.enabled} onChange={() => toggle(e)} disabled={busy === e.name} label={e.name} />
                </>} />
            ))}
          </List>
        )}
      </div>

      <StatusLine working={!!busy} text={trLog(status, lang)} />
    </Page>
  );
}
