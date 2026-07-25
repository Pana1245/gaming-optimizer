import { runPowershell } from "./api";
import { ENGINE_TWEAKS } from "../engineTweaks";

// ---- Puntaje de optimización: lee el estado real del registro y lo compara ----
export interface ScoreResult { applied: number; total: number; pct: number; missing: string[]; }

const SCORE_TWEAKS = ENGINE_TWEAKS.filter((t) => t.group === "Gaming" || t.group === "Privacidad");

export async function readScore(): Promise<ScoreResult> {
  const checks = SCORE_TWEAKS
    .map((t, i) => `$v${i}=(Get-ItemProperty '${t.key}' -Name '${t.prop}' -EA SilentlyContinue).'${t.prop}'; if("$v${i}" -eq '${t.value}'){ Write-Output '${t.id}=1' } else { Write-Output '${t.id}=0' }`)
    .join("\n");
  const r = await runPowershell(checks);
  const state: Record<string, boolean> = {};
  for (const line of r.output.split("\n")) {
    const m = line.trim().match(/^(\S+)=([01])$/);
    if (m) state[m[1]] = m[2] === "1";
  }
  const applied = SCORE_TWEAKS.filter((t) => state[t.id]).length;
  const missing = SCORE_TWEAKS.filter((t) => !state[t.id]).map((t) => t.name);
  const total = SCORE_TWEAKS.length;
  return { applied, total, pct: total ? Math.round((applied / total) * 100) : 0, missing };
}

// ---- Temperaturas CPU/GPU (mejor esfuerzo: depende del hardware/driver) ------
export interface Temps { cpu: number | null; gpu: number | null; }

const TEMP_SCRIPT = String.raw`$cpu=$null; $gpu=$null
try{ $t=Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -EA SilentlyContinue | Select-Object -First 1
  if($t){ $cpu=[math]::Round(($t.CurrentTemperature/10)-273.15,0) } }catch{}
try{ $smi=Get-Command nvidia-smi -EA SilentlyContinue
  if($smi){ $g=& nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader 2>$null | Select-Object -First 1
    if($g -match '^\d+$'){ $gpu=[int]$g } } }catch{}
if($null -eq $cpu){ $cpu='N' }; if($null -eq $gpu){ $gpu='N' }
Write-Output "CPU=$cpu"; Write-Output "GPU=$gpu"`;

export async function readTemps(): Promise<Temps> {
  const r = await runPowershell(TEMP_SCRIPT);
  const grab = (tag: string): number | null => {
    const m = r.output.match(new RegExp(`${tag}=(-?\\d+)`));
    if (!m) return null;
    const v = parseInt(m[1], 10);
    return v > 0 && v < 120 ? v : null;
  };
  return { cpu: grab("CPU"), gpu: grab("GPU") };
}
