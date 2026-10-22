import { runPowershell } from "./api";

// Hasta la v2.5.x la app se instalaba POR USUARIO (%LOCALAPPDATA%\GamingOptimizer): una
// carpeta que cualquier programa sin admin puede modificar, con un app.exe que corre como
// administrador (y que la tarea "Iniciar con Windows" abre elevado sin UAC). Ahora se
// instala en Program Files. Al abrir la versión nueva desde ahí, se quita la vieja SIN
// correr su desinstalador (cerraría app.exe, que es esta misma app) y la tarea de inicio
// se repunta al exe nuevo. Las preferencias no se tocan: viven en otra carpeta.
const MIGRATE = String.raw`$me=(Get-CimInstance Win32_Process -Filter "ProcessId=$((Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId)").ExecutablePath
$pf=[Environment]::GetFolderPath('ProgramFiles')
if(-not $me -or -not $me.StartsWith($pf + '\',[StringComparison]::OrdinalIgnoreCase)){ 'MIGRATE=SKIP'; exit 0 }
$left=0
# 1) Instalación vieja por usuario: sus archivos, su entrada de desinstalación y sus accesos.
$k='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\GamingOptimizer'
$old="$((Get-ItemProperty -LiteralPath $k -EA SilentlyContinue).InstallLocation)".Trim().Trim('"').TrimEnd('\')
$lad=[Environment]::GetFolderPath('LocalApplicationData')
if($old -and $old.StartsWith($lad + '\',[StringComparison]::OrdinalIgnoreCase) -and -not $me.StartsWith($old + '\',[StringComparison]::OrdinalIgnoreCase)){
  foreach($f in 'app.exe','uninstall.exe'){ Remove-Item -LiteralPath (Join-Path $old $f) -Force -EA SilentlyContinue }
  Remove-Item -LiteralPath (Join-Path $old 'resources') -Recurse -Force -EA SilentlyContinue
  if(-not @(Get-ChildItem -LiteralPath $old -Force -EA SilentlyContinue).Count){ Remove-Item -LiteralPath $old -Force -EA SilentlyContinue }
  if(Test-Path -LiteralPath (Join-Path $old 'app.exe')){ $left++ } else { Remove-Item -LiteralPath $k -Force -EA SilentlyContinue }
}
foreach($l in @((Join-Path ([Environment]::GetFolderPath('Programs')) 'GamingOptimizer.lnk'), (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'GamingOptimizer.lnk'))){
  if(Test-Path -LiteralPath $l){
    $t=(New-Object -ComObject WScript.Shell).CreateShortcut($l).TargetPath
    if($t -and $t.StartsWith($lad + '\',[StringComparison]::OrdinalIgnoreCase)){ Remove-Item -LiteralPath $l -Force -EA SilentlyContinue }
  }
}
# 2) "Iniciar con Windows": que la tarea abra el exe nuevo (con los mismos argumentos).
$task=Get-ScheduledTask -TaskName 'GamingOptimizer Autostart' -EA SilentlyContinue
if($task){
  $a=$task.Actions | Select-Object -First 1
  if($a.Execute -and $a.Execute.Trim('"') -ne $me){
    try{ Set-ScheduledTask -TaskName 'GamingOptimizer Autostart' -Action (New-ScheduledTaskAction -Execute $me -Argument $a.Arguments) -EA Stop | Out-Null }catch{ $left++ }
  }
}
'MIGRATE=' + $(if($left){ 'LEFT' } else { 'OK' })`;

const FLAG = "installMigrate1";

/** Una vez (cuando ya corre desde Program Files y no queda nada viejo); si no, se reintenta. */
export async function migrateInstallOnce(): Promise<void> {
  try { if (localStorage.getItem(FLAG)) return; } catch { return; }
  const r = await runPowershell(MIGRATE).catch(() => null);
  if (r?.ok && /MIGRATE=OK/.test(r.output)) {
    try { localStorage.setItem(FLAG, "1"); } catch { /* sin storage: se reintenta */ }
  }
}
