import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface RunResult { ok: boolean; output: string; }
export interface Stats { cpu: number; ram: number; disk: number; }
export interface SysInfo {
  windows: string;
  cpu: string;
  cores: number;
  threads: number;
  ram_gb: number;
  gpu: string;
  win_ver: number;
}

export const runPowershell = (script: string) =>
  invoke<RunResult>("run_powershell", { script }).catch(
    (e) => ({ ok: false, output: `ERROR invoke: ${String(e)}` }) as RunResult,
  );

export const getStats = () => invoke<Stats>("stats");

export const getSystemInfo = () => invoke<SysInfo>("system_info");

export const ledgerRead = () => invoke<string>("ledger_read");
export const ledgerWrite = (content: string) => invoke<boolean>("ledger_write", { content });

// Motor: operaciones de registro nativas (Rust/winreg), sin PowerShell.
export interface RegApplyResult { prior: string; now: string; ok: boolean; }
export const regApply = (key: string, prop: string, kind: string, value: string) =>
  invoke<RegApplyResult>("reg_apply", { key, prop, kind, value });
export const regUndo = (key: string, prop: string, kind: string, prior: string) =>
  invoke<boolean>("reg_undo", { key, prop, kind, prior });

export const startGameWatch = (games: string[]) => invoke("start_game_watch", { games });
export const stopGameWatch = () => invoke("stop_game_watch");

export const clearStandbyRam = (lang: string) => invoke<RunResult>("clear_standby_ram", { lang });

export interface StreamDone { ok: boolean; code: number; }

let _streamId = 0;
/** Ejecuta PowerShell con salida en vivo. Llama onLine por cada línea; resuelve con
 *  el resultado final (ok + código de salida real) al terminar. */
export async function runStream(script: string, onLine: (line: string) => void): Promise<StreamDone> {
  const id = `${Date.now()}_${_streamId++}`;
  const unLine = await listen<string>(`ps-line-${id}`, (e) => onLine(e.payload));
  let resolveDone!: (d: StreamDone) => void;
  const done = new Promise<StreamDone>((res) => { resolveDone = res; });
  const unDone = await listen<StreamDone>(`ps-done-${id}`, (e) => resolveDone(e.payload));
  // finally: si invoke rechaza, igual liberamos los listeners (antes quedaban
  // registrados el resto de la sesión en cada fallo).
  try {
    await invoke("run_powershell_stream", { script, id });
    return await done;
  } finally {
    unLine();
    unDone();
  }
}
