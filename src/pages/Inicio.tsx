import { useEffect, useState } from "react";
import { runPowershell } from "../lib/api";
import { useScrollMemory } from "../lib/useScrollMemory";
import { Page, List, Row, Badge, Switch, Empty, Check } from "../components/ui";
import { StatusLine } from "../components/Feedback";
import { useI18n } from "../lib/i18n";
import { trLog } from "../lib/logI18n";

// HKLM32 = clave Run de las apps de 32 bits (WOW6432Node), donde escriben la mayoría de
// los instaladores de 32 bits: antes no se listaban (el Administrador de tareas sí las
// muestra). Su estado va en StartupApproved\Run32.
interface Entry { name: string; cmd: string; scope: "HKCU" | "HKLM" | "HKLM32"; enabled: boolean; }

const APPROVED: Record<Entry["scope"], string> = {
  HKCU: String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`,
  HKLM: String.raw`HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`,
  HKLM32: String.raw`HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32`,
};

// Estado en StartupApproved: primer byte par = activado (02, 06…), impar = desactivado
// (03…), igual que lo lee el Chequeo; antes sólo 03 contaba como desactivado.
const LIST = String.raw`$out=@()
$keys=@(
 @{p='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; a='${APPROVED.HKCU}'; s='HKCU'},
 @{p='HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'; a='${APPROVED.HKLM}'; s='HKLM'},
 @{p='HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; a='${APPROVED.HKLM32}'; s='HKLM32'}
)
foreach($k in $keys){
 if(Test-Path $k.p){
  foreach($name in (Get-Item $k.p).Property){
   $cmd=(Get-ItemProperty $k.p).$name
   $enabled=$true
   if(Test-Path $k.a){ $b=(Get-ItemProperty -Path $k.a -Name $name -EA SilentlyContinue).$name; if($b){ $enabled = (($b[0] -band 1) -eq 0) } }
   $out += [pscustomobject]@{name=$name; cmd="$cmd"; scope=$k.s; enabled=$enabled}
  }
 }
}
if($out.Count -eq 0){ '[]' } else { $out | ConvertTo-Json -Compress -Depth 3 }`;

const toggleScript = (e: Entry, enable: boolean) => {
  const name = e.name.replace(/'/g, "''");
  const appr = APPROVED[e.scope];
  const bytes = enable ? "2,0,0,0,0,0,0,0,0,0,0,0" : "3,0,0,0,0,0,0,0,0,0,0,0";
  return `$a='${appr}'\nif(!(Test-Path $a)){ New-Item $a -Force | Out-Null }\nSet-ItemProperty -Path $a -Name '${name}' -Value ([byte[]](${bytes})) -Type Binary -Force\nWrite-Output OK`;
};

// "Recomendados": apps que no hace falta que arranquen con Windows (se abren igual
// cuando las usás). Se busca en el nombre y en el comando de cada entrada.
const SUGGEST: RegExp[] = [
  /spotify/i, /discord/i, /steam\.exe/i, /epicgameslauncher/i, /eadesktop|\borigin\.exe/i, /ubisoft|\bupc\.exe/i,
  /battle\.net/i, /galaxyclient/i, /riotclient/i, /overwolf/i, /teams/i, /microsoftedgeautolaunch|msedge\.exe.*--no-startup-window/i,
  /skype/i, /\bzoom\b/i, /whatsapp/i, /telegram/i, /adobe ?gc ?invoker|adobeaamupdater|acrotray|ccxprocess|creative cloud/i,
  /ituneshelper/i, /ccleaner/i, /utorrent|bittorrent|qbittorrent/i, /browser.?assistant/i, /cortana/i,
];
// Nunca se sugieren aunque coincidan: drivers, audio, antivirus, periféricos (mouse,
// teclado, RGB) ni sincronización de archivos.
const NEVER = /onedrive|dropbox|google ?drive|googledrivefs|securityhealth|defender|realtek|rtkaud|nvidia|\bamd\b|radeon|\bintel\b|synaptics|\belan|logitech|lghub|razer|corsair|icue|steelseries|nahimic|waves|maxxaudio|dolby|bitdefender|kaspersky|avast|\bavg\b|\beset\b|malwarebytes|norton|mcafee/i;
const isSuggested = (e: Entry) => { const txt = `${e.name} ${e.cmd}`; return !NEVER.test(txt) && SUGGEST.some((r) => r.test(txt)); };

export default function Inicio() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [recOpen, setRecOpen] = useState(false);
  const [recSel, setRecSel] = useState<Record<string, boolean>>({});
  const scrollRef = useScrollMemory<HTMLDivElement>("startup");

  const readItems = async (): Promise<Entry[]> => {
    const r = await runPowershell(LIST);
    try {
      const data = JSON.parse(r.output.trim() || "[]");
      return Array.isArray(data) ? data : [data];
    } catch { return []; }
  };
  const show = (l: Entry[]) => { setItems(l); setLoading(false); };
  // `loading` ya arranca en true: al abrir sólo se lee la lista.
  useEffect(() => { readItems().then(show); }, []);
  const load = async () => { setLoading(true); show(await readItems()); };

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
  const keyOf = (e: Entry) => e.scope + e.name;
  const suggested = items.filter((e) => e.enabled && isSuggested(e));
  const openRec = () => {
    setRecSel(Object.fromEntries(suggested.map((e) => [keyOf(e), true])));
    setRecOpen((o) => !o);
  };
  const chosen = suggested.filter((e) => recSel[keyOf(e)]);

  // Desactiva las sugeridas que quedaron marcadas, una por una (cada una se puede volver
  // a activar con su interruptor).
  const disableChosen = async () => {
    const list = chosen;
    if (!list.length) return;
    setBusy("__rec__");
    let ok = 0;
    for (const e of list) {
      setStatus(`${t("startup.disabling")} ${e.name}…`);
      const r = await runPowershell(toggleScript(e, false));
      if (r.ok) {
        ok++;
        setItems((l) => l.map((x) => (keyOf(x) === keyOf(e) ? { ...x, enabled: false } : x)));
      }
    }
    const fail = list.length - ok;
    setStatus(`${fail ? "✗" : "✓"} ${t("startup.recDone").replace("{n}", String(ok))}${fail ? ` · ${t("startup.recFail").replace("{n}", String(fail))}` : ""}`);
    setBusy(null);
    setRecOpen(false);
  };

  return (
    <Page tkey="page.startup" actions={<>
      <button onClick={openRec} disabled={loading || !!busy} aria-expanded={recOpen} className="btn btn-ghost">
        <span className="text-accent">★</span> {t("startup.recBtn")}{suggested.length ? ` (${suggested.length})` : ""}
      </button>
      <button onClick={load} disabled={!!busy} className="btn btn-ghost">{t("common.refresh")}</button>
    </>}>
      <div className="flex items-center justify-between gap-4 mb-3 -mt-1 shrink-0">
        <span className="text-[12.5px] text-text-dim">
          <span className="text-text font-medium tabular-nums">{enabledCount}</span> {t("startup.active")} · {items.length} {t("startup.total")}
        </span>
        <span className="text-[12px] text-text-mute truncate">{t("startup.scope")}</span>
      </div>

      {recOpen && !loading && (
        <div className="rounded-xl border border-accent/25 bg-accent/[0.035] px-4 py-3.5 mb-4 shrink-0">
          <div className="text-[13.5px] font-medium text-text">{t("startup.recTitle")}</div>
          <p className="text-[12px] text-text-mute leading-relaxed mt-1">{t("startup.recHint")}</p>
          {suggested.length === 0 ? (
            <p className="text-[12.5px] text-text-dim mt-3">{t("startup.recNone")}</p>
          ) : (<>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-3 max-h-44 overflow-y-auto">
              {suggested.map((e) => (
                <button key={keyOf(e)} onClick={() => setRecSel((s) => ({ ...s, [keyOf(e)]: !s[keyOf(e)] }))}
                  className="flex items-center gap-2 min-w-0 px-2 py-1.5 rounded-md text-left hover:bg-white/[0.035] transition-colors">
                  <Check on={!!recSel[keyOf(e)]} />
                  <span className={`text-[12.5px] truncate ${recSel[keyOf(e)] ? "text-text" : "text-text-dim"}`}>{e.name}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={disableChosen} disabled={!chosen.length || !!busy} className="btn btn-primary h-8 px-3 text-[12.5px]">
                {t("startup.recApply").replace("{n}", String(chosen.length))}
              </button>
              <button onClick={() => setRecOpen(false)} className="btn btn-ghost h-8 px-3 text-[12.5px]">{t("common.cancel")}</button>
            </div>
          </>)}
        </div>
      )}

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
                  {e.enabled && isSuggested(e) && <span title={t("startup.recBadge")} aria-label={t("startup.recBadge")} className="text-accent text-[12px]">★</span>}
                  <Badge>{e.scope === "HKLM32" ? "HKLM 32-bit" : e.scope}</Badge>
                  <Switch on={e.enabled} onChange={() => toggle(e)} disabled={busy === e.name || busy === "__rec__"} label={e.name} />
                </>} />
            ))}
          </List>
        )}
      </div>

      <StatusLine working={!!busy} text={trLog(status, lang)} />
    </Page>
  );
}
