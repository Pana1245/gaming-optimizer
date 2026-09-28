import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES } from "../catalog";
import { EXTRA_TWEAKS, EXTRA_CATEGORIES } from "../extraCatalog";
import { TWEAK_DESC } from "../tweakDesc";
import { CATEGORY_EN, TWEAK_EN, TWEAK_DESC_EN } from "../catalogEn";
import { CATEGORY_PT, TWEAK_PT, TWEAK_DESC_PT } from "../catalogPt";
import { runPowershell, getSystemInfo } from "../lib/api";
import { notify } from "../lib/notify";
import { useScrollMemory } from "../lib/useScrollMemory";
import EnergyCheckbox from "../components/EnergyCheckbox";
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
  "[Sycnex] Remove ALL Bloatware (lista completa)",
  "[Sycnex] Remove Bloatware por lista negra",
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
  'policies-windows'  = 'HKLM\SOFTWARE\Policies\Microsoft\Windows'
  'powersettings'     = 'HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings'
  'tcpip-interfaces'  = 'HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces'
}
$n = 0
foreach($k in $keys.GetEnumerator()){
  reg export $($k.Value) "$backDir\$($k.Name).reg" /y > $null 2>&1
  if($LASTEXITCODE -eq 0){ $n++ }
}
Write-Output "Backup del registro: $n ramas exportadas"

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

export default function Optimizaciones() {
  const { t, lang } = useI18n();
  // Nombre/descripción del tweak en el idioma actual (las claves son el nombre en español).
  const tn = (name: string) => pick(lang, name, TWEAK_EN[name], TWEAK_PT[name]);
  const td = (name: string) => pick(lang, TWEAK_DESC[name], TWEAK_DESC_EN[name], TWEAK_DESC_PT[name]);
  const [winVer, setWinVer] = useState(11);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [log, setLog] = useState<string[]>(["Listo."]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [canReboot, setCanReboot] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const scrollRef = useScrollMemory<HTMLDivElement>("opt");

  const cats = useMemo(
    () => ALL_CATEGORIES.map((c) => ({
      ...c,
      tweaks: c.tweaks.filter((t) => !t.os || t.os === winVer),
    })).filter((c) => c.tweaks.length > 0),
    [winVer]
  );

  useEffect(() => {
    const init: Record<string, boolean> = {};
    ALL_CATEGORIES.forEach((c) => c.tweaks.forEach((t, i) => (init[`${c.id}:${i}`] = !t.optIn)));
    setSel(init);
    getSystemInfo().then((info) => setWinVer(info.win_ver)).catch(() => {});
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  const addLog = (s: string) => setLog((l) => [...l, s]);
  const setAll = (v: boolean) => {
    const n: Record<string, boolean> = {};
    cats.forEach((c) => c.tweaks.forEach((t, i) => (n[`${c.id}:${i}`] = v && !t.optIn)));
    setSel(n);
  };
  const modoGamer = () => {
    const n: Record<string, boolean> = {};
    cats.forEach((c) => c.tweaks.forEach((_, i) => (n[`${c.id}:${i}`] = false)));
    Object.entries(MODO_GAMER).forEach(([cid, idx]) =>
      idx.forEach((i) => (n[`${cid}:${i}`] = true)));
    setSel(n);
  };

  const selectedList = () =>
    cats.flatMap((c) => c.tweaks
      .map((t, i) => ({ t, key: `${c.id}:${i}` }))
      .filter(({ key }) => sel[key])
      .map(({ t }) => t));

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
    const risky = list.filter((x) => /Set-Service|bcdedit|Remove-AppxPackage|Register-ScheduledTask|Disable-ScheduledTask/i.test(x.script));
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
      const r = await runPowershell(list[i].script);
      if (!mounted.current) return;
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
            const selCount = c.tweaks.filter((_, i) => sel[`${c.id}:${i}`]).length;
            const allOn = c.tweaks.every((tw, i) => tw.optIn || sel[`${c.id}:${i}`]);
            const toggleCat = () => setSel((s) => {
              const n = { ...s };
              c.tweaks.forEach((tw, i) => (n[`${c.id}:${i}`] = !allOn && !tw.optIn));
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
                  {c.tweaks.map((tw, i) => (
                    <EnergyCheckbox
                      key={i}
                      label={tn(tw.name)}
                      badge={tw.os ? `W${tw.os}` : undefined}
                      risk={tw.risk === "advanced" || ADVANCED.has(tw.name) ? "advanced" : "safe"}
                      desc={td(tw.name)}
                      checked={!!sel[`${c.id}:${i}`]}
                      onChange={(v) => setSel((s) => ({ ...s, [`${c.id}:${i}`]: v }))}
                    />
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
