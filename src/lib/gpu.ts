import type { RegOp } from "../engineTweaks";
import { runPowershell } from "./api";

const GFX = String.raw`HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers`;
const GAMES = String.raw`HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games`;
const GAMECFG = String.raw`HKCU:\System\GameConfigStore`;
const DWM = String.raw`HKLM:\SOFTWARE\Microsoft\Windows\Dwm`;

// Optimizaciones universales de GPU (cualquier marca). Se aplican por el Motor →
// reversibles desde el Historial.
export const GPU_OPS: RegOp[] = [
  { id: "gpu_hags", group: "GPU", name: "GPU Scheduling por hardware (HAGS)",
    desc: "Deja que la GPU gestione su planificación: menos latencia y overhead de CPU.",
    key: GFX, prop: "HwSchMode", type: "DWord", value: 2 },
  { id: "gpu_prio", group: "GPU", name: "Prioridad de GPU alta para juegos",
    desc: "Sube la prioridad de GPU de las tareas multimedia/juego.",
    key: GAMES, prop: "GPU Priority", type: "DWord", value: 8 },
  { id: "gpu_dvr", group: "GPU", name: "Desactivar Game DVR",
    desc: "Apaga la grabación en segundo plano de Windows que roba FPS.",
    key: GAMECFG, prop: "GameDVR_Enabled", type: "DWord", value: 0 },
  { id: "gpu_tdr", group: "GPU", name: "Evitar cuelgues del driver bajo carga (TDR)", risk: "advanced",
    desc: "Sube TdrDelay a 10s: da más tiempo a la GPU antes de reiniciar el driver. Útil si tenés crasheos 'el driver dejó de responder y se recuperó'.",
    key: GFX, prop: "TdrDelay", type: "DWord", value: 10 },
  { id: "gpu_mpo", group: "GPU", name: "Desactivar MPO (arregla parpadeos / stutter)", risk: "advanced",
    desc: "Multi-Plane Overlay causa parpadeos o tirones en algunas GPUs y setups multimonitor. Desactivarlo lo soluciona.",
    key: DWM, prop: "OverlayTestMode", type: "DWord", value: 5 },
];

export const isNvidia = (gpu: string) => /nvidia|geforce|rtx|gtx|quadro/i.test(gpu);
export const isAmd = (gpu: string) => /amd|radeon|\brx\s?\d|vega|rdna/i.test(gpu);

// ---- NVIDIA: monitor en vivo (nvidia-smi) -----------------------------------
export interface NvInfo { name: string; temp: number; util: number; clock: number; power: number; memUsed: number; memTotal: number; }

const NV_INFO = String.raw`$smi=Get-Command nvidia-smi -EA SilentlyContinue
if(-not $smi){ Write-Output 'NONV' } else {
  $q=& nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,clocks.gr,power.draw,memory.used,memory.total --format=csv,noheader,nounits 2>$null | Select-Object -First 1
  if($q){ Write-Output $q } else { Write-Output 'NONV' }
}`;

export async function getNvInfo(): Promise<NvInfo | null> {
  const r = await runPowershell(NV_INFO);
  const line = r.output.trim();
  if (!line || line === "NONV") return null;
  const p = line.split(",").map((s) => s.trim());
  if (p.length < 7) return null;
  const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
  return { name: p[0], temp: num(p[1]), util: num(p[2]), clock: num(p[3]), power: num(p[4]), memUsed: num(p[5]), memTotal: num(p[6]) };
}

// ---- NVIDIA: PowerMizer = Preferir máximo rendimiento (evita downclock) ------
const NV_CLASS = String.raw`HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}`;
const NV_STORE = String.raw`HKCU:\Software\GamingOptimizer\GpuPrev`;

export const NV_MAXPERF = (en: boolean) => String.raw`$base='${NV_CLASS}'; $store='${NV_STORE}'
if(!(Test-Path $store)){ New-Item $store -Force | Out-Null }
# Sólo guardamos el estado original si todavía no hay un backup pendiente; así
# aplicar dos veces no pisa los valores originales con los ya optimizados.
$saved=(Get-ItemProperty $store -Name '_NV_saved' -EA SilentlyContinue).'_NV_saved'
$n=0
Get-ChildItem $base -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
  $id=$_.PSChildName; $k=$_.PSPath
  $desc=(Get-ItemProperty $k -Name DriverDesc -EA SilentlyContinue).DriverDesc
  if($desc -match 'NVIDIA'){
    if($saved -ne '1'){
      foreach($v in 'PowerMizerEnable','PerfLevelSrc','PowerMizerLevel','PowerMizerLevelAC'){
        $cur=(Get-ItemProperty $k -Name $v -EA SilentlyContinue).$v
        if($null -eq $cur){ Set-ItemProperty $store -Name ($id+'_'+$v) -Value '__ABSENT__' -Force }
        else { Set-ItemProperty $store -Name ($id+'_'+$v) -Value ([string]$cur) -Force }
      }
    }
    Set-ItemProperty $k -Name PowerMizerEnable   -Value 1      -Type DWord -Force
    Set-ItemProperty $k -Name PerfLevelSrc       -Value 0x2222 -Type DWord -Force
    Set-ItemProperty $k -Name PowerMizerLevel    -Value 1      -Type DWord -Force
    Set-ItemProperty $k -Name PowerMizerLevelAC  -Value 1      -Type DWord -Force
    $n++
  }
}
if($n -gt 0){ Set-ItemProperty $store -Name '_NV_saved' -Value '1' -Force; Write-Output ('${en ? "NVIDIA: maximum performance applied to " : "NVIDIA: maximo rendimiento aplicado a "}'+$n+'${en ? " adapter(s). Restart to take effect." : " adaptador(es). Reinicia para que tome efecto."}') } else { Write-Output '${en ? "No NVIDIA adapter found in the registry." : "No encontre adaptador NVIDIA en el registro."}' }`;

export const NV_RESTORE = (en: boolean) => String.raw`$base='${NV_CLASS}'; $store='${NV_STORE}'
# Sin un backup válido no tocamos nada: borrar las propiedades del driver podía
# destruir la configuración legítima del usuario.
$saved=(Get-ItemProperty $store -Name '_NV_saved' -EA SilentlyContinue).'_NV_saved'
if($saved -ne '1'){ Write-Output '${en ? "No valid NVIDIA backup to restore; nothing was changed." : "No hay un backup valido de NVIDIA; no se modifico nada."}'; return }
$n=0
Get-ChildItem $base -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
  $id=$_.PSChildName; $k=$_.PSPath
  $desc=(Get-ItemProperty $k -Name DriverDesc -EA SilentlyContinue).DriverDesc
  if($desc -match 'NVIDIA'){
    foreach($v in 'PowerMizerEnable','PerfLevelSrc','PowerMizerLevel','PowerMizerLevelAC'){
      $prev=(Get-ItemProperty $store -Name ($id+'_'+$v) -EA SilentlyContinue).($id+'_'+$v)
      if($prev -eq '__ABSENT__'){ Remove-ItemProperty $k -Name $v -Force -EA SilentlyContinue }
      elseif(-not [string]::IsNullOrEmpty($prev)){ Set-ItemProperty $k -Name $v -Value ([int]$prev) -Type DWord -Force }
    }
    $n++
  }
}
Remove-ItemProperty $store -Name '_NV_saved' -Force -EA SilentlyContinue
Write-Output ('${en ? "NVIDIA: driver values restored (" : "NVIDIA: valores del driver restaurados ("}'+$n+'${en ? "). Restart to take effect." : "). Reinicia para que tome efecto."}')`;

// ---- AMD: máximo rendimiento (desactiva ULPS + frame-rate target) -----------
// EnableUlps=0 evita el downclock profundo en reposo; KMD_FRTEnabled=0 quita el
// limitador de FPS por ahorro. Ambos se guardan para poder restaurarlos.
export const AMD_MAXPERF = (en: boolean) => String.raw`$base='${NV_CLASS}'; $store='${NV_STORE}'
if(!(Test-Path $store)){ New-Item $store -Force | Out-Null }
$saved=(Get-ItemProperty $store -Name '_AMD_saved' -EA SilentlyContinue).'_AMD_saved'
$n=0
Get-ChildItem $base -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
  $id=$_.PSChildName; $k=$_.PSPath
  $desc=(Get-ItemProperty $k -Name DriverDesc -EA SilentlyContinue).DriverDesc
  if($desc -match 'AMD|Radeon'){
    if($saved -ne '1'){
      foreach($v in 'EnableUlps','KMD_FRTEnabled'){
        $cur=(Get-ItemProperty $k -Name $v -EA SilentlyContinue).$v
        if($null -eq $cur){ Set-ItemProperty $store -Name ('AMD_'+$id+'_'+$v) -Value '__ABSENT__' -Force }
        else { Set-ItemProperty $store -Name ('AMD_'+$id+'_'+$v) -Value ([string]$cur) -Force }
      }
    }
    Set-ItemProperty $k -Name EnableUlps     -Value 0 -Type DWord -Force
    Set-ItemProperty $k -Name KMD_FRTEnabled -Value 0 -Type DWord -Force
    $n++
  }
}
if($n -gt 0){ Set-ItemProperty $store -Name '_AMD_saved' -Value '1' -Force; Write-Output ('${en ? "AMD: maximum performance applied to " : "AMD: maximo rendimiento aplicado a "}'+$n+'${en ? " adapter(s). Restart to take effect." : " adaptador(es). Reinicia para que tome efecto."}') } else { Write-Output '${en ? "No AMD/Radeon adapter found in the registry." : "No encontre adaptador AMD/Radeon en el registro."}' }`;

export const AMD_RESTORE = (en: boolean) => String.raw`$base='${NV_CLASS}'; $store='${NV_STORE}'
$saved=(Get-ItemProperty $store -Name '_AMD_saved' -EA SilentlyContinue).'_AMD_saved'
if($saved -ne '1'){ Write-Output '${en ? "No valid AMD backup to restore; nothing was changed." : "No hay un backup valido de AMD; no se modifico nada."}'; return }
$n=0
Get-ChildItem $base -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
  $id=$_.PSChildName; $k=$_.PSPath
  $desc=(Get-ItemProperty $k -Name DriverDesc -EA SilentlyContinue).DriverDesc
  if($desc -match 'AMD|Radeon'){
    foreach($v in 'EnableUlps','KMD_FRTEnabled'){
      $prev=(Get-ItemProperty $store -Name ('AMD_'+$id+'_'+$v) -EA SilentlyContinue).('AMD_'+$id+'_'+$v)
      if($prev -eq '__ABSENT__'){ Remove-ItemProperty $k -Name $v -Force -EA SilentlyContinue }
      elseif(-not [string]::IsNullOrEmpty($prev)){ Set-ItemProperty $k -Name $v -Value ([int]$prev) -Type DWord -Force }
    }
    $n++
  }
}
Remove-ItemProperty $store -Name '_AMD_saved' -Force -EA SilentlyContinue
Write-Output ('${en ? "AMD: driver values restored (" : "AMD: valores del driver restaurados ("}'+$n+'${en ? "). Restart to take effect." : "). Reinicia para que tome efecto."}')`;
