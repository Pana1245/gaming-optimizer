import { runPowershell } from "./api";

// ---- Control de Windows Update ----------------------------------------------
const AU = String.raw`HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU`;
const UX = String.raw`HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings`;

export const WU_STATUS = String.raw`$svc=Get-Service wuauserv -EA SilentlyContinue
$start=if($svc){[string]$svc.StartType}else{'?'}
$pol=(Get-ItemProperty '${AU}' -Name NoAutoUpdate -EA SilentlyContinue).NoAutoUpdate
$pause=(Get-ItemProperty '${UX}' -Name PauseUpdatesExpiryTime -EA SilentlyContinue).PauseUpdatesExpiryTime
if($start -eq 'Disabled' -or $pol -eq 1){ Write-Output 'STATE=disabled' }
elseif($pause){ try{ $d=[datetime]::Parse($pause); if($d -gt (Get-Date)){ Write-Output ('STATE=paused|'+$d.ToString('yyyy-MM-dd')) } else { Write-Output 'STATE=active' } }catch{ Write-Output 'STATE=active' } }
else { Write-Output 'STATE=active' }`;

export const WU_DISABLE = String.raw`Set-Service wuauserv -StartupType Disabled -EA SilentlyContinue
Stop-Service wuauserv -Force -EA SilentlyContinue
if(!(Test-Path '${AU}')){ New-Item '${AU}' -Force | Out-Null }
Set-ItemProperty '${AU}' -Name NoAutoUpdate -Value 1 -Type DWord -Force
Set-ItemProperty '${AU}' -Name AUOptions -Value 1 -Type DWord -Force
Write-Output 'Windows Update desactivado'`;

export const WU_ENABLE = String.raw`Set-Service wuauserv -StartupType Manual -EA SilentlyContinue
Remove-ItemProperty '${AU}' -Name NoAutoUpdate -Force -EA SilentlyContinue
Remove-ItemProperty '${AU}' -Name AUOptions -Force -EA SilentlyContinue
'PauseUpdatesExpiryTime','PauseFeatureUpdatesStartTime','PauseFeatureUpdatesEndTime','PauseQualityUpdatesStartTime','PauseQualityUpdatesEndTime' | ForEach-Object { Remove-ItemProperty '${UX}' -Name $_ -Force -EA SilentlyContinue }
Start-Service wuauserv -EA SilentlyContinue
Write-Output 'Windows Update reactivado'`;

export const WU_PAUSE = String.raw`if(!(Test-Path '${UX}')){ New-Item '${UX}' -Force | Out-Null }
$now=(Get-Date).ToUniversalTime(); $end=$now.AddDays(35); $f='yyyy-MM-ddTHH:mm:ssZ'
Set-ItemProperty '${UX}' -Name PauseUpdatesExpiryTime -Value $end.ToString($f) -Force
Set-ItemProperty '${UX}' -Name PauseFeatureUpdatesStartTime -Value $now.ToString($f) -Force
Set-ItemProperty '${UX}' -Name PauseFeatureUpdatesEndTime -Value $end.ToString($f) -Force
Set-ItemProperty '${UX}' -Name PauseQualityUpdatesStartTime -Value $now.ToString($f) -Force
Set-ItemProperty '${UX}' -Name PauseQualityUpdatesEndTime -Value $end.ToString($f) -Force
Write-Output ('Updates pausados hasta ' + $end.ToString('yyyy-MM-dd'))`;

export async function getWuStatus(): Promise<{ state: "active" | "paused" | "disabled"; until?: string }> {
  const r = await runPowershell(WU_STATUS);
  const m = r.output.match(/STATE=(\w+)(?:\|(.+))?/);
  if (!m) return { state: "active" };
  return { state: m[1] as "active" | "paused" | "disabled", until: m[2]?.trim() };
}

// ---- Desbloquear archivo: qué proceso lo está usando (Restart Manager) -------
export interface Locker { pid: number; name: string; }

const rmWho = (path: string) => String.raw`Add-Type -ErrorAction SilentlyContinue @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class RmLock {
  [StructLayout(LayoutKind.Sequential)]
  struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }
  const int CCH_RM_MAX_APP_NAME = 255;
  const int CCH_RM_MAX_SVC_NAME = 63;
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=CCH_RM_MAX_APP_NAME+1)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=CCH_RM_MAX_SVC_NAME+1)] public string strServiceShortName;
    public uint ApplicationType; public uint AppStatus; public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
  }
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmStartSession(out uint h, int flags, string key);
  [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint h);
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmRegisterResources(uint h, uint nf, string[] files, uint na, RM_UNIQUE_PROCESS[] apps, uint ns, string[] svc);
  [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint h, out uint need, ref uint count, [In,Out] RM_PROCESS_INFO[] info, ref uint reasons);
  public static List<int> Who(string path){
    var pids=new List<int>(); uint h; string key=Guid.NewGuid().ToString();
    if(RmStartSession(out h,0,key)!=0) return pids;
    try{
      string[] res=new string[]{path};
      if(RmRegisterResources(h,(uint)res.Length,res,0,null,0,null)!=0) return pids;
      uint need=0,count=0,reasons=0;
      int r=RmGetList(h,out need,ref count,null,ref reasons);
      if(r==234){ var info=new RM_PROCESS_INFO[need]; count=need; if(RmGetList(h,out need,ref count,info,ref reasons)==0){ for(int i=0;i<count;i++) pids.Add(info[i].Process.dwProcessId); } }
    } finally { RmEndSession(h); }
    return pids;
  }
}
'@
$path='${path.replace(/'/g, "''")}'
if(-not (Test-Path $path)){ Write-Output 'NOEXIST' } else {
  $pids=[RmLock]::Who($path)
  $out=foreach($id in $pids){ try{ $p=Get-Process -Id $id -EA Stop; [pscustomobject]@{pid=$id;name=$p.ProcessName} }catch{ [pscustomobject]@{pid=$id;name='(sistema)'} } }
  $arr=@($out)
  if($arr.Count -eq 0){ Write-Output 'NONE' } else { $j=$arr|ConvertTo-Json -Compress; if($j[0] -ne '['){ $j="[$j]" }; Write-Output $j }
}`;

export async function whoLocks(path: string): Promise<{ status: "ok" | "none" | "noexist"; lockers: Locker[] }> {
  const r = await runPowershell(rmWho(path));
  const out = r.output.trim();
  if (out === "NOEXIST") return { status: "noexist", lockers: [] };
  if (out === "NONE") return { status: "none", lockers: [] };
  try {
    const arr = JSON.parse(out) as Locker[];
    return { status: "ok", lockers: Array.isArray(arr) ? arr : [] };
  } catch {
    return { status: "none", lockers: [] };
  }
}

export const killProc = (pid: number) =>
  runPowershell(`Stop-Process -Id ${pid} -Force -EA SilentlyContinue; Write-Output OK`);
