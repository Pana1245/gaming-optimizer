import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { runPowershell } from "../lib/api";
import { useScrollMemory } from "../lib/useScrollMemory";
import { HudTitle } from "../components/NeonCard";
import Modal from "../components/Modal";
import { Spinner, IndeterminateBar } from "../components/Feedback";

interface App {
  name: string; pub: string; type: "win32" | "uwp";
  size: number; date: string; location: string; key: string; uninstall: string;
  scope: "machine" | "user";  // HKLM (confiable) vs HKCU (escribible por el usuario)
}

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
    $apps+=[pscustomobject]@{name="$($p.DisplayName)";pub="$($p.Publisher)";type='win32';size=$size;date="$($p.InstallDate)";location="$($p.InstallLocation)";key="$($_.Name)";uninstall="$($p.UninstallString)";scope=$root.s}
   }
  }
 }
}
Get-AppxPackage -EA SilentlyContinue | Where-Object { -not $_.IsFramework } | ForEach-Object {
 $apps+=[pscustomobject]@{name="$($_.Name)";pub="$($_.Publisher)";type='uwp';size=0;date='';location="$($_.InstallLocation)";key="$($_.PackageFullName)";uninstall="$($_.PackageFullName)";scope='machine'}
}
$apps=$apps | Sort-Object name -Unique
if($apps.Count -eq 0){'[]'}else{$apps|ConvertTo-Json -Compress -Depth 3}`;

const esc = (s: string) => (s || "").replace(/'/g, "''");

// La cadena de desinstalación viene del registro (dato NO confiable) y este
// script corre ELEVADO. Interpolarla en un here-string permitía romperlo (una
// línea '@) e inyectar comandos de administrador. La codificamos en base64 y la
// decodificamos como dato puro dentro de PS: el literal base64 no puede cerrar
// el string ni inyectar nada.
const b64utf8 = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s || "")));

// base64 de UTF-16LE — formato que espera `powershell.exe -EncodedCommand`.
const b64utf16 = (s: string) => {
  const buf = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); buf[i * 2] = c & 0xff; buf[i * 2 + 1] = c >> 8; }
  let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
};

const uninstallScript = (a: App) => {
  if (a.type === "uwp")
    return `Get-AppxPackage -Name '${esc(a.name)}' -EA SilentlyContinue | Remove-AppxPackage -EA SilentlyContinue; Write-Output 'OK'`;

  // Cuerpo que ejecuta el desinstalador. La cadena viene del registro (dato no
  // confiable): se decodifica de base64 como dato puro, nunca se interpola como código.
  const body = `$u=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64utf8(a.uninstall)}')).Trim()
if($u -match 'msiexec'){ $u=$u -replace '/I','/X' -replace '/i','/x'; Start-Process cmd -ArgumentList '/c',"$u /quiet /norestart" -Wait -WindowStyle Hidden }
else { Start-Process cmd -ArgumentList '/c',$u -Wait -WindowStyle Hidden }`;

  // HKLM (machine): la entrada la escribió un instalador con admin → confiable →
  // se ejecuta con la elevación de la app (sin prompt extra).
  if (a.scope === "machine")
    return `${body}\nWrite-Output 'Desinstalador ejecutado'`;

  // HKCU (user): cualquiera sin admin puede plantar una entrada acá. Correr su
  // UninstallString con el token elevado de la app sería una escalada de
  // privilegios. Se ejecuta DES-ELEVADO (como el usuario normal) vía tarea
  // programada de nivel limitado; si el desinstalador real necesita admin, pedirá
  // UAC por su cuenta.
  const innerB64 = b64utf16(body);
  return String.raw`$tn = "GO_Uninstall_" + [guid]::NewGuid().ToString('N')
$act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -WindowStyle Hidden -EncodedCommand ${innerB64}'
$usr = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$prin = New-ScheduledTaskPrincipal -UserId $usr -LogonType Interactive -RunLevel Limited
try {
  Register-ScheduledTask -TaskName $tn -Action $act -Principal $prin -Force -ErrorAction Stop | Out-Null
  Start-ScheduledTask -TaskName $tn
  $w = 0
  while ((($t = Get-ScheduledTask -TaskName $tn -EA SilentlyContinue)) -and ($t.State -ne 'Ready') -and ($w -lt 300)) { Start-Sleep -Seconds 2; $w += 2 }
} catch { Unregister-ScheduledTask -TaskName $tn -Confirm:$false -EA SilentlyContinue; Write-Output ('No se pudo ejecutar el desinstalador: ' + $_.Exception.Message); return }
Unregister-ScheduledTask -TaskName $tn -Confirm:$false -EA SilentlyContinue
Write-Output 'Desinstalador ejecutado (modo usuario)'`;
};

interface Leftover { type: "folder" | "regkey"; label: string; path: string; }

// UWP: quitar el paquete de todos los usuarios (no deja restos del registro clásico).
const forceUwp = (a: App) =>
  `Get-AppxPackage -Name '${esc(a.name)}' -AllUsers -EA SilentlyContinue | Remove-AppxPackage -AllUsers -EA SilentlyContinue; Write-Output 'Paquete UWP eliminado'`;

// ESCÁNER estilo Geek Uninstaller: busca restos ESPECÍFICOS de la app (carpeta de
// instalación, clave de desinstalación, carpetas de datos y claves de registro
// propias) y devuelve los que EXISTEN. Los datos del registro (no confiables) se
// pasan en base64 y se usan sólo como -LiteralPath, nunca como código. Nunca
// ofrece rutas protegidas ni claves de editor "peladas" (Software\<editor>) — eso
// evita borrar ramas compartidas como Software\Microsoft o %AppData%\Google.
const scanLeftovers = (a: App) => String.raw`$name=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64utf8(a.name)}'))
$pub=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64utf8(a.pub)}'))
$loc=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64utf8(a.location)}'))
$key=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64utf8(a.key)}'))
$bad=@('microsoft','windows','google','common files','intel','nvidia','amd','realtek','adobe','oracle','mozilla','system','program files','program files (x86)','programdata','users','appdata','local','roaming','temp','default','wow6432node','classes','clients','policies')
$prot=@($env:ProgramFiles,[Environment]::GetEnvironmentVariable('ProgramFiles(x86)'),$env:ProgramData,$env:windir,$env:APPDATA,$env:LOCALAPPDATA,$env:SystemDrive,'C:\Windows','C:\Users') | ForEach-Object { if($_){ $_.TrimEnd('\').ToLower() } }
function SafeFolder($p){ if(!$p){return $false}; $t=$p.TrimEnd('\'); if($t.Length -le 12){return $false}; if($prot -contains $t.ToLower()){return $false}; return (Test-Path -LiteralPath $p) }
# Nombre "limpio" desde el DisplayName: sin (...) y cortado en la primera versión
# ("7-Zip 26.01 (x64 edition)" -> "7-Zip"). Sirve para apps MSI sin InstallLocation.
$clean = ($name -replace '\([^)]*\)','')
$clean = ($clean -replace '(?i)\s+v?\d[\d\.\-]*.*$','').Trim()
$leaf = if($loc){ Split-Path $loc -Leaf } else { '' }
$folderTerms = @($leaf,$clean,$pub) | Where-Object { $_ -and $_.Length -gt 2 -and ($bad -notcontains $_.ToLower()) } | Select-Object -Unique
$appTerms = @($leaf,$clean) | Where-Object { $_ -and $_.Length -gt 2 -and ($bad -notcontains $_.ToLower()) } | Select-Object -Unique
$found=@()
if(SafeFolder $loc){ $found += [pscustomobject]@{type='folder'; label='Carpeta de instalación'; path=$loc} }
if($key){ $found += [pscustomobject]@{type='regkey'; label='Clave de desinstalación'; path=('Registry::'+$key)} }
foreach($root in @($env:APPDATA,$env:LOCALAPPDATA,$env:ProgramData,$env:ProgramFiles,[Environment]::GetEnvironmentVariable('ProgramFiles(x86)'))){
  if(!$root){ continue }
  foreach($t in $folderTerms){
    $p = Join-Path $root $t
    if((SafeFolder $p) -and (@($found.path) -notcontains $p)){ $found += [pscustomobject]@{type='folder'; label='Datos / carpeta'; path=$p} }
  }
}
foreach($rr in @('HKCU:\Software','HKLM:\Software','HKLM:\Software\Wow6432Node')){
  foreach($t in $appTerms){
    $cands=@("$rr\$t")
    if($pub -and ($bad -notcontains $pub.ToLower())){ $cands += "$rr\$pub\$t" }
    foreach($c in $cands){
      if((Test-Path -LiteralPath $c) -and (@($found.path) -notcontains $c)){ $found += [pscustomobject]@{type='regkey'; label='Registro'; path=$c} }
    }
  }
}
if($found.Count -eq 0){'[]'}else{$found|ConvertTo-Json -Compress -Depth 3}`;

// Borra SOLO los restos que el usuario confirmó. Re-valida las guardas (defensa en
// profundidad): nunca borra rutas protegidas ni claves de registro raíz, aunque
// llegaran en la lista.
const deleteLeftovers = (items: { type: string; path: string }[]) => String.raw`$json=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64utf8(JSON.stringify(items))}'))
$items=@($json | ConvertFrom-Json)
$prot=@($env:ProgramFiles,[Environment]::GetEnvironmentVariable('ProgramFiles(x86)'),$env:ProgramData,$env:windir,$env:APPDATA,$env:LOCALAPPDATA,$env:SystemDrive,'C:\Windows','C:\Users') | ForEach-Object { if($_){ $_.TrimEnd('\').ToLower() } }
$protReg=@('hkcu:\software','hklm:\software','hklm:\software\wow6432node','hklm:\software\microsoft','hkcu:\software\microsoft','hklm:\system','hkcu:\system','hkcu:\control panel')
$done=0
foreach($it in $items){
  $p=$it.path
  if($it.type -eq 'folder'){
    $t=$p.TrimEnd('\')
    if($t.Length -gt 12 -and ($prot -notcontains $t.ToLower()) -and (Test-Path -LiteralPath $p)){
      # Cerrar procesos cuyo ejecutable esté dentro de la carpeta (archivos en uso).
      $pref=$t.ToLower()+'\'
      Get-Process -EA SilentlyContinue | Where-Object { $_.Path -and $_.Path.ToLower().StartsWith($pref) } | Stop-Process -Force -EA SilentlyContinue
      Start-Sleep -Milliseconds 300
      Remove-Item -LiteralPath $p -Recurse -Force -EA SilentlyContinue
      if(-not (Test-Path -LiteralPath $p)){ $done++ }
    }
  } elseif($it.type -eq 'regkey'){
    if(($protReg -notcontains $p.ToLower().TrimEnd('\')) -and (Test-Path -LiteralPath $p)){
      Remove-Item -LiteralPath $p -Recurse -Force -EA SilentlyContinue
      if(-not (Test-Path -LiteralPath $p)){ $done++ }
    }
  }
}
$total=$items.Count
if($done -lt $total){ Write-Output ('Restos eliminados: '+$done+'/'+$total+' (algunos estaban en uso o protegidos)') } else { Write-Output ('Restos eliminados: '+$done+'/'+$total) }`;

const MS_BLOAT = String.raw`$list='Microsoft.BingNews','Microsoft.BingWeather','Microsoft.GetHelp','Microsoft.Getstarted','Microsoft.Messaging','Microsoft.MicrosoftSolitaireCollection','Microsoft.MicrosoftOfficeHub','Microsoft.People','Microsoft.SkypeApp','Microsoft.ZuneMusic','Microsoft.ZuneVideo','Microsoft.WindowsFeedbackHub','Microsoft.YourPhone','Microsoft.Todos','Clipchamp.Clipchamp','Microsoft.GamingApp','Microsoft.549981C3F5F10','Microsoft.MixedReality.Portal','Microsoft.WindowsMaps'
$n=0; foreach($a in $list){ if(Get-AppxPackage -Name $a -AllUsers -EA SilentlyContinue){ Get-AppxPackage -Name $a -AllUsers | Remove-AppxPackage -AllUsers -EA SilentlyContinue; $n++ } }
Write-Output "Apps de Microsoft removidas: $n"`;

const OEM_BLOAT = String.raw`$list='king.com.CandyCrush*','*.Disney*','*.Facebook*','*.Netflix*','*.TikTok*','*.Spotify*','*.Twitter*','*.Booking*','*WildTangent*','*McAfee*','*.LinkedInforWindows*','*.Dropbox*','*.Roblox*'
$n=0; foreach($a in $list){ Get-AppxPackage -Name $a -AllUsers -EA SilentlyContinue | ForEach-Object { Remove-AppxPackage -Package $_.PackageFullName -AllUsers -EA SilentlyContinue; $n++ } }
Write-Output "Bloatware de terceros removido: $n"`;

const fmtDate = (d: string) =>
  /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
const fmtSize = (mb: number) =>
  !mb ? "" : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;

export default function Desinstalar() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [confirm, setConfirm] = useState<null | { title: string; msg: string; run: () => void }>(null);
  const [scan, setScan] = useState<null | { app: App; items: (Leftover & { checked: boolean })[] }>(null);
  const scrollRef = useScrollMemory<HTMLDivElement>("uninstall");

  const load = async () => {
    setLoading(true);
    const r = await runPowershell(LIST);
    try {
      const data = JSON.parse(r.output.trim() || "[]");
      setApps(Array.isArray(data) ? data : [data]);
    } catch { setApps([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return q ? apps.filter((a) => a.name.toLowerCase().includes(q)) : apps;
  }, [apps, query]);

  const removeRow = (a: App) =>
    setApps((l) => l.filter((x) => !(x.name === a.name && x.type === a.type)));

  const uninstall = async (a: App) => {
    setWorking(true); setBusy(a.name);
    setStatus(`Desinstalando ${a.name}…${a.type === "win32" ? " (puede abrir su propio desinstalador)" : ""}`);
    const r = await runPowershell(uninstallScript(a));
    setStatus(`✓ ${a.name}: ${(r.output.split("\n").pop() || "hecho").trim()}`);
    if (a.type === "uwp") removeRow(a);
    setBusy(null); setWorking(false);
  };

  const force = async (a: App) => {
    // UWP: no hay restos de registro clásico; se quita el paquete directo.
    if (a.type === "uwp") {
      setConfirm({
        title: "Forzar borrado",
        msg: `Se quitará el paquete "${a.name}" de todos los usuarios.\nNo se puede deshacer.`,
        run: async () => {
          setConfirm(null);
          setWorking(true); setBusy(a.name);
          setStatus(`Forzando borrado de ${a.name}…`);
          const r = await runPowershell(forceUwp(a));
          setStatus(`✓ ${a.name}: ${(r.output.split("\n").pop() || "hecho").trim()}`);
          removeRow(a);
          setBusy(null); setWorking(false);
        },
      });
      return;
    }
    // win32: Forzar = DESINSTALAR + barrer restos (estilo "Force Removal" de Geek).
    // Corre primero el desinstalador (cierra la app y borra sus archivos) y recién
    // después escanea los restos, así no chocan con archivos en uso.
    setConfirm({
      title: "Forzar borrado",
      msg: `Se va a DESINSTALAR "${a.name}" y después borrar los restos que queden (archivos + registro).\n\nPrimero corre su desinstalador y luego te muestro qué sobró para eliminar. No se puede deshacer.`,
      run: async () => {
        setConfirm(null);
        setWorking(true); setBusy(a.name);
        setStatus(`Desinstalando ${a.name}…`);
        await runPowershell(uninstallScript(a));
        setStatus(`Buscando restos de ${a.name}…`);
        const r = await runPowershell(scanLeftovers(a));
        let items: Leftover[] = [];
        try { const d = JSON.parse(r.output.trim() || "[]"); items = (Array.isArray(d) ? d : [d]) as Leftover[]; } catch {}
        setBusy(null); setWorking(false); setStatus("");
        if (items.length === 0) { setStatus(`✓ ${a.name}: desinstalado, sin restos.`); removeRow(a); return; }
        setScan({ app: a, items: items.map((it) => ({ ...it, checked: true })) });
      },
    });
  };

  const toggleItem = (i: number) =>
    setScan((s) => (s ? { ...s, items: s.items.map((it, j) => (j === i ? { ...it, checked: !it.checked } : it)) } : s));

  const runDelete = async () => {
    if (!scan) return;
    const app = scan.app;
    const chosen = scan.items.filter((i) => i.checked).map(({ type, path }) => ({ type, path }));
    setScan(null);
    if (chosen.length === 0) { removeRow(app); return; }
    setWorking(true); setBusy(app.name);
    setStatus(`Borrando restos de ${app.name}…`);
    const r = await runPowershell(deleteLeftovers(chosen));
    const last = r.output.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "hecho";
    setStatus(`✓ ${app.name}: ${last}`);
    removeRow(app);
    setBusy(null); setWorking(false);
  };

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.uninstall" />

      <div className="flex items-center gap-2 mb-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar programa…"
          className="flex-1 h-9 px-3 rounded-lg bg-surface border border-line focus:border-accent outline-none text-[13px] text-text placeholder:text-text-mute transition" />
        <button disabled={working} onClick={() => setConfirm({ title: "Quitar bloatware de Microsoft", msg: "Se quitarán apps no esenciales de Microsoft (Noticias, Clima, Solitaire, Skype, etc.).", run: async () => { setConfirm(null); setWorking(true); setStatus("Quitando bloatware de Microsoft…"); const r = await runPowershell(MS_BLOAT); setStatus("✓ " + (r.output.split("\n").pop() || "Hecho").trim()); await load(); setWorking(false); } })}
          className="btn btn-ghost">Bloatware MS</button>
        <button disabled={working} onClick={() => setConfirm({ title: "Quitar bloatware de terceros", msg: "Se quitarán apps preinstaladas de terceros (CandyCrush, Disney, McAfee, etc.).", run: async () => { setConfirm(null); setWorking(true); setStatus("Quitando bloatware de terceros…"); const r = await runPowershell(OEM_BLOAT); setStatus("✓ " + (r.output.split("\n").pop() || "Hecho").trim()); await load(); setWorking(false); } })}
          className="btn btn-ghost">Bloatware OEM</button>
        <button disabled={working || loading} onClick={load}
          className="btn btn-ghost">Actualizar</button>
      </div>

      {working && <IndeterminateBar className="mb-3" />}

      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-2 -mr-2">
        {loading ? (
          <div className="text-text-mute text-sm">Cargando programas…</div>
        ) : (
          <div className="rounded-xl border border-line divide-y divide-line/60">
            {filtered.map((a) => (
              <div key={a.type + a.name} className="flex items-center gap-3 px-4 py-2.5 group">
                <span className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 ${a.type === "uwp" ? "text-[#7eb6ff] border border-[#7eb6ff44]" : "text-text-mute border border-line"}`}>
                  {a.type}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-text truncate">{a.name}</div>
                  <div className="text-[12px] text-text-mute truncate">
                    {[a.pub, fmtSize(a.size), fmtDate(a.date)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 shrink-0 transition ${busy === a.name ? "opacity-100" : "opacity-60 group-hover:opacity-100"}`}>
                  {busy === a.name && <Spinner />}
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => uninstall(a)} disabled={working}
                    className="px-3 h-8 rounded-lg text-[13px] text-text-dim hover:text-text border border-line hover:border-line-2 transition disabled:opacity-30">
                    Quitar
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => force(a)} disabled={working}
                    className="px-3 h-8 rounded-lg text-[13px] text-[#ff7a90] hover:text-[#ff5470] border border-[#ff547033] hover:border-[#ff547066] transition disabled:opacity-30">
                    Forzar
                  </motion.button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="px-4 py-3 text-text-mute text-sm">Sin resultados.</div>}
          </div>
        )}
      </div>

      {(status || working) && (
        <div className="mt-4 pt-4 border-t border-line text-[13px] font-mono text-text-dim flex items-center gap-2">
          {working && <Spinner />}
          <span className="truncate">{status}</span>
        </div>
      )}

      <Modal open={!!confirm} title={confirm?.title || ""} onClose={() => setConfirm(null)}
        onConfirm={confirm?.run} confirmText="Confirmar" closeText="Cancelar">
        {confirm?.msg || ""}
      </Modal>

      <Modal open={!!scan} title={`Forzar borrado — ${scan?.app.name ?? ""}`}
        onClose={() => setScan(null)} onConfirm={runDelete}
        confirmText={`Borrar (${scan?.items.filter((i) => i.checked).length ?? 0})`} closeText="Cancelar">
        <div>
          <p className="mb-3">Restos encontrados de esta app. Destildá lo que quieras conservar. <b className="text-text">No se puede deshacer.</b></p>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-line divide-y divide-line/60">
            {scan?.items.map((it, i) => (
              <label key={i} className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-white/[0.025]">
                <input type="checkbox" checked={it.checked} onChange={() => toggleItem(i)}
                  className="mt-1 shrink-0" style={{ accentColor: "#00e676" }} />
                <span className="min-w-0">
                  <span className="text-[11px] text-text-mute">{it.label}</span>
                  <span className="block text-[12px] text-text-dim font-mono break-all leading-snug">{it.path}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
