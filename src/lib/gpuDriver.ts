// Optimización del driver de video en 1 clic: los mismos ajustes que se cambian a mano en
// el Panel de control de NVIDIA o en AMD Software (Adrenalin), sin abrirlos.
// - NVIDIA: NVAPI DRS (la API oficial del driver; la misma que usa NVIDIA Profile
//   Inspector) sobre el perfil global. IDs de funciones y ajustes tomados del SDK
//   público de NVIDIA (github.com/NVIDIA/nvapi, MIT).
// - AMD: ADLX (SDK oficial de AMD, viene con Adrenalin; github.com/GPUOpen-LibrariesAndSDKs/ADLX,
//   MIT). Sirve para placas dedicadas e integradas (Ryzen con gráficos Radeon).
// El código nativo corre en un PowerShell aparte (C# vía Add-Type): si un driver raro
// falla, se cae ese proceso y no la app. Antes de cambiar nada se guarda el valor que
// había (HKCU\Software\GamingOptimizer\GpuPrev) para "Restaurar como estaba".
import { runPowershell } from "./api";
import { NV_RESTORE, AMD_RESTORE } from "./gpu";

export type Vendor = "nvidia" | "amd";

/** Ajustes de NVIDIA: [clave, ID de NVAPI DRS, valor recomendado]. */
export const NV_SETTINGS = [
  { key: "pstate", id: 0x1057eb71, want: 1 },          // Modo de energía: Preferir máximo rendimiento
  { key: "lowlat", id: 0x007ba09e, want: 1 },          // Modo de baja latencia: Activado (1 cuadro)
  { key: "texq", id: 0x00ce2691, want: 20 },           // Filtrado de texturas - calidad: Alto rendimiento
  { key: "shader", id: 0x00ac8497, want: 4294967295 }, // Tamaño de caché de sombreadores: Ilimitado
] as const;

/** Ajustes de AMD (Gráficos globales de Adrenalin) y su valor recomendado. */
export const AMD_SETTINGS = [
  { key: "antilag", want: 1 }, // Radeon Anti-Lag: activado
  { key: "chill", want: 0 },   // Radeon Chill (limita FPS): desactivado
  { key: "boost", want: 0 },   // Radeon Boost (baja la resolución en movimiento): desactivado
  { key: "esync", want: 0 },   // Enhanced Sync (puede dar tirones): desactivado
  { key: "frtc", want: 0 },    // Frame Rate Target Control (límite de FPS): desactivado
  { key: "vsync", want: 1 },   // Esperar actualización vertical: desactivado, salvo que el juego lo pida
] as const;

const STORE = String.raw`HKCU:\Software\GamingOptimizer\GpuPrev`;

// C# 5 (el compilador que trae Windows PowerShell 5.1): sin $"", ?. ni out var.
// Cada script lleva sólo el código de su marca y sin comentarios ni sangría: la línea de
// comandos de Windows tiene un límite (~32 KB) y el script va codificado en UTF-16.
const slim = (cs: string) => cs.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//")).join("\n");
const addType = (cs: string) => `Add-Type -TypeDefinition @'\n${slim(cs)}\n'@`;

const NV_CS = addType(String.raw`using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class GoNv {
  [DllImport("nvapi64.dll", EntryPoint = "nvapi_QueryInterface", CallingConvention = CallingConvention.Cdecl)]
  static extern IntPtr QI(uint id);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FInit();
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FSessOut(out IntPtr h);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FSess(IntPtr s);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FProf(IntPtr s, out IntPtr p);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FGet(IntPtr s, IntPtr p, uint id, IntPtr st);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FSet(IntPtr s, IntPtr p, IntPtr st);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FId(IntPtr s, IntPtr p, uint id);
  // NVDRS_SETTING_V1 (pack 4): version, nombre (2048 x u16), id, tipo, origen, 2 flags y
  // dos uniones de 4100 bytes (valor predefinido y actual). Total 12320 bytes.
  const int SZ = 12320, OFS_ID = 4100, OFS_TYPE = 4104, OFS_LOC = 4108, OFS_CUR = 8220;
  static IntPtr sess = IntPtr.Zero, prof = IntPtr.Zero;
  static Delegate F(uint id, Type t) {
    IntPtr p = QI(id);
    if (p == IntPtr.Zero) throw new Exception("qi " + id.ToString("x8"));
    return Marshal.GetDelegateForFunctionPointer(p, t);
  }
  static IntPtr NewSetting() {
    IntPtr b = Marshal.AllocHGlobal(SZ);
    Marshal.Copy(new byte[SZ], 0, b, SZ);
    Marshal.WriteInt32(b, 0, SZ | (1 << 16));
    return b;
  }
  public static string Open() {
    try {
      int r = ((FInit)F(0x0150e828, typeof(FInit)))();
      if (r == -6 || r == -2) return "nonv";
      if (r != 0) return "init " + r;
      r = ((FSessOut)F(0x0694d52e, typeof(FSessOut)))(out sess); if (r != 0) return "session " + r;
      r = ((FSess)F(0x375dbd6b, typeof(FSess)))(sess); if (r != 0) return "load " + r;
      r = ((FProf)F(0xda8466a0, typeof(FProf)))(sess, out prof); if (r != 0) return "profile " + r;
      return "";
    } catch (DllNotFoundException) { return "nonv"; }
    catch (Exception e) { return e.Message; }
  }
  // "v=<valor>;loc=<origen>" (origen 0 = puesto en el perfil global), "nf" si no está o "e=<código>".
  public static string Get(uint id) {
    IntPtr b = NewSetting();
    try {
      int r = ((FGet)F(0x73bf8338, typeof(FGet)))(sess, prof, id, b);
      if (r == -160) return "nf";
      if (r != 0) return "e=" + r;
      return "v=" + ((uint)Marshal.ReadInt32(b, OFS_CUR)).ToString() + ";loc=" + Marshal.ReadInt32(b, OFS_LOC);
    } finally { Marshal.FreeHGlobal(b); }
  }
  public static int Set(uint id, uint v) {
    IntPtr b = NewSetting();
    try {
      Marshal.WriteInt32(b, OFS_ID, unchecked((int)id));
      Marshal.WriteInt32(b, OFS_TYPE, 0);
      Marshal.WriteInt32(b, OFS_CUR, unchecked((int)v));
      return ((FSet)F(0x577dd202, typeof(FSet)))(sess, prof, b);
    } finally { Marshal.FreeHGlobal(b); }
  }
  // Vuelve al valor de fábrica (si no tiene uno predefinido, se borra del perfil).
  public static int Def(uint id) {
    int r = ((FId)F(0x53f0381e, typeof(FId)))(sess, prof, id);
    if (r != 0) r = ((FId)F(0xe4a26362, typeof(FId)))(sess, prof, id);
    return r == -160 ? 0 : r;
  }
  public static int Save() { return ((FSess)F(0xfcbc7e14, typeof(FSess)))(sess); }
  public static void Close() {
    if (sess == IntPtr.Zero) return;
    try { ((FSess)F(0xdad9cff8, typeof(FSess)))(sess); } catch { }
    sess = IntPtr.Zero;
  }
}
`);

const AMD_CS = addType(String.raw`using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class GoAmd {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr LoadLibraryW(string n);
  [DllImport("kernel32.dll", CharSet = CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr h, string n);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FVer(out ulong v);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FInit(ulong v, out IntPtr sys);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FTerm();
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int MOutPtr(IntPtr self, out IntPtr o);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int MGpuOutPtr(IntPtr self, IntPtr gpu, out IntPtr o);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate uint MUint(IntPtr self);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int MUintOutPtr(IntPtr self, uint i, out IntPtr o);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int MOutByte(IntPtr self, out byte v);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int MByte(IntPtr self, byte v);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int MOutInt(IntPtr self, out int v);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int MInt(IntPtr self, int v);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int MRel(IntPtr self);
  static IntPtr dll = IntPtr.Zero, sys = IntPtr.Zero, s3d = IntPtr.Zero, list = IntPtr.Zero;
  static List<IntPtr> gpus = new List<IntPtr>();
  // Método i de la tabla virtual del objeto ADLX (el objeto empieza con el puntero a la tabla).
  static Delegate M(IntPtr obj, int i, Type t) {
    IntPtr vt = Marshal.ReadIntPtr(obj);
    return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(vt, i * IntPtr.Size), t);
  }
  static void Rel(IntPtr obj) { if (obj != IntPtr.Zero) ((MRel)M(obj, 1, typeof(MRel)))(obj); }
  public static string Open() {
    try {
      dll = LoadLibraryW("amdadlx64.dll");
      if (dll == IntPtr.Zero) return "noadlx";
      IntPtr pv = GetProcAddress(dll, "ADLXQueryFullVersion"), pi = GetProcAddress(dll, "ADLXInitialize");
      if (pv == IntPtr.Zero || pi == IntPtr.Zero) return "noadlx";
      ulong ver;
      int r = ((FVer)Marshal.GetDelegateForFunctionPointer(pv, typeof(FVer)))(out ver);
      if (r != 0) return "version " + r;
      r = ((FInit)Marshal.GetDelegateForFunctionPointer(pi, typeof(FInit)))(ver, out sys);
      if (r != 0 && r != 2) return "init " + r;
      // IADLXSystem: 1 = GetGPUs, 7 = Get3DSettingsServices (no tiene Acquire/Release).
      r = ((MOutPtr)M(sys, 1, typeof(MOutPtr)))(sys, out list); if (r != 0) return "gpus " + r;
      r = ((MOutPtr)M(sys, 7, typeof(MOutPtr)))(sys, out s3d); if (r != 0) return "3d " + r;
      // IADLXGPUList: 3 = Size, 11 = At_GPUList.
      uint n = ((MUint)M(list, 3, typeof(MUint)))(list);
      for (uint i = 0; i < n; i++) {
        IntPtr g;
        if (((MUintOutPtr)M(list, 11, typeof(MUintOutPtr)))(list, i, out g) == 0 && g != IntPtr.Zero) gpus.Add(g);
      }
      return "";
    } catch (Exception e) { return e.Message; }
  }
  // "índice|id único|tipo (1 integrada, 2 dedicada)|nombre". IADLXGPU: 5 = Type, 7 = Name, 18 = UniqueId.
  public static string[] Gpus() {
    List<string> o = new List<string>();
    for (int i = 0; i < gpus.Count; i++) {
      IntPtr g = gpus[i], pn; int type, uid;
      string name = ((MOutPtr)M(g, 7, typeof(MOutPtr)))(g, out pn) == 0 && pn != IntPtr.Zero ? Marshal.PtrToStringAnsi(pn) : "AMD";
      if (((MOutInt)M(g, 5, typeof(MOutInt)))(g, out type) != 0) type = 0;
      if (((MOutInt)M(g, 18, typeof(MOutInt)))(g, out uid) != 0) uid = i;
      o.Add(i + "|" + uid + "|" + type + "|" + name);
    }
    return o.ToArray();
  }
  // Por ajuste: método de IADLX3DSettingsServices que lo devuelve y, en esa interfaz,
  // los métodos para leer y cambiar (todas: 3 = IsSupported). "int" = modo, no sí/no.
  static int[] Map(string f) {
    switch (f) {
      case "antilag": return new int[] { 3, 4, 5, 0 };
      case "chill": return new int[] { 4, 4, 8, 0 };
      case "boost": return new int[] { 5, 4, 7, 0 };
      case "esync": return new int[] { 7, 4, 5, 0 };
      case "vsync": return new int[] { 8, 5, 6, 1 };
      case "frtc": return new int[] { 9, 4, 7, 0 };
    }
    throw new Exception("ajuste " + f);
  }
  static IntPtr Feat(int gi, int[] m) {
    IntPtr f;
    int r = ((MGpuOutPtr)M(s3d, m[0], typeof(MGpuOutPtr)))(s3d, gpus[gi], out f);
    if (r != 0 || f == IntPtr.Zero) return IntPtr.Zero;
    byte sup;
    if (((MOutByte)M(f, 3, typeof(MOutByte)))(f, out sup) != 0 || sup == 0) { Rel(f); return IntPtr.Zero; }
    return f;
  }
  // Valor actual, o "na" si esa placa no tiene el ajuste.
  public static string Get(int gi, string feat) {
    int[] m = Map(feat);
    IntPtr f = Feat(gi, m);
    if (f == IntPtr.Zero) return "na";
    try {
      if (m[3] == 1) { int v; return ((MOutInt)M(f, m[1], typeof(MOutInt)))(f, out v) == 0 ? v.ToString() : "na"; }
      byte b; return ((MOutByte)M(f, m[1], typeof(MOutByte)))(f, out b) == 0 ? (b != 0 ? "1" : "0") : "na";
    } finally { Rel(f); }
  }
  public static int Set(int gi, string feat, int v) {
    int[] m = Map(feat);
    IntPtr f = Feat(gi, m);
    if (f == IntPtr.Zero) return -1;
    try {
      int r = m[3] == 1 ? ((MInt)M(f, m[2], typeof(MInt)))(f, v) : ((MByte)M(f, m[2], typeof(MByte)))(f, (byte)(v != 0 ? 1 : 0));
      return r == 1 ? 0 : r; // 1 = ADLX_ALREADY_ENABLED
    } finally { Rel(f); }
  }
  public static void Close() {
    try {
      foreach (IntPtr g in gpus) Rel(g);
      gpus.Clear(); Rel(s3d); Rel(list); s3d = IntPtr.Zero; list = IntPtr.Zero;
      IntPtr pt = dll == IntPtr.Zero ? IntPtr.Zero : GetProcAddress(dll, "ADLXTerminate");
      if (pt != IntPtr.Zero) ((FTerm)Marshal.GetDelegateForFunctionPointer(pt, typeof(FTerm)))();
    } catch { }
  }
}
`);

const psArr = (xs: readonly (string | number)[]) => `@(${xs.map((x) => (typeof x === "number" ? String(x) : `'${x}'`)).join(",")})`;

/** Lee (status), aplica lo recomendado (apply) o vuelve a como estaba (restore).
 *  Siempre termina con una línea JSON del estado final. */
export const nvScript = (mode: "status" | "apply" | "restore") => String.raw`$store='${STORE}'
${NV_CS}
$keys=${psArr(NV_SETTINGS.map((s) => s.key))}; $ids=[uint32[]]${psArr(NV_SETTINGS.map((s) => s.id))}; $want=[uint32[]]${psArr(NV_SETTINGS.map((s) => s.want))}
$res=[ordered]@{ vendor='nvidia'; reason=''; done=0; total=0; action='${mode}'; backup=$false; items=@() }
$o=if('GoNv' -as [type]){ [GoNv]::Open() } else { 'compile' }
if($o){ $res.reason=$o } else {
  $saved=(Get-ItemProperty $store -Name '_NVDRS_saved' -EA SilentlyContinue).'_NVDRS_saved' -eq '1'
  if('${mode}' -eq 'apply'){
    if(-not $saved){
      if(!(Test-Path $store)){ New-Item $store -Force | Out-Null }
      for($i=0; $i -lt $ids.Count; $i++){
        $g=[GoNv]::Get($ids[$i])
        $prev=if($g -match '^v=(\d+);loc=0$'){ $Matches[1] } else { '__DEFAULT__' }
        Set-ItemProperty $store -Name ('NVDRS_' + $keys[$i]) -Value $prev -Force
      }
      Set-ItemProperty $store -Name '_NVDRS_saved' -Value '1' -Force
    }
    for($i=0; $i -lt $ids.Count; $i++){ $res.total++; if([GoNv]::Set($ids[$i], $want[$i]) -eq 0){ $res.done++ } }
    $sv=[GoNv]::Save(); if($sv -ne 0){ $res.reason='save ' + $sv }
  } elseif('${mode}' -eq 'restore'){
    if(-not $saved){ $res.reason='nobackup' } else {
      for($i=0; $i -lt $ids.Count; $i++){
        $prev=(Get-ItemProperty $store -Name ('NVDRS_' + $keys[$i]) -EA SilentlyContinue).('NVDRS_' + $keys[$i])
        $res.total++
        $r=if($prev -match '^\d+$'){ [GoNv]::Set($ids[$i], [uint32]$prev) } else { [GoNv]::Def($ids[$i]) }
        if($r -eq 0){ $res.done++ }
      }
      $sv=[GoNv]::Save()
      if($sv -ne 0){ $res.reason='save ' + $sv } else {
        foreach($k in $keys){ Remove-ItemProperty $store -Name ('NVDRS_' + $k) -Force -EA SilentlyContinue }
        Remove-ItemProperty $store -Name '_NVDRS_saved' -Force -EA SilentlyContinue
      }
    }
  }
  for($i=0; $i -lt $ids.Count; $i++){
    $g=[GoNv]::Get($ids[$i])
    $cur=if($g -match '^v=(\d+)'){ [uint32]$Matches[1] } else { $null }
    $res.items += [ordered]@{ key=$keys[$i]; cur=$cur; want=$want[$i] }
  }
  [GoNv]::Close()
}
# Versiones anteriores ajustaban PowerMizer por el registro: Restaurar también lo devuelve.
if('${mode}' -eq 'restore' -and (Get-ItemProperty $store -Name '_NV_saved' -EA SilentlyContinue).'_NV_saved' -eq '1'){ & { ${NV_RESTORE(false)} } | Out-Null; if($res.reason -eq 'nobackup'){ $res.reason='' } }
$res.backup=(Get-ItemProperty $store -Name '_NVDRS_saved' -EA SilentlyContinue).'_NVDRS_saved' -eq '1'
$res | ConvertTo-Json -Compress -Depth 5`;

export const amdScript = (mode: "status" | "apply" | "restore") => String.raw`$store='${STORE}'
${AMD_CS}
$keys=${psArr(AMD_SETTINGS.map((s) => s.key))}; $want=${psArr(AMD_SETTINGS.map((s) => s.want))}
$res=[ordered]@{ vendor='amd'; reason=''; done=0; total=0; action='${mode}'; backup=$false; gpus=@() }
$o=if('GoAmd' -as [type]){ [GoAmd]::Open() } else { 'compile' }
if($o){ $res.reason=$o } else {
  $saved=(Get-ItemProperty $store -Name '_ADLX_saved' -EA SilentlyContinue).'_ADLX_saved' -eq '1'
  $list=@([GoAmd]::Gpus())
  if('${mode}' -eq 'apply'){
    if(-not $saved){
      if(!(Test-Path $store)){ New-Item $store -Force | Out-Null }
      foreach($l in $list){ $p=$l -split '\|',4
        foreach($k in $keys){ $v=[GoAmd]::Get([int]$p[0], $k); if($v -ne 'na'){ Set-ItemProperty $store -Name ('ADLX_' + $p[1] + '_' + $k) -Value $v -Force } }
      }
      Set-ItemProperty $store -Name '_ADLX_saved' -Value '1' -Force
    }
    # Primero lo que se apaga y al final lo que se activa: en Adrenalin, Anti-Lag no
    # convive con Chill y el driver podría rechazarlo si Chill sigue prendido.
    $order=@(0..($keys.Count - 1) | Sort-Object { $want[$_] })
    foreach($l in $list){ $p=$l -split '\|',4
      foreach($i in $order){
        if([GoAmd]::Get([int]$p[0], $keys[$i]) -eq 'na'){ continue }
        $res.total++; if([GoAmd]::Set([int]$p[0], $keys[$i], $want[$i]) -eq 0){ $res.done++ }
      }
    }
  } elseif('${mode}' -eq 'restore'){
    if(-not $saved){ $res.reason='nobackup' } else {
      foreach($l in $list){ $p=$l -split '\|',4
        foreach($k in $keys){
          $prev=(Get-ItemProperty $store -Name ('ADLX_' + $p[1] + '_' + $k) -EA SilentlyContinue).('ADLX_' + $p[1] + '_' + $k)
          if($prev -match '^\d+$'){ $res.total++; if([GoAmd]::Set([int]$p[0], $k, [int]$prev) -eq 0){ $res.done++ } }
        }
      }
      Get-Item $store -EA SilentlyContinue | Select-Object -ExpandProperty Property | Where-Object { $_ -like 'ADLX_*' } | ForEach-Object { Remove-ItemProperty $store -Name $_ -Force -EA SilentlyContinue }
      Remove-ItemProperty $store -Name '_ADLX_saved' -Force -EA SilentlyContinue
    }
  }
  foreach($l in $list){ $p=$l -split '\|',4
    $items=@(); for($i=0; $i -lt $keys.Count; $i++){ $v=[GoAmd]::Get([int]$p[0], $keys[$i]); $items += [ordered]@{ key=$keys[$i]; cur=$(if($v -eq 'na'){ $null } else { [int]$v }); want=$want[$i] } }
    $res.gpus += [ordered]@{ name=$p[3]; type=[int]$p[2]; items=$items }
  }
  [GoAmd]::Close()
}
# Versiones anteriores tocaban ULPS por el registro: Restaurar también lo devuelve.
if('${mode}' -eq 'restore' -and (Get-ItemProperty $store -Name '_AMD_saved' -EA SilentlyContinue).'_AMD_saved' -eq '1'){ & { ${AMD_RESTORE(false)} } | Out-Null; if($res.reason -eq 'nobackup'){ $res.reason='' } }
$res.backup=(Get-ItemProperty $store -Name '_ADLX_saved' -EA SilentlyContinue).'_ADLX_saved' -eq '1'
$res | ConvertTo-Json -Compress -Depth 6`;

export interface DrvItem { key: string; cur: number | null; want: number }
export interface DrvState {
  vendor: Vendor;
  reason: string; // "" = OK · "nonv" / "noadlx" = sin driver · "nobackup" · otro = error
  done: number; total: number; action: string; backup: boolean;
  items?: DrvItem[];
  gpus?: { name: string; type: number; items: DrvItem[] }[];
}

export async function driverRun(vendor: Vendor, mode: "status" | "apply" | "restore"): Promise<DrvState> {
  const r = await runPowershell(vendor === "nvidia" ? nvScript(mode) : amdScript(mode));
  const line = r.output.trim().split("\n").reverse().find((l) => l.trim().startsWith("{"));
  if (!line) return { vendor, reason: r.output.trim().split("\n").pop()?.slice(0, 160) || "sin respuesta", done: 0, total: 0, action: mode, backup: false };
  const d = JSON.parse(line) as DrvState;
  // ConvertTo-Json de PowerShell 5.1 deja un objeto suelto cuando el arreglo tiene un solo elemento.
  const arr = <T,>(x: T | T[] | undefined) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  d.items = arr(d.items);
  d.gpus = arr(d.gpus).map((g) => ({ ...g, items: arr(g.items) }));
  return d;
}

/** ¿Ya está todo como lo recomendado? En AMD, null = la placa no tiene ese ajuste (no
 *  cuenta); en NVIDIA, null = valor de fábrica del driver (todavía no optimizado). */
export const isOptimized = (vendor: Vendor, items: DrvItem[]) =>
  items.every((i) => (i.cur === null ? vendor === "amd" : i.cur === i.want));
