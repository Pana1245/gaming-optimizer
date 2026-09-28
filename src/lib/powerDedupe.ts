import { runPowershell } from "./api";

// Limpieza única de planes de energía duplicados. Versiones viejas creaban una copia
// NUEVA de "Máximo rendimiento" (Ultimate Performance) cada vez que se aplicaba el
// tweak — y en Windows en otros idiomas, en cada uso. Se deja una sola: la activa
// (o la de Gaming Optimizer) y se borran las demás copias INACTIVAS por GUID. Nunca
// toca los planes de fábrica ni planes de otros programas (Bitsum, etc.).
const DEDUPE = String.raw`$rx = '([0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})'
# powercfg escribe en la página de códigos OEM: se lee con esa para que los acentos lleguen bien.
$prevEnc = [Console]::OutputEncoding
try { [Console]::OutputEncoding = [Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage) } catch {}
$list = powercfg /list 2>$null
$act = powercfg /getactivescheme 2>$null
[Console]::OutputEncoding = $prevEnc
$builtin = @('381b4222-f694-41f0-9685-ff5bb260df2e','8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c','a1841308-3541-4fab-bc81-f71556f20b4a','e9a42b02-d5df-448d-aa00-03f14749eb61')
$active = if ("$act" -match $rx) { $matches[1].ToLower() } else { '' }
$ult = @(); $ours = ''
foreach ($l in $list) {
  if ($l -match $rx) {
    $g = $matches[1].ToLower()
    if ($builtin -notcontains $g -and $l -match 'Gaming Optimizer|Ultimate Performance|M.ximo rendimiento|Desempenho M.ximo|Ultimative Leistung|Performances optimales') {
      $ult += $g
      if (-not $ours -and $l -match 'Gaming Optimizer') { $ours = $g }
    }
  }
}
if ($ult.Count -lt 2) { Write-Output 'PPDEDUPE=0'; exit 0 }
$keep = if ($ult -contains $active) { $active } elseif ($ours) { $ours } else { $ult[0] }
$n = 0
foreach ($g in $ult) {
  if ($g -ne $keep -and $g -ne $active) { powercfg /delete $g 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $n++ } }
}
Write-Output ("PPDEDUPE=" + $n)`;

const FLAG = "powerDedupe1";

/** Corre una sola vez por instalación (si falla, se reintenta en el próximo arranque). */
export async function dedupePowerPlansOnce(): Promise<void> {
  try { if (localStorage.getItem(FLAG)) return; } catch { return; }
  const r = await runPowershell(DEDUPE).catch(() => null);
  if (r?.ok && /PPDEDUPE=\d+/.test(r.output)) {
    try { localStorage.setItem(FLAG, "1"); } catch { /* sin storage: se reintenta */ }
  }
}
