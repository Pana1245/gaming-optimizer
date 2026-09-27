import type { RegOp } from "../engineTweaks";
import { runPowershell } from "./api";

const GFX = String.raw`HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers`;
const DWM = String.raw`HKLM:\SOFTWARE\Microsoft\Windows\Dwm`;

// Optimizaciones universales de GPU (cualquier marca). Se aplican por el Motor →
// reversibles desde el Historial. HAGS y Game DVR NO van acá: ya están en
// Optimizaciones → Gaming (antes estaban repetidos en 3 lugares). "Prioridad de GPU"
// se quitó: ponía 8, que ya es el valor por defecto de Windows (placebo).
export const GPU_OPS: RegOp[] = [
  { id: "gpu_tdr", group: "GPU", name: "Evitar cuelgues del driver bajo carga (TDR)", risk: "advanced",
    desc: "Sube TdrDelay a 10s: da más tiempo a la GPU antes de reiniciar el driver. Útil si tenés crasheos 'el driver dejó de responder y se recuperó'.", nameEn: "Prevent driver hangs under load (TDR)", descEn: "Raises TdrDelay to 10s: gives the GPU more time before the driver resets. Useful if you get 'display driver stopped responding and has recovered' crashes.", namePt: "Evitar travamentos do driver sob carga (TDR)", descPt: "Aumenta o TdrDelay para 10s: dá mais tempo à GPU antes de reiniciar o driver. Útil se você tem crashes do tipo 'o driver parou de responder e se recuperou'.",
    key: GFX, prop: "TdrDelay", type: "DWord", value: 10 },
  { id: "gpu_mpo", group: "GPU", name: "Desactivar MPO (arregla parpadeos / stutter)", risk: "advanced",
    desc: "Multi-Plane Overlay causa parpadeos o tirones en algunas GPUs y setups multimonitor. Desactivarlo lo soluciona.", nameEn: "Disable MPO (fixes flicker / stutter)", descEn: "Multi-Plane Overlay causes flicker or stutter on some GPUs and multi-monitor setups. Disabling it fixes that.", namePt: "Desativar MPO (corrige piscadas / stutter)", descPt: "O Multi-Plane Overlay causa piscadas ou travadinhas em algumas GPUs e setups com vários monitores. Desativá-lo resolve.",
    key: DWM, prop: "OverlayTestMode", type: "DWord", value: 5 },
];

export const isNvidia = (gpu: string) => /nvidia|geforce|rtx|gtx|quadro/i.test(gpu);
export const isAmd = (gpu: string) => /amd|radeon|\brx\s?\d|vega|rdna/i.test(gpu);
// Gráficos integrados (en el procesador): AMD Ryzen APU ("Radeon(TM) Graphics", "Vega 8
// Graphics", "780M"), Intel UHD/Iris/HD. Sólo para rotular; las acciones van por marca.
export const isIntegrated = (gpu: string) =>
  /radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|radeon(\(tm\))?\s*\d{3}m\b|intel.*(uhd|iris|hd graphics)/i.test(gpu);

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

// Subclaves del registro (0000, 0001…) de las placas PRESENTES. El registro de la
// clase Display guarda también placas que ya no están (si cambiaste de GPU); sin este
// filtro los scripts escribían en esas "fantasmas" y contaban adaptadores de más.
// Si Get-PnpDevice no está disponible, $present queda vacío y no se filtra.
const PRESENT_PS = String.raw`$present=@(Get-PnpDevice -Class Display -PresentOnly -EA SilentlyContinue | ForEach-Object { (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName 'DEVPKEY_Device_Driver' -EA SilentlyContinue).Data } | Where-Object { $_ } | ForEach-Object { ($_ -split '\\')[-1] })`;

export const NV_MAXPERF = (en: boolean) => String.raw`$base='${NV_CLASS}'; $store='${NV_STORE}'
${PRESENT_PS}
if(!(Test-Path $store)){ New-Item $store -Force | Out-Null }
# Sólo guardamos el estado original si todavía no hay un backup pendiente; así
# aplicar dos veces no pisa los valores originales con los ya optimizados.
$saved=(Get-ItemProperty $store -Name '_NV_saved' -EA SilentlyContinue).'_NV_saved'
$n=0
Get-ChildItem $base -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
  $id=$_.PSChildName; $k=$_.PSPath
  if($present.Count -gt 0 -and $present -notcontains $id){ return }
  $desc=(Get-ItemProperty $k -Name DriverDesc -EA SilentlyContinue).DriverDesc
  if($desc -match 'NVIDIA'){
    if($saved -ne '1'){
      foreach($v in 'PowerMizerEnable','PerfLevelSrc','PowerMizerLevel','PowerMizerLevelAC'){
        $cur=(Get-ItemProperty $k -Name $v -EA SilentlyContinue).$v
        if($null -eq $cur){ Set-ItemProperty $store -Name ($id+'_'+$v) -Value '__ABSENT__' -Force }
        else { Set-ItemProperty $store -Name ($id+'_'+$v) -Value ([string]$cur) -Force }
      }
    }
    Set-ItemProperty $k -Name PowerMizerEnable   -Value 1      -Type DWord -Force -EA SilentlyContinue
    Set-ItemProperty $k -Name PerfLevelSrc       -Value 0x2222 -Type DWord -Force -EA SilentlyContinue
    Set-ItemProperty $k -Name PowerMizerLevel    -Value 1      -Type DWord -Force -EA SilentlyContinue
    Set-ItemProperty $k -Name PowerMizerLevelAC  -Value 1      -Type DWord -Force -EA SilentlyContinue
    # Contar sólo si la escritura realmente tomó efecto (no reportar éxito falso).
    if((Get-ItemProperty $k -Name PowerMizerEnable -EA SilentlyContinue).PowerMizerEnable -eq 1){ $n++ }
  }
}
if($n -gt 0){ Set-ItemProperty $store -Name '_NV_saved' -Value '1' -Force; Write-Output ('${en ? "NVIDIA: maximum performance applied to " : "NVIDIA: maximo rendimiento aplicado a "}'+$n+'${en ? " adapter(s). Restart to take effect." : " adaptador(es). Reinicia para que tome efecto."}') } else { Write-Output '${en ? "No NVIDIA adapter found in the registry." : "No encontre adaptador NVIDIA en el registro."}' }`;

export const NV_RESTORE = (en: boolean) => String.raw`$base='${NV_CLASS}'; $store='${NV_STORE}'
${PRESENT_PS}
# Sin un backup válido no tocamos nada: borrar las propiedades del driver podía
# destruir la configuración legítima del usuario.
$saved=(Get-ItemProperty $store -Name '_NV_saved' -EA SilentlyContinue).'_NV_saved'
if($saved -ne '1'){ Write-Output '${en ? "No valid NVIDIA backup to restore; nothing was changed." : "No hay un backup válido de NVIDIA; no se modificó nada."}'; return }
$n=0
Get-ChildItem $base -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
  $id=$_.PSChildName; $k=$_.PSPath
  if($present.Count -gt 0 -and $present -notcontains $id){ return }
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
${PRESENT_PS}
if(!(Test-Path $store)){ New-Item $store -Force | Out-Null }
$saved=(Get-ItemProperty $store -Name '_AMD_saved' -EA SilentlyContinue).'_AMD_saved'
$n=0
Get-ChildItem $base -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
  $id=$_.PSChildName; $k=$_.PSPath
  if($present.Count -gt 0 -and $present -notcontains $id){ return }
  $desc=(Get-ItemProperty $k -Name DriverDesc -EA SilentlyContinue).DriverDesc
  if($desc -match 'AMD|Radeon'){
    if($saved -ne '1'){
      foreach($v in 'EnableUlps','KMD_FRTEnabled'){
        $cur=(Get-ItemProperty $k -Name $v -EA SilentlyContinue).$v
        if($null -eq $cur){ Set-ItemProperty $store -Name ('AMD_'+$id+'_'+$v) -Value '__ABSENT__' -Force }
        else { Set-ItemProperty $store -Name ('AMD_'+$id+'_'+$v) -Value ([string]$cur) -Force }
      }
    }
    Set-ItemProperty $k -Name EnableUlps     -Value 0 -Type DWord -Force -EA SilentlyContinue
    Set-ItemProperty $k -Name KMD_FRTEnabled -Value 0 -Type DWord -Force -EA SilentlyContinue
    # Contar sólo si la escritura realmente tomó efecto (no reportar éxito falso).
    if((Get-ItemProperty $k -Name EnableUlps -EA SilentlyContinue).EnableUlps -eq 0){ $n++ }
  }
}
if($n -gt 0){ Set-ItemProperty $store -Name '_AMD_saved' -Value '1' -Force; Write-Output ('${en ? "AMD: maximum performance applied to " : "AMD: maximo rendimiento aplicado a "}'+$n+'${en ? " adapter(s). Restart to take effect." : " adaptador(es). Reinicia para que tome efecto."}') } else { Write-Output '${en ? "No AMD/Radeon adapter found in the registry." : "No encontre adaptador AMD/Radeon en el registro."}' }`;

export const AMD_RESTORE = (en: boolean) => String.raw`$base='${NV_CLASS}'; $store='${NV_STORE}'
${PRESENT_PS}
$saved=(Get-ItemProperty $store -Name '_AMD_saved' -EA SilentlyContinue).'_AMD_saved'
if($saved -ne '1'){ Write-Output '${en ? "No valid AMD backup to restore; nothing was changed." : "No hay un backup válido de AMD; no se modificó nada."}'; return }
$n=0
Get-ChildItem $base -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
  $id=$_.PSChildName; $k=$_.PSPath
  if($present.Count -gt 0 -and $present -notcontains $id){ return }
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
