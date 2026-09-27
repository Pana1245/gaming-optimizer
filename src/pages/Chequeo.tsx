import { useState } from "react";
import { motion } from "framer-motion";
import { HudTitle } from "../components/NeonCard";
import { runPowershell } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { CATEGORIES } from "../catalog";
import { ENGINE_TWEAKS } from "../engineTweaks";
import { applyOp, loadLedger, saveLedger } from "../lib/engine";

// Chequeo de PC: busca problemas REALES que le quitan rendimiento (monitor a menos Hz
// de los que soporta, RAM sin XMP o en single channel, disco lleno/HDD/gastado,
// driver viejo, plan de energía de ahorro…) y ofrece el arreglo o la sección.
// No cambia nada por su cuenta: cada arreglo es un botón.

// Monitores: frecuencia actual vs la máxima que ofrece a la MISMA resolución, y cambio.
const DISP_CS = String.raw`Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public class GoDisp {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra; public int dmFields;
    public int dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency,
      dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct DISPLAY_DEVICE {
    public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString; public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceKey;
  }
  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern bool EnumDisplayDevices(string dev, int i, ref DISPLAY_DEVICE dd, int flags);
  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern int ChangeDisplaySettingsEx(string dev, ref DEVMODE dm, IntPtr hwnd, int flags, IntPtr lp);
  public static List<string> List() {
    var o = new List<string>();
    for (int i = 0; ; i++) {
      var d = new DISPLAY_DEVICE(); d.cb = Marshal.SizeOf(d);
      if (!EnumDisplayDevices(null, i, ref d, 0)) break;
      if ((d.StateFlags & 1) == 0) continue;
      var cur = new DEVMODE(); cur.dmSize = (short)Marshal.SizeOf(cur);
      if (!EnumDisplaySettings(d.DeviceName, -1, ref cur)) continue;
      int max = cur.dmDisplayFrequency;
      var m = new DEVMODE(); m.dmSize = (short)Marshal.SizeOf(m);
      for (int k = 0; EnumDisplaySettings(d.DeviceName, k, ref m); k++)
        if (m.dmPelsWidth == cur.dmPelsWidth && m.dmPelsHeight == cur.dmPelsHeight && m.dmDisplayFrequency > max) max = m.dmDisplayFrequency;
      var mon = new DISPLAY_DEVICE(); mon.cb = Marshal.SizeOf(mon);
      string name = EnumDisplayDevices(d.DeviceName, 0, ref mon, 0) ? mon.DeviceString : "";
      o.Add(d.DeviceName + "|" + name + "|" + cur.dmPelsWidth + "x" + cur.dmPelsHeight + "|" + cur.dmDisplayFrequency + "|" + max);
    }
    return o;
  }
  // Misma resolución, otra frecuencia; CDS_UPDATEREGISTRY para que quede guardado. 0 = OK.
  public static int SetHz(string dev, int hz) {
    var cur = new DEVMODE(); cur.dmSize = (short)Marshal.SizeOf(cur);
    if (!EnumDisplaySettings(dev, -1, ref cur)) return -99;
    cur.dmDisplayFrequency = hz; cur.dmFields = 0x400000;
    return ChangeDisplaySettingsEx(dev, ref cur, IntPtr.Zero, 1, IntPtr.Zero);
  }
}
'@`;

const SCAN = DISP_CS + "\n" + String.raw`$o = [ordered]@{}
$o.displays = @(foreach ($l in [GoDisp]::List()) { $p = $l -split '\|'; [ordered]@{ dev=$p[0]; name=$p[1]; res=$p[2]; hz=[int]$p[3]; max=[int]$p[4] } })
$mods = @(Get-CimInstance Win32_PhysicalMemory -EA SilentlyContinue)
$o.ram = [ordered]@{
  modules = $mods.Count
  slots = [int]((Get-CimInstance Win32_PhysicalMemoryArray -EA SilentlyContinue | Measure-Object MemoryDevices -Sum).Sum)
  speed = [int](($mods | Measure-Object Speed -Maximum).Maximum)
  configured = [int](($mods | Measure-Object ConfiguredClockSpeed -Minimum).Minimum)
  type = [int](($mods | Select-Object -First 1).SMBIOSMemoryType)
  parts = @($mods | ForEach-Object { "$($_.PartNumber)".Trim() })
  gb = [math]::Round((($mods | Measure-Object Capacity -Sum).Sum) / 1GB)
}
$sysLetter = $env:SystemDrive.TrimEnd(':')
$part = Get-Partition -DriveLetter $sysLetter -EA SilentlyContinue
$pd = if ($part) { Get-PhysicalDisk -EA SilentlyContinue | Where-Object DeviceId -eq "$($part.DiskNumber)" } else { $null }
$rel = if ($pd) { $pd | Get-StorageReliabilityCounter -EA SilentlyContinue } else { $null }
$ld = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($env:SystemDrive)'" -EA SilentlyContinue
$o.disk = [ordered]@{
  drive = $env:SystemDrive; model = "$($pd.FriendlyName)"; media = "$($pd.MediaType)"; health = "$($pd.HealthStatus)"
  wear = if ($rel -and $rel.Wear -ne $null) { [int]$rel.Wear } else { -1 }
  temp = if ($rel -and $rel.Temperature) { [int]$rel.Temperature } else { -1 }
  freeGb = if ($ld) { [math]::Round($ld.FreeSpace / 1GB, 1) } else { -1 }
  sizeGb = if ($ld) { [math]::Round($ld.Size / 1GB, 1) } else { -1 }
}
$o.gpus = @(Get-CimInstance Win32_VideoController -EA SilentlyContinue | Where-Object { "$($_.PNPDeviceID)" -like 'PCI*' } | ForEach-Object {
  [ordered]@{ name = "$($_.Name)"; version = "$($_.DriverVersion)"; days = if ($_.DriverDate) { [int]((Get-Date) - $_.DriverDate).TotalDays } else { -1 } } })
# powercfg escribe en la página de códigos OEM de la consola: se lee con esa y se vuelve a UTF-8.
$prevEnc = [Console]::OutputEncoding
try { [Console]::OutputEncoding = [Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage) } catch {}
$ap = powercfg /getactivescheme 2>$null
[Console]::OutputEncoding = $prevEnc
$o.power = [ordered]@{
  guid = if ("$ap" -match '([0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})') { $matches[1].ToLower() } else { '' }
  name = if ("$ap" -match '\((.+)\)\s*$') { $matches[1] } else { '' } }
$gm = (Get-ItemProperty 'HKCU:\Software\Microsoft\GameBar' -Name AutoGameModeEnabled -EA SilentlyContinue).AutoGameModeEnabled
$o.gameMode = if ($gm -eq $null) { 1 } else { [int]$gm }
$o.rebootPending = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending')
$cs = Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue
$o.pagefile = [ordered]@{ auto = [bool]$cs.AutomaticManagedPagefile; count = @(Get-CimInstance Win32_PageFileUsage -EA SilentlyContinue).Count }
$on = 0
foreach ($pair in @(@('HKCU:\Software\Microsoft\Windows\CurrentVersion\Run','HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'),
                    @('HKLM:\Software\Microsoft\Windows\CurrentVersion\Run','HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'))) {
  $run = Get-ItemProperty $pair[0] -EA SilentlyContinue; $apr = Get-ItemProperty $pair[1] -EA SilentlyContinue
  if ($run) { foreach ($n in ($run.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' }).Name) {
    $st = if ($apr) { $apr.$n } else { $null }
    if (-not $st -or ($st[0] -band 1) -eq 0) { $on++ } } }
}
$o.startupOn = $on
$o | ConvertTo-Json -Compress -Depth 4`;

const PAGEFILE_ON = String.raw`$cs = Get-CimInstance Win32_ComputerSystem
Set-CimInstance -InputObject $cs -Property @{ AutomaticManagedPagefile = $true } -ErrorAction Stop
Write-Output OK`;

interface Scan {
  displays: { dev: string; name: string; res: string; hz: number; max: number }[];
  ram: { modules: number; slots: number; speed: number; configured: number; type: number; parts: string[]; gb: number };
  disk: { drive: string; model: string; media: string; health: string; wear: number; temp: number; freeGb: number; sizeGb: number };
  gpus: { name: string; version: string; days: number }[];
  power: { guid: string; name: string };
  gameMode: number; rebootPending: boolean;
  pagefile: { auto: boolean; count: number };
  startupOn: number;
}
type Status = "bad" | "warn" | "info" | "ok";
interface Item {
  id: string; status: Status; title: string; detail: string;
  fix?: { label: string; run: () => Promise<boolean> };
  nav?: string;
}

// Velocidad nominal del kit a partir del número de parte (si el SPD sólo informa
// la velocidad base JEDEC). Ej: CMK16GX4M2B3200C16 → 3200, F4-3600C16 → 3600,
// Kingston Fury KF432C16 → 3200, KF556C40 → 5600.
const SPEEDS = [2133, 2400, 2666, 2800, 2933, 3000, 3200, 3333, 3466, 3600, 3733, 3800, 4000, 4133, 4266, 4400, 4600, 4800, 5200, 5600, 6000, 6200, 6400, 6800, 7200, 7600, 8000];
const ratedFromPart = (p: string) => {
  const s = p.toUpperCase();
  const k = s.match(/^KF[45](\d{2})C/);
  if (k) return +k[1] * 100;
  for (const m of s.matchAll(/\d{4}/g)) if (SPEEDS.includes(+m[0])) return +m[0];
  return 0;
};

const BALANCED = "381b4222-f694-41f0-9685-ff5bb260df2e";
const SAVER = "a1841308-3541-4fab-bc81-f71556f20b4a";
const POWER_SCRIPT = CATEGORIES.flatMap((c) => c.tweaks).find((tw) => tw.name === "Plan de energía: Máximo rendimiento")?.script ?? "";
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

const STATUS: Record<Status, { color: string; icon: string }> = {
  bad: { color: "#ff5470", icon: "✗" },
  warn: { color: "#ffd24a", icon: "!" },
  info: { color: "#3b9eff", icon: "i" },
  ok: { color: "#00e676", icon: "✓" },
};
const ORDER: Status[] = ["bad", "warn", "info", "ok"];

export default function Chequeo({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { t } = useI18n();
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [fixState, setFixState] = useState<Record<string, "run" | "ok" | "fail">>({});

  const run = async () => {
    setBusy(true); setErr(false); setFixState({});
    try {
      const r = await runPowershell(SCAN);
      setScan(JSON.parse(r.output.trim().split("\n").pop() || ""));
    } catch { setErr(true); }
    setBusy(false);
  };

  const items: Item[] = [];
  if (scan) {
    // Monitores
    for (const d of scan.displays) {
      const v = { hz: d.hz, max: d.max, name: d.name || "Monitor", res: d.res };
      // El aviso sale siempre; el botón sólo si el nombre de dispositivo es el esperado
      // (se inserta en el script, así que se valida antes).
      if (d.max > d.hz + 5)
        items.push({ id: `mon-${d.dev}`, status: "bad", title: fill(t("hc.mon.bad.t"), v), detail: fill(t("hc.mon.bad.d"), v),
          fix: /^\\\\\.\\DISPLAY\d+$/.test(d.dev)
            ? { label: fill(t("hc.mon.fix"), v), run: async () => /^0\s*$/.test((await runPowershell(`${DISP_CS}\n[GoDisp]::SetHz('${d.dev}', ${d.max})`)).output.trim().split("\n").pop() || "") }
            : undefined });
      else items.push({ id: `mon-${d.dev}`, status: "ok", title: fill(t("hc.mon.ok.t"), v), detail: fill(t("hc.mon.ok.d"), v) });
    }
    // RAM: velocidad
    const ram = scan.ram;
    if (ram.configured > 0) {
      const rated = Math.max(ram.speed, ...ram.parts.map(ratedFromPart));
      const v = { cfg: ram.configured, rated };
      const ddr4 = ram.type === 26, ddr5 = ram.type === 34;
      if (rated > ram.configured + 100) items.push({ id: "ram-xmp", status: "bad", title: fill(t("hc.ram.xmp.t"), v), detail: t("hc.ram.xmp.d") });
      else if ((ddr4 && ram.configured < 3000) || (ddr5 && ram.configured < 5200)) items.push({ id: "ram-xmp", status: "info", title: fill(t("hc.ram.maybe.t"), v), detail: t("hc.ram.maybe.d") });
      else items.push({ id: "ram-xmp", status: "ok", title: fill(t("hc.ram.ok.t"), v), detail: t("hc.ram.ok.d") });
    }
    // RAM: canales y cantidad
    if (ram.modules === 1 && ram.slots > 1) items.push({ id: "ram-ch", status: "warn", title: t("hc.ch.single.t"), detail: t("hc.ch.single.d") });
    else if (ram.modules >= 2) items.push({ id: "ram-ch", status: "ok", title: fill(t("hc.ch.ok.t"), { n: ram.modules, gb: ram.gb }), detail: t("hc.ch.ok.d") });
    if (ram.gb > 0 && ram.gb < 16) items.push({ id: "ram-gb", status: ram.gb < 8 ? "warn" : "info", title: fill(t("hc.ram.low.t"), { gb: ram.gb }), detail: t("hc.ram.low.d") });
    // Disco
    const dk = scan.disk, dv = { drive: dk.drive, model: dk.model || dk.drive, free: dk.freeGb, size: dk.sizeGb, wear: dk.wear, temp: dk.temp, health: dk.health };
    let diskIssue = false;
    if (dk.health && dk.health !== "Healthy") { diskIssue = true; items.push({ id: "disk-h", status: "bad", title: fill(t("hc.disk.health.t"), dv), detail: t("hc.disk.health.d") }); }
    if (dk.media === "HDD") { diskIssue = true; items.push({ id: "disk-hdd", status: "warn", title: t("hc.disk.hdd.t"), detail: t("hc.disk.hdd.d") }); }
    if (dk.wear >= 80) { diskIssue = true; items.push({ id: "disk-w", status: "warn", title: fill(t("hc.disk.wear.t"), dv), detail: t("hc.disk.wear.d") }); }
    if (dk.temp >= 70) { diskIssue = true; items.push({ id: "disk-t", status: "warn", title: fill(t("hc.disk.hot.t"), dv), detail: t("hc.disk.hot.d") }); }
    if (dk.freeGb >= 0 && (dk.freeGb < 15 || dk.freeGb < dk.sizeGb * 0.1)) { diskIssue = true; items.push({ id: "disk-f", status: "warn", title: fill(t("hc.disk.space.t"), dv), detail: t("hc.disk.space.d"), nav: "clean" }); }
    if (!diskIssue && dk.freeGb >= 0) items.push({ id: "disk", status: "ok", title: fill(t("hc.disk.ok.t"), dv), detail: fill(t("hc.disk.ok.d"), dv) });
    // Driver de video
    for (const g of scan.gpus) {
      if (g.days < 0) continue;
      const v = { name: g.name, version: g.version, months: Math.floor(g.days / 30) };
      items.push(g.days > 180
        ? { id: `gpu-${g.name}`, status: "warn", title: fill(t("hc.gpu.old.t"), v), detail: fill(t("hc.gpu.old.d"), v) }
        : { id: `gpu-${g.name}`, status: "ok", title: t("hc.gpu.ok.t"), detail: fill(t("hc.gpu.ok.d"), v) });
    }
    // Plan de energía
    const pv = { name: scan.power.name || "—" };
    if ((scan.power.guid === BALANCED || scan.power.guid === SAVER) && POWER_SCRIPT)
      items.push({ id: "power", status: "warn", title: fill(t("hc.pow.bad.t"), pv), detail: t("hc.pow.bad.d"),
        fix: { label: t("hc.pow.fix"), run: async () => (await runPowershell(POWER_SCRIPT)).ok } });
    else if (scan.power.guid) items.push({ id: "power", status: "ok", title: fill(t("hc.pow.ok.t"), pv), detail: t("hc.pow.ok.d") });
    // Modo de juego (por el Motor: queda en el Historial, reversible)
    const gmOp = ENGINE_TWEAKS.find((o) => o.id === "gamemode");
    if (scan.gameMode === 0 && gmOp)
      items.push({ id: "gm", status: "warn", title: t("hc.gm.bad.t"), detail: t("hc.gm.bad.d"),
        fix: { label: t("hc.fixOn"), run: async () => { const l = await loadLedger(); const e = await applyOp(gmOp); l.push(e); await saveLedger(l); return e.verified; } } });
    else items.push({ id: "gm", status: "ok", title: t("hc.gm.ok.t"), detail: t("hc.gm.ok.d") });
    // Reinicio pendiente
    if (scan.rebootPending) items.push({ id: "reboot", status: "info", title: t("hc.reboot.t"), detail: t("hc.reboot.d") });
    // Memoria virtual
    if (!scan.pagefile.auto && scan.pagefile.count === 0)
      items.push({ id: "pf", status: "bad", title: t("hc.pf.bad.t"), detail: t("hc.pf.bad.d"),
        fix: { label: t("hc.fixOn"), run: async () => /OK/.test((await runPowershell(PAGEFILE_ON)).output) } });
    else items.push({ id: "pf", status: "ok", title: t("hc.pf.ok.t"), detail: t("hc.pf.ok.d") });
    // Inicio
    items.push(scan.startupOn > 10
      ? { id: "startup", status: "warn", title: fill(t("hc.st.many.t"), { n: scan.startupOn }), detail: t("hc.st.many.d"), nav: "startup" }
      : { id: "startup", status: "ok", title: fill(t("hc.st.ok.t"), { n: scan.startupOn }), detail: t("hc.st.ok.d") });
    items.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  }
  const count = (s: Status) => items.filter((i) => i.status === s).length;

  const doFix = async (it: Item) => {
    if (!it.fix) return;
    setFixState((f) => ({ ...f, [it.id]: "run" }));
    let ok = false;
    try { ok = await it.fix.run(); } catch { ok = false; }
    setFixState((f) => ({ ...f, [it.id]: ok ? "ok" : "fail" }));
  };

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.health" />

      <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
        <div className="text-[13px] text-text-mute">
          {scan ? (
            <span className="flex items-center gap-3">
              {count("bad") + count("warn") === 0
                ? <span className="text-accent">{t("hc.allGood")}</span>
                : <>
                    <span style={{ color: STATUS.bad.color }}>{count("bad")} {t("hc.nBad")}</span>
                    <span style={{ color: STATUS.warn.color }}>{count("warn")} {t("hc.nWarn")}</span>
                  </>}
              <span style={{ color: STATUS.ok.color }}>{count("ok")} {t("hc.nOk")}</span>
            </span>
          ) : t("hc.intro")}
        </div>
        <button onClick={run} disabled={busy} className="btn btn-primary shrink-0">
          {busy ? t("hc.scanning") : scan ? t("hc.again") : t("hc.run")}
        </button>
      </div>

      {err && <p className="text-[13px] text-[#ff5470] mb-3">{t("hc.err")}</p>}

      <div className="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2">
        {busy && !scan && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-text-mute text-[13px]">
            <motion.div className="w-12 h-12 rounded-full border-2 border-accent/30 border-t-accent"
              animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} />
            {t("hc.scanning")}
          </div>
        )}
        <div className={`space-y-2 transition-opacity ${busy ? "opacity-50" : ""}`}>
          {items.map((it, i) => {
            const st = STATUS[it.status];
            const fs = fixState[it.id];
            return (
              <motion.div key={it.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="flex items-start gap-3.5 rounded-xl border px-4 py-3.5"
                style={{ borderColor: it.status === "ok" ? "#1c1c1f" : `${st.color}40`, background: it.status === "ok" ? "rgba(255,255,255,0.012)" : `${st.color}0a` }}>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 mt-0.5"
                  style={{ background: `${st.color}22`, color: st.color, boxShadow: `inset 0 0 0 1px ${st.color}55` }}>{st.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className={`text-[14px] font-medium ${it.status === "ok" ? "text-text-dim" : "text-text"}`}>{it.title}</div>
                  {it.detail && <div className="text-[12.5px] text-text-mute mt-0.5 leading-relaxed">{it.detail}</div>}
                  {fs === "fail" && <div className="text-[12px] text-[#ff5470] mt-1">{t("hc.fixFail")}</div>}
                </div>
                {it.fix && (
                  fs === "ok"
                    ? <span className="text-[12.5px] text-accent shrink-0 mt-1">{t("hc.fixed")}</span>
                    : <button onClick={() => doFix(it)} disabled={fs === "run"} className="btn btn-primary shrink-0">
                        {fs === "run" ? t("hc.fixing") : it.fix.label}
                      </button>
                )}
                {it.nav && (
                  <button onClick={() => onNavigate(it.nav!)} className="btn btn-ghost shrink-0">{t("hc.goTo")} {t(`nav.${it.nav}`)} →</button>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
