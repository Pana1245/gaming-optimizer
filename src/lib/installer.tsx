import { createContext, useContext, useState, type ReactNode } from "react";
import { runPowershell, runStream } from "./api";
import { WINGET_SETUP } from "./wingetSetup";
import { waitTask } from "./shell";
import { notify } from "./notify";
import { useI18n } from "./i18n";

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
  $t0 = Get-Date
  Start-ScheduledTask -TaskName $tn
${waitTask(300)}
} catch { Unregister-ScheduledTask -TaskName $tn -Confirm:$false -EA SilentlyContinue; Write-Output ('GO_FAIL ' + $_.Exception.Message); exit }
Unregister-ScheduledTask -TaskName $tn -Confirm:$false -EA SilentlyContinue
$rc   = if (Test-Path $code) { (Get-Content $code -Raw).Trim() } else { '' }
$otxt = if (Test-Path $out)  { (Get-Content $out -Raw) } else { '' }
Remove-Item $out, $code -Force -EA SilentlyContinue
if ($rc -eq '0' -or $otxt -match 'already installed|ya está instalad') { Write-Output 'GO_OK' }
else { Write-Output ('GO_FAIL ' + (($otxt -replace '\s+', ' ').Trim())) }`;

export function InstallerProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const { t } = useI18n();
  const [log, setLog] = useState<string[]>(() => [t("inst.ready")]);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  const addLog = (s: string) => setLog((l) => [...l, s]);

  // Corre en el provider (nunca se desmonta) → la instalación NO se corta ni pierde
  // el progreso aunque el usuario cambie de sección.
  // Instala winget mostrando el avance. El porcentaje de descarga reemplaza la última
  // línea (en vez de sumar diez líneas por archivo).
  const setupWinget = async (): Promise<boolean> => {
    addLog(t("inst.wg.start"));
    let ok = false;
    await runStream(WINGET_SETUP, (raw) => {
      const line = raw.trim();
      const dl = line.match(/^@dl:(\w+):(\d+)$/);
      if (dl) {
        const msg = `  ${t(`inst.wg.what.${dl[1]}`)}: ${dl[2]}%`;
        setLog((l) => (l.length && l[l.length - 1].startsWith(`  ${t(`inst.wg.what.${dl[1]}`)}:`) ? [...l.slice(0, -1), msg] : [...l, msg]));
        return;
      }
      const step = line.match(/^@step:(\w+)$/);
      if (step) return addLog(t(`inst.wg.${step[1]}`));
      const err = line.match(/^@err:(\w+)$/);
      if (err) return addLog(t(`inst.wg.err.${err[1]}`));
      if (line.startsWith("@detail:")) return addLog(`  ${line.slice(8)}`);
      if (line === "@ok") { ok = true; addLog(t("inst.wg.ok")); }
    }).catch(() => {});
    return ok;
  };

  const install = async (apps: InstallApp[]) => {
    if (running || apps.length === 0) return;
    setRunning(true);
    setProgress(0);
    setDone(null);
    setLog([t("inst.ready")]);

    // En un Windows recién instalado App Installer está pero winget todavía no se
    // registró (Windows lo hace en segundo plano tras el primer inicio de sesión).
    // Se fuerza el registro con el comando que documenta Microsoft y se reintenta.
    const wingetOk = await runPowershell(`if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  try { Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe -ErrorAction Stop } catch {}
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
if (Get-Command winget -ErrorAction SilentlyContinue) { "OK" } else { "NO" }`);
    // No está App Installer: se instala desde el release oficial de Microsoft (verificado por SHA256).
    if (!/OK/.test(wingetOk.output) && !(await setupWinget())) {
      addLog(t("inst.noWinget2"));
      setRunning(false);
      return;
    }
    addLog(t("inst.installingN").replace("{n}", String(apps.length)));
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
        addLog(userOnly ? t("inst.userMode") : t("inst.retryUser"));
        const d = await runPowershell(deElevatedInstall(app.id));
        if (d.output.includes("GO_OK")) { r = { ok: true, output: "" }; viaUser = true; }
        else r = { ok: false, output: d.output.replace(/GO_FAIL/g, "").trim() || r.output };
      }
      if (isOk(r)) { ok++; addLog(wasAlready(r) ? t("inst.already") : viaUser ? t("inst.okUser") : t("inst.ok")); }
      else addLog(inUse(r.output)
        ? t("inst.inUse").replace("{name}", app.name)
        : `  ✗ ${errorLine(r.output)}`);
      setProgress((i + 1) / apps.length);
    }
    const sum = (k: string) => t(k).replace("{ok}", String(ok)).replace("{total}", String(apps.length));
    addLog(sum("inst.completed"));
    setRunning(false);
    notify(t("inst.notifyTitle"), sum("inst.summary"));
    setDone(sum("inst.summary"));
  };

  const clearDone = () => setDone(null);

  return (
    <InstallerCtx.Provider value={{ running, log, progress, done, install, clearDone }}>
      {children}
    </InstallerCtx.Provider>
  );
}
