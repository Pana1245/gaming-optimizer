// Catálogo de Optimizaciones. Mantenido a mano (ya NO se regenera desde main.py).
// optIn: nunca se preselecciona (ni con "Marcar todo"); el usuario debe tildarlo a mano.
import { BLOAT_MS, BLOAT_THIRD, EDGE_REMOVE } from "./bloat";
import { EXPLORER_FNS } from "./lib/shell";

// picker: el script se arma con lo elegido en el menú desplegable de la fila (bloatware:
// bloatCustom, permisos: permsDeny, servicios: svcDisable); `script` queda vacío.
export interface Tweak { name: string; script: string; os?: 10 | 11; risk?: "advanced"; optIn?: boolean; picker?: "bloat" | "perms" | "svc"; }
export interface Category { id: string; name: string; color: string; tweaks: Tweak[]; }

export const CATEGORIES: Category[] = [
  {
    id: "gaming",
    name: "Gaming Performance",
    color: "#FF6B35",
    tweaks: [
      { name: "Plan de energía: Máximo rendimiento", script: "# Reutiliza el plan Ultimate Performance si ya existe (antes se creaba UNA COPIA NUEVA\n# cada vez que se aplicaba); si no existe lo crea una sola vez; si la edicion de Windows\n# no lo soporta, usa Alto rendimiento.\n# La copia se renombra con un nombre fijo: asi se reconoce en Windows de cualquier idioma\n# (antes, en aleman/portugues/etc. el nombre no coincidia y se duplicaba en cada uso).\n$ult = powercfg /list | Select-String 'Gaming Optimizer|Ultimate Performance|M.ximo rendimiento' | Select-Object -First 1\n$new = $false\nif (-not $ult) { $ult = powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>$null; $new = $true }\nif (\"$ult\" -match '([0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})') {\n  $g = $matches[1]\n  if ($new) { powercfg /changename $g 'Ultimate Performance (Gaming Optimizer)' 2>$null | Out-Null }\n  powercfg /setactive $g\n  if ($LASTEXITCODE -eq 0) { Write-Output 'Plan de energia: Maximo rendimiento (Ultimate Performance)'; exit 0 }\n}\n# Alto rendimiento por GUID (el alias SCHEME_MAX es Ahorro de energia).\npowercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c\nif ($LASTEXITCODE -eq 0) { Write-Output 'Plan de energia: Alto rendimiento' } else { Write-Output 'No se pudo cambiar el plan de energia'; exit 1 }" },
      { name: "Habilitar Game Mode de Windows", script: "$path = 'HKCU:\\Software\\Microsoft\\GameBar'\nif (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }\nSet-ItemProperty -Path $path -Name 'AutoGameModeEnabled' -Value 1 -Type DWord -Force\nWrite-Output \"Game Mode habilitado\"" },
      { name: "Deshabilitar Xbox Game Bar y DVR", script: "$p1 = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR'\n$p2 = 'HKCU:\\System\\GameConfigStore'\nforeach ($p in @($p1,$p2)) { if (!(Test-Path $p)) { New-Item -Path $p -Force | Out-Null } }\nSet-ItemProperty -Path $p1 -Name 'AppCaptureEnabled' -Value 0 -Type DWord -Force\nSet-ItemProperty -Path $p2 -Name 'GameDVR_Enabled'   -Value 0 -Type DWord -Force\nGet-AppxPackage 'Microsoft.XboxGamingOverlay' -AllUsers -ErrorAction SilentlyContinue | ForEach-Object { $pkg = $_; try { Remove-AppxPackage -Package $pkg.PackageFullName -AllUsers -ErrorAction Stop } catch { Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction SilentlyContinue } }\nGet-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Where-Object DisplayName -eq 'Microsoft.XboxGamingOverlay' | ForEach-Object { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction SilentlyContinue | Out-Null }\nWrite-Output \"Xbox Game Bar deshabilitado\"" },
      { name: "Hardware Accelerated GPU Scheduling (HAGS)", script: "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'HwSchMode' -Value 2 -Type DWord -Force\nWrite-Output \"HAGS habilitado\"" },
      { name: "Prioridad CPU máxima para juegos", script: "$path = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games'\nif (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }\nSet-ItemProperty -Path $path -Name 'Priority'            -Value 6      -Type DWord  -Force\nSet-ItemProperty -Path $path -Name 'Scheduling Category' -Value 'High' -Type String -Force\nSet-ItemProperty -Path $path -Name 'SFIO Priority'       -Value 'High' -Type String -Force\nSet-ItemProperty -Path $path -Name 'GPU Priority'        -Value 8      -Type DWord  -Force\n$sys = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'\nSet-ItemProperty -Path $sys -Name 'SystemResponsiveness' -Value 0 -Type DWord -Force\nWrite-Output \"Prioridad CPU configurada\"" },
      { name: "Deshabilitar Full-Screen Optimization (FSO)", script: "$path = 'HKCU:\\System\\GameConfigStore'\nif (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }\nSet-ItemProperty -Path $path -Name 'GameDVR_DXGIHonorFSEWindowsCompatible' -Value 1 -Type DWord -Force\nSet-ItemProperty -Path $path -Name 'GameDVR_FSEBehavior'                    -Value 2 -Type DWord -Force\nWrite-Output \"FSO deshabilitado\"" },
      { name: "Deshabilitar aceleración del mouse", script: "Set-ItemProperty -Path 'HKCU:\\Control Panel\\Mouse' -Name 'MouseSpeed'      -Value '0' -Type String -Force\nSet-ItemProperty -Path 'HKCU:\\Control Panel\\Mouse' -Name 'MouseThreshold1' -Value '0' -Type String -Force\nSet-ItemProperty -Path 'HKCU:\\Control Panel\\Mouse' -Name 'MouseThreshold2' -Value '0' -Type String -Force\nWrite-Output \"Aceleracion del mouse deshabilitada\"" },
      { name: "Timer Resolution — 1ms (reduce micro-stutters)", script: String.raw`# Pedidos de resolución de timer globales (Windows 11; en 10 ya son globales).
$path = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\kernel'
if (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
Set-ItemProperty -Path $path -Name 'GlobalTimerResolutionRequests' -Value 1 -Type DWord -Force

# La resolución vale mientras viva el proceso que la pidió: la tarea queda corriendo oculta.
$taskScript = @'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class NtTimer {
    [DllImport("ntdll.dll")] public static extern int NtSetTimerResolution(uint r, bool set, ref uint cur);
}
"@
$cur = [uint32]0
[void][NtTimer]::NtSetTimerResolution(10000, $true, [ref]$cur)
while ($true) { Start-Sleep -Seconds 3600 }
'@
$dir = "$env:ProgramData\GamingOptimizer"; $scriptPath = "$dir\SetTimerRes.ps1"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
# Permisos seguros: este script corre con privilegios máximos al iniciar sesión; un usuario
# estándar no debe poder reemplazarlo (dueño Administradores, Usuarios solo lectura).
icacls $dir /setowner *S-1-5-32-544 /T /C /Q 2>$null | Out-Null
icacls $dir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' /C /Q 2>$null | Out-Null
# Sin /T arriba: a los archivos les sacaba lo heredado y quedaban sin permisos. El contenido hereda de la carpeta.
icacls "$dir\*" /reset /T /C /Q 2>$null | Out-Null
# Si ya corre (se aplica de nuevo), su proceso tiene el script abierto: frenarla antes de reescribirlo.
Stop-ScheduledTask -TaskName 'GamingOptimizer_TimerRes' -ErrorAction SilentlyContinue
$taskScript | Out-File $scriptPath -Encoding utf8 -Force

$action = New-ScheduledTaskAction -Execute "$env:windir\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "' + $scriptPath + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn
# Sin límite de tiempo (por defecto la corta a las 72 h) y también con batería.
$settings = New-ScheduledTaskSettingsSet -Hidden -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'GamingOptimizer_TimerRes' -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force -ErrorAction SilentlyContinue | Out-Null
Start-ScheduledTask -TaskName 'GamingOptimizer_TimerRes' -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class NtTimerQ { [DllImport("ntdll.dll")] public static extern int NtQueryTimerResolution(out uint min, out uint max, out uint cur); }
"@
$mn = [uint32]0; $mx = [uint32]0; $cu = [uint32]0
[void][NtTimerQ]::NtQueryTimerResolution([ref]$mn, [ref]$mx, [ref]$cu)
if ($cu -le 10500) { Write-Output "Timer Resolution: $([math]::Round($cu/10000.0,2))ms (activa en segundo plano)" }
else { Write-Output "Timer Resolution configurada (se activa al iniciar sesión)" }` },
      { name: "Core Parking OFF — todos los núcleos activos", script: "$as = powercfg /getactivescheme\n$scheme = if ($as -match '([0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})') { $matches[1] } else { 'SCHEME_CURRENT' }\n# Minimo y maximo de nucleos activos al 100%\npowercfg /setacvalueindex $scheme SUB_PROCESSOR CPMINCORES 100 2>$null\npowercfg /setdcvalueindex $scheme SUB_PROCESSOR CPMINCORES 100 2>$null\npowercfg /setacvalueindex $scheme SUB_PROCESSOR CPMAXCORES 100 2>$null\npowercfg /setdcvalueindex $scheme SUB_PROCESSOR CPMAXCORES 100 2>$null\n# Frecuencia minima del procesador al 100% (sin throttling)\npowercfg /setacvalueindex $scheme SUB_PROCESSOR PROCTHROTTLEMIN 100 2>$null\npowercfg /setacvalueindex $scheme SUB_PROCESSOR PROCTHROTTLEMAX 100 2>$null\npowercfg /setactive $scheme 2>$null\nWrite-Output \"Core Parking deshabilitado — todos los nucleos activos\"" },
      { name: "Desactivar HPET (timer de alta precisión)", optIn: true, risk: "advanced", script: "# HPET puede agregar latencia de entrada en algunos equipos; desactivarlo es un tweak gamer clasico.\nbcdedit /deletevalue useplatformclock 2>$null | Out-Null\nbcdedit /set disabledynamictick yes 2>$null | Out-Null\n# Por ID de hardware (ACPI\\PNP0103): el nombre del dispositivo cambia según el idioma de Windows.\n$h = Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like 'ACPI\\PNP0103*' }\nif ($h) { $h | Disable-PnpDevice -Confirm:$false -ErrorAction SilentlyContinue }\nWrite-Output \"HPET desactivado (reinicia para aplicar)\"" },
    ],
  },
  {
    id: "network",
    name: "Red — Menor Latencia",
    color: "#4CAF50",
    tweaks: [
      { name: "Deshabilitar algoritmo de Nagle (ping más bajo)", script: "$base = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'\nGet-ChildItem $base | ForEach-Object {\n    Set-ItemProperty -Path $_.PSPath -Name 'TcpAckFrequency' -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue\n    Set-ItemProperty -Path $_.PSPath -Name 'TCPNoDelay'      -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue\n}\nWrite-Output \"Algoritmo de Nagle deshabilitado\"" },
      { name: "Deshabilitar Teredo", script: "netsh interface teredo set state disabled | Out-Null\nWrite-Output \"Teredo deshabilitado\"" },
      { name: "Optimizar TCP", script: "netsh int tcp set global autotuninglevel=normal | Out-Null\nnetsh int tcp set global chimney=disabled       | Out-Null\nnetsh int tcp set global rss=enabled            | Out-Null\nnetsh int tcp set global dca=enabled            | Out-Null\nWrite-Output \"TCP optimizado\"" },
      { name: "Deshabilitar Large Send Offload (LSO)", script: "Get-NetAdapter -Physical | ForEach-Object { Disable-NetAdapterLso -Name $_.Name -ErrorAction SilentlyContinue }\nWrite-Output \"LSO deshabilitado\"" },
      { name: "Reservar 0% de ancho de banda para QoS", script: "$path = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched'\nif (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }\nSet-ItemProperty -Path $path -Name 'NonBestEffortLimit' -Value 0 -Type DWord -Force\nWrite-Output \"QoS bandwidth al 100 para juegos\"" },
    ],
  },
  {
    id: "debloat",
    name: "Eliminar Bloatware",
    color: "#2196F3",
    tweaks: [
      { name: "Eliminar bloatware (elegir apps)", optIn: true, picker: "bloat", script: "" },
      { name: "Eliminar apps Microsoft innecesarias", script: BLOAT_MS },
      { name: "Eliminar apps de terceros preinstaladas", script: BLOAT_THIRD },
      { name: "Desinstalar Microsoft Edge (si usás otro navegador)", optIn: true, risk: "advanced", script: EDGE_REMOVE },
      { name: "Deshabilitar OneDrive", optIn: true, risk: "advanced", script: "Stop-Process -Name 'OneDrive' -Force -ErrorAction SilentlyContinue\nif (Test-Path \"$env:SystemRoot\\SysWOW64\\OneDriveSetup.exe\") { & \"$env:SystemRoot\\SysWOW64\\OneDriveSetup.exe\" /uninstall 2>$null }\nelseif (Test-Path \"$env:SystemRoot\\System32\\OneDriveSetup.exe\")  { & \"$env:SystemRoot\\System32\\OneDriveSetup.exe\"  /uninstall 2>$null }\n$path = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\OneDrive'\nif (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }\nSet-ItemProperty -Path $path -Name 'DisableFileSyncNGSC' -Value 1 -Type DWord -Force\nWrite-Output \"OneDrive deshabilitado\"" },
    ],
  },
  {
    id: "privacy",
    name: "Privacidad y Telemetría",
    color: "#9C27B0",
    tweaks: [
      { name: "Deshabilitar telemetría de Windows", script: "$paths = @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection',\n           'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection',\n           'HKLM:\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection')\nforeach ($p in $paths) {\n    if (!(Test-Path $p)) { New-Item -Path $p -Force | Out-Null }\n    Set-ItemProperty -Path $p -Name 'AllowTelemetry' -Value 0 -Type DWord -Force\n}\nStop-Service 'DiagTrack' -ErrorAction SilentlyContinue; Set-Service 'DiagTrack' -StartupType Disabled -ErrorAction SilentlyContinue\nStop-Service 'dmwappushservice' -ErrorAction SilentlyContinue; Set-Service 'dmwappushservice' -StartupType Disabled -ErrorAction SilentlyContinue\n# Sólo Enterprise/Education/Server respetan el nivel 0; Home y Pro lo tratan como 1 (obligatorio).\nif ((Get-CimInstance Win32_OperatingSystem).Caption -match 'Enterprise|Education|Server') { Write-Output \"Telemetria deshabilitada\" }\nelse { Write-Output \"Telemetria reducida al minimo (Home/Pro no permite apagarla del todo)\" }" },
      { name: "Deshabilitar tareas programadas de telemetría", script: "$tasks = @(\n    '\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser',\n    '\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater',\n    '\\Microsoft\\Windows\\Autochk\\Proxy',\n    '\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator',\n    '\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip',\n    '\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticDataCollector',\n    '\\Microsoft\\Windows\\Feedback\\Siuf\\DmClient',\n    '\\Microsoft\\Windows\\Windows Error Reporting\\QueueReporting'\n)\nforeach ($t in $tasks) { Disable-ScheduledTask -TaskPath ((Split-Path $t) + '\\') -TaskName (Split-Path $t -Leaf) -ErrorAction SilentlyContinue | Out-Null }\nWrite-Output \"Tareas de telemetria deshabilitadas\"" },
      { name: "Deshabilitar ID publicitario y Cortana", script: "$adPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo'\nif (!(Test-Path $adPath)) { New-Item -Path $adPath -Force | Out-Null }\nSet-ItemProperty -Path $adPath -Name 'Enabled' -Value 0 -Type DWord -Force\n$cortanaPath = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search'\nif (!(Test-Path $cortanaPath)) { New-Item -Path $cortanaPath -Force | Out-Null }\nSet-ItemProperty -Path $cortanaPath -Name 'AllowCortana'         -Value 0 -Type DWord -Force\nSet-ItemProperty -Path $cortanaPath -Name 'DisableWebSearch'     -Value 1 -Type DWord -Force\nSet-ItemProperty -Path $cortanaPath -Name 'ConnectedSearchUseWeb'-Value 0 -Type DWord -Force\nWrite-Output \"ID publicitario y Cortana deshabilitados\"" },
      { name: "Deshabilitar Activity History y Timeline", script: "$path = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System'\nif (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }\nSet-ItemProperty -Path $path -Name 'EnableActivityFeed'    -Value 0 -Type DWord -Force\nSet-ItemProperty -Path $path -Name 'PublishUserActivities' -Value 0 -Type DWord -Force\nSet-ItemProperty -Path $path -Name 'UploadUserActivities'  -Value 0 -Type DWord -Force\nWrite-Output \"Activity History deshabilitado\"" },
    ],
  },
  {
    id: "visual",
    name: "Rendimiento Visual",
    color: "#FF9800",
    tweaks: [
      { name: "Desactivar animaciones y efectos visuales", script: "$adv  = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced'\n$desk = 'HKCU:\\Control Panel\\Desktop'\n$win  = 'HKCU:\\Control Panel\\Desktop\\WindowMetrics'\n$dwm  = 'HKCU:\\Software\\Microsoft\\Windows\\DWM'\nSet-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Name 'VisualFXSetting' -Value 3 -Type DWord -Force\nSet-ItemProperty -Path $adv  -Name 'TaskbarAnimations'    -Value 0   -Type DWord  -Force\nSet-ItemProperty -Path $win  -Name 'MinAnimate'           -Value '0' -Type String -Force\nSet-ItemProperty -Path $adv  -Name 'ListviewAlphaSelect'  -Value 0   -Type DWord  -Force\nSet-ItemProperty -Path $adv  -Name 'ListviewShadow'       -Value 0   -Type DWord  -Force\nSet-ItemProperty -Path $desk -Name 'MenuShowDelay'        -Value '0' -Type String -Force\nSet-ItemProperty -Path $desk -Name 'UserPreferencesMask'  -Value ([byte[]](0x90,0x12,0x01,0x80,0x10,0x00,0x00,0x00)) -Type Binary -Force\nif (!(Test-Path $dwm)) { New-Item -Path $dwm -Force | Out-Null }\nSet-ItemProperty -Path $dwm  -Name 'EnableAeroPeek'        -Value 0 -Type DWord -Force\nSet-ItemProperty -Path $adv  -Name 'DisablePreviewDesktop' -Value 1 -Type DWord -Force\nSet-ItemProperty -Path $desk -Name 'DragFullWindows'        -Value '1' -Type String -Force\nSet-ItemProperty -Path $desk -Name 'FontSmoothing'          -Value '2' -Type String -Force\nSet-ItemProperty -Path $desk -Name 'FontSmoothingType'      -Value 2   -Type DWord  -Force\nSet-ItemProperty -Path $adv  -Name 'IconsOnly'              -Value 0   -Type DWord  -Force\nWrite-Output \"Efectos visuales optimizados\"" },
      { name: "Deshabilitar transparencia de Windows", script: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' -Name 'EnableTransparency' -Value 0 -Type DWord -Force\nWrite-Output \"Transparencia deshabilitada\"" },
      { name: "Reducir delay del menú contextual", script: "Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'MenuShowDelay' -Value '0' -Type String -Force\nWrite-Output \"Delay del menu reducido\"" },
    ],
  },
  {
    id: "desktop",
    name: "Escritorio y Apariencia",
    color: "#607D8B",
    tweaks: [
      { name: "Activar Modo Oscuro (apps y sistema)", script: "$path = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'\nif (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }\nSet-ItemProperty -Path $path -Name 'AppsUseLightTheme'    -Value 0 -Type DWord -Force\nSet-ItemProperty -Path $path -Name 'SystemUsesLightTheme' -Value 0 -Type DWord -Force\nWrite-Output \"Modo oscuro activado\"" },
      { name: "Simplificar barra de tareas (conservar buscador)", script: "$adv = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced'\n# Ocultar boton Task View\nSet-ItemProperty -Path $adv -Name 'ShowTaskViewButton' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue\n# Ocultar boton Cortana\nSet-ItemProperty -Path $adv -Name 'ShowCortanaButton'  -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue\n# Ocultar icono People (contactos)\nSet-ItemProperty -Path $adv -Name 'PeopleBand'          -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue\n# Ocultar Noticias y tiempo (widgets Windows 10)\nSet-ItemProperty -Path $adv -Name 'TaskbarDa'           -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue\n# Ocultar Meet Now (camara rapida)\n$pol = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer'\nif (!(Test-Path $pol)) { New-Item -Path $pol -Force | Out-Null }\nSet-ItemProperty -Path $pol -Name 'HideSCAMeetNow'      -Value 1 -Type DWord -Force\n# Mantener buscador visible (modo barra completa = 2, solo icono = 1)\nSet-ItemProperty -Path $adv -Name 'SearchboxTaskbarMode' -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue\nWrite-Output \"Barra de tareas simplificada (buscador conservado)\"" },
      { name: "Desanclar todas las apps del menu Inicio", os: 10, optIn: true, script: String.raw`${EXPLORER_FNS}
$blankLayout = @'
<LayoutModificationTemplate xmlns:defaultlayout="http://schemas.microsoft.com/Start/2014/FullDefaultLayout" xmlns:start="http://schemas.microsoft.com/Start/2014/StartLayout" Version="1" xmlns="http://schemas.microsoft.com/Start/2014/LayoutModification">
  <LayoutOptions StartTileGroupCellWidth="6" />
  <DefaultLayoutOverride>
    <StartLayoutCollection>
      <defaultlayout:StartLayout GroupCellWidth="6" />
    </StartLayoutCollection>
  </DefaultLayoutOverride>
</LayoutModificationTemplate>
'@
$layoutFile = "$env:TEMP\GoBlankStart.xml"
$blankLayout | Out-File $layoutFile -Encoding utf8 -Force
# Import-StartLayout sólo cambia el perfil por defecto (usuarios nuevos). Para la cuenta actual:
# diseño vacío bloqueado por política -> Explorer lo aplica -> se suelta la política y quedan
# los mosaicos vacíos pero editables.
$pol = 'HKCU:\Software\Policies\Microsoft\Windows\Explorer'
$had = Test-Path $pol
if (!$had) { New-Item -Path $pol -Force | Out-Null }
Set-ItemProperty -Path $pol -Name 'LockedStartLayout' -Value 1 -Type DWord -Force
Set-ItemProperty -Path $pol -Name 'StartLayoutFile' -Value $layoutFile -Type ExpandString -Force
Stop-GoExplorer; Start-GoExplorer
Start-Sleep -Seconds 5
# Abrir el Inicio una vez hace que cargue el diseño nuevo.
try { (New-Object -ComObject WScript.Shell).SendKeys('^{ESCAPE}'); Start-Sleep -Seconds 3; (New-Object -ComObject WScript.Shell).SendKeys('{ESCAPE}') } catch {}
Remove-ItemProperty -Path $pol -Name 'LockedStartLayout','StartLayoutFile' -Force -ErrorAction SilentlyContinue
if (!$had -and -not (Get-Item $pol).Property) { Remove-Item $pol -Force -ErrorAction SilentlyContinue }
Stop-GoExplorer; Start-GoExplorer
Remove-Item $layoutFile -Force -ErrorAction SilentlyContinue
Write-Output "Apps del Inicio desancladas"` },
      { name: "Desactivar panel de Widgets", script: "$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced'\nSet-ItemProperty -Path $path -Name 'TaskbarDa' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue\n$pol = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Dsh'\nif (!(Test-Path $pol)) { New-Item -Path $pol -Force | Out-Null }\nSet-ItemProperty -Path $pol -Name 'AllowNewsAndInterests' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue\nWrite-Output \"Panel de Widgets desactivado\"", os: 11 },
      { name: "Desactivar botón Chat / Teams en barra de tareas", script: "$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced'\nSet-ItemProperty -Path $path -Name 'TaskbarMn' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue\nWrite-Output \"Boton Chat/Teams eliminado de la barra de tareas\"", os: 11 },
      { name: "Desactivar Copilot", script: "$adv = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced'\nSet-ItemProperty -Path $adv -Name 'ShowCopilotButton' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue\n$pol = 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot'\nif (!(Test-Path $pol)) { New-Item -Path $pol -Force | Out-Null }\nSet-ItemProperty -Path $pol -Name 'TurnOffWindowsCopilot' -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue\nWrite-Output \"Copilot desactivado\"", os: 11 },
      { name: "Borrar accesos directos rotos (destino inexistente)", optIn: true, risk: "advanced", script: "$dirs = @(\n    [System.Environment]::GetFolderPath('Desktop'),\n    [System.Environment]::GetFolderPath('CommonDesktopDirectory'),\n    \"$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\",\n    \"$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\"\n)\n$shell   = New-Object -ComObject WScript.Shell\n$removed = 0\nforeach ($dir in $dirs) {\n    if (!(Test-Path $dir)) { continue }\n    Get-ChildItem -Path $dir -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue | ForEach-Object {\n        try {\n            $target = $shell.CreateShortcut($_.FullName).TargetPath\n            # Sólo destinos en un disco FIJO que existe (un USB desconectado o una unidad de red,\n            # que el administrador no ve, no son accesos rotos) y -LiteralPath: con -Path,\n            # 'Juego [GOTY Edition]' se tomaba como comodín y se borraba un acceso que anda.\n            $root = if ($target -and -not $target.StartsWith('\\\\')) { [IO.Path]::GetPathRoot($target) } else { '' }\n            $fixed = $root -and (Test-Path -LiteralPath $root) -and ([IO.DriveInfo]::new($root).DriveType -eq 'Fixed')\n            if ($fixed -and !(Test-Path -LiteralPath $target)) {\n                Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue\n                $removed++\n            }\n        } catch {}\n    }\n}\n[System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null\nWrite-Output \"Accesos directos rotos eliminados: $removed\"" },
    ],
  },
  {
    id: "permisos",
    name: "Permisos de Aplicaciones",
    color: "#00BCD4",
    tweaks: [
      { name: "Bloquear permisos de apps (elegir cuáles)", picker: "perms", script: "" },
      { name: "Deshabilitar Activación por Voz", script: "$path = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\voiceActivation'\nif (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }\nSet-ItemProperty -Path $path -Name 'Value' -Value 'Deny' -Type String -Force\n$pol = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy'\nif (!(Test-Path $pol)) { New-Item -Path $pol -Force | Out-Null }\nSet-ItemProperty -Path $pol -Name 'LetAppsActivateWithVoice' -Value 2 -Type DWord -Force\nWrite-Output \"Activacion por voz deshabilitada\"" },
      { name: "Deshabilitar apps en segundo plano", script: "$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications'\nif (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }\nSet-ItemProperty -Path $path -Name 'GlobalUserDisabled' -Value 1 -Type DWord -Force\nWrite-Output \"Apps en segundo plano deshabilitadas\"" },
      { name: "Deshabilitar notificaciones de apps", script: String.raw`# El interruptor "Recibir notificaciones de aplicaciones" de Configuración.
$path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\PushNotifications'
if (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
Set-ItemProperty -Path $path -Name 'ToastEnabled' -Value 0 -Type DWord -Force
Write-Output "Notificaciones de apps deshabilitadas"` },
    ],
  },
  {
    id: "services",
    name: "Servicios Innecesarios",
    color: "#F44336",
    tweaks: [
      { name: "Deshabilitar servicios (elegir cuáles)", picker: "svc", script: "" },
      { name: "Deshabilitar Windows Defender (ADVERTENCIA: reduce proteccion)", optIn: true, script: "# 1. Deshabilitar Tamper Protection via registro\n$tp = 'HKLM:\\SOFTWARE\\Microsoft\\Windows Defender\\Features'\nif (Test-Path $tp) {\n    Set-ItemProperty -Path $tp -Name 'TamperProtection' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue\n}\n\n# 2. Deshabilitar via Group Policy (metodo mas permanente)\n$pol = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender'\nif (!(Test-Path $pol)) { New-Item -Path $pol -Force | Out-Null }\nSet-ItemProperty -Path $pol -Name 'DisableAntiSpyware'       -Value 1 -Type DWord -Force\nSet-ItemProperty -Path $pol -Name 'DisableAntiVirus'         -Value 1 -Type DWord -Force\n\n$rt = \"$pol\\Real-Time Protection\"\nif (!(Test-Path $rt)) { New-Item -Path $rt -Force | Out-Null }\nSet-ItemProperty -Path $rt -Name 'DisableRealtimeMonitoring' -Value 1 -Type DWord -Force\nSet-ItemProperty -Path $rt -Name 'DisableBehaviorMonitoring' -Value 1 -Type DWord -Force\nSet-ItemProperty -Path $rt -Name 'DisableOnAccessProtection' -Value 1 -Type DWord -Force\nSet-ItemProperty -Path $rt -Name 'DisableScanOnRealtimeEnable' -Value 1 -Type DWord -Force\n\n# 3. Deshabilitar servicios de Defender\n$svcs = @('WinDefend','WdNisSvc','WdNisDrv','Sense','WdFilter','WdBoot')\nforeach ($svc in $svcs) {\n    Stop-Service $svc -Force -ErrorAction SilentlyContinue\n    Set-Service  $svc -StartupType Disabled -ErrorAction SilentlyContinue\n}\n\n# 4. Deshabilitar tareas programadas de Defender\n$defTasks = @(\n    '\\Microsoft\\Windows\\Windows Defender\\Windows Defender Cache Maintenance',\n    '\\Microsoft\\Windows\\Windows Defender\\Windows Defender Cleanup',\n    '\\Microsoft\\Windows\\Windows Defender\\Windows Defender Scheduled Scan',\n    '\\Microsoft\\Windows\\Windows Defender\\Windows Defender Verification'\n)\nforeach ($t in $defTasks) {\n    Disable-ScheduledTask -TaskPath ((Split-Path $t) + '\\') -TaskName (Split-Path $t -Leaf) -ErrorAction SilentlyContinue | Out-Null\n}\n\n# 5. Intentar via PowerShell (puede fallar si Tamper Protection sigue activa)\ntry { Set-MpPreference -DisableRealtimeMonitoring $true -ErrorAction SilentlyContinue } catch {}\n\n# 6. Verificación real: con la Protección contra alteraciones activa, Windows ignora todo lo anterior.\nStart-Sleep -Seconds 1\n$st = Get-MpComputerStatus -ErrorAction SilentlyContinue\nif ($st -and $st.RealTimeProtectionEnabled -and $st.IsTamperProtected) {\n  Write-Output \"Windows Defender sigue activo: la Protección contra alteraciones lo bloquea. Apagala en Seguridad de Windows > Protección antivirus y contra amenazas > Administrar configuración, y volvé a aplicar.\"\n  exit 1\n}\nif ($st -and $st.RealTimeProtectionEnabled) { Write-Output \"Windows Defender quedará deshabilitado al reiniciar.\" }\nelse { Write-Output \"Windows Defender deshabilitado (reinicia para aplicar completamente)\" }" },
    ],
  },
];
