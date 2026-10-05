// Reinicio del Explorador de Windows (barra de tareas y escritorio) desde la app.
//
// La app corre ELEVADA: un `Start-Process explorer` lanzado desde acá, con el escritorio
// cerrado, deja al Explorador como escritorio de ADMINISTRADOR, y todo lo que se abre
// después desde la barra de tareas o el menú Inicio corre elevado sin pedir UAC. Además,
// Windows suele relanzarlo solo al cerrarlo (AutoRestartShell): el Start-Process extra
// abría una ventana del Explorador de más.
//
// Stop-GoExplorer   cierra el Explorador y espera a que termine de verdad.
// Start-GoExplorer  espera unos segundos a que Windows lo relance; si no vuelve, lo abre
//                   DES-ELEVADO con una tarea programada de nivel limitado (como el
//                   usuario normal). Sólo si eso falla se abre directo, para no dejar
//                   la PC sin escritorio.
export const EXPLORER_FNS = String.raw`function Stop-GoExplorer {
  $old = @(Get-Process explorer -EA SilentlyContinue)
  $old | Stop-Process -Force -EA SilentlyContinue
  foreach ($x in $old) { try { $x.WaitForExit(5000) | Out-Null } catch {} }
}
function Start-GoExplorer {
  for ($i = 0; $i -lt 8 -and -not (Get-Process explorer -EA SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }
  if (Get-Process explorer -EA SilentlyContinue) { return }
  $tn = 'GO_Explorer_' + [guid]::NewGuid().ToString('N')
  try {
    $usr = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $act = New-ScheduledTaskAction -Execute "$env:windir\explorer.exe"
    $prin = New-ScheduledTaskPrincipal -UserId $usr -LogonType Interactive -RunLevel Limited
    $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $tn -Action $act -Principal $prin -Settings $set -Force -ErrorAction Stop | Out-Null
    Start-ScheduledTask -TaskName $tn
    for ($i = 0; $i -lt 20 -and -not (Get-Process explorer -EA SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }
  } catch {}
  Unregister-ScheduledTask -TaskName $tn -Confirm:$false -EA SilentlyContinue
  if (-not (Get-Process explorer -EA SilentlyContinue)) { Start-Process "$env:windir\explorer.exe" }
}`;

// Espera a que termine una tarea programada ya registrada en $tn, recién arrancada con
// Start-ScheduledTask. Start-ScheduledTask vuelve ANTES de que la tarea pase a "Running":
// mirar sólo que el estado fuera distinto de "Ready" cortaba la espera en el acto, se
// borraba la tarea y se informaba un resultado de algo que todavía no había corrido.
// Se considera terminada cuando ya arrancó (LastRunTime nuevo) y dejó de correr.
// `startedAfter` es el nombre de una variable con la hora previa al Start-ScheduledTask.
export const waitTask = (maxSecs: number, startedAfter = "$t0") => String.raw`$w = 0
while ($w -lt ${maxSecs}) {
  Start-Sleep -Seconds 1; $w++
  $tk = Get-ScheduledTask -TaskName $tn -EA SilentlyContinue
  if (-not $tk) { break }
  if ("$($tk.State)" -eq 'Running' -or "$($tk.State)" -eq 'Queued') { continue }
  $ti = Get-ScheduledTaskInfo -TaskName $tn -EA SilentlyContinue
  if ($ti -and $ti.LastRunTime -and $ti.LastRunTime -ge ${startedAfter}.AddSeconds(-2)) { break }
  if ($w -ge 30) { break }   # nunca llegó a arrancar
}`;
