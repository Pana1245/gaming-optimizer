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
}

const LIST = String.raw`$apps=@()
$roots=@('HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall')
foreach($root in $roots){
 if(Test-Path $root){
  Get-ChildItem $root -EA SilentlyContinue | ForEach-Object {
   $p=Get-ItemProperty $_.PSPath -EA SilentlyContinue
   if($p.DisplayName -and -not $p.SystemComponent){
    $size=if($p.EstimatedSize){[math]::Round($p.EstimatedSize/1024,1)}else{0}
    $apps+=[pscustomobject]@{name="$($p.DisplayName)";pub="$($p.Publisher)";type='win32';size=$size;date="$($p.InstallDate)";location="$($p.InstallLocation)";key="$($_.Name)";uninstall="$($p.UninstallString)"}
   }
  }
 }
}
Get-AppxPackage -EA SilentlyContinue | Where-Object { -not $_.IsFramework } | ForEach-Object {
 $apps+=[pscustomobject]@{name="$($_.Name)";pub="$($_.Publisher)";type='uwp';size=0;date='';location="$($_.InstallLocation)";key="$($_.PackageFullName)";uninstall="$($_.PackageFullName)"}
}
$apps=$apps | Sort-Object name -Unique
if($apps.Count -eq 0){'[]'}else{$apps|ConvertTo-Json -Compress -Depth 3}`;

const esc = (s: string) => (s || "").replace(/'/g, "''");

const uninstallScript = (a: App) => {
  if (a.type === "uwp")
    return `Get-AppxPackage -Name '${esc(a.name)}' -EA SilentlyContinue | Remove-AppxPackage -EA SilentlyContinue; Write-Output 'OK'`;
  return `$u=@'
${a.uninstall}
'@
if($u -match 'msiexec'){ $u=$u -replace '/I','/X' -replace '/i','/x'; Start-Process cmd -ArgumentList '/c',"$u /quiet /norestart" -Wait -WindowStyle Hidden }
else { Start-Process cmd -ArgumentList '/c',$u -Wait -WindowStyle Hidden }
Write-Output 'Desinstalador ejecutado'`;
};

const forceScript = (a: App) => {
  if (a.type === "uwp")
    return `Get-AppxPackage -Name '${esc(a.name)}' -AllUsers -EA SilentlyContinue | Remove-AppxPackage -AllUsers -EA SilentlyContinue; Write-Output 'Paquete UWP eliminado'`;
  return String.raw`$removed=@()
$loc='${esc(a.location)}'; $name='${esc(a.name)}'; $pub='${esc(a.pub)}'; $key='${esc(a.key)}'
if($loc -and (Test-Path $loc)){ Remove-Item -LiteralPath $loc -Recurse -Force -EA SilentlyContinue; $removed+="Carpeta: $loc" }
$bases=@($env:ProgramFiles,[Environment]::GetEnvironmentVariable('ProgramFiles(x86)'),$env:ProgramData,$env:APPDATA,$env:LOCALAPPDATA)
foreach($b in $bases){ foreach($t in @($name,$pub)){ if($t -and $b){ $d=Join-Path $b $t; if(Test-Path $d){ Remove-Item -LiteralPath $d -Recurse -Force -EA SilentlyContinue; $removed+="Carpeta: $d" } } } }
if($key){ Remove-Item -LiteralPath "Registry::$key" -Recurse -Force -EA SilentlyContinue; $removed+="Registro de desinstalacion" }
foreach($r in @('HKCU:\Software','HKLM:\Software','HKLM:\Software\Wow6432Node')){ foreach($t in @($pub,$name)){ if($t){ $pp=Join-Path $r $t; if(Test-Path $pp){ Remove-Item -LiteralPath $pp -Recurse -Force -EA SilentlyContinue; $removed+="Registro: $t" } } } }
if($removed.Count -eq 0){ Write-Output 'No se encontraron restos.' } else { $removed | ForEach-Object { Write-Output $_ } }`;
};

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

  const force = (a: App) =>
    setConfirm({
      title: "Forzar borrado",
      msg: `Se eliminarán los restos de "${a.name}":\n• Carpeta de instalación\n• Carpetas en ProgramData/AppData\n• Claves de registro\n\nUsalo para programas ya desinstalados o entradas rotas. No se puede deshacer.`,
      run: async () => {
        setConfirm(null);
        setWorking(true); setBusy(a.name);
        setStatus(`Forzando borrado de ${a.name}…`);
        const r = await runPowershell(forceScript(a));
        const lines = r.output.split("\n").map((l) => l.trim()).filter(Boolean);
        setStatus(`✓ ${a.name}: ${lines.length} resto(s) eliminados`);
        removeRow(a);
        setBusy(null); setWorking(false);
      },
    });

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
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${a.type === "uwp" ? "text-[#7eb6ff] border border-[#7eb6ff44]" : "text-text-mute border border-line"}`}>
                  {a.type}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-text truncate">{a.name}</div>
                  <div className="text-[11px] text-text-mute truncate">
                    {[a.pub, fmtSize(a.size), fmtDate(a.date)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 shrink-0 transition ${busy === a.name ? "opacity-100" : "opacity-60 group-hover:opacity-100"}`}>
                  {busy === a.name && <Spinner />}
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => uninstall(a)} disabled={working}
                    className="px-3 h-8 rounded-lg text-[12px] text-text-dim hover:text-text border border-line hover:border-line-2 transition disabled:opacity-30">
                    Quitar
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => force(a)} disabled={working}
                    className="px-3 h-8 rounded-lg text-[12px] text-[#ff7a90] hover:text-[#ff5470] border border-[#ff547033] hover:border-[#ff547066] transition disabled:opacity-30">
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
    </div>
  );
}
