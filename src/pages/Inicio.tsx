import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { runPowershell } from "../lib/api";
import { useScrollMemory } from "../lib/useScrollMemory";
import { HudTitle } from "../components/NeonCard";
import { StatusLine } from "../components/Feedback";

interface Entry { name: string; cmd: string; scope: "HKCU" | "HKLM"; enabled: boolean; }

const LIST = String.raw`$out=@()
$keys=@(
 @{p='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; a='HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'; s='HKCU'},
 @{p='HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'; a='HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'; s='HKLM'}
)
foreach($k in $keys){
 if(Test-Path $k.p){
  foreach($name in (Get-Item $k.p).Property){
   $cmd=(Get-ItemProperty $k.p).$name
   $enabled=$true
   if(Test-Path $k.a){ $b=(Get-ItemProperty -Path $k.a -Name $name -EA SilentlyContinue).$name; if($b){ $enabled = ($b[0] -ne 3) } }
   $out += [pscustomobject]@{name=$name; cmd="$cmd"; scope=$k.s; enabled=$enabled}
  }
 }
}
if($out.Count -eq 0){ '[]' } else { $out | ConvertTo-Json -Compress -Depth 3 }`;

const toggleScript = (e: Entry, enable: boolean) => {
  const name = e.name.replace(/'/g, "''");
  const appr = e.scope === "HKCU"
    ? String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`
    : String.raw`HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`;
  const bytes = enable ? "2,0,0,0,0,0,0,0,0,0,0,0" : "3,0,0,0,0,0,0,0,0,0,0,0";
  return `$a='${appr}'\nif(!(Test-Path $a)){ New-Item $a -Force | Out-Null }\nSet-ItemProperty -Path $a -Name '${name}' -Value ([byte[]](${bytes})) -Type Binary -Force\nWrite-Output OK`;
};

export default function Inicio() {
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const scrollRef = useScrollMemory<HTMLDivElement>("startup");

  const load = async () => {
    setLoading(true);
    const r = await runPowershell(LIST);
    try {
      const data = JSON.parse(r.output.trim() || "[]");
      setItems(Array.isArray(data) ? data : [data]);
    } catch { setItems([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (e: Entry) => {
    setBusy(e.name);
    setStatus(`${e.enabled ? "Desactivando" : "Activando"} ${e.name}…`);
    await runPowershell(toggleScript(e, !e.enabled));
    setItems((list) => list.map((x) => (x.name === e.name && x.scope === e.scope ? { ...x, enabled: !x.enabled } : x)));
    setStatus(`✓ ${e.name} ${e.enabled ? "desactivado" : "activado"}`);
    setBusy(null);
  };

  const enabledCount = items.filter((i) => i.enabled).length;

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.startup" />

      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] text-text-mute">{enabledCount} activos · {items.length} en total</span>
        <button onClick={load} className="btn btn-ghost">Actualizar</button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-2 -mr-2">
        {loading ? (
          <div className="text-text-mute text-sm">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="text-text-mute text-sm">No se encontraron programas de inicio.</div>
        ) : (
          <div className="rounded-xl border border-line divide-y divide-line/60">
            {items.map((e) => (
              <div key={e.scope + e.name} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] ${e.enabled ? "text-text" : "text-text-mute"}`}>{e.name}</div>
                  <div className="text-[11px] text-text-mute truncate font-mono">{e.cmd}</div>
                </div>
                <span className="text-[10px] text-text-mute border border-line rounded px-1.5 py-0.5">{e.scope}</span>
                <button
                  onClick={() => toggle(e)} disabled={busy === e.name}
                  className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 ${e.enabled ? "bg-accent" : "bg-line-2"}`}>
                  <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }}
                    className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-black"
                    style={{ left: e.enabled ? 20 : 2 }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <StatusLine working={!!busy} text={status} />
    </div>
  );
}
