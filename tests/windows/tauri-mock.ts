// Reemplazo de las APIs de Tauri para correr el código de la app en Node, sobre un Windows
// real (prueba de fuego en GitHub Actions). Los comandos del backend que usan los scripts
// se ejecutan COMO LOS EJECUTA src-tauri/src/lib.rs: powershell.exe oculto, con
// -EncodedCommand (UTF-16LE en base64) y el mismo preámbulo de UTF-8.
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

// ── Eventos (listen / emit) ──────────────────────────────────────────────────
type Event<T> = { event: string; id: number; payload: T };
type Handler = (e: Event<unknown>) => void;
const handlers = new Map<string, Set<Handler>>();
export type UnlistenFn = () => void;
export async function listen<T>(event: string, cb: (e: Event<T>) => void): Promise<UnlistenFn> {
  let set = handlers.get(event);
  if (!set) handlers.set(event, (set = new Set()));
  const h = cb as Handler;
  set.add(h);
  return () => { set!.delete(h); };
}
export function emit(event: string, payload?: unknown) {
  handlers.get(event)?.forEach((cb) => cb({ event, id: 0, payload }));
}

// ── PowerShell, igual que el backend ────────────────────────────────────────
const PRE = "$ProgressPreference='SilentlyContinue';\ntry{[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)}catch{}\n";
export const encodeScript = (script: string) => Buffer.from(PRE + script, "utf16le").toString("base64");

// stderr acumulado desde la última consulta: la prueba lo informa como aviso.
let stderrBuf = "";
export const takeStderr = () => { const s = stderrBuf.trim(); stderrBuf = ""; return s; };

export interface PsResult { ok: boolean; output: string; code: number; stderr: string }

const killTree = (pid: number) => { spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { windowsHide: true }); };

export function runPs(script: string, timeoutSecs = 600, onLine?: (l: string) => void): Promise<PsResult> {
  return new Promise((resolve) => {
    let child;
    try {
      // Sin el PSModulePath del PowerShell 7 que lanza la prueba en GitHub (con él, Windows
      // PowerShell no encuentra cmdlets como Get-FileHash): igual que la app abierta desde el Explorador.
      const env = { ...process.env };
      delete env.PSModulePath;
      child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodeScript(script)], { windowsHide: true, env });
    } catch (e) {
      resolve({ ok: false, output: String(e), code: -1, stderr: String(e) });
      return;
    }
    const out: Buffer[] = [], err: Buffer[] = [];
    let pending = "";
    child.stdout.on("data", (b: Buffer) => {
      out.push(b);
      if (onLine) {
        pending += b.toString("utf8");
        const parts = pending.split(/\r\n|\r|\n/);
        pending = parts.pop() ?? "";
        parts.forEach((l) => l.trim() && onLine(l.trimEnd()));
      }
    });
    child.stderr.on("data", (b: Buffer) => err.push(b));
    const timer = setTimeout(() => { if (child.pid) killTree(child.pid); }, timeoutSecs * 1000);
    child.on("error", (e) => { clearTimeout(timer); resolve({ ok: false, output: String(e), code: -1, stderr: String(e) }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (onLine && pending.trim()) onLine(pending.trimEnd());
      const stdout = Buffer.concat(out).toString("utf8").trim();
      const stderr = Buffer.concat(err).toString("utf8").trim();
      if (stderr && !stderr.includes("CLIXML")) stderrBuf += stderr + "\n";
      const c = code ?? -1;
      // Igual que lib.rs: si falló, se agrega stderr a la salida.
      const output = c !== 0 && stderr && !stderr.includes("CLIXML") ? `${stdout}\n${stderr}`.trim() : stdout;
      resolve({ ok: c === 0, output, code: c, stderr });
    });
  });
}

// ── invoke() ─────────────────────────────────────────────────────────────────
let ledger = "[]";
const REPO = path.resolve(process.env.GO_REPO ?? ".");
const ALLOWED_HOSTS = ["www.asus.com", "gfwsl.geforce.com", "www.nvidia.com"];

export async function invoke<T = unknown>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  switch (cmd) {
    case "run_powershell": {
      const r = await runPs(String(args.script), Number(args.timeoutSecs ?? 600));
      return { ok: r.ok, output: r.output } as T;
    }
    case "run_powershell_stream": {
      const id = String(args.id);
      runPs(String(args.script), 1800, (l) => emit(`ps-line-${id}`, l)).then((r) => emit(`ps-done-${id}`, { ok: r.ok, code: r.code }));
      return undefined as T;
    }
    case "system_info": {
      const build = Number(os.release().split(".")[2] ?? 0);
      return { windows: os.version(), cpu: os.cpus()[0]?.model ?? "", cores: os.cpus().length, threads: os.cpus().length,
        ram_gb: Math.round(os.totalmem() / 1073741824), gpu: "", gpus: [], win_ver: build >= 22000 ? 11 : 10 } as T;
    }
    case "drivers_fetch": {
      const url = new URL(String(args.url));
      if (url.protocol !== "https:" || !ALLOWED_HOSTS.includes(url.host)) throw new Error(`host no permitido: ${url.host}`);
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GamingOptimizer" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.text()) as T;
    }
    case "ledger_read": return ledger as T;
    case "ledger_write": ledger = String(args.content); return true as T;
    case "stats": return { cpu: 0, ram: 0, disk: 0 } as T;
    case "clear_standby_ram": return { ok: true, output: "(prueba: no se libera RAM)" } as T;
    case "open_url": return undefined as T;
    default: throw new Error(`prueba: comando de backend no simulado: ${cmd}`);
  }
}

// ── Otras APIs/plugins que importa la app (no hacen falta en la prueba) ─────
export const resolveResource = async (p: string) => path.join(REPO, "src-tauri", p);
export const getVersion = async () => "prueba";
export const getCurrentWindow = () => ({ minimize: async () => {}, toggleMaximize: async () => {}, close: async () => {} });
export const isPermissionGranted = async () => false;
export const requestPermission = async () => "denied";
export const sendNotification = (n: { title: string; body?: string }) => { void n; };
export const exit = async (code = 0) => { void code; };
export const relaunch = async () => {};
export const check = async () => null;
export type Update = never;
