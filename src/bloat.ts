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

// ── Catálogo de bloatware ────────────────────────────────────────────────────
// Cada app con su nombre legible (para el menú "Elegir apps" de Optimizaciones), su
// grupo y si es RECOMENDADO quitarla. Recomendado = casi nadie la usa. NO se
// recomiendan las que mucha gente sí usa (Outlook, Correo, Teams, Reloj, Vincular al
// teléfono, To Do, Family) ni las de streaming/redes que el usuario pudo instalar a
// propósito (Spotify, Netflix, Disney+, Prime Video, TikTok, Instagram, Facebook…).
// Los patrones son los mismos de siempre (comparación -like de PowerShell). Se sacaron
// OneNote, Sway y Edge DevTools: KEEP_CORE ("Microsoft.Office.*", "Microsoft.MicrosoftEdge*")
// los protegía igual, así que nunca se quitaban.
export type BloatGroup = "ms" | "third" | "extra";
export interface BloatApp {
  id: string;
  patterns: string[];
  name: string; nameEn?: string; namePt?: string;
  group: BloatGroup;
  rec: boolean;
}
const app = (group: BloatGroup, rec: boolean, patterns: string | string[], name: string, nameEn?: string, namePt?: string): BloatApp => {
  const pats = Array.isArray(patterns) ? patterns : [patterns];
  return { id: pats[0], patterns: pats, name, nameEn, namePt, group, rec };
};

export const BLOAT_APPS: BloatApp[] = [
  // Apps de Microsoft que casi nadie usa
  app("ms", true, "Microsoft.BingNews", "Noticias (Bing)", "News (Bing)", "Notícias (Bing)"),
  app("ms", true, "Microsoft.BingWeather", "El Tiempo (Clima)", "Weather", "Clima"),
  app("ms", true, "Microsoft.BingFinance", "Finanzas (Bing)", "Money (Bing)", "Finanças (Bing)"),
  app("ms", true, "Microsoft.BingSports", "Deportes (Bing)", "Sports (Bing)", "Esportes (Bing)"),
  app("ms", true, "Microsoft.BingTravel", "Viajes (Bing)", "Travel (Bing)", "Viagens (Bing)"),
  app("ms", true, "Microsoft.BingFoodAndDrink", "Cocina (Bing)", "Food & Drink (Bing)", "Culinária (Bing)"),
  app("ms", true, "Microsoft.BingHealthAndFitness", "Salud (Bing)", "Health & Fitness (Bing)", "Saúde (Bing)"),
  app("ms", true, "Microsoft.BingTranslator", "Traductor de Bing", "Bing Translator", "Tradutor do Bing"),
  app("ms", true, "Microsoft.BingSearch", "Búsqueda de Bing", "Bing Search", "Pesquisa do Bing"),
  app("ms", true, "Microsoft.GetHelp", "Obtener ayuda", "Get Help", "Obter Ajuda"),
  app("ms", true, "Microsoft.Getstarted", "Consejos", "Tips", "Dicas"),
  app("ms", true, "Microsoft.Messaging", "Mensajes", "Messaging", "Mensagens"),
  app("ms", true, "Microsoft.Microsoft3DViewer", "Visor 3D", "3D Viewer", "Visualizador 3D"),
  app("ms", true, "Microsoft.3DBuilder", "3D Builder"),
  app("ms", true, "Microsoft.MicrosoftSolitaireCollection", "Microsoft Solitaire Collection"),
  app("ms", true, "Microsoft.MicrosoftOfficeHub", "Microsoft 365 (Office)"),
  app("ms", true, "Microsoft.NetworkSpeedTest", "Network Speed Test"),
  app("ms", true, "Microsoft.News", "Microsoft Start (Noticias)", "Microsoft Start (News)", "Microsoft Start (Notícias)"),
  app("ms", true, "Microsoft.OneConnect", "Planes móviles", "Mobile Plans", "Planos Móveis"),
  app("ms", true, "Microsoft.People", "Contactos", "People", "Pessoas"),
  app("ms", true, "Microsoft.Print3D", "Print 3D"),
  app("ms", true, "Microsoft.SkypeApp", "Skype"),
  app("ms", true, "Microsoft.Wallet", "Microsoft Wallet"),
  app("ms", false, "Microsoft.WindowsAlarms", "Reloj y alarmas", "Clock & Alarms", "Relógio e Alarmes"),
  app("ms", true, "Microsoft.WindowsFeedbackHub", "Centro de opiniones", "Feedback Hub", "Hub de Comentários"),
  app("ms", true, "Microsoft.WindowsMaps", "Mapas", "Maps", "Mapas"),
  app("ms", true, "Microsoft.ZuneVideo", "Películas y TV", "Movies & TV", "Filmes e TV"),
  app("ms", false, "Microsoft.YourPhone", "Vincular al teléfono", "Phone Link", "Vincular ao Celular"),
  app("ms", true, "Microsoft.MixedReality.Portal", "Portal de realidad mixta", "Mixed Reality Portal", "Portal de Realidade Misturada"),
  app("ms", false, "Microsoft.Todos", "Microsoft To Do"),
  app("ms", true, "Microsoft.PowerAutomateDesktop", "Power Automate"),
  app("ms", true, "Microsoft.MicrosoftPowerBIForWindows", "Power BI"),
  app("ms", true, "Microsoft.WindowsReadingList", "Lista de lectura", "Reading List", "Lista de Leitura"),
  app("ms", true, "Microsoft.549981C3F5F10", "Cortana"),
  app("ms", true, "Microsoft.Copilot", "Copilot"),
  app("ms", true, "Microsoft.MicrosoftJournal", "Microsoft Journal"),
  app("ms", false, "Microsoft.OutlookForWindows", "Outlook (nuevo)", "Outlook (new)", "Outlook (novo)"),
  app("ms", false, "microsoft.windowscommunicationsapps", "Correo y Calendario", "Mail and Calendar", "Email e Calendário"),
  app("ms", true, "Microsoft.Windows.DevHome", "Dev Home"),
  app("ms", false, "MicrosoftCorporationII.MicrosoftFamily", "Microsoft Family (control parental)", "Microsoft Family Safety", "Microsoft Family (controle dos pais)"),
  app("ms", false, ["MicrosoftTeams", "MSTeams"], "Microsoft Teams"),
  app("ms", true, "Clipchamp.Clipchamp", "Clipchamp"),
  // Apps de terceros que Windows instala solas como "sugerencia"
  app("third", true, ["*CandyCrush*", "*king.com*"], "Juegos de King (Candy Crush…)", "King games (Candy Crush…)", "Jogos da King (Candy Crush…)"),
  app("third", true, "*BubbleWitch*", "Bubble Witch Saga"),
  app("third", true, "*RoyalRevolt*", "Royal Revolt"),
  app("third", true, "*MarchofEmpires*", "March of Empires"),
  app("third", true, "*HiddenCity*", "Hidden City"),
  app("third", true, "*FarmVille*", "FarmVille"),
  app("third", true, "*Asphalt8*", "Asphalt 8"),
  app("third", false, "*Duolingo*", "Duolingo"),
  app("third", true, "*EclipseManager*", "Eclipse Manager"),
  app("third", true, "*AdobePhotoshopExpress*", "Adobe Photoshop Express"),
  app("third", true, "*Wunderlist*", "Wunderlist"),
  app("third", true, "*Flipboard*", "Flipboard"),
  app("third", false, "*Twitter*", "X (Twitter)"),
  app("third", false, "*Facebook*", "Facebook"),
  app("third", false, "*Instagram*", "Instagram"),
  app("third", false, "*Spotify*", "Spotify"),
  app("third", false, "*Netflix*", "Netflix"),
  app("third", true, "*PandoraMediaInc*", "Pandora"),
  app("third", false, "*TikTok*", "TikTok"),
  app("third", false, "*Disney*", "Disney+"),
  app("third", true, "*Booking*", "Booking.com"),
  app("third", true, "*WildTangent*", "WildTangent Games"),
  app("third", true, "*McAfee*", "McAfee (prueba)", "McAfee (trial)", "McAfee (avaliação)"),
  app("third", true, "*Norton*", "Norton (prueba)", "Norton (trial)", "Norton (avaliação)"),
  app("third", false, "*LinkedInforWindows*", "LinkedIn"),
  app("third", true, "*Amazon.com.Amazon*", "Amazon (tienda)", "Amazon (store)", "Amazon (loja)"),
  app("third", false, "*PrimeVideo*", "Prime Video"),
  // Otras apps de Windows: algunos sí las usan (nunca se recomiendan)
  app("extra", false, "MicrosoftWindows.Client.WebExperience", "Widgets"),
  app("extra", false, "Microsoft.ZuneMusic", "Reproductor multimedia", "Media Player", "Reprodutor Multimídia"),
  app("extra", false, "Microsoft.MicrosoftStickyNotes", "Notas rápidas", "Sticky Notes", "Notas Autoadesivas"),
  app("extra", false, "Microsoft.WindowsSoundRecorder", "Grabadora de sonido", "Sound Recorder", "Gravador de Som"),
  app("extra", false, "MicrosoftCorporationII.QuickAssist", "Asistencia rápida", "Quick Assist", "Assistência Rápida"),
  app("extra", false, "Microsoft.Paint3D", "Paint 3D"),
  app("extra", false, "Microsoft.Whiteboard", "Microsoft Whiteboard"),
  app("extra", false, "Microsoft.RemoteDesktop", "Escritorio remoto (app)", "Remote Desktop (app)", "Área de Trabalho Remota (app)"),
  app("extra", false, "Microsoft.WindowsScan", "Escáner de Windows", "Windows Scan", "Scanner do Windows"),
  app("extra", false, "Microsoft.CommsPhone", "Teléfono", "Phone", "Telefone"),
  app("extra", false, "Microsoft.ConnectivityStore", "Microsoft Wi-Fi"),
];

export const BLOAT_RECOMMENDED = BLOAT_APPS.filter((a) => a.rec).map((a) => a.id);

const patternsOf = (g: BloatGroup) => BLOAT_APPS.filter((a) => a.group === g).flatMap((a) => a.patterns);
// Presets de Optimizaciones ("Eliminar apps Microsoft innecesarias" / "…de terceros").
const MS_APPS = patternsOf("ms");
const THIRD_PARTY = patternsOf("third");

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

// Las apps que el usuario eligió en el menú "Elegir apps" (ids de BLOAT_APPS).
export const bloatCustom = (ids: string[]) => {
  const pats = BLOAT_APPS.filter((a) => ids.includes(a.id)).flatMap((a) => a.patterns);
  return `${CORE}
Write-Output "Eliminando bloatware (apps elegidas)..."
Remove-GoApps ${psList(pats)} ${keepCore}
Block-Reinstall
Write-GoSummary`;
};

// Nombres de los paquetes que se PUEDEN quitar en esta PC (instalados para algún usuario o
// provisionados), con el mismo filtro que Remove-GoApps: sin frameworks, sistema ni KEEP_CORE.
export const BLOAT_DETECT = String.raw`function Test-Like($name, $patterns) { foreach ($p in $patterns) { if ($name -like $p) { return $true } }; return $false }
$keep = ${keepCore}
$n = @{}
foreach ($p in @(Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue)) {
  if (-not $p.IsFramework -and "$($p.SignatureKind)" -ne 'System' -and -not $p.NonRemovable -and -not (Test-Like $p.Name $keep)) { $n[$p.Name] = 1 }
}
foreach ($p in @(Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue)) { if (-not (Test-Like $p.DisplayName $keep)) { $n[$p.DisplayName] = 1 } }
if ($n.Count -eq 0) { '[]' } else { @($n.Keys) | ConvertTo-Json -Compress }`;

// -like de PowerShell (sin distinguir mayúsculas; los patrones sólo usan *).
const likeRx = (p: string) =>
  new RegExp("^" + p.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i");
/** Ids de BLOAT_APPS que están en la PC, según los nombres de paquete de BLOAT_DETECT. */
export function bloatInstalled(names: string[]): Set<string> {
  const out = new Set<string>();
  for (const a of BLOAT_APPS) {
    const rx = a.patterns.map(likeRx);
    if (names.some((n) => rx.some((r) => r.test(n)))) out.add(a.id);
  }
  return out;
}

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
  Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object { if ($_.PSChildName -notmatch 'Edge|IEXPLORE') { $n = $_.GetValue(''); $others += $(if ($n) { $n } else { $_.PSChildName }) } }
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
