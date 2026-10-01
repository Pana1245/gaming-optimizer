import { useEffect, useRef, useState } from "react";
import { runPowershell } from "../lib/api";
import { Page, ActionCard, SectionTitle, List, Row, LogPanel } from "../components/ui";
import { IconReset, IconShieldCheck, IconLifeRing } from "../components/icons";
import { Spinner, IndeterminateBar } from "../components/Feedback";
import { useI18n } from "../lib/i18n";
import { trLog } from "../lib/logI18n";

const b64utf8 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s || "")));

// Restaura un backup (por nombre de carpeta). "reg import" solo vuelve a escribir los
// valores que había: NO borra los que agregaron los tweaks (la mayoría CREA valores,
// ej. políticas). Por eso, después de importar:
//  - en cada clave del backup se borran los valores que no estaban;
//  - en ramas de POLÍTICAS se borran también las subclaves nuevas (las crean los tweaks;
//    en ramas del sistema, como las interfaces de red, Windows crea claves solo → no se tocan);
//  - las ramas que no existían al hacer el backup (.absent) se borran.
const restoreScript = (name: string) => String.raw`$root="$env:SystemDrive\OptimizacionBackup"
$name=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64utf8(name)}'))
$dir=Join-Path $root $name
if(-not $name -or -not (Test-Path -LiteralPath $dir)){ Write-Output "No hay backups disponibles."; return }
Write-Output "Restaurando backup: $name"
$regs=@(Get-ChildItem -LiteralPath $dir -Filter *.reg)
if(-not $regs){ Write-Output "El backup no tiene archivos .reg."; return }
$failed=0; $removed=0
foreach($r in $regs){
  $out = & reg import $r.FullName 2>&1
  if($LASTEXITCODE -ne 0){ $failed++; Write-Output ("  ERROR  " + $r.Name + ": " + ($out -join ' ')); continue }
  Write-Output ("  OK  " + $r.Name)
  # Claves y valores que había en el backup
  $keys=@{}; $order=@(); $cur=$null
  foreach($line in (Get-Content -LiteralPath $r.FullName -Encoding Unicode)){
    if($line -match '^\[(.+)\]$'){ $cur=$Matches[1]; $keys[$cur.ToLower()]=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase); $order+=$cur; continue }
    if(-not $cur){ continue }
    if($line -match '^@='){ [void]$keys[$cur.ToLower()].Add(''); continue }
    if($line -match '^"((?:[^"\\]|\\.)*)"='){ [void]$keys[$cur.ToLower()].Add(($Matches[1] -replace '\\(.)','$1')) }
  }
  if(-not $order){ continue }
  # 1) Valores agregados después del backup. En las interfaces de red Windows guarda datos que
  #    cambian solos (DHCP…): ahí solo se quitan los valores que agregan los tweaks de red.
  $onlyNames = if($order[0] -match '(?i)\\Tcpip\\Parameters\\Interfaces'){ @('TcpAckFrequency','TCPNoDelay','TcpDelAckTicks') } else { $null }
  foreach($k in $order){
    $item=Get-Item -LiteralPath ('Registry::' + $k) -EA SilentlyContinue
    if(-not $item){ continue }
    foreach($vn in $item.GetValueNames()){
      if($onlyNames -and ($onlyNames -notcontains $vn)){ continue }
      if(-not $keys[$k.ToLower()].Contains($vn)){ Remove-ItemProperty -LiteralPath ('Registry::' + $k) -Name $vn -Force -EA SilentlyContinue; $removed++ }
    }
  }
  # 2) Subclaves nuevas, solo en ramas de políticas
  $top=$order[0]
  if($top -match '(?i)\\Policies(\\|$)|\\PolicyManager\\'){
    foreach($sk in @(Get-ChildItem -LiteralPath ('Registry::' + $top) -Recurse -EA SilentlyContinue)){
      $p=$sk.Name; $parent=Split-Path $p -Parent
      if(-not $keys.ContainsKey($p.ToLower()) -and $keys.ContainsKey($parent.ToLower())){ Remove-Item -LiteralPath ('Registry::' + $p) -Recurse -Force -EA SilentlyContinue; $removed++ }
    }
  }
}
# 3) Ramas que no existían cuando se hizo el backup
foreach($a in @(Get-ChildItem -LiteralPath $dir -Filter *.absent)){
  $k=(Get-Content -LiteralPath $a.FullName -Raw).Trim()
  if($k -and (Test-Path -LiteralPath ('Registry::' + $k))){ Remove-Item -LiteralPath ('Registry::' + $k) -Recurse -Force -EA SilentlyContinue; $removed++ }
}
# 4) Servicios y tareas programadas (no están en el registro exportado)
$stf=Join-Path $dir 'state.json'
if(Test-Path -LiteralPath $stf){
  $st=Get-Content -LiteralPath $stf -Raw | ConvertFrom-Json
  $sv=0; $tk=0
  if($st.services){ foreach($p in $st.services.PSObject.Properties){
    $sk="HKLM:\SYSTEM\CurrentControlSet\Services\$($p.Name)"
    if(-not (Test-Path -LiteralPath $sk)){ continue }
    Set-ItemProperty -LiteralPath $sk -Name Start -Value ([int]$p.Value.start) -Type DWord -Force -EA SilentlyContinue
    if($null -ne $p.Value.delayed){ Set-ItemProperty -LiteralPath $sk -Name DelayedAutostart -Value ([int]$p.Value.delayed) -Type DWord -Force -EA SilentlyContinue }
    if((Get-ItemProperty -LiteralPath $sk -Name Start -EA SilentlyContinue).Start -eq [int]$p.Value.start){ $sv++ }
    if([int]$p.Value.start -eq 2){ Start-Service -Name $p.Name -EA SilentlyContinue }
  } }
  if($st.tasks){ foreach($p in $st.tasks.PSObject.Properties){
    $tp=$p.Name; $path=(Split-Path $tp) + '\'; $tn=Split-Path $tp -Leaf
    if($p.Value -eq 'Disabled'){ Disable-ScheduledTask -TaskPath $path -TaskName $tn -EA SilentlyContinue | Out-Null }
    else { Enable-ScheduledTask -TaskPath $path -TaskName $tn -EA SilentlyContinue | Out-Null }
    $tk++
  } }
  # La tarea de Timer Resolution la crea un tweak: si no existía, se quita (con su script).
  if(-not $st.timerTask -and (Get-ScheduledTask -TaskName 'GamingOptimizer_TimerRes' -EA SilentlyContinue)){
    Unregister-ScheduledTask -TaskName 'GamingOptimizer_TimerRes' -Confirm:$false -EA SilentlyContinue
    Remove-Item -LiteralPath "$env:ProgramData\GamingOptimizer\SetTimerRes.ps1" -Force -EA SilentlyContinue
    Write-Output "Tarea de Timer Resolution quitada."
  }
  Write-Output ("Servicios restaurados: " + $sv + " · tareas: " + $tk)
}
Write-Output ("Cambios agregados después del backup que se quitaron: " + $removed)
if($failed -gt 0){ Write-Output ("Restauración incompleta: " + $failed + " archivo(s) fallaron. Nada se marcó como restaurado por completo.") }
else { Write-Output "Registro restaurado. Reinicia el PC para aplicar." }`;

const SCRIPTS = {
  list: `$root="$env:SystemDrive\\OptimizacionBackup"; if(Test-Path $root){ Get-ChildItem $root -Directory | Sort-Object Name -Descending | Select-Object -ExpandProperty Name }`,
  checkpoint: `$srKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore"
Enable-ComputerRestore -Drive "$env:SystemDrive\\" -ErrorAction SilentlyContinue
New-Item -Path $srKey -Force | Out-Null
$prevFreq = (Get-ItemProperty -Path $srKey -Name "SystemRestorePointCreationFrequency" -EA SilentlyContinue).SystemRestorePointCreationFrequency
Set-ItemProperty -Path $srKey -Name "SystemRestorePointCreationFrequency" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
try {
  Checkpoint-Computer -Description "Gaming Optimizer (manual)" -RestorePointType "MODIFY_SETTINGS" -ErrorAction Stop
  Write-Output "Punto de restauracion creado correctamente."
} catch {
  Write-Output ("No se pudo crear el punto de restauracion: " + $_.Exception.Message)
  Write-Output "Verifica que la Proteccion del sistema este activada y que haya espacio en disco."
} finally {
  if($null -eq $prevFreq){ Remove-ItemProperty -Path $srKey -Name "SystemRestorePointCreationFrequency" -Force -EA SilentlyContinue }
  else { Set-ItemProperty -Path $srKey -Name "SystemRestorePointCreationFrequency" -Value $prevFreq -Type DWord -Force -EA SilentlyContinue }
}`,

};


export default function RestaurarPage() {
  const { t, lang } = useI18n();
  const [log, setLog] = useState<string[]>(() => [t("common.ready")]);
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (s: string) => setLog((l) => {
    const n = [...l, s];
    queueMicrotask(() => logRef.current?.scrollTo(0, logRef.current!.scrollHeight));
    return n;
  });

  const loadBackups = () =>
    runPowershell(SCRIPTS.list).then((r) =>
      setBackups(r.output.split("\n").map((s) => s.trim()).filter(Boolean)));

  useEffect(() => { loadBackups(); }, []);

  const action = async (key: keyof typeof SCRIPTS, title: string) => {
    if (busy) return;
    setBusy(true);
    addLog(`▸ ${title}`);
    const r = await runPowershell(SCRIPTS[key]);
    r.output.split("\n").forEach((l) => l.trim() && addLog("  " + l.trim()));
    setBusy(false);
    loadBackups();
  };

  const restore = async (name: string, title: string) => {
    if (busy || !name) return;
    setBusy(true);
    addLog(`▸ ${title}`);
    const r = await runPowershell(restoreScript(name));
    r.output.split("\n").forEach((l) => l.trim() && addLog("  " + l.trim()));
    setBusy(false);
    loadBackups();
  };
  // La lista viene de más nuevo a más viejo: el último es el ORIGINAL (antes de la primera optimización).
  const oldest = backups[backups.length - 1];

  const openRstrui = () => runPowershell("Start-Process rstrui.exe");


  return (
    <Page tkey="page.restore">
      {busy && <div className="-mt-3 mb-5 shrink-0"><IndeterminateBar /></div>}
      <div className="flex-1 grid grid-cols-[1fr_320px] gap-6 min-h-0">
        <div className="space-y-3 overflow-y-auto pr-3 -mr-3 pb-2">
          <ActionCard icon={<IconReset />} title={t("restore.restoreLast")} desc={t("restore.restoreLastDesc")}
            action={<button disabled={busy || !oldest} onClick={() => restore(oldest, t("restore.restoreLast"))} className="btn btn-primary">{t("common.restore")}</button>} />
          <ActionCard icon={<IconShieldCheck />} title={t("restore.createPoint")} desc={t("restore.createPointDesc")}
            action={<button disabled={busy} onClick={() => action("checkpoint", t("restore.createPoint"))} className="btn btn-ghost">{t("restore.createBtn")}</button>} />
          <ActionCard icon={<IconLifeRing />} title={t("restore.winRestore")} desc={t("restore.winRestoreDesc")}
            action={<button disabled={busy} onClick={openRstrui} className="btn btn-ghost">{t("restore.openBtn")}</button>} />

          <div className="pt-3">
            <SectionTitle right={backups.length ? <span className="tabular-nums">{backups.length}</span> : undefined}>{t("restore.available")}</SectionTitle>
            {backups.length ? (
              <List>
                {backups.map((b) => <Row key={b} title={<span className="font-mono text-[13px]">{b}</span>}
                  desc={b === oldest ? t("restore.original") : undefined}
                  right={<button disabled={busy} onClick={() => restore(b, `${t("restore.restoreThis")} ${b}`)} className="text-[12.5px] text-text-mute hover:text-text transition-colors">{t("restore.restoreThis")}</button>} />)}
              </List>
            ) : (
              <div className="rounded-xl border border-dashed border-line-2 px-4 py-6 text-center text-[13px] text-text-mute">{t("restore.noBackups")}</div>
            )}
          </div>
        </div>
        <LogPanel ref={logRef} label={<span className="flex items-center gap-2">{t("repair.output")}{busy && <Spinner size={12} />}</span>}>
          {trLog(log.join("\n"), lang)}
        </LogPanel>
      </div>
    </Page>
  );
}
