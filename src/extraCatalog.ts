import type { Tweak, Category } from "./catalog";

// Tweaks nuevos, fusionados por id de categoría en Optimizaciones.
export const EXTRA_TWEAKS: Record<string, Tweak[]> = {
  gaming: [
    {
      name: "Plan de energía Ultimate Performance",
      script: String.raw`powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>$null | Out-Null
$p = powercfg -list | Select-String 'Ultimate' | Select-Object -First 1
if($p){ $g = ($p -split '\s+')[3]; powercfg /setactive $g; Write-Output 'Ultimate Performance activado' }
else { Write-Output 'No disponible en esta edicion' }`,
    },
    {
      name: "MSI mode en la GPU (menos latencia)",
      risk: "advanced",
      script: String.raw`$gpus = Get-CimInstance Win32_VideoController | Where-Object { $_.PNPDeviceID -like 'PCI*' }
$n = 0
foreach($g in $gpus){
  $p = "HKLM:\SYSTEM\CurrentControlSet\Enum\$($g.PNPDeviceID)\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
  if(Test-Path $p){ Set-ItemProperty $p -Name MSISupported -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; $n++ }
}
Write-Output "MSI mode activado en $n GPU(s). Reinicia para aplicar."`,
    },
  ],
  privacy: [
    {
      name: "Bloquear telemetría (archivo hosts)",
      risk: "advanced",
      script: String.raw`$hosts = "$env:windir\System32\drivers\etc\hosts"
$domains = @('vortex.data.microsoft.com','telemetry.microsoft.com','watson.telemetry.microsoft.com','settings-win.data.microsoft.com','telecommand.telemetry.microsoft.com','oca.telemetry.microsoft.com','v10.events.data.microsoft.com')
$c = Get-Content $hosts -ErrorAction SilentlyContinue
$add = 0
foreach($d in $domains){ if($c -notmatch [regex]::Escape($d)){ Add-Content $hosts "0.0.0.0 $d"; $add++ } }
Write-Output "Dominios de telemetria bloqueados: $add"`,
    },
    {
      name: "Desactivar Recall (captura de IA)",
      os: 11,
      script: String.raw`$p = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI'
if(!(Test-Path $p)){ New-Item $p -Force | Out-Null }
Set-ItemProperty $p -Name DisableAIDataAnalysis -Value 1 -Type DWord -Force
Dism /Online /Disable-Feature /FeatureName:Recall /NoRestart 2>$null | Out-Null
Write-Output 'Recall desactivado'`,
    },
  ],
  desktop: [
    {
      name: "Quitar OneDrive por completo",
      risk: "advanced",
      script: String.raw`taskkill /f /im OneDrive.exe 2>$null | Out-Null
$x = "$env:SystemRoot\SysWOW64\OneDriveSetup.exe"
if(!(Test-Path $x)){ $x = "$env:SystemRoot\System32\OneDriveSetup.exe" }
if(Test-Path $x){ Start-Process $x '/uninstall' -Wait }
Remove-Item "$env:UserProfile\OneDrive" -Recurse -Force -ErrorAction SilentlyContinue
Write-Output 'OneDrive desinstalado'`,
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// Tweaks adaptados de WinUtil — Chris Titus Tech (https://github.com/ChrisTitusTech/winutil)
// Licencia MIT. Crédito al proyecto original. Ver CREDITS.md.
// ───────────────────────────────────────────────────────────────────────────
export const EXTRA_CATEGORIES: Category[] = [
  {
    id: "winutil",
    name: "Más Tweaks · WinUtil",
    color: "#00BCD4",
    tweaks: [
      { name: "Menú contextual clásico (clic derecho de W10)", os: 11, risk: "advanced", script: String.raw`reg add "HKCU\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32" /f /ve | Out-Null
Stop-Process -Name explorer -Force; Start-Process explorer
Write-Output "Menú contextual clásico activado"` },
      { name: "Mostrar extensiones de archivo", script: String.raw`Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' HideFileExt 0 -Type DWord -Force
Write-Output "Extensiones visibles"` },
      { name: "Mostrar archivos y carpetas ocultos", script: String.raw`Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' Hidden 1 -Type DWord -Force
Write-Output "Archivos ocultos visibles"` },
      { name: "“Finalizar tarea” con clic derecho en la barra", os: 11, script: String.raw`$p='HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced\TaskbarDeveloperSettings'
if(!(Test-Path $p)){ New-Item $p -Force | Out-Null }
Set-ItemProperty $p TaskbarEndTask 1 -Type DWord -Force
Write-Output "Finalizar tarea habilitado"` },
      { name: "Alinear barra de tareas a la izquierda", os: 11, script: String.raw`Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' TaskbarAl 0 -Type DWord -Force
Write-Output "Barra de tareas a la izquierda"` },
      { name: "Desactivar Consumer Features (sugerencias y anuncios)", script: String.raw`$p='HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent'
if(!(Test-Path $p)){ New-Item $p -Force | Out-Null }
Set-ItemProperty $p DisableWindowsConsumerFeatures 1 -Type DWord -Force
Write-Output "Consumer features desactivado"` },
      { name: "Quitar sugerencias/anuncios del menú Inicio", script: String.raw`$c='HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'
foreach($n in 'SubscribedContent-338388Enabled','SubscribedContent-338389Enabled','SubscribedContent-353698Enabled','SystemPaneSuggestionsEnabled'){ Set-ItemProperty $c $n 0 -Type DWord -Force -EA SilentlyContinue }
Write-Output "Sugerencias del Inicio desactivadas"` },
      { name: "Quitar búsqueda de Bing del menú Inicio", script: String.raw`$p='HKCU:\Software\Policies\Microsoft\Windows\Explorer'
if(!(Test-Path $p)){ New-Item $p -Force | Out-Null }
Set-ItemProperty $p DisableSearchBoxSuggestions 1 -Type DWord -Force
Write-Output "Bing en Inicio desactivado"` },
      { name: "Debloat de Microsoft Edge (quitar promos)", script: String.raw`$p='HKLM:\SOFTWARE\Policies\Microsoft\Edge'
if(!(Test-Path $p)){ New-Item $p -Force | Out-Null }
foreach($k in 'EdgeShoppingAssistantEnabled','HubsSidebarEnabled','ShowRecommendationsEnabled','PersonalizationReportingEnabled'){ Set-ItemProperty $p $k 0 -Type DWord -Force -EA SilentlyContinue }
Write-Output "Edge debloated"` },
      { name: "Desactivar seguimiento de ubicación", script: String.raw`Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location' Value 'Deny' -Type String -Force -EA SilentlyContinue
Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\lfsvc\Service\Configuration' Status 0 -Type DWord -Force -EA SilentlyContinue
Write-Output "Ubicación desactivada"` },
      { name: "Desactivar Storage Sense", script: String.raw`Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy' -Recurse -Force -EA SilentlyContinue
Write-Output "Storage Sense desactivado"` },
      { name: "Desactivar Wi-Fi Sense", script: String.raw`$p='HKLM:\SOFTWARE\Microsoft\PolicyManager\default\WiFi\AllowWiFiHotSpotReporting'
if(!(Test-Path $p)){ New-Item $p -Force | Out-Null }
Set-ItemProperty $p value 0 -Type DWord -Force
Write-Output "Wi-Fi Sense desactivado"` },
      { name: "Desactivar telemetría de PowerShell 7", script: String.raw`[Environment]::SetEnvironmentVariable('POWERSHELL_TELEMETRY_OPTOUT','1','Machine')
Write-Output "Telemetría de PowerShell desactivada"` },
      { name: "Desactivar hibernación (libera espacio)", risk: "advanced", script: String.raw`powercfg /hibernate off
Write-Output "Hibernación desactivada"` },
      { name: "Desactivar IPv6", risk: "advanced", script: String.raw`Disable-NetAdapterBinding -Name '*' -ComponentID ms_tcpip6 -EA SilentlyContinue
Write-Output "IPv6 desactivado"` },
      { name: "Desactivar reinicio automático tras actualizar", script: String.raw`$p='HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
if(!(Test-Path $p)){ New-Item $p -Force | Out-Null }
Set-ItemProperty $p NoAutoRebootWithLoggedOnUsers 1 -Type DWord -Force
Write-Output "Reinicio automático desactivado"` },
      { name: "Pantalla azul (BSOD) con detalles técnicos", script: String.raw`Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CrashControl' DisplayParameters 1 -Type DWord -Force -EA SilentlyContinue
Write-Output "BSOD detallado activado"` },
      { name: "Mensajes detallados al iniciar sesión", script: String.raw`Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' VerboseStatus 1 -Type DWord -Force
Write-Output "Mensajes de inicio detallados"` },
      { name: "Activar NumLock al iniciar Windows", script: String.raw`reg add "HKU\.DEFAULT\Control Panel\Keyboard" /v InitialKeyboardIndicators /t REG_SZ /d 2 /f | Out-Null
Write-Output "NumLock activado al inicio"` },
      { name: "Desactivar Sticky Keys", script: String.raw`Set-ItemProperty 'HKCU:\Control Panel\Accessibility\StickyKeys' Flags '506' -Type String -Force
Write-Output "Sticky Keys desactivado"` },
      { name: "Mostrar segundos en el reloj de la barra", os: 11, script: String.raw`Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' ShowSecondsInSystemClock 1 -Type DWord -Force
Write-Output "Segundos en el reloj activados"` },
      { name: "Hora del sistema en UTC (dual-boot con Linux)", risk: "advanced", script: String.raw`Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\TimeZoneInformation' RealTimeIsUniversal 1 -Type DWord -Force
Write-Output "Hora en UTC (dual-boot)"` },
      { name: "Desactivar servicio HomeGroup", script: String.raw`foreach($s in 'HomeGroupListener','HomeGroupProvider'){ Stop-Service $s -EA SilentlyContinue; Set-Service $s -StartupType Disabled -EA SilentlyContinue }
Write-Output "HomeGroup desactivado"` },
    ],
  },
];
