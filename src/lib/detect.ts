import { runPowershell } from "./api";

export interface DetectedGame { name: string; exe: string; source: string; }

// Escanea Steam (libraryfolders.vdf + appmanifest), Epic (manifests .item con el
// ejecutable exacto) y Riot (Valorant/LoL), y devuelve [{name, exe, source}].
const DETECT_SCRIPT = String.raw`$out=New-Object System.Collections.ArrayList
$skip='unins|vcredist|vc_redist|redist|crashpad|crashhandler|crashreport|setup|dxsetup|directx|notification|epicwebhelper|easyanticheat|battleye|launcher_|cleanup|helper'
# STEAM
try{
  $steam=(Get-ItemProperty 'HKCU:\Software\Valve\Steam' -EA SilentlyContinue).SteamPath
  if($steam){
    $libs=New-Object System.Collections.ArrayList; [void]$libs.Add($steam)
    $vdf=Join-Path $steam 'steamapps\libraryfolders.vdf'
    if(Test-Path $vdf){ Get-Content $vdf | Select-String '"path"' | ForEach-Object { if($_ -match '"path"\s+"(.+?)"'){ [void]$libs.Add(($matches[1] -replace '\\\\','\')) } } }
    foreach($lib in ($libs|Select-Object -Unique)){
      try{
        if(-not $lib){ continue }
        $sa="$lib\steamapps"
        if(Test-Path $sa -EA SilentlyContinue){
          Get-ChildItem $sa -Filter 'appmanifest_*.acf' -EA SilentlyContinue | ForEach-Object {
            $c=Get-Content $_.FullName -Raw -Encoding UTF8
            $nm=if($c -match '"name"\s+"(.+?)"'){$matches[1]}else{$null}
            $dir=if($c -match '"installdir"\s+"(.+?)"'){$matches[1]}else{$null}
            if($nm -and $dir){
              $full="$sa\common\$dir"
              if(Test-Path $full -EA SilentlyContinue){
                $exe=Get-ChildItem $full -Filter *.exe -Recurse -Depth 2 -EA SilentlyContinue | Where-Object { $_.Name -notmatch $skip } | Sort-Object Length -Descending | Select-Object -First 1
                if($exe){ [void]$out.Add([pscustomobject]@{name=$nm; exe=$exe.Name.ToLower(); source='Steam'}) }
              }
            }
          }
        }
      }catch{}
    }
  }
}catch{}
# EPIC
try{
  $man='C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests'
  if(Test-Path $man){
    Get-ChildItem $man -Filter *.item -EA SilentlyContinue | ForEach-Object {
      try{ $j=Get-Content $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        if($j.LaunchExecutable -and $j.DisplayName){
          $exe=Split-Path $j.LaunchExecutable -Leaf
          if($exe -match '\.exe$' -and $exe -notmatch $skip){ [void]$out.Add([pscustomobject]@{name=$j.DisplayName; exe=$exe.ToLower(); source='Epic'}) }
        }
      }catch{}
    }
  }
}catch{}
# RIOT
try{
  if(Test-Path 'C:\Riot Games\VALORANT'){ [void]$out.Add([pscustomobject]@{name='VALORANT'; exe='valorant-win64-shipping.exe'; source='Riot'}) }
  if(Test-Path 'C:\Riot Games\League of Legends'){ [void]$out.Add([pscustomobject]@{name='League of Legends'; exe='league of legends.exe'; source='Riot'}) }
}catch{}
$arr=@($out | Sort-Object exe -Unique)
if($arr.Count -eq 0){ Write-Output '[]' } else { $j=$arr | ConvertTo-Json -Compress; if($j[0] -ne '['){ $j="[$j]" }; Write-Output $j }`;

export async function detectGames(): Promise<DetectedGame[]> {
  const r = await runPowershell(DETECT_SCRIPT);
  try {
    const arr = JSON.parse(r.output.trim() || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
