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

// Temp REAL de CPU/GPU vía LibreHardwareMonitorLib (bundleada). Lee los sensores
// por hardware (el driver de kernel lo carga la propia lib; la app corre elevada).
// No se llama Close() a propósito: deja el driver cargado para que las lecturas
// siguientes sean rápidas y no se reinstale el servicio en cada poll. Si falla
// (o no hay admin), cae a nvidia-smi para GPU y N/D para CPU — nunca el valor ACPI.
const TEMP_SCRIPT = (dll: string) => String.raw`$cpu=$null; $gpu=$null
try{
  Add-Type -Path '${dll}' -EA Stop
  $c=New-Object LibreHardwareMonitor.Hardware.Computer
  $c.IsCpuEnabled=$true; $c.IsGpuEnabled=$true
  $c.Open()
  foreach($hw in $c.Hardware){
    $hw.Update()
    $ht=$hw.HardwareType.ToString()
    foreach($s in $hw.Sensors){
      if($s.SensorType -eq [LibreHardwareMonitor.Hardware.SensorType]::Temperature -and $null -ne $s.Value){
        if($ht -like '*Cpu*' -and $s.Name -eq 'CPU Package'){ $cpu=[int][math]::Round([double]$s.Value,0) }
        elseif($ht -like '*Gpu*' -and $null -eq $gpu -and ($s.Name -eq 'GPU Core' -or $s.Name -eq 'GPU Temperature' -or $s.Name -eq 'GPU')){ $gpu=[int][math]::Round([double]$s.Value,0) }
      }
    }
  }
}catch{}
if($null -eq $gpu){ try{ $smi=Get-Command nvidia-smi -EA SilentlyContinue
  if($smi){ $g=& nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader 2>$null | Select-Object -First 1
    if($g -match '^\d+$'){ $gpu=[int]$g } } }catch{} }
if($null -eq $cpu){ $cpu='N' }; if($null -eq $gpu){ $gpu='N' }
Write-Output "CPU=$cpu"; Write-Output "GPU=$gpu"`;

// Ruta de la DLL bundleada (se resuelve una vez y se cachea).
let _dllPath: string | null | undefined;
async function lhmDll(): Promise<string | null> {
  if (_dllPath !== undefined) return _dllPath;
  try {
    const { resolveResource } = await import("@tauri-apps/api/path");
    _dllPath = await resolveResource("resources/LibreHardwareMonitorLib.dll");
  } catch { _dllPath = null; }
  return _dllPath;
}

export async function readTemps(): Promise<Temps> {
  const dll = await lhmDll();
  if (!dll) return { cpu: null, gpu: null };
  const r = await runPowershell(TEMP_SCRIPT(dll));
  const grab = (tag: string): number | null => {
    const m = r.output.match(new RegExp(`${tag}=(-?\\d+)`));
    if (!m) return null;
    const v = parseInt(m[1], 10);
    return v > 0 && v < 120 ? v : null;
  };
  return { cpu: grab("CPU"), gpu: grab("GPU") };
}
