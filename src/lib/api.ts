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
  invoke<RunResult>("run_powershell", { script });

export const getStats = () => invoke<Stats>("stats");

export const getSystemInfo = () => invoke<SysInfo>("system_info");

export const ledgerRead = () => invoke<string>("ledger_read");
export const ledgerWrite = (content: string) => invoke<boolean>("ledger_write", { content });

export const startGameWatch = (games: string[]) => invoke("start_game_watch", { games });
export const stopGameWatch = () => invoke("stop_game_watch");

let _streamId = 0;
/** Ejecuta PowerShell con salida en vivo. Llama onLine por cada línea; resuelve al terminar. */
export async function runStream(script: string, onLine: (line: string) => void): Promise<void> {
  const id = `${Date.now()}_${_streamId++}`;
  const unLine = await listen<string>(`ps-line-${id}`, (e) => onLine(e.payload));
  let resolveDone!: () => void;
  const done = new Promise<void>((res) => { resolveDone = res; });
  const unDone = await listen(`ps-done-${id}`, () => resolveDone());
  await invoke("run_powershell_stream", { script, id });
  await done;
  unLine();
  unDone();
}
