// Instala App Installer (winget) cuando NO está en la PC (Windows 10 viejos, LTSC,
// imágenes "debloateadas"). Todo sale del release OFICIAL de Microsoft en GitHub
// (microsoft/winget-cli): el paquete y sus dependencias se descargan y se comparan
// con el SHA256 que publica Microsoft antes de instalar nada.
// Salida para la UI (una línea por evento):
//   @step:<find|deps|bundle|install>   @dl:<deps|bundle>:<porcentaje>
//   @ok   @err:<oldwin|net|hash|install>   @detail:<mensaje>
export const WINGET_SETUP = String.raw`$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
if ([Environment]::OSVersion.Version.Build -lt 17763) { Write-Output '@err:oldwin'; exit 2 }

Write-Output '@step:find'
try {
  $rel = Invoke-RestMethod 'https://api.github.com/repos/microsoft/winget-cli/releases/latest' -Headers @{ 'User-Agent' = 'GamingOptimizer' } -UseBasicParsing -ErrorAction Stop
} catch { Write-Output '@err:net'; Write-Output ('@detail:' + ($_.Exception.Message -replace '\s+', ' ')); exit 3 }
$url = @{}
foreach ($x in $rel.assets) { $url[$x.name] = $x.browser_download_url }
$bundleN = 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe.msixbundle'
$depsN = 'DesktopAppInstaller_Dependencies.zip'
foreach ($n in @($bundleN, $depsN, 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe.txt', 'DesktopAppInstaller_Dependencies.txt')) {
  if (-not $url[$n]) { Write-Output '@err:net'; exit 3 }
}
$dir = Join-Path $env:TEMP 'GamingOptimizer-winget'
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
New-Item $dir -ItemType Directory -Force | Out-Null

# Descarga por partes para poder informar el avance (cada 10%).
function Save-File($u, $out, $tag) {
  $req = [Net.HttpWebRequest]::Create($u)
  $req.UserAgent = 'GamingOptimizer'
  $resp = $req.GetResponse()
  $total = $resp.ContentLength
  $in = $resp.GetResponseStream()
  $fs = [IO.File]::Create($out)
  try {
    $buf = New-Object byte[] 1048576
    $done = 0; $next = 10
    while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
      $fs.Write($buf, 0, $n); $done += $n
      if ($tag -and $total -gt 0) {
        $p = [int][Math]::Floor(100 * $done / $total)
        if ($p -ge $next) { Write-Output ('@dl:' + $tag + ':' + $p); $next = $p - ($p % 10) + 10 }
      }
    }
  } finally { $fs.Close(); $in.Close(); $resp.Close() }
}
# SHA256 oficial publicado por Microsoft junto al archivo.
function Get-OfficialHash($txtName) {
  $t = Join-Path $dir $txtName
  Save-File $url[$txtName] $t ''
  ((Get-Content $t -Raw).Trim() -split '\s+')[0]
}

try {
  Write-Output '@step:deps'
  $deps = Join-Path $dir $depsN
  Save-File $url[$depsN] $deps 'deps'
  if ((Get-FileHash $deps -Algorithm SHA256).Hash -ne (Get-OfficialHash 'DesktopAppInstaller_Dependencies.txt')) { Write-Output '@err:hash'; exit 4 }
  Write-Output '@step:bundle'
  $bundle = Join-Path $dir $bundleN
  Save-File $url[$bundleN] $bundle 'bundle'
  if ((Get-FileHash $bundle -Algorithm SHA256).Hash -ne (Get-OfficialHash 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe.txt')) { Write-Output '@err:hash'; exit 4 }
} catch { Write-Output '@err:net'; Write-Output ('@detail:' + ($_.Exception.Message -replace '\s+', ' ')); exit 3 }

Write-Output '@step:install'
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } elseif ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
Expand-Archive -Path $deps -DestinationPath (Join-Path $dir 'deps') -Force
# Si ya hay una versión igual o más nueva de una dependencia, Windows la rechaza: se ignora.
Get-ChildItem (Join-Path $dir ('deps\' + $arch)) -Filter *.appx | ForEach-Object {
  try { Add-AppxPackage -Path $_.FullName -ErrorAction Stop } catch {}
}
try { Add-AppxPackage -Path $bundle -ForceApplicationShutdown -ErrorAction Stop } catch { Write-Output ('@detail:' + $_.Exception.Message) }
try { Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe -ErrorAction Stop } catch {}
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps')
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
if (Get-Command winget -ErrorAction SilentlyContinue) { Write-Output '@ok' } else { Write-Output '@err:install'; exit 5 }`;
