import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { runPowershell } from "./api";

export interface UApp {
  name: string; pub: string; type: "win32" | "uwp";
  size: number; date: string; location: string; key: string; uninstall: string;
  scope: "machine" | "user";
  icon: string;
}

const b64utf8 = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s || "")));

const LIST = String.raw`$apps=@()
$roots=@(
 @{p='HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall'; s='machine'},
 @{p='HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; s='machine'},
 @{p='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'; s='user'}
)
foreach($root in $roots){
 if(Test-Path $root.p){
  Get-ChildItem $root.p -EA SilentlyContinue | ForEach-Object {
   $p=Get-ItemProperty $_.PSPath -EA SilentlyContinue
   if($p.DisplayName -and -not $p.SystemComponent){
    $size=if($p.EstimatedSize){[math]::Round($p.EstimatedSize/1024,1)}else{0}
    $apps+=[pscustomobject]@{name="$($p.DisplayName)";pub="$($p.Publisher)";type='win32';size=$size;date="$($p.InstallDate)";location="$($p.InstallLocation)";key="$($_.Name)";uninstall="$($p.UninstallString)";scope=$root.s;icon="$($p.DisplayIcon)"}
   }
  }
 }
}
Get-AppxPackage -EA SilentlyContinue | Where-Object { -not $_.IsFramework } | ForEach-Object {
 $apps+=[pscustomobject]@{name="$($_.Name)";pub="$($_.Publisher)";type='uwp';size=0;date='';location="$($_.InstallLocation)";key="$($_.PackageFullName)";uninstall="$($_.PackageFullName)";scope='machine';icon=''}
}
$apps=$apps | Sort-Object name -Unique
if($apps.Count -eq 0){'[]'}else{$apps|ConvertTo-Json -Compress -Depth 3}`;

// Extrae iconos como PNG base64, localmente (sin red). win32: del DisplayIcon
// (exe/.ico); uwp: del logo del AppxManifest. Se llama en tandas chicas porque el
// backend usa -EncodedCommand y un solo comando con todo supera el límite de
// Windows (~32K).
const iconsScript = (items: { key: string; type: string; icon: string; location: string }[]) =>
  String.raw`Add-Type -AssemblyName System.Drawing
$json=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64utf8(JSON.stringify(items))}'))
$items=$json | ConvertFrom-Json
$out=[ordered]@{}
foreach($it in $items){
  $b64=''
  try{
    if($it.type -eq 'win32' -and $it.icon){
      $raw=([string]$it.icon).Trim('"').Trim()
      $ci=$raw.LastIndexOf(',')
      if($ci -gt 2){ $tail=$raw.Substring($ci+1); $num=($tail.Length -gt 0); foreach($c in $tail.ToCharArray()){ if($c -lt '0' -or $c -gt '9'){ $num=$false } }; if($num){ $raw=$raw.Substring(0,$ci) } }
      if($raw -and (Test-Path -LiteralPath $raw)){
        if($raw.ToLower().EndsWith('.ico')){ $ic=New-Object System.Drawing.Icon($raw) }
        else { $ic=[System.Drawing.Icon]::ExtractAssociatedIcon($raw) }
        if($ic){ $bmp=$ic.ToBitmap(); $ms=New-Object System.IO.MemoryStream; $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png); $b64=[Convert]::ToBase64String($ms.ToArray()); $ms.Dispose(); $bmp.Dispose(); $ic.Dispose() }
      }
    } elseif($it.type -eq 'uwp' -and $it.location){
      $man=Join-Path $it.location 'AppxManifest.xml'
      if(Test-Path -LiteralPath $man){
        [xml]$x=Get-Content -LiteralPath $man
        $logo=$null
        try{ $logo=$x.Package.Applications.Application.VisualElements.Square44x44Logo }catch{}
        if(-not $logo){ try{ $logo=$x.Package.Properties.Logo }catch{} }
        if($logo){
          $rel=Join-Path $it.location $logo
          $dir=Split-Path $rel
          $leaf=[IO.Path]::GetFileNameWithoutExtension($rel)
          $ext=[IO.Path]::GetExtension($rel)
          $cand=$null
          if(Test-Path -LiteralPath $dir){ $cand=Get-ChildItem -LiteralPath $dir -Filter ($leaf+'*'+$ext) -EA SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 1 }
          if(-not $cand -and (Test-Path -LiteralPath $rel)){ $cand=Get-Item -LiteralPath $rel }
          if($cand){ $b64=[Convert]::ToBase64String([IO.File]::ReadAllBytes($cand.FullName)) }
        }
      }
    }
  }catch{}
  if($b64){ $out[$it.key]=$b64 }
}
if($out.Count -eq 0){'{}'}else{$out|ConvertTo-Json -Compress -Depth 3}`;

interface Ctx {
  apps: UApp[];
  icons: Record<string, string>;
  loading: boolean;
  reload: () => void;
  removeApp: (a: UApp) => void;
}
const UninstallCtx = createContext<Ctx>(null!);
export const useUninstall = () => useContext(UninstallCtx);

export function UninstallProvider({ children }: { children: ReactNode }) {
  const [apps, setApps] = useState<UApp[]>([]);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const tok = useRef(0);

  const loadIcons = async (list: UApp[], myTok: number) => {
    const CH = 20;
    for (let i = 0; i < list.length; i += CH) {
      if (myTok !== tok.current) return;
      const chunk = list.slice(i, i + CH);
      try {
        const payload = chunk.map((a) => ({ key: a.key, type: a.type, icon: a.icon, location: a.location }));
        const ir = await runPowershell(iconsScript(payload));
        const map = JSON.parse(ir.output.trim() || "{}") as Record<string, string>;
        if (myTok !== tok.current) return;
        setIcons((prev) => {
          const next = { ...prev };
          for (const k in map) next[k] = `data:image/png;base64,${map[k]}`;
          return next;
        });
      } catch {}
    }
  };

  const reload = async () => {
    const myTok = ++tok.current;
    setLoading(true);
    setIcons({});
    const r = await runPowershell(LIST);
    if (myTok !== tok.current) return;
    let list: UApp[] = [];
    try {
      const data = JSON.parse(r.output.trim() || "[]");
      list = Array.isArray(data) ? data : [data];
    } catch {}
    setApps(list);
    setLoading(false);
    if (list.length) loadIcons(list, myTok);
  };

  const removeApp = (a: UApp) =>
    setApps((l) => l.filter((x) => !(x.name === a.name && x.type === a.type)));

  // Precarga al arrancar la app (en segundo plano, con un pequeño retraso para no
  // competir con el render inicial / splash). Cuando el usuario abra Desinstalar,
  // la lista y los iconos ya están listos.
  useEffect(() => {
    const id = setTimeout(() => { reload(); }, 1200);
    return () => clearTimeout(id);
  }, []);

  return (
    <UninstallCtx.Provider value={{ apps, icons, loading, reload, removeApp }}>
      {children}
    </UninstallCtx.Provider>
  );
}
