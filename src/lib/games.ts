// Biblioteca de juegos: detecta lo instalado en Steam, Epic, Riot y Microsoft Store
// (más los que el usuario agrega a mano) y cómo lanzarlo. Sólo lee archivos de los
// launchers; nada se modifica.
import { invoke } from "@tauri-apps/api/core";
import { runPowershell } from "./api";

export type GameSource = "Steam" | "Epic" | "Riot" | "Store" | "Manual";
export interface Game {
  id: string;                 // único: "steam:730", "epic:Fortnite", "manual:<ruta>"…
  name: string;
  source: GameSource;
  appId?: string;             // Steam
  dir?: string;               // carpeta de instalación
  exePath?: string;           // ejecutable REAL del juego (el proceso que corre), si se sabe
  launch: string;             // steam://…, com.epicgames.launcher://…, shell:AppsFolder\…, o un .exe
  args?: string;
  icon?: string;              // PNG en base64 (juegos que no son de Steam)
}

// Herramientas de Steam que no son juegos (runtimes, SteamVR) y programas comunes que se
// venden por Steam (OBS, Blender, VTube Studio, Wallpaper Engine, Lossless Scaling, Soundpad).
// Cualquier otro se puede ocultar desde la Biblioteca.
const STEAM_SKIP = ["228980", "1070560", "1391110", "1628350", "1493710", "2180100", "250820",
  "1905180", "365670", "1325860", "431960", "993090", "629520"];

// Juegos conocidos cuyo proceso real no es el que lanza el launcher (o está más adentro).
const KNOWN_EXE: Record<string, string> = {
  "steam:730": String.raw`game\bin\win64\cs2.exe`,
  "steam:10": "hl.exe",
  "steam:70": "hl.exe",
  "steam:252950":String.raw`Binaries\Win64\RocketLeague.exe`,
  "steam:578080": String.raw`TslGame\Binaries\Win64\TslGame.exe`,
  "steam:1172470": String.raw`r5apex.exe`,
  "steam:570": String.raw`game\bin\win64\dota2.exe`,
  "epic:Fortnite": String.raw`FortniteGame\Binaries\Win64\FortniteClient-Win64-Shipping.exe`,
  "riot:valorant": String.raw`ShooterGame\Binaries\Win64\VALORANT-Win64-Shipping.exe`,
  "riot:league_of_legends": String.raw`Game\League of Legends.exe`,
};

const psMap = (m: Record<string, string>) => "@{" + Object.entries(m).map(([k, v]) => `'${k}'='${v.replace(/'/g, "''")}'`).join(";") + "}";

export const SCAN = String.raw`$out=New-Object System.Collections.ArrayList
$known=${psMap(KNOWN_EXE)}
$skipApps=@(${STEAM_SKIP.map((x) => `'${x}'`).join(",")})
$skipExe='hlds|dedicated|server|unins|vcredist|vc_redist|redist|crashpad|crash|setup|dxsetup|directx|notification|webhelper|easyanticheat|battleye|eac_|launcher|cleanup|helper|update|report'
function Add($id,$name,$src,$dir,$exe,$launch,$argv,$appId){
  if($exe -and -not (Test-Path -LiteralPath $exe -PathType Leaf)){ $exe=$null }
  [void]$out.Add([pscustomobject]@{id=$id;name=$name;source=$src;dir=$dir;exePath=$exe;launch=$launch;args=$argv;appId=$appId})
}
function BestExe($dir,$hint){
  $c=@(Get-ChildItem -LiteralPath $dir -Filter *.exe -Recurse -Depth 2 -EA SilentlyContinue | Where-Object { $_.Name -notmatch $skipExe })
  $key=($hint -replace '[^a-zA-Z0-9]','').ToLower()
  $m=$c | Where-Object { $k=($_.BaseName -replace '[^a-zA-Z0-9]','').ToLower(); $k.Length -gt 2 -and $key -and ($k -like "*$key*" -or $key -like "*$k*") } | Sort-Object Length -Descending | Select-Object -First 1
  if(-not $m){ $m=$c | Sort-Object Length -Descending | Select-Object -First 1 }
  if($m){ $m.FullName }
}
# STEAM: todas las bibliotecas de libraryfolders.vdf
try{
  $steam=(Get-ItemProperty 'HKCU:\Software\Valve\Steam' -EA SilentlyContinue).SteamPath
  if($steam){
    $libs=@($steam -replace '/','\')
    $vdf=Join-Path $steam 'steamapps\libraryfolders.vdf'
    if(Test-Path -LiteralPath $vdf){ foreach($l in (Get-Content -LiteralPath $vdf -Encoding UTF8)){ if($l -match '"path"\s+"(.+?)"'){ $libs+=($Matches[1] -replace '\\\\','\') } } }
    foreach($lib in ($libs | Sort-Object -Unique)){
      foreach($f in @(Get-ChildItem -LiteralPath "$lib\steamapps" -Filter 'appmanifest_*.acf' -EA SilentlyContinue)){
        $c=Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8
        $a=if($c -match '"appid"\s+"(\d+)"'){$Matches[1]}; $nm=if($c -match '"name"\s+"(.+?)"'){$Matches[1]}; $d=if($c -match '"installdir"\s+"(.+?)"'){$Matches[1]}
        if(-not $a -or -not $nm -or -not $d -or $skipApps -contains $a){ continue }
        $full="$lib\steamapps\common\$d"
        if(-not (Test-Path -LiteralPath $full)){ continue }
        $exe=if($known["steam:$a"]){ Join-Path $full $known["steam:$a"] } else { BestExe $full $d }
        Add "steam:$a" $nm 'Steam' $full $exe "steam://rungameid/$a" '' $a
      }
    }
  }
}catch{}
# EPIC: manifiestos .item (y Pending\: ahí queda el de un juego instalado con una actualización a medias)
try{
  $md="$env:ProgramData\Epic\EpicGamesLauncher\Data\Manifests"; $seen=@{}
  foreach($f in @(Get-ChildItem -LiteralPath $md -Filter *.item -EA SilentlyContinue) + @(Get-ChildItem -LiteralPath "$md\Pending" -Filter *.item -EA SilentlyContinue)){
    try{
      $j=Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
      if(-not $j.DisplayName -or -not $j.AppName -or -not $j.InstallLocation){ continue }
      $id="epic:$($j.AppName)"
      if($seen[$id]){ continue }
      $exe=if($known[$id]){ Join-Path $j.InstallLocation $known[$id] } elseif($j.LaunchExecutable){ Join-Path $j.InstallLocation $j.LaunchExecutable }
      # Incompleto: sólo si el juego ya está en el disco (actualizando), no una descarga a medias.
      if($j.bIsIncompleteInstall -and -not ($exe -and (Test-Path -LiteralPath $exe -PathType Leaf))){ continue }
      $seen[$id]=1
      $uri='com.epicgames.launcher://apps/' + [uri]::EscapeDataString("$($j.CatalogNamespace):$($j.CatalogItemId):$($j.AppName)") + '?action=launch&silent=true'
      Add $id $j.DisplayName 'Epic' $j.InstallLocation $exe $uri '' $null
    }catch{}
  }
}catch{}
# RIOT: Riot Client + carpetas de cada producto
try{
  $rcj="$env:ProgramData\Riot Games\RiotClientInstalls.json"
  $rc=if(Test-Path -LiteralPath $rcj){ ((Get-Content -LiteralPath $rcj -Raw | ConvertFrom-Json).rc_default) -replace '/','\' }
  if($rc -and (Test-Path -LiteralPath $rc)){
    foreach($p in @(@{k='valorant';n='VALORANT'},@{k='league_of_legends';n='League of Legends'})){
      $y="$env:ProgramData\Riot Games\Metadata\$($p.k).live\$($p.k).live.product_settings.yaml"
      if(-not (Test-Path -LiteralPath $y)){ continue }
      $dir=$null; foreach($l in (Get-Content -LiteralPath $y)){ if($l -match 'product_install_full_path:\s*"(.+?)"'){ $dir=$Matches[1] -replace '/','\' } }
      if(-not $dir -or -not (Test-Path -LiteralPath $dir)){ continue }
      $exe=Join-Path $dir $known["riot:$($p.k)"]
      Add "riot:$($p.k)" $p.n 'Riot' $dir $exe $rc "--launch-product=$($p.k) --launch-patchline=live" $null
    }
  }
}catch{}
# MICROSOFT STORE: Minecraft
try{
  $mc=Get-AppxPackage -Name 'Microsoft.MinecraftUWP' -EA SilentlyContinue | Select-Object -First 1
  if($mc){ Add 'store:minecraft' 'Minecraft (Bedrock)' 'Store' $mc.InstallLocation (Join-Path $mc.InstallLocation 'Minecraft.Windows.exe') "shell:AppsFolder\$($mc.PackageFamilyName)!Game" '' $null }
  $ml=Get-AppxPackage -Name 'Microsoft.4297127D64EC6' -EA SilentlyContinue | Select-Object -First 1
  if($ml){ Add 'store:minecraft-launcher' 'Minecraft Launcher' 'Store' $ml.InstallLocation $null "shell:AppsFolder\$($ml.PackageFamilyName)!Minecraft" '' $null }
}catch{}
ConvertTo-Json -InputObject @($out) -Compress -Depth 3`;

// Íconos de los ejecutables (para los juegos que no tienen portada de Steam).
const ICONS = (paths: string[]) => String.raw`Add-Type -AssemblyName System.Drawing
$out=[ordered]@{}
foreach($p in @(${paths.map((p) => `'${p.replace(/'/g, "''")}'`).join(",")})){
  try{ $ic=[System.Drawing.Icon]::ExtractAssociatedIcon($p); $bmp=$ic.ToBitmap(); $ms=New-Object IO.MemoryStream; $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png); $out[$p]=[Convert]::ToBase64String($ms.ToArray()); $ms.Dispose(); $bmp.Dispose(); $ic.Dispose() }catch{}
}
$out | ConvertTo-Json -Compress`;

export async function scanGames(): Promise<Game[]> {
  const r = await runPowershell(SCAN);
  let list: Game[];
  try { list = JSON.parse(r.output.trim().split("\n").pop() || "[]"); } catch { list = []; }
  const seen = new Set<string>();
  list = list.filter((g) => g && g.id && !seen.has(g.id) && seen.add(g.id));
  const m = await iconsFor(list.filter((g) => g.source !== "Steam" && g.exePath).map((g) => g.exePath!));
  for (const g of list) if (g.exePath && m[g.exePath]) g.icon = m[g.exePath];
  return list;
}

export async function iconsFor(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  try { return JSON.parse((await runPowershell(ICONS(paths))).output.trim() || "{}"); } catch { return {}; }
}

/** Portada vertical oficial de Steam (CDN público); el resto usa su ícono. */
export const steamCover = (appId: string) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
export const steamHeader = (appId: string) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;

/** Lanza el juego por el escritorio (sin permisos de administrador, como un doble clic). */
export const launchGame = (g: Game) => invoke<void>("launch_game", { target: g.launch, args: g.args || null });

// Elegir un .exe para agregar un juego a mano.
const PICK = String.raw`Add-Type -AssemblyName System.Windows.Forms
$d=New-Object System.Windows.Forms.OpenFileDialog
$d.Filter='Juegos (*.exe)|*.exe'; $d.Title='Elegí el ejecutable del juego'
$f=New-Object System.Windows.Forms.Form; $f.TopMost=$true; $f.ShowInTaskbar=$false
if($d.ShowDialog($f) -eq 'OK'){ $d.FileName }`;
export async function pickExe(): Promise<string | null> {
  const r = await runPowershell(PICK);
  const p = r.output.trim().split("\n").pop()?.trim() || "";
  return /\.exe$/i.test(p) ? p : null;
}

// ---- Ajustes de Windows por juego (sólo registro del usuario; el juego no se toca) ----
// GPU: lo que guarda Configuración > Pantalla > Gráficos. FSO: la casilla "Deshabilitar
// optimizaciones de pantalla completa" de Propiedades > Compatibilidad del .exe.
const GPU_KEY = String.raw`HKCU:\Software\Microsoft\DirectX\UserGpuPreferences`;
const LAYERS_KEY = String.raw`HKCU:\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers`;
const FSO_FLAG = "DISABLEDXMAXIMIZEDWINDOWEDMODE";
export interface GameWin { gpu: boolean; fso: boolean }
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

export async function readGameWin(exe: string): Promise<GameWin> {
  const r = await runPowershell(String.raw`$g=(Get-ItemProperty -LiteralPath ${q(GPU_KEY)} -Name ${q(exe)} -EA SilentlyContinue).${q(exe)}
$l=(Get-ItemProperty -LiteralPath ${q(LAYERS_KEY)} -Name ${q(exe)} -EA SilentlyContinue).${q(exe)}
Write-Output ("GPU=" + [int]("$g" -match 'GpuPreference=2;'))
Write-Output ("FSO=" + [int](@("$l" -split '\s+') -contains '${FSO_FLAG}'))`);
  return { gpu: /GPU=1/.test(r.output), fso: /FSO=1/.test(r.output) };
}

export async function setGameWin(exe: string, what: keyof GameWin, on: boolean): Promise<boolean> {
  // El valor es una lista "clave=valor;" (ej. también SwapEffectUpgradeEnable): sólo se toca GpuPreference.
  // Al apagar sólo se quita si es la nuestra (alto rendimiento): una preferencia propia del usuario queda.
  const script = what === "gpu"
    ? String.raw`$k=${q(GPU_KEY)}; $n=${q(exe)}
$kv=[ordered]@{}
foreach($x in ("$((Get-ItemProperty -LiteralPath $k -Name $n -EA SilentlyContinue).$n)" -split ';')){ if($x -match '^\s*([^=]+)=(.*)$'){ $kv[$Matches[1].Trim()]=$Matches[2].Trim() } }
if(${on ? "$true" : "$false"}){ $kv['GpuPreference']='2' } elseif($kv['GpuPreference'] -eq '2'){ $kv.Remove('GpuPreference') }
if($kv.Count){ if(!(Test-Path -LiteralPath $k)){ New-Item -Path $k -Force | Out-Null }; Set-ItemProperty -LiteralPath $k -Name $n -Value ((@($kv.Keys | ForEach-Object { "$_=$($kv[$_])" }) -join ';') + ';') -Type String -Force -EA Stop }
else{ Remove-ItemProperty -LiteralPath $k -Name $n -Force -EA SilentlyContinue }
Write-Output OK`
    // Se agrega o quita sólo nuestra marca: otras (ej. "ejecutar como administrador") se conservan.
    : String.raw`$k=${q(LAYERS_KEY)}; $n=${q(exe)}
$t=@("$((Get-ItemProperty -LiteralPath $k -Name $n -EA SilentlyContinue).$n)" -split '\s+' | Where-Object { $_ -and $_ -ne '~' -and $_ -ne '${FSO_FLAG}' })
if(${on ? "$true" : "$false"}){ $t+='${FSO_FLAG}' }
if($t.Count){ if(!(Test-Path -LiteralPath $k)){ New-Item -Path $k -Force | Out-Null }; Set-ItemProperty -LiteralPath $k -Name $n -Value ('~ ' + ($t -join ' ')) -Type String -Force -EA Stop }
else{ Remove-ItemProperty -LiteralPath $k -Name $n -Force -EA SilentlyContinue }
Write-Output OK`;
  const r = await runPowershell(script);
  return r.ok && /OK/.test(r.output);
}

export function manualGame(path: string): Game {
  const file = path.split("\\").pop() || path;
  return { id: `manual:${path.toLowerCase()}`, name: file.replace(/\.exe$/i, ""), source: "Manual", dir: path.slice(0, path.length - file.length - 1), exePath: path, launch: path };
}
