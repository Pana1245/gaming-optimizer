import { runPowershell } from "./api";

// Hasta la v2.5.1 las temperaturas se leían con LibreHardwareMonitor 0.9.3, que instalaba el
// driver WinRing0 (vulnerable, CVE-2020-14979) copiado como powershell.sys con el servicio
// R0powershell, y nunca lo quitaba. Se quita una vez: sólo ESE servicio y sólo si el .sys
// está firmado por el autor de WinRing0 (otros programas pueden usar su propia copia).
const CLEAN = String.raw`$n=0; $left=0
foreach($d in @(Get-CimInstance Win32_SystemDriver -EA SilentlyContinue | Where-Object { $_.Name -eq 'R0powershell' -or $_.PathName -match '\\WindowsPowerShell\\v1\.0\\powershell\.sys$' })){
  $p=($d.PathName -replace '^\\\?\?\\','')
  $sig=if(Test-Path -LiteralPath $p){ Get-AuthenticodeSignature -LiteralPath $p } else { $null }
  if($sig -and "$($sig.SignerCertificate.Subject)" -notmatch 'MIYAZAKI'){ continue }
  sc.exe stop $d.Name 2>$null | Out-Null; sc.exe delete $d.Name 2>$null | Out-Null
  if(Test-Path -LiteralPath $p){ Remove-Item -LiteralPath $p -Force -EA SilentlyContinue }
  if((Get-Service -Name $d.Name -EA SilentlyContinue) -or (Test-Path -LiteralPath $p)){ $left++ } else { $n++ }
}
Write-Output ("WR0=" + $n + ";LEFT=" + $left)`;

const FLAG = "winring0Clean1";

/** Una vez por instalación; si el driver sigue cargado (se borra al reiniciar), se reintenta. */
export async function removeWinRing0Once(): Promise<void> {
  try { if (localStorage.getItem(FLAG)) return; } catch { return; }
  const r = await runPowershell(CLEAN).catch(() => null);
  if (r?.ok && /WR0=\d+;LEFT=0/.test(r.output)) {
    try { localStorage.setItem(FLAG, "1"); } catch { /* sin storage: se reintenta */ }
  }
}
