import { createContext, useContext, useState, type ReactNode } from "react";
import { runPowershell } from "./api";
import { notify } from "./notify";

export interface InstallApp { id: string; name: string; }

interface Ctx {
  running: boolean;
  log: string[];
  progress: number;      // 0..1
  done: string | null;   // resumen al terminar (dispara el modal)
  install: (apps: InstallApp[]) => Promise<void>;
  clearDone: () => void;
}

const InstallerCtx = createContext<Ctx>({
  running: false, log: ["Listo."], progress: 0, done: null,
  install: async () => {}, clearDone: () => {},
});

export const useInstaller = () => useContext(InstallerCtx);

// Paquetes cuyo manifiesto de winget declara `ElevationRequirement: elevationProhibited`:
// winget se niega a instalarlos desde un proceso admin (esta app lo es) y el intento
// elevado falla o se cuelga. Van DIRECTO a la instalación des-elevada. Revisado contra
// microsoft/winget-pkgs para todo el catálogo (sólo Spotify lo tiene).
const USER_ONLY = new Set(["Spotify.Spotify"]);

// La primera línea de la salida de winget suele ser ruido ("Encontrado X…", spinners).
// Preferimos la línea que realmente describe el error.
const errorLine = (out: string) => {
  const lines = out.split("\n").map((l) => l.trim()).filter((l) => /\w/.test(l) && !/[▀-▟]/.test(l));
  return (lines.find((l) => /error|fall|fail|c[oó]digo|code|0x[0-9a-f]{6,}|denegad|denied|hash/i.test(l))
    ?? lines[lines.length - 1] ?? "Error").slice(0, 120);
};
const inUse = (out: string) => /in use|en uso|packageInUse|c[oó]digo.*\b26\b/i.test(out);

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

export function InstallerProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>(["Listo."]);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  const addLog = (s: string) => setLog((l) => [...l, s]);

  // Corre en el provider (nunca se desmonta) → la instalación NO se corta ni pierde
  // el progreso aunque el usuario cambie de sección.
  const install = async (apps: InstallApp[]) => {
    if (running || apps.length === 0) return;
    setRunning(true);
    setProgress(0);
    setDone(null);
    setLog(["Listo."]);

    const wingetOk = await runPowershell(`if (Get-Command winget -ErrorAction SilentlyContinue) { "OK" } else { "NO" }`);
    if (!/OK/.test(wingetOk.output)) {
      addLog("✗ winget (App Installer) no está instalado en esta PC.");
      addLog('  Instalalo gratis desde Microsoft Store buscando "App Installer" y reintentá.');
      setRunning(false);
      return;
    }
    addLog(`Instalando ${apps.length} aplicaciones vía winget…`);
    let ok = 0;
    const isOk = (r: { ok: boolean; output: string }) =>
      r.ok || /already installed|ya está instalad|no applicable|no aplicable|reboot|reinici/i.test(r.output);
    const wasAlready = (r: { ok: boolean; output: string }) =>
      /already installed|ya está instalad/i.test(r.output);

    for (let i = 0; i < apps.length; i++) {
      const app = apps[i];
      addLog(`▸ ${app.name}`);
      // --source winget: evita la fuente msstore (falla con --disable-interactivity).
      // --force: instalación forzosa (aunque haya otra versión / chequeos no críticos).
      const cmd = `winget install --id "${app.id}" --exact --source winget --silent --force --accept-package-agreements --accept-source-agreements --disable-interactivity`;
      const userOnly = USER_ONLY.has(app.id);
      // Los paquetes que prohíben admin ni se intentan elevados (fallan o se cuelgan).
      let r = userOnly ? { ok: false, output: "" } : await runPowershell(cmd);
      let viaUser = false;
      // Si falla elevado (o el paquete prohíbe admin), instala DES-ELEVADO.
      if (!isOk(r)) {
        addLog(userOnly ? "  ↪ instalando en modo usuario (este paquete no admite admin)…" : "  ↩ reintentando sin admin (modo usuario)…");
        const d = await runPowershell(deElevatedInstall(app.id));
        if (d.output.includes("GO_OK")) { r = { ok: true, output: "" }; viaUser = true; }
        else r = { ok: false, output: d.output.replace(/GO_FAIL/g, "").trim() || r.output };
      }
      if (isOk(r)) { ok++; addLog(wasAlready(r) ? "  ✓ Ya estaba instalado" : viaUser ? "  ✓ Instalado (modo usuario)" : "  ✓ Instalado"); }
      else addLog(inUse(r.output)
        ? `  ✗ ${app.name} está abierto — cerralo y reintentá`
        : `  ✗ ${errorLine(r.output)}`);
      setProgress((i + 1) / apps.length);
    }
    addLog(`Completado: ${ok}/${apps.length} aplicaciones.`);
    setRunning(false);
    notify("Instalación completada", `${ok}/${apps.length} aplicaciones instaladas.`);
    setDone(`${ok}/${apps.length} aplicaciones instaladas.`);
  };

  const clearDone = () => setDone(null);

  return (
    <InstallerCtx.Provider value={{ running, log, progress, done, install, clearDone }}>
      {children}
    </InstallerCtx.Provider>
  );
}
