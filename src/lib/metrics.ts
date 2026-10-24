import { runPowershell } from "./api";
import { ENGINE_TWEAKS } from "../engineTweaks";
import { PS_QUOTES } from "./psQuote";

// ---- Puntaje de optimización: lee el estado real del registro y lo compara ----
export interface ScoreResult { applied: number; total: number; pct: number; missing: { name: string; nameEn?: string; namePt?: string }[]; }

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
  const missing = SCORE_TWEAKS.filter((t) => !state[t.id]).map((t) => ({ name: t.name, nameEn: t.nameEn, namePt: t.namePt }));
  const total = SCORE_TWEAKS.length;
  return { applied, total, pct: total ? Math.round((applied / total) * 100) : 0, missing };
}

// ---- Temperaturas CPU/GPU (mejor esfuerzo: depende del hardware/driver) ------
// pawn: ¿está instalado el driver PawnIO? Sin él la CPU no tiene temperatura (N/D).
export interface Temps { cpu: number | null; gpu: number | null; pawn: boolean; }

// Temp REAL de CPU/GPU vía LibreHardwareMonitorLib 0.9.6 (bundleada en resources/lhm).
// Las versiones ≤0.9.4 instalaban el driver WinRing0 (vulnerable, CVE-2020-14979: Defender
// lo marca y los anti-cheat como Vanguard lo rechazan). La 0.9.6 usa PawnIO (firmado) sólo
// si YA está instalado: la app no instala drivers. La GPU no necesita driver (NVAPI/ADL).
// Si no hay sensor, cae a nvidia-smi para GPU y N/D para CPU — nunca el valor ACPI.
// CPU: Intel informa "CPU Package"; AMD Ryzen NO tiene ese sensor ("Core (Tctl/Tdie)",
// "Core (Tdie)", "Core (Tctl)" o "Package"): se toma el primero que exista.
const TEMP_SCRIPT = (dll: string) => String.raw`$cpu=$null; $gpu=$null
$cpuNames=@('CPU Package','Core (Tctl/Tdie)','Core (Tdie)','Core (Tctl)','Package','Tdie','Tctl')
$cpuRank=99
$lhmDir=Split-Path '${dll.replace(PS_QUOTES, "$&$&")}'
# Dependencias (System.Memory, HidSharp…) desde la misma carpeta, sin importar la versión pedida.
$null=[AppDomain]::CurrentDomain.add_AssemblyResolve({ param($s,$e)
  $p=Join-Path $lhmDir ((New-Object Reflection.AssemblyName($e.Name)).Name + '.dll')
  if(Test-Path -LiteralPath $p){ [Reflection.Assembly]::LoadFrom($p) } else { $null } })
try{
  Add-Type -Path '${dll.replace(PS_QUOTES, "$&$&")}' -EA Stop
  $c=New-Object LibreHardwareMonitor.Hardware.Computer
  $c.IsCpuEnabled=$true; $c.IsGpuEnabled=$true
  $c.Open()
  foreach($hw in $c.Hardware){
    $hw.Update()
    $ht=$hw.HardwareType.ToString()
    foreach($s in $hw.Sensors){
      if($s.SensorType -eq [LibreHardwareMonitor.Hardware.SensorType]::Temperature -and $null -ne $s.Value){
        $ci=[array]::IndexOf($cpuNames,[string]$s.Name)
        if($ht -like '*Cpu*' -and $ci -ge 0 -and $ci -lt $cpuRank){ $cpuRank=$ci; $cpu=[int][math]::Round([double]$s.Value,0) }
        elseif($ht -like '*Gpu*' -and $null -eq $gpu -and ($s.Name -eq 'GPU Core' -or $s.Name -eq 'GPU Temperature' -or $s.Name -eq 'GPU')){ $gpu=[int][math]::Round([double]$s.Value,0) }
      }
    }
  }
  $c.Close()
}catch{}
$pawn=[int][bool](Get-Service -Name 'PawnIO' -EA SilentlyContinue)
if($null -eq $gpu){ try{ $smi=Get-Command nvidia-smi -EA SilentlyContinue
  if($smi){ $g=& nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader 2>$null | Select-Object -First 1
    if($g -match '^\d+$'){ $gpu=[int]$g } } }catch{} }
if($null -eq $cpu){ $cpu='N' }; if($null -eq $gpu){ $gpu='N' }
Write-Output "CPU=$cpu"; Write-Output "GPU=$gpu"; Write-Output "PAWN=$pawn"`;

// Ruta de la DLL bundleada (se resuelve una vez y se cachea).
let _dllPath: string | null | undefined;
async function lhmDll(): Promise<string | null> {
  if (_dllPath !== undefined) return _dllPath;
  try {
    const { resolveResource } = await import("@tauri-apps/api/path");
    _dllPath = await resolveResource("resources/lhm/LibreHardwareMonitorLib.dll");
  } catch { _dllPath = null; }
  return _dllPath;
}

export async function readTemps(): Promise<Temps> {
  const dll = await lhmDll();
  if (!dll) return { cpu: null, gpu: null, pawn: false };
  const r = await runPowershell(TEMP_SCRIPT(dll));
  const grab = (tag: string): number | null => {
    const m = r.output.match(new RegExp(`${tag}=(-?\\d+)`));
    if (!m) return null;
    const v = parseInt(m[1], 10);
    return v > 0 && v < 120 ? v : null;
  };
  return { cpu: grab("CPU"), gpu: grab("GPU"), pawn: /PAWN=1/.test(r.output) };
}
