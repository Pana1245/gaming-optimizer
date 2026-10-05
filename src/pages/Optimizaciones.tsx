import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CATEGORIES, type Tweak } from "../catalog";
import { EXTRA_TWEAKS, EXTRA_CATEGORIES } from "../extraCatalog";
import { BLOAT_APPS, BLOAT_MS, BLOAT_THIRD, bloatCustom } from "../bloat";
import { PERMS, PERMS_RECOMMENDED, permsDeny } from "../perms";
import { SVCS, SVCS_RECOMMENDED, SVC_BACKUP_NAMES, svcDisable } from "../services";
import { TWEAK_DESC } from "../tweakDesc";
import { CATEGORY_EN, TWEAK_EN, TWEAK_DESC_EN } from "../catalogEn";
import { CATEGORY_PT, TWEAK_PT, TWEAK_DESC_PT } from "../catalogPt";
import { runPowershell, getSystemInfo } from "../lib/api";
import { notify } from "../lib/notify";
import { useScrollMemory } from "../lib/useScrollMemory";
import { useSharedState } from "../lib/sharedState";
import EnergyCheckbox from "../components/EnergyCheckbox";
import BloatPicker from "../components/BloatPicker";
import PermsPicker from "../components/PermsPicker";
import SvcPicker from "../components/SvcPicker";
import { MenuButton } from "../components/PickerPanel";
import { Page, SectionTitle, List, LogPanel, Progress } from "../components/ui";
import Modal from "../components/Modal";
import { useI18n, pick } from "../lib/i18n";
import { trLog } from "../lib/logI18n";

// Categorías base + tweaks nuevos fusionados por id + categorías extra (WinUtil)
const ALL_CATEGORIES = [
  ...CATEGORIES.map((c) => ({
    ...c,
    tweaks: [...c.tweaks, ...(EXTRA_TWEAKS[c.id] || [])],
  })),
  ...EXTRA_CATEGORIES,
];

// Tweaks marcados como avanzados (además de los que traen risk:"advanced")
const ADVANCED = new Set([
  "Prioridad CPU máxima para juegos",
  "Timer Resolution — 1ms (reduce micro-stutters)",
  "Core Parking OFF — todos los núcleos activos",
  "Reservar 0% de ancho de banda para QoS",
  "Desanclar todas las apps del menu Inicio",
]);

const BACKUP = String.raw`$date    = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backDir = "$env:SystemDrive\OptimizacionBackup\$date"
New-Item -ItemType Directory -Path $backDir -Force | Out-Null

# Backup REAL del registro: exporta a .reg las ramas que tocan las optimizaciones,
# para que "Restaurar" pueda reimportarlas (RestaurarPage hace 'reg import').
$keys = [ordered]@{
  'explorer-advanced' = 'HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
  'personalize'       = 'HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
  'gameconfigstore'   = 'HKCU\System\GameConfigStore'
  'gamebar'           = 'HKCU\Software\Microsoft\GameBar'
  'mouse'             = 'HKCU\Control Panel\Mouse'
  'desktop'           = 'HKCU\Control Panel\Desktop'
  'dwm'               = 'HKCU\Software\Microsoft\Windows\DWM'
  'advertising'       = 'HKCU\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo'
  'consentstore'      = 'HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore'
  'backgroundapps'    = 'HKCU\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications'
  'graphicsdrivers'   = 'HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers'
  'systemprofile'     = 'HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'
  'sessionmanager'    = 'HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\kernel'
  'cv-policies'       = 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies'
  'policies-ms-lm'    = 'HKLM\SOFTWARE\Policies\Microsoft'
  'policies-ms-cu'    = 'HKCU\Software\Policies\Microsoft'
  'cv-policies-cu'    = 'HKCU\Software\Microsoft\Windows\CurrentVersion\Policies'
  'cv-policies-wow'   = 'HKLM\SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Policies'
  'powersettings'     = 'HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings'
  'tcpip-interfaces'  = 'HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces'
  'gamedvr'           = 'HKCU\Software\Microsoft\Windows\CurrentVersion\GameDVR'
  'contentdelivery'   = 'HKCU\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'
  'visualeffects'     = 'HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects'
  'accessibility'     = 'HKCU\Control Panel\Accessibility'
  'wifi-policy'       = 'HKLM\SOFTWARE\Microsoft\PolicyManager\default\WiFi'
  'consentstore-lm'   = 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore'
  'defender-features' = 'HKLM\SOFTWARE\Microsoft\Windows Defender\Features'
  'crashcontrol'      = 'HKLM\SYSTEM\CurrentControlSet\Control\CrashControl'
  'timezone'          = 'HKLM\SYSTEM\CurrentControlSet\Control\TimeZoneInformation'
  'lfsvc'             = 'HKLM\SYSTEM\CurrentControlSet\Services\lfsvc\Service\Configuration'
}
# MSI mode de la(s) placa(s) de video (clave por dispositivo)
$i = 0
foreach($g in @(Get-CimInstance Win32_VideoController -EA SilentlyContinue | Where-Object { $_.PNPDeviceID -like 'PCI*' })){
  $keys["msi-gpu$i"] = "HKLM\SYSTEM\CurrentControlSet\Enum\$($g.PNPDeviceID)\Device Parameters\Interrupt Management"; $i++
}
$n = 0
foreach($k in $keys.GetEnumerator()){
  reg export $($k.Value) "$backDir\$($k.Name).reg" /y > $null 2>&1
  if($LASTEXITCODE -eq 0){ $n++ }
  # Si la clave no existía, se anota: al restaurar se borra (la creó un tweak).
  elseif(-not (Test-Path -LiteralPath ('Registry::' + $k.Value))){ Set-Content -LiteralPath "$backDir\$($k.Name).absent" -Value $k.Value -Encoding UTF8 }
}
Write-Output "Backup del registro: $n ramas exportadas"

# Servicios y tareas que modifican los tweaks: no viven en las ramas exportadas,
# así que se guarda su estado para que Restaurar también los devuelva.
$svcState=@{}
foreach($sn in @(${[...new Set(["DiagTrack", "dmwappushservice", "Sense", "WdBoot", "WdFilter", "WdNisDrv", "WdNisSvc", "WinDefend", "wuauserv", "HomeGroupListener", "HomeGroupProvider", ...SVC_BACKUP_NAMES])].map((n) => `'${n}'`).join(",")})){
  $sk="HKLM:\SYSTEM\CurrentControlSet\Services\$sn"
  $v=(Get-ItemProperty -LiteralPath $sk -Name Start -EA SilentlyContinue).Start
  if($null -ne $v){ $svcState[$sn]=@{ start=[int]$v; delayed=(Get-ItemProperty -LiteralPath $sk -Name DelayedAutostart -EA SilentlyContinue).DelayedAutostart } }
}
$taskState=@{}
foreach($tp in @('\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser','\Microsoft\Windows\Application Experience\ProgramDataUpdater','\Microsoft\Windows\Autochk\Proxy','\Microsoft\Windows\Customer Experience Improvement Program\Consolidator','\Microsoft\Windows\Customer Experience Improvement Program\UsbCeip','\Microsoft\Windows\DiskDiagnostic\Microsoft-Windows-DiskDiagnosticDataCollector','\Microsoft\Windows\Feedback\Siuf\DmClient','\Microsoft\Windows\Windows Defender\Windows Defender Cache Maintenance','\Microsoft\Windows\Windows Defender\Windows Defender Cleanup','\Microsoft\Windows\Windows Defender\Windows Defender Scheduled Scan','\Microsoft\Windows\Windows Defender\Windows Defender Verification','\Microsoft\Windows\Windows Error Reporting\QueueReporting','\Microsoft\Windows\Xbox\XblGameSaveTask')){
  $tt=Get-ScheduledTask -TaskPath ((Split-Path $tp) + '\') -TaskName (Split-Path $tp -Leaf) -EA SilentlyContinue
  if($tt){ $taskState[$tp]="$($tt.State)" }
}
$timerTask=[bool](Get-ScheduledTask -TaskName 'GamingOptimizer_TimerRes' -EA SilentlyContinue)
@{ services=$svcState; tasks=$taskState; timerTask=$timerTask } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$backDir\state.json" -Encoding UTF8

Write-Output "Creando punto de restauracion..."
$srKey = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore"
$prevFreq = $null
try {
    Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction Stop
    # Windows limita a 1 punto/24h; ponemos la frecuencia en 0 para que se cree siempre.
    New-Item -Path $srKey -Force | Out-Null
    $prevFreq = (Get-ItemProperty -Path $srKey -Name "SystemRestorePointCreationFrequency" -EA SilentlyContinue).SystemRestorePointCreationFrequency
    Set-ItemProperty -Path $srKey -Name "SystemRestorePointCreationFrequency" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
    Checkpoint-Computer -Description "Gaming Optimizer - $date" -RestorePointType "MODIFY_SETTINGS" -ErrorAction Stop
    Write-Output "Punto de restauracion creado OK"
} catch { Write-Output "AVISO: no se pudo crear punto de restauracion" }
finally {
    # Dejar la frecuencia como estaba: no queremos que el sistema cree un punto en cada trigger.
    if($null -eq $prevFreq){ Remove-ItemProperty -Path $srKey -Name "SystemRestorePointCreationFrequency" -Force -EA SilentlyContinue }
    else { Set-ItemProperty -Path $srKey -Name "SystemRestorePointCreationFrequency" -Value $prevFreq -Type DWord -Force -EA SilentlyContinue }
}
Write-Output "Backup en: $backDir"
`;

const MODO_GAMER: Record<string, number[]> = {
  gaming: [0, 1, 3, 4, 5, 7, 8],
  network: [0, 1, 2],
  visual: [0, 1],
};

// Clave de selección por NOMBRE del tweak (no por posición): la lista visible se filtra
// por versión de Windows y, con claves por índice, al ocultarse un tweak W11 en Windows 10
// las casillas quedaban corridas respecto de la preselección (y de lo que se aplicaba).
const selKey = (catId: string, tw: Tweak) => `${catId}:${tw.name}`;

// Presets que la lista elegida de bloatware reemplaza: se desmarcan al usarla (si no,
// quitarían igual las apps que el usuario dejó sin marcar).
const isBloatPreset = (tw: Tweak) => tw.script === BLOAT_MS || tw.script === BLOAT_THIRD;

// Filas con menú desplegable ("Elegir apps", "Elegir cuáles"): el script se arma con lo
// elegido, que se recuerda entre sesiones.
type PickerKey = NonNullable<Tweak["picker"]>;
const PICKERS: Record<PickerKey, {
  storage: string; ids: string[]; initial: string[]; btn: string;
  script: (ids: string[]) => string; presets?: (tw: Tweak) => boolean;
  Menu: (p: { selected: string[]; onChange: (ids: string[]) => void }) => ReactNode;
}> = {
  bloat: { storage: "bloat_sel", ids: BLOAT_APPS.map((a) => a.id), initial: [], btn: "bloat.menuBtn", script: bloatCustom, presets: isBloatPreset, Menu: BloatPicker },
  perms: { storage: "perms_sel", ids: PERMS.map((x) => x.id), initial: PERMS_RECOMMENDED, btn: "perms.menuBtn", script: permsDeny, Menu: PermsPicker },
  svc: { storage: "svc_sel", ids: SVCS.map((x) => x.id), initial: SVCS_RECOMMENDED, btn: "perms.menuBtn", script: svcDisable, Menu: SvcPicker },
};
const loadPick = (k: PickerKey): string[] => {
  const d = PICKERS[k];
  try {
    const raw = localStorage.getItem(d.storage);
    if (raw === null) return d.initial;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? d.ids.filter((id) => v.includes(id)) : d.initial;
  } catch { return d.initial; }
};
const scriptOf = (tw: Tweak, picks: Record<PickerKey, string[]>) => (tw.picker ? PICKERS[tw.picker].script(picks[tw.picker]) : tw.script);
// Una fila con menú y nada elegido no se marca sola (no tendría nada que aplicar).
const defaultOn = (tw: Tweak, picks: Record<PickerKey, string[]>) => !tw.optIn && !(tw.picker && picks[tw.picker].length === 0);

export default function Optimizaciones() {
  const { t, lang } = useI18n();
  // Nombre/descripción del tweak en el idioma actual (las claves son el nombre en español).
  const tn = (name: string) => pick(lang, name, TWEAK_EN[name], TWEAK_PT[name]);
  const td = (name: string) => pick(lang, TWEAK_DESC[name], TWEAK_DESC_EN[name], TWEAK_DESC_PT[name]);
  const [winVer, setWinVer] = useState(11);
  const [picks, setPicks] = useState<Record<PickerKey, string[]>>(() => ({ bloat: loadPick("bloat"), perms: loadPick("perms"), svc: loadPick("svc") }));
  // Compartido (sobrevive al cambiar de sección): la selección, el registro y el estado de
  // la aplicación en curso. Antes, al volver mientras aplicaba, la página decía "Listo." y
  // dejaba lanzar otra pasada encima de la que seguía corriendo.
  const [sel, setSel] = useSharedState<Record<string, boolean>>("opt.sel", () => {
    const p = { bloat: loadPick("bloat"), perms: loadPick("perms"), svc: loadPick("svc") };
    const init: Record<string, boolean> = {};
    ALL_CATEGORIES.forEach((c) => c.tweaks.forEach((t) => (init[selKey(c.id, t)] = defaultOn(t, p))));
    return init;
  });
  const [log, setLog] = useSharedState<string[]>("opt.log", () => ["Listo."]);
  const [progress, setProgress] = useSharedState("opt.progress", () => 0);
  const [running, setRunning] = useSharedState("opt.running", () => false);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useSharedState<string | null>("opt.done", () => null);
  const [canReboot, setCanReboot] = useSharedState("opt.canReboot", () => false);
  const [openMenu, setOpenMenu] = useState<Partial<Record<PickerKey, boolean>>>({});
  const logRef = useRef<HTMLDivElement>(null);
  const scrollRef = useScrollMemory<HTMLDivElement>("opt");

  const cats = useMemo(
    () => ALL_CATEGORIES.map((c) => ({
      ...c,
      tweaks: c.tweaks.filter((t) => !t.os || t.os === winVer),
    })).filter((c) => c.tweaks.length > 0),
    [winVer]
  );

  useEffect(() => {
    getSystemInfo().then((info) => setWinVer(info.win_ver)).catch(() => {});
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  const addLog = (s: string) => setLog((l) => [...l, s]);
  const setAll = (v: boolean) => {
    const n: Record<string, boolean> = {};
    cats.forEach((c) => c.tweaks.forEach((t) => (n[selKey(c.id, t)] = v && defaultOn(t, picks))));
    setSel(n);
  };
  const modoGamer = () => {
    const n: Record<string, boolean> = {};
    cats.forEach((c) => c.tweaks.forEach((t) => (n[selKey(c.id, t)] = false)));
    // Los índices del preset son del catálogo completo (sin filtrar por Windows).
    Object.entries(MODO_GAMER).forEach(([cid, idx]) => {
      const cat = ALL_CATEGORIES.find((c) => c.id === cid);
      idx.forEach((i) => { const tw = cat?.tweaks[i]; if (tw && cats.some((c) => c.id === cid && c.tweaks.includes(tw))) n[selKey(cid, tw)] = true; });
    });
    setSel(n);
  };

  // Marca/desmarca la fila de un menú; al marcar la de bloatware se desmarcan sus presets.
  const markPickerRow = (k: PickerKey, on: boolean) => setSel((s) => {
    const n = { ...s };
    const presets = PICKERS[k].presets;
    ALL_CATEGORIES.forEach((c) => c.tweaks.forEach((tw) => {
      if (tw.picker === k) n[selKey(c.id, tw)] = on;
      else if (on && presets?.(tw)) n[selKey(c.id, tw)] = false;
    }));
    return n;
  });
  const setPick = (k: PickerKey, ids: string[]) => {
    setPicks((p) => ({ ...p, [k]: ids }));
    try { localStorage.setItem(PICKERS[k].storage, JSON.stringify(ids)); } catch { /* sin storage: sólo esta sesión */ }
    markPickerRow(k, ids.length > 0);
  };

  const selectedList = () =>
    cats.flatMap((c) => c.tweaks.filter((t) => sel[selKey(c.id, t)]));

  const run = async () => {
    setConfirm(false);
    const list = selectedList();
    setRunning(true);
    setProgress(0);
    setLog([t("common.ready")]);
    addLog(t("opt.step1"));
    const bk = await runPowershell(BACKUP);
    bk.output.split("\n").forEach((l) => l.trim() && addLog("  " + l.trim()));
    // No aplicar nada si el backup no dejó un respaldo utilizable: sin esto, un
    // fallo de permisos/espacio/registro modificaba el sistema sin backup.
    const exported = Number(bk.output.match(/Backup del registro: (\d+) ramas/)?.[1] ?? 0);
    if (!bk.ok || exported === 0) {
      addLog(t("opt.backupFailedLog"));
      setRunning(false);
      setDone(t("opt.backupFailedDone"));
      return;
    }
    // Si el punto de restauración falló Y hay tweaks que el backup del registro NO
    // revierte (servicios/BCD/AppX/tareas), avisar para no dar falsa confianza.
    const pointOk = /punto de restauracion creado ok/i.test(bk.output);
    const risky = list.filter((x) => /Set-Service|bcdedit|Remove-AppxPackage|Register-ScheduledTask|Disable-ScheduledTask/i.test(scriptOf(x, picks)));
    const noSafetyNet = !pointOk && risky.length > 0;
    if (noSafetyNet) {
      addLog(t("opt.noPointWarn1"));
      addLog(`  ${risky.length} ${t("opt.noPointWarn2")}`);
      addLog("  " + t("opt.noPointWarn3"));
    }
    addLog(t("opt.step2").replace("{n}", String(list.length)));
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      addLog(`▸ ${tn(list[i].name)}`);
      const pk = list[i].picker;
      if (pk && picks[pk].length === 0) {
        addLog(`  ✗ ${t("pick.noneChosen")}`);
        setProgress((i + 1) / list.length);
        continue;
      }
      const r = await runPowershell(scriptOf(list[i], picks));
      // Si el usuario cambió de sección, se SIGUE aplicando: cortar acá dejaba la
      // lista a medias sin avisar (los setState sobre la página desmontada no hacen nada).
      if (r.ok) ok++;
      addLog(`  ${r.ok ? "✓" : "✗"} ${(r.output.split("\n")[0] || "OK").trim()}`);
      setProgress((i + 1) / list.length);
    }
    addLog(t("opt.completedLog").replace("{ok}", String(ok)).replace("{total}", String(list.length)));
    setRunning(false);
    setCanReboot(true);
    notify(t("opt.notifyTitle"), t("opt.appliedShort").replace("{ok}", String(ok)).replace("{total}", String(list.length)));
    setDone(t("opt.doneMain").replace("{ok}", String(ok)).replace("{total}", String(list.length)) + (noSafetyNet ? t("opt.doneNoNet") : ""));
  };

  const reboot = () => runPowershell("shutdown /r /t 3");

  const count = selectedList().length;

  return (
    <Page tkey="page.opt" actions={<>
      <button disabled={running} onClick={modoGamer} className="btn btn-ghost">{t("opt.gamerPreset")}</button>
      <button disabled={running} onClick={() => setAll(true)} className="btn btn-ghost">{t("opt.selectAll")}</button>
      <button disabled={running} onClick={() => setAll(false)} className="btn btn-ghost">{t("opt.deselect")}</button>
      <button disabled={running} onClick={() => (count === 0 ? setDone(t("opt.noneSelected")) : setConfirm(true))} className="btn btn-primary px-5">
        {running ? t("opt.optimizing") : `${t("opt.applyBtn")}${count ? ` (${count})` : ""}`}
      </button>
    </>}>
      {running && <div className="-mt-3 mb-5 shrink-0"><Progress value={progress} /></div>}

      <div className="flex-1 grid grid-cols-[1fr_320px] gap-6 min-h-0">
        {/* Lista por categorías */}
        <div ref={scrollRef} className={`overflow-y-auto pr-3 -mr-3 space-y-6 pb-2 transition-opacity ${running ? "pointer-events-none opacity-50" : ""}`}>
          {cats.map((c) => {
            const selCount = c.tweaks.filter((tw) => sel[selKey(c.id, tw)]).length;
            const allOn = c.tweaks.every((tw) => tw.optIn || sel[selKey(c.id, tw)]);
            const toggleCat = () => setSel((s) => {
              const n = { ...s };
              c.tweaks.forEach((tw) => (n[selKey(c.id, tw)] = !allOn && !tw.optIn));
              return n;
            });
            return (
              <section key={c.id}>
                <SectionTitle dot={c.color} right={<>
                  <span className="tabular-nums">{selCount}/{c.tweaks.length}</span>
                  <button onClick={toggleCat} className="text-text-mute hover:text-accent transition-colors">{allOn ? t("apps.catRemove") : t("apps.catAll")}</button>
                </>}>
                  {pick(lang, c.name, CATEGORY_EN[c.id], CATEGORY_PT[c.id])}
                </SectionTitle>
                {c.id === "winutil" && <p className="text-[12px] text-text-mute -mt-1 mb-2">{t("opt.winutilNote")}</p>}
                <List>
                  {c.tweaks.map((tw) => (
                    <Fragment key={tw.name}>
                    <EnergyCheckbox
                      label={tn(tw.name)}
                      badge={tw.os ? `W${tw.os}` : undefined}
                      risk={tw.risk === "advanced" || ADVANCED.has(tw.name) ? "advanced" : "safe"}
                      desc={td(tw.name)}
                      checked={!!sel[selKey(c.id, tw)]}
                      onChange={(v) => {
                        const k = tw.picker;
                        if (!k) return setSel((s) => ({ ...s, [selKey(c.id, tw)]: v }));
                        // Sin nada elegido, marcar la fila abre su menú para elegir.
                        if (v && picks[k].length === 0) return setOpenMenu((o) => ({ ...o, [k]: true }));
                        markPickerRow(k, v);
                      }}
                      action={tw.picker ? (() => {
                        const k = tw.picker;
                        return <MenuButton open={!!openMenu[k]} onClick={() => setOpenMenu((o) => ({ ...o, [k]: !o[k] }))} label={t(PICKERS[k].btn)} count={picks[k].length} />;
                      })() : undefined}
                    />
                    {tw.picker && openMenu[tw.picker] && (() => {
                      const k = tw.picker, Menu = PICKERS[k].Menu;
                      return <Menu selected={picks[k]} onChange={(ids) => setPick(k, ids)} />;
                    })()}
                    </Fragment>
                  ))}
                </List>
              </section>
            );
          })}
        </div>

        {/* Registro */}
        <LogPanel ref={logRef} label={t("common.progress")}>{trLog(log.join("\n"), lang)}</LogPanel>
      </div>

      <Modal open={confirm} title={t("opt.confirmTitle")} onClose={() => setConfirm(false)}
        onConfirm={run} confirmText={t("opt.applyBtn")} closeText={t("common.cancel")}>
        {t("opt.confirmBody").replace("{n}", String(count))}
      </Modal>
      <Modal open={!!done} title={t("opt.resultTitle")} onClose={() => { setDone(null); setCanReboot(false); }}
        onConfirm={canReboot ? () => { reboot(); setDone(null); setCanReboot(false); } : undefined}
        confirmText={t("opt.reboot")} closeText={t("opt.rebootLater")}>
        {trLog(done || "", lang)}
      </Modal>
    </Page>
  );
}
