import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { APP_CATALOG } from "../apps";
import { runPowershell } from "../lib/api";
import { notify } from "../lib/notify";
import { useScrollMemory } from "../lib/useScrollMemory";
import { HudTitle } from "../components/NeonCard";
import Modal from "../components/Modal";

// Instala una app DES-ELEVADA (como el usuario normal, sin admin) vía una tarea
// programada de nivel limitado. Necesario para apps per-usuario como Spotify, cuyo
// instalador se niega a correr elevado. Devuelve 'GO_OK' o 'GO_FAIL <detalle>'.
const deElevatedInstall = (id: string) => String.raw`$id = '${id.replace(/'/g, "''")}'
$tmp  = "$env:TEMP\go_" + [guid]::NewGuid().ToString('N')
$out  = "$tmp.out"; $code = "$tmp.code"
$inner = "winget install --id '$id' --exact --source winget --silent --force --accept-package-agreements --accept-source-agreements --disable-interactivity *>&1 | Out-File -LiteralPath '$out' -Encoding utf8; " + '$LASTEXITCODE | Set-Content -LiteralPath ' + "'$code'"
$b64  = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))
$tn   = "GO_Install_" + [guid]::NewGuid().ToString('N')
$act  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ("-NoProfile -WindowStyle Hidden -EncodedCommand " + $b64)
$usr  = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$prin = New-ScheduledTaskPrincipal -UserId $usr -LogonType Interactive -RunLevel Limited
try {
  Register-ScheduledTask -TaskName $tn -Action $act -Principal $prin -Force -ErrorAction Stop | Out-Null
  Start-ScheduledTask -TaskName $tn
  $w = 0
  while ((($t = Get-ScheduledTask -TaskName $tn -EA SilentlyContinue)) -and ($t.State -ne 'Ready') -and ($w -lt 300)) { Start-Sleep -Seconds 2; $w += 2 }
} catch { Write-Output ('GO_FAIL ' + $_.Exception.Message); exit }
Unregister-ScheduledTask -TaskName $tn -Confirm:$false -EA SilentlyContinue
$rc   = if (Test-Path $code) { (Get-Content $code -Raw).Trim() } else { '' }
$otxt = if (Test-Path $out)  { (Get-Content $out -Raw) } else { '' }
Remove-Item $out, $code -Force -EA SilentlyContinue
if ($rc -eq '0' -or $otxt -match 'already installed|ya está instalad') { Write-Output 'GO_OK' }
else { Write-Output ('GO_FAIL ' + (($otxt -replace '\s+', ' ').Trim())) }`;

const INSTALLED_NAMES = `$names=@()
$roots=@('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')
foreach($r in $roots){ Get-ItemProperty $r -EA SilentlyContinue | Where-Object DisplayName | ForEach-Object { $names+=$_.DisplayName } }
Get-AppxPackage -EA SilentlyContinue | ForEach-Object { $names+=$_.Name }
($names | Sort-Object -Unique) -join '|'`;

const itemV = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

export default function AppsPage() {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [log, setLog] = useState<string[]>(["Listo."]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const logRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const scrollRef = useScrollMemory<HTMLDivElement>("apps");

  const setAll = (v: boolean) => {
    const n: Record<string, boolean> = {};
    APP_CATALOG.forEach((c) => c.apps.forEach((a) => (n[a.id] = v)));
    setSel(n);
  };

  useEffect(() => {
    runPowershell(INSTALLED_NAMES).then((r) => {
      const hay = r.output.toLowerCase();
      const set = new Set<string>();
      APP_CATALOG.forEach((c) => c.apps.forEach((a) => {
        const n = a.name.toLowerCase();
        if (n.length >= 3 && hay.includes(n)) set.add(a.id);
      }));
      setInstalled(set);
    }).catch(() => {});
  }, []);

  const selected = useMemo(
    () => APP_CATALOG.flatMap((c) => c.apps).filter((a) => sel[a.id]),
    [sel]
  );

  const addLog = (s: string) => setLog((l) => {
    const n = [...l, s];
    queueMicrotask(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight));
    return n;
  });

  const install = async () => {
    setRunning(true);
    setProgress(0);
    setLog(["Listo."]);
    // Verifica que winget (App Installer) exista antes de empezar: en PCs sin él,
    // cada install fallaría con un error críptico.
    const wingetOk = await runPowershell(`if (Get-Command winget -ErrorAction SilentlyContinue) { "OK" } else { "NO" }`);
    if (!mounted.current) return;
    if (!/OK/.test(wingetOk.output)) {
      addLog("✗ winget (App Installer) no está instalado en esta PC.");
      addLog('  Instalalo gratis desde Microsoft Store buscando "App Installer" y reintentá.');
      setRunning(false);
      return;
    }
    addLog(`Instalando ${selected.length} aplicaciones vía winget…`);
    let ok = 0;
    // Considera éxito: exit 0, "ya instalado", o "no hay update aplicable".
    const isOk = (r: { ok: boolean; output: string }) =>
      r.ok || /already installed|ya está instalad|no applicable|no aplicable|reboot|reinici/i.test(r.output);
    const wasAlready = (r: { ok: boolean; output: string }) =>
      /already installed|ya está instalad/i.test(r.output);

    for (let i = 0; i < selected.length; i++) {
      const app = selected[i];
      addLog(`▸ ${app.name}`);
      // --source winget: evita que winget consulte la fuente msstore (Microsoft Store),
      // que en PCs sin sus términos aceptados falla con --disable-interactivity aunque el
      // paquete esté en la fuente winget. Todos los ids del catálogo son de la fuente winget.
      // --force: instalación forzosa — instala aunque haya otra versión y omite chequeos no críticos.
      const cmd = `winget install --id "${app.id}" --exact --source winget --silent --force --accept-package-agreements --accept-source-agreements --disable-interactivity`;
      let r = await runPowershell(cmd);
      let viaUser = false;
      // Si falla elevado, reintenta DES-ELEVADO (como usuario normal): apps per-usuario
      // como Spotify rechazan correr como admin y solo así se instalan.
      if (!isOk(r)) {
        addLog("  ↩ reintentando sin admin (modo usuario)…");
        const d = await runPowershell(deElevatedInstall(app.id));
        if (d.output.includes("GO_OK")) { r = { ok: true, output: "" }; viaUser = true; }
        else r = { ok: false, output: d.output.replace(/GO_FAIL/g, "").trim() || r.output };
      }
      if (!mounted.current) return;
      if (isOk(r)) { ok++; addLog(wasAlready(r) ? "  ✓ Ya estaba instalado" : viaUser ? "  ✓ Instalado (modo usuario)" : "  ✓ Instalado"); }
      else addLog(`  ✗ ${(r.output.split("\n").find((l) => l.trim()) || "Error").slice(0, 80)}`);
      setProgress((i + 1) / selected.length);
    }
    addLog(`Completado: ${ok}/${selected.length} aplicaciones.`);
    setRunning(false);
    notify("Instalación completada", `${ok}/${selected.length} aplicaciones instaladas.`);
    setDone(`${ok}/${selected.length} aplicaciones instaladas.`);
  };

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.apps" />

      <div className="flex-1 grid grid-cols-[1fr_340px] gap-6 min-h-0">
        <motion.div ref={scrollRef} className={`overflow-y-auto pr-3 -mr-3 space-y-7 transition-opacity ${running ? "pointer-events-none opacity-50" : ""}`}
          initial="hidden" animate="show"
          variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
          {APP_CATALOG.map((c) => {
            const selCount = c.apps.filter((a) => sel[a.id]).length;
            const allOn = selCount === c.apps.length;
            return (
              <motion.section key={c.category} variants={itemV}>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                  <h2 className="section-label">{c.category}</h2>
                  <span className="text-[12px] text-text-mute">{selCount}/{c.apps.length}</span>
                  <button
                    onClick={() => setSel((s) => {
                      const n = { ...s };
                      c.apps.forEach((a) => (n[a.id] = !allOn));
                      return n;
                    })}
                    className="ml-auto text-[12px] text-text-mute hover:text-accent transition"
                  >
                    {allOn ? "Quitar" : "Todo"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 rounded-xl border border-line p-1">
                  {c.apps.map((a) => {
                    const on = !!sel[a.id];
                    const inst = installed.has(a.id);
                    return (
                      <div key={a.id}
                        onClick={() => setSel((s) => ({ ...s, [a.id]: !on }))}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer hover:bg-white/[0.025] transition-colors">
                        <div className={`w-[16px] h-[16px] rounded border shrink-0 flex items-center justify-center transition-all ${on ? "bg-accent border-accent" : "border-line-2"}`}>
                          {on && <svg viewBox="0 0 16 16" className="w-2.5 h-2.5"><path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" fill="none" stroke="#000" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <img src={`https://www.google.com/s2/favicons?domain=${a.domain}&sz=32`}
                          alt="" className="w-4 h-4 rounded-sm opacity-90"
                          onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                        <span className={`text-[13px] truncate ${on ? "text-text" : "text-text-dim"}`}>{a.name}</span>
                        {inst && <span title="Ya instalado" className="ml-auto text-[11px] text-accent shrink-0">✓ instalado</span>}
                      </div>
                    );
                  })}
                </div>
              </motion.section>
            );
          })}
        </motion.div>

        <div className="flex flex-col min-h-0">
          <span className="section-label mb-2.5">Progreso</span>
          <div ref={logRef} className="flex-1 overflow-y-auto rounded-xl bg-surface border border-line p-4 font-mono text-[13px] leading-relaxed text-text-dim whitespace-pre-wrap">
            {log.join("\n")}
          </div>
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-line">
        {running && (
          <div className="h-[3px] rounded-full bg-line overflow-hidden mb-4">
            <motion.div className="h-full bg-accent" animate={{ width: `${progress * 100}%` }}
              transition={{ ease: "easeOut", duration: 0.3 }} />
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button disabled={running} onClick={() => setAll(true)} className="btn btn-ghost">Seleccionar todo</button>
            <button disabled={running} onClick={() => setAll(false)} className="btn btn-ghost">Deseleccionar</button>
            <span className="text-[13px] text-text-mute ml-1">{selected.length} sel.</span>
          </div>
          <button disabled={running || selected.length === 0} onClick={install} className="btn btn-primary px-6">
            {running ? "Instalando…" : `Instalar (${selected.length})`}
          </button>
        </div>
      </div>

      <Modal open={!!done} title="Instalación completada" onClose={() => setDone(null)}>{done || ""}</Modal>
    </div>
  );
}
