import { useEffect, useRef, useState } from "react";
import { runPowershell } from "../lib/api";
import { Page, ActionCard, SectionTitle, List, Row, LogPanel } from "../components/ui";
import { IconReset, IconShieldCheck, IconLifeRing } from "../components/icons";
import { Spinner, IndeterminateBar } from "../components/Feedback";
import { useI18n } from "../lib/i18n";
import { trLog } from "../lib/logI18n";

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
  restore: `$root="$env:SystemDrive\\OptimizacionBackup"
if(!(Test-Path $root)){ Write-Output "No hay backups disponibles."; return }
$last = Get-ChildItem $root -Directory | Sort-Object Name -Descending | Select-Object -First 1
if(!$last){ Write-Output "No hay backups disponibles."; return }
Write-Output "Restaurando backup: $($last.Name)"
$regs = Get-ChildItem $last.FullName -Filter *.reg
if(!$regs){ Write-Output "El backup no tiene archivos .reg."; return }
$failed=0
foreach($r in $regs){
  $out = & reg import $r.FullName 2>&1
  if($LASTEXITCODE -eq 0){ Write-Output ("  OK  " + $r.Name) }
  else { $failed++; Write-Output ("  ERROR  " + $r.Name + ": " + ($out -join ' ')) }
}
if($failed -gt 0){ Write-Output ("Restauración incompleta: " + $failed + " archivo(s) fallaron. Nada se marcó como restaurado por completo.") }
else { Write-Output "Registro restaurado. Reinicia el PC para aplicar." }`,
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

  const openRstrui = () => runPowershell("Start-Process rstrui.exe");


  return (
    <Page tkey="page.restore">
      {busy && <div className="-mt-3 mb-5 shrink-0"><IndeterminateBar /></div>}
      <div className="flex-1 grid grid-cols-[1fr_320px] gap-6 min-h-0">
        <div className="space-y-3 overflow-y-auto pr-3 -mr-3 pb-2">
          <ActionCard icon={<IconReset />} title={t("restore.restoreLast")} desc={t("restore.restoreLastDesc")}
            action={<button disabled={busy} onClick={() => action("restore", t("restore.restoreLast"))} className="btn btn-primary">{t("common.restore")}</button>} />
          <ActionCard icon={<IconShieldCheck />} title={t("restore.createPoint")} desc={t("restore.createPointDesc")}
            action={<button disabled={busy} onClick={() => action("checkpoint", t("restore.createPoint"))} className="btn btn-ghost">{t("restore.createBtn")}</button>} />
          <ActionCard icon={<IconLifeRing />} title={t("restore.winRestore")} desc={t("restore.winRestoreDesc")}
            action={<button disabled={busy} onClick={openRstrui} className="btn btn-ghost">{t("restore.openBtn")}</button>} />

          <div className="pt-3">
            <SectionTitle right={backups.length ? <span className="tabular-nums">{backups.length}</span> : undefined}>{t("restore.available")}</SectionTitle>
            {backups.length ? (
              <List>
                {backups.map((b) => <Row key={b} title={<span className="font-mono text-[13px]">{b}</span>} />)}
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
