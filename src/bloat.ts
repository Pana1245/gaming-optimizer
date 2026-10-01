// ─────────────────────────────────────────────────────────────────────────────
// Eliminación de bloatware y de Microsoft Edge (scripts de Optimizaciones).
//
// Todos los scripts de bloatware usan la misma función Remove-GoApps:
//  1. Quita cada app para TODOS los usuarios (y si Windows no lo permite, para el
//     usuario actual).
//  2. Quita la copia "provisionada": la que Windows vuelve a instalar a cada
//     usuario nuevo y después de las actualizaciones grandes.
//  3. Verifica al final qué se fue de verdad y lo informa (antes siempre decía
//     "eliminadas" aunque no se hubiera quitado nada).
// Nunca toca frameworks, componentes del sistema ni la lista KEEP_CORE (Store,
// Xbox/Game Pass, juegos, paneles de drivers, idiomas).
// ─────────────────────────────────────────────────────────────────────────────

const psList = (xs: string[]) => "@(" + xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(",") + ")";

// Protegidas SIEMPRE (patrones -like).
const KEEP_CORE = [
  // Tienda, instalador de apps y compras
  "Microsoft.WindowsStore", "Microsoft.StorePurchaseApp", "Microsoft.DesktopAppInstaller", "Microsoft.Winget.*",
  // Xbox / Game Pass (sin Gaming Services no abren los juegos de Game Pass)
  "Microsoft.GamingApp", "Microsoft.GamingServices", "Microsoft.XboxApp", "Microsoft.XboxIdentityProvider",
  "Microsoft.Xbox.TCUI", "Microsoft.XboxGameCallableUI", "Microsoft.XboxGamingOverlay", "Microsoft.XboxSpeechToTextOverlay",
  // Juegos y apps que la gente usa
  "*Minecraft*", "*ROBLOX*", "*WhatsApp*",
  // Runtimes y frameworks (otras apps dependen de ellos)
  "Microsoft.VCLibs*", "Microsoft.UI.Xaml*", "Microsoft.NET.*", "Microsoft.WindowsAppRuntime*", "Microsoft.Services.Store.Engagement",
  "Microsoft.DirectXRuntime", "Microsoft.WidgetsPlatformRuntime", "Microsoft.ApplicationCompatibilityEnhancements",
  // Idiomas, códecs y extensiones de imagen/video
  "Microsoft.LanguageExperiencePack*", "*Extension", "*Extensions",
  // Paneles de drivers (NVIDIA, AMD, Realtek, Intel, Dolby)
  "NVIDIACorp.*", "AdvancedMicroDevicesInc*", "RealtekSemiconductorCorp.*", "AppUp.Intel*", "*IntelGraphics*", "DolbyLaboratories.*",
  // Edge tiene su propio tweak (con chequeo de otro navegador); OneDrive también
  "Microsoft.MicrosoftEdge*", "Microsoft.OneDriveSync",
  // Seguridad de Windows y Portal de empresa (PCs de trabajo)
  "Microsoft.SecHealthUI", "Microsoft.CompanyPortal",
  // Detectados en la simulación: runtimes, Office y el launcher de Minecraft (su nombre no dice "Minecraft")
  "MicrosoftCorporationII.WinAppRuntime*", "Microsoft.Office.*", "Microsoft.OfficePushNotificationUtility",
  "Microsoft.4297127D64EC6", "Microsoft.XboxGameOverlay",
];

// Lista completa (opcional, avanzada): además de las anteriores, estas apps de Windows
// que algunos usan. Es una lista EXPLÍCITA: nunca se quita "todo menos X", porque eso
// borraría apps que instaló el usuario (juegos, Claude, launchers…).
const AGGRESSIVE = [
  "MicrosoftWindows.Client.WebExperience", // Widgets
  "Microsoft.ZuneMusic", // Reproductor multimedia (en W11 es el reproductor de música por defecto)
  "Microsoft.MicrosoftStickyNotes", "Microsoft.WindowsSoundRecorder", "MicrosoftCorporationII.QuickAssist",
  "Microsoft.Paint3D", "Microsoft.Whiteboard", "Microsoft.RemoteDesktop", "Microsoft.WindowsScan",
  "Microsoft.CommsPhone", "Microsoft.ConnectivityStore", "Microsoft.MicrosoftEdgeDevToolsClient",
];

// Apps de Microsoft que casi nadie usa (explícitas: no se quita nada por comodín).
const MS_APPS = [
  "Microsoft.BingNews", "Microsoft.BingWeather", "Microsoft.BingFinance", "Microsoft.BingSports", "Microsoft.BingTravel",
  "Microsoft.BingFoodAndDrink", "Microsoft.BingHealthAndFitness", "Microsoft.BingTranslator", "Microsoft.BingSearch",
  "Microsoft.GetHelp", "Microsoft.Getstarted", "Microsoft.Messaging", "Microsoft.Microsoft3DViewer", "Microsoft.3DBuilder",
  "Microsoft.MicrosoftSolitaireCollection", "Microsoft.MicrosoftOfficeHub", "Microsoft.Office.OneNote", "Microsoft.Office.Sway",
  "Microsoft.NetworkSpeedTest", "Microsoft.News", "Microsoft.OneConnect", "Microsoft.People", "Microsoft.Print3D",
  "Microsoft.SkypeApp", "Microsoft.Wallet", "Microsoft.WindowsAlarms", "Microsoft.WindowsFeedbackHub", "Microsoft.WindowsMaps",
  "Microsoft.ZuneVideo", "Microsoft.YourPhone", "Microsoft.MixedReality.Portal",
  "Microsoft.Todos", "Microsoft.PowerAutomateDesktop", "Microsoft.MicrosoftPowerBIForWindows", "Microsoft.WindowsReadingList",
  "Microsoft.549981C3F5F10", "Microsoft.Copilot", "Microsoft.MicrosoftJournal", "Microsoft.OutlookForWindows",
  "microsoft.windowscommunicationsapps", "Microsoft.Windows.DevHome", "MicrosoftCorporationII.MicrosoftFamily",
  "MicrosoftTeams", "MSTeams", "Clipchamp.Clipchamp",
];

// Apps de terceros que vienen preinstaladas o se instalan solas como "sugerencia".
const THIRD_PARTY = [
  "*CandyCrush*", "*BubbleWitch*", "*RoyalRevolt*", "*MarchofEmpires*", "*HiddenCity*", "*FarmVille*", "*Asphalt8*",
  "*Duolingo*", "*EclipseManager*", "*AdobePhotoshopExpress*", "*Wunderlist*", "*Flipboard*", "*Twitter*", "*Facebook*",
  "*Instagram*", "*Spotify*", "*Netflix*", "*PandoraMediaInc*", "*TikTok*", "*Disney*", "*Booking*", "*WildTangent*",
  "*McAfee*", "*Norton*", "*LinkedInforWindows*", "*king.com*", "*Amazon.com.Amazon*", "*PrimeVideo*",
];

const CORE = String.raw`$script:GoRemoved = 0; $script:GoFailed = 0
function Test-Like($name, $patterns) { foreach ($p in $patterns) { if ($name -like $p) { return $true } }; return $false }
function Remove-GoApps($Include, $Keep) {
  $removed = New-Object System.Collections.Generic.List[string]
  $failed = New-Object System.Collections.Generic.List[string]
  $pkgs = @(Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue | Where-Object {
    -not $_.IsFramework -and "$($_.SignatureKind)" -ne 'System' -and -not $_.NonRemovable -and
    (Test-Like $_.Name $Include) -and -not (Test-Like $_.Name $Keep) })
  foreach ($p in ($pkgs | Sort-Object PackageFullName -Unique)) {
    $ok = $false
    try { Remove-AppxPackage -Package $p.PackageFullName -AllUsers -ErrorAction Stop; $ok = $true } catch {}
    if (-not $ok) { try { Remove-AppxPackage -Package $p.PackageFullName -ErrorAction Stop; $ok = $true } catch {} }
    if (-not $removed.Contains($p.Name) -and -not $failed.Contains($p.Name)) { if ($ok) { $removed.Add($p.Name) } else { $failed.Add($p.Name) } }
  }
  # Copia provisionada: sin esto Windows la reinstala a usuarios nuevos y tras actualizaciones grandes.
  $prov = 0
  foreach ($pp in @(Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Where-Object { (Test-Like $_.DisplayName $Include) -and -not (Test-Like $_.DisplayName $Keep) })) {
    try { Remove-AppxProvisionedPackage -Online -PackageName $pp.PackageName -AllUsers -ErrorAction Stop | Out-Null; $prov++ }
    catch { try { Remove-AppxProvisionedPackage -Online -PackageName $pp.PackageName -ErrorAction Stop | Out-Null; $prov++ } catch {} }
  }
  # Verificación real: ¿sigue instalada para algún usuario?
  $still = @(Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue | Where-Object {
    $removed.Contains($_.Name) -and (@($_.PackageUserInformation | Where-Object { "$($_.InstallState)" -eq 'Installed' }).Count -gt 0) } | ForEach-Object { $_.Name })
  foreach ($n in $removed) { if ($still -contains $n) { $failed.Add($n) } else { Write-Output "  - $n" } }
  $okN = @($removed | Where-Object { $still -notcontains $_ }).Count
  foreach ($n in ($failed | Sort-Object -Unique)) { Write-Output "  ! No se pudo quitar: $n" }
  $script:GoRemoved += $okN
  $script:GoFailed += @($failed | Sort-Object -Unique).Count
}
# Evita que Windows vuelva a instalar solo las apps "sugeridas" (Candy Crush y compañía).
function Block-Reinstall {
  $c = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'
  if (!(Test-Path $c)) { New-Item $c -Force | Out-Null }
  foreach ($v in 'SilentInstalledAppsEnabled', 'OemPreInstalledAppsEnabled', 'PreInstalledAppsEnabled', 'PreInstalledAppsEverEnabled') {
    Set-ItemProperty $c $v 0 -Type DWord -Force -ErrorAction SilentlyContinue
  }
  $cc = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent'
  if (!(Test-Path $cc)) { New-Item $cc -Force | Out-Null }
  Set-ItemProperty $cc DisableWindowsConsumerFeatures 1 -Type DWord -Force -ErrorAction SilentlyContinue
}
function Write-GoSummary {
  Write-Output ("Apps eliminadas: " + $script:GoRemoved + " · no se pudieron: " + $script:GoFailed)
}
`;

const keepCore = psList(KEEP_CORE);

export const BLOAT_MS = `${CORE}
Write-Output "Eliminando apps de Microsoft que casi nadie usa..."
Remove-GoApps ${psList(MS_APPS)} ${keepCore}
Block-Reinstall
Write-GoSummary`;

export const BLOAT_THIRD = `${CORE}
Write-Output "Eliminando apps de terceros preinstaladas..."
Remove-GoApps ${psList(THIRD_PARTY)} ${keepCore}
Block-Reinstall
Write-GoSummary`;

// Lista completa: las de Microsoft + terceros + las "agresivas", todas explícitas.
export const BLOAT_ALL = `${CORE}
Write-Output "Eliminando bloatware (lista completa)..."
Remove-GoApps ${psList([...MS_APPS, ...THIRD_PARTY, ...AGGRESSIVE])} ${keepCore}
Block-Reinstall
Write-GoSummary`;

// ─────────────────────────────────────────────────────────────────────────────
// Microsoft Edge. Solo se desinstala si hay OTRO navegador instalado (para no dejar
// la PC sin navegador). Usa el desinstalador oficial de Edge (setup.exe --uninstall),
// que Microsoft bloquea fuera de la UE salvo con el permiso AllowUninstall.
// NO toca WebView2 ni EdgeUpdate: muchas apps (incluida esta) necesitan WebView2 y
// EdgeUpdate lo mantiene actualizado. Se revierte con Reactivar → Reinstalar Edge.
// ─────────────────────────────────────────────────────────────────────────────
const EDGE_STABLE = "{56EB18F8-B008-4CBD-B6D2-8C97FE7E9062}";

export const EDGE_REMOVE = String.raw`$pf86 = [Environment]::GetFolderPath('ProgramFilesX86')
$others = @()
foreach ($root in 'HKLM:\SOFTWARE\Clients\StartMenuInternet', 'HKLM:\SOFTWARE\WOW6432Node\Clients\StartMenuInternet', 'HKCU:\SOFTWARE\Clients\StartMenuInternet') {
  Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object { if ($_.PSChildName -notmatch 'Edge|IEXPLORE') { $others += $_.PSChildName } }
}
if (-not $others) { Write-Output "Edge NO se desinstaló: no hay otro navegador instalado (instalá Chrome, Firefox u otro primero)."; exit 1 }
Write-Output ("Otro navegador detectado: " + (($others | Select-Object -Unique) -join ', '))

$appDirs = @("$pf86\Microsoft\Edge\Application", "$env:ProgramFiles\Microsoft\Edge\Application", "$env:LOCALAPPDATA\Microsoft\Edge\Application")
$installed = @($appDirs | Where-Object { Test-Path (Join-Path $_ 'msedge.exe') })
if (-not $installed) { Write-Output "Microsoft Edge ya no está instalado." }
else {
  Get-Process -Name msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  # Permiso de desinstalación (sin esto, setup.exe se niega fuera de la UE).
  # En las dos vistas del registro (64 y 32 bits): según la versión, lo lee un proceso u otro.
  $devs = @('HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdateDev', 'HKLM:\SOFTWARE\Microsoft\EdgeUpdateDev')
  foreach ($dev in $devs) { if (!(Test-Path $dev)) { New-Item $dev -Force | Out-Null }; Set-ItemProperty $dev AllowUninstall '' -Type String -Force }
  foreach ($d in $installed) {
    $setup = Get-ChildItem $d -Filter setup.exe -Recurse -Depth 3 -ErrorAction SilentlyContinue | Where-Object { $_.DirectoryName -like '*\Installer' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $setup) { continue }
    $argv = @('--uninstall', '--verbose-logging', '--force-uninstall')
    if ($d -notlike "$env:LOCALAPPDATA*") { $argv += '--system-level' }
    Start-Process $setup.FullName -ArgumentList $argv -Wait -WindowStyle Hidden -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
  foreach ($dev in $devs) { Remove-ItemProperty $dev AllowUninstall -ErrorAction SilentlyContinue }
  $left = @($appDirs | Where-Object { Test-Path (Join-Path $_ 'msedge.exe') })
  if ($left) { Write-Output "Windows no permitió desinstalar Microsoft Edge en esta PC (sigue en: $($left -join ', '))."; exit 1 }
  Write-Output "Microsoft Edge desinstalado."
}

# Registro de la app de Edge en Windows (el "stub" que abre los links de Windows).
$sids = @('S-1-5-18', ([Security.Principal.WindowsIdentity]::GetCurrent()).User.Value)
$eol = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Appx\AppxAllUserStore\EndOfLife'
foreach ($p in @(Get-AppxPackage -AllUsers -Name 'Microsoft.MicrosoftEdge*' -ErrorAction SilentlyContinue)) {
  foreach ($s in $sids) { New-Item "$eol\$s\$($p.PackageFullName)" -Force -ErrorAction SilentlyContinue | Out-Null }
  try { Remove-AppxPackage -Package $p.PackageFullName -AllUsers -ErrorAction Stop } catch {}
  foreach ($s in $sids) { Remove-Item "$eol\$s\$($p.PackageFullName)" -Force -ErrorAction SilentlyContinue }
}

# Que Windows Update / EdgeUpdate no lo reinstale (WebView2 sigue actualizándose).
$pol = 'HKLM:\SOFTWARE\Policies\Microsoft\EdgeUpdate'
if (!(Test-Path $pol)) { New-Item $pol -Force | Out-Null }
Set-ItemProperty $pol 'Install${EDGE_STABLE}' 0 -Type DWord -Force
# EdgeUpdate es de 32 bits (lee WOW6432Node); se escribe en ambas vistas.
foreach ($eu in 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate') {
  if (!(Test-Path $eu)) { New-Item $eu -Force | Out-Null }
  Set-ItemProperty $eu DoNotUpdateToEdgeWithChromium 1 -Type DWord -Force
}

# Accesos directos que quedan colgados.
$lnks = @("$env:PUBLIC\Desktop\Microsoft Edge.lnk", "$env:USERPROFILE\Desktop\Microsoft Edge.lnk",
  "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Microsoft Edge.lnk", "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Microsoft Edge.lnk",
  "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\Microsoft Edge.lnk", "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Microsoft Edge.lnk")
foreach ($l in $lnks) { Remove-Item $l -Force -ErrorAction SilentlyContinue }
Write-Output "WebView2 se mantiene (lo usan otras apps). Para volver a tener Edge: Reactivar → Microsoft Edge."`;

// Reactivar: vuelve a instalar Edge (quita el bloqueo y lo instala con winget).
export const EDGE_REINSTALL = String.raw`$pf86 = [Environment]::GetFolderPath('ProgramFilesX86')
Remove-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\EdgeUpdate' 'Install${EDGE_STABLE}' -ErrorAction SilentlyContinue
foreach ($eu in 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate') { Remove-ItemProperty $eu DoNotUpdateToEdgeWithChromium -ErrorAction SilentlyContinue }
if (Test-Path "$pf86\Microsoft\Edge\Application\msedge.exe") { Write-Output "Microsoft Edge ya está instalado."; exit 0 }
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Write-Output "Falta winget: instalá Edge desde https://www.microsoft.com/edge"; exit 1 }
winget install --id Microsoft.Edge --exact --source winget --silent --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Null
if (Test-Path "$pf86\Microsoft\Edge\Application\msedge.exe") { Write-Output "Microsoft Edge reinstalado." } else { Write-Output "No se pudo reinstalar Edge: descargalo de https://www.microsoft.com/edge"; exit 1 }`;
