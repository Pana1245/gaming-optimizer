// Permisos de C:\OptimizacionBackup. Restaurar importa esos .reg (y hosts.bak, state.json)
// como administrador: si heredan los permisos de C:\ ("Usuarios autentificados" puede
// modificar), cualquier programa sin admin podía alterar un respaldo y escribir lo que
// quisiera en HKLM. Quedan como ProgramData\GamingOptimizer: dueño Administradores,
// SYSTEM/Administradores control total, Usuarios sólo lectura, sin herencia.
// No se siguen junctions ni enlaces: si la carpeta misma fuera uno, se quita el enlace
// (sólo el enlace) para que la app no cambie permisos ni escriba en otro lado.
export const SECURE_BACKUP_ROOT = String.raw`$broot="$env:SystemDrive\OptimizacionBackup"
$bi=Get-Item -LiteralPath $broot -Force -EA SilentlyContinue
if($bi -and ($bi.Attributes -band [IO.FileAttributes]::ReparsePoint)){ [IO.Directory]::Delete($broot,$false); $bi=$null }
if(-not $bi){ New-Item -ItemType Directory -Path $broot -Force | Out-Null }
$dsd='O:BAD:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)'
$fsd='O:BAD:PAI(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x1200a9;;;BU)'
function Lock-GoBackup($p){
  $it=Get-Item -LiteralPath $p -Force -EA SilentlyContinue
  if(-not $it -or ($it.Attributes -band [IO.FileAttributes]::ReparsePoint)){ return }
  try{
    $a=if($it.PSIsContainer){ New-Object Security.AccessControl.DirectorySecurity } else { New-Object Security.AccessControl.FileSecurity }
    $a.SetSecurityDescriptorSddlForm($(if($it.PSIsContainer){ $dsd } else { $fsd }))
    Set-Acl -LiteralPath $it.FullName -AclObject $a
  }catch{}
  if($it.PSIsContainer){ foreach($c in @(Get-ChildItem -LiteralPath $p -Force -EA SilentlyContinue)){ Lock-GoBackup $c.FullName } }
}
Lock-GoBackup $broot`;
