// Ajustes DENTRO del juego (como NVIDIA App, pero sin depender de la placa): se editan los
// archivos de opciones que el propio juego guarda, con el juego cerrado. No se toca el proceso
// ni los archivos del juego, sólo sus opciones (lo mismo que cambia su menú).
import { runPowershell } from "./api";

export type Values = Record<string, string>;
export type Preset = "low" | "mid" | "high";
export type SaveResult = "ok" | "running" | "changed" | "error";
/** Opción de un juego: [valor del archivo, texto] (texto = clave de i18n "lib.…" o literal). */
/** `def`: valor que usa el juego cuando la opción no está en el archivo (visto en el propio juego). */
export interface Field { key: string; opts: [string, string][]; nvidiaOnly?: boolean; def?: string }
export interface GameCfg<R> { who: string; running: boolean; nvidia: boolean; hasBackup: boolean; values: Values; raw: R }
export interface GameAdapter<R = unknown> {
  id: string;                        // prefijo de los textos: lib.<id>.f.<clave>
  fields: Field[];
  presets: Record<Preset, Values>;
  load(): Promise<GameCfg<R> | null>;
  /** Sólo los valores que cambiaron. */
  save(raw: R, changed: Values): Promise<SaveResult>;
  restore(raw: R): Promise<SaveResult>;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const psq = (s: string) => `'${s.replace(/'/g, "''")}'`;
const lastJson = (out: string) => { try { return JSON.parse(out.trim().split("\n").pop() || ""); } catch { return null; } };
const NVIDIA_PS = String.raw`[bool](@(Get-CimInstance Win32_VideoController -EA SilentlyContinue) | Where-Object { $_.Name -match 'NVIDIA' })`;

/** Guarda archivos de opciones: con el juego cerrado, sólo si nadie los cambió desde que se
 *  leyeron, y dejando antes una copia .gobak de cada uno (la primera vez). `locate` deja en
 *  $dir la carpeta y valida que sea la misma cuenta; `procs` son los procesos del juego. */
async function saveFiles(locate: string, procs: string[], files: [string, string, string][]): Promise<SaveResult> {
  const r = await runPowershell(locate + String.raw`
if(Get-Process ${procs.map(psq).join(",")} -EA SilentlyContinue){ Write-Output 'RUNNING'; exit 0 }
$enc=New-Object System.Text.UTF8Encoding $false
# ArrayList y no @(@(...)): con un solo archivo PowerShell aplanaba la lista.
$files=New-Object System.Collections.ArrayList
${files.map(([n, a, b]) => `[void]$files.Add(@(${psq(n)},'${b64(a)}','${b64(b)}'))`).join("\n")}
# Si el juego los cambió después de abrir el panel, se escribiría encima con datos viejos.
foreach($f in $files){
  $p=Join-Path $dir $f[0]
  $now=if(Test-Path -LiteralPath $p){ [IO.File]::ReadAllText($p, $enc) } else { '' }
  if($now -cne $enc.GetString([Convert]::FromBase64String($f[1]))){ Write-Output 'CHANGED'; exit 0 }
}
try{
  # Primero todas las copias (si una falla, no se escribe nada); después los archivos.
  foreach($f in $files){ $p=Join-Path $dir $f[0]; if($f[2] -and (Test-Path -LiteralPath $p) -and -not (Test-Path -LiteralPath "$p.gobak")){ Copy-Item -LiteralPath $p -Destination "$p.gobak" -EA Stop } }
  foreach($f in $files){ if($f[2]){ [IO.File]::WriteAllText((Join-Path $dir $f[0]), $enc.GetString([Convert]::FromBase64String($f[2])), $enc) } }
}catch{ Write-Output 'ERROR'; exit 1 }
Write-Output 'OK'`);
  return !r.ok ? "error" : /RUNNING/.test(r.output) ? "running" : /CHANGED/.test(r.output) ? "changed" : /OK/.test(r.output) ? "ok" : "error";
}

/** Vuelve a los archivos como estaban antes del primer cambio (sus copias .gobak). */
async function restoreFiles(locate: string, procs: string[], names: string[]): Promise<SaveResult> {
  const r = await runPowershell(locate + String.raw`
if(Get-Process ${procs.map(psq).join(",")} -EA SilentlyContinue){ Write-Output 'RUNNING'; exit 0 }
try{ foreach($f in @(${names.map(psq).join(",")})){ $p=Join-Path $dir $f; if(Test-Path -LiteralPath "$p.gobak"){ Move-Item -LiteralPath "$p.gobak" -Destination $p -Force -EA Stop } } }
catch{ Write-Output 'ERROR'; exit 1 }
Write-Output 'OK'`);
  return !r.ok ? "error" : /RUNNING/.test(r.output) ? "running" : /OK/.test(r.output) ? "ok" : "error";
}

// ---- Formato KeyValues de Valve: líneas "clave"<tabs>"valor" ----
const lineRx = (key: string) => new RegExp(`^(\\s*"${esc(key)}"\\s+")([^"]*)(".*)$`, "m");

/** Valor de una clave, o undefined si no está. */
export function kvGet(text: string, key: string): string | undefined {
  return lineRx(key).exec(text)?.[2];
}

/** Cambia el valor de una clave; si no está, la agrega antes de la llave que cierra el bloque `block`. */
export function kvSet(text: string, key: string, value: string, block = ""): string {
  const rx = lineRx(key);
  if (rx.test(text)) return text.replace(rx, (_m, a, _v, c) => `${a}${value}${c}`);
  // Se agrega como última línea del bloque, con la sangría de su primera clave.
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const open = text.indexOf("{", block ? text.indexOf(`"${block}"`) : 0);
  if (open < 0 || (block && text.indexOf(`"${block}"`) < 0)) return text;
  let depth = 0, close = open;
  for (; close < text.length; close++) { if (text[close] === "{") depth++; else if (text[close] === "}" && --depth === 0) break; }
  if (close >= text.length) return text;
  const indent = /\n([ \t]*)"/.exec(text.slice(open))?.[1] ?? "\t";
  const lineStart = text.lastIndexOf("\n", close) + 1;
  return `${text.slice(0, lineStart)}${indent}"${key}"\t\t"${value}"${nl}${text.slice(lineStart)}`;
}

// ---- Formato INI (Unreal): líneas Clave=Valor dentro de [Sección] ----
const iniRx = (key: string) => new RegExp(`^(${esc(key)}=)(.*?)(\\r?)$`, "m");
export function iniGet(text: string, key: string): string | undefined {
  return iniRx(key).exec(text)?.[2];
}
/** Cambia el valor; si la clave no está, la agrega justo debajo del encabezado de la sección. */
export function iniSet(text: string, key: string, value: string, section: string): string {
  const rx = iniRx(key);
  if (rx.test(text)) return text.replace(rx, (_m, a, _v, cr) => `${a}${value}${cr}`);
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const h = text.indexOf(`[${section}]`);
  if (h < 0) return `${text}${text.endsWith(nl) || !text ? "" : nl}[${section}]${nl}${key}=${value}${nl}`;
  const eol = text.indexOf("\n", h);
  if (eol < 0) return `${text}${nl}${key}=${value}${nl}`;
  return `${text.slice(0, eol + 1)}${key}=${value}${nl}${text.slice(eol + 1)}`;
}

// ---- Counter-Strike 2 ----
export interface Cs2 { account: string; persona: string; running: boolean; nvidia: boolean; video: string; machine: string; hasBackup: boolean }
export type Cs2Values = Values;

const Q4: [string, string][] = [["0", "lib.q.0"], ["1", "lib.q.1"], ["2", "lib.q.2"], ["3", "lib.q.3"]];
// fps_max vive en cs2_machine_convars.vcfg; displaymode combina fullscreen + nowindowborder.
export const CS2_FIELDS: Field[] = [
  { key: "displaymode", opts: [["full", "lib.cs2.full"], ["borderless", "lib.cs2.borderless"], ["window", "lib.cs2.window"]] },
  { key: "fps_max", opts: [["0", "lib.go.noLimit"], ...["60", "120", "144", "165", "240", "300", "400"].map((x): [string, string] => [x, x])] },
  { key: "setting.mat_vsync", opts: [["0", "lib.q.off"], ["1", "lib.q.on"]] },
  { key: "setting.r_low_latency", opts: [["0", "lib.q.off"], ["1", "lib.q.on"], ["2", "lib.go.boost"]], nvidiaOnly: true },
  { key: "setting.msaa_samples", opts: [["0", "lib.q.off"], ["2", "2x MSAA"], ["4", "4x MSAA"], ["8", "8x MSAA"]] },
  { key: "setting.videocfg_shadow_quality", opts: Q4 },
  { key: "setting.videocfg_texture_detail", opts: Q4.slice(0, 3) },
  { key: "setting.videocfg_particle_detail", opts: Q4 },
  { key: "setting.videocfg_ao_detail", opts: [["0", "lib.q.off"], ["1", "lib.q.1"], ["2", "lib.q.2"]] },
  { key: "setting.r_texturefilteringquality", opts: [["0", "lib.cs2.bilinear"], ["1", "lib.cs2.trilinear"], ["2", "2x AF"], ["3", "4x AF"], ["4", "8x AF"], ["5", "16x AF"]] },
  { key: "setting.shaderquality", opts: [["0", "lib.q.0"], ["1", "lib.q.2"]] },
];

const presets = (keys: string[], low: string[], mid: string[], high: string[]): Record<Preset, Values> => {
  const m = (v: string[]) => Object.fromEntries(keys.map((k, i) => [k, v[i]]));
  return { low: m(low), mid: m(mid), high: m(high) };
};
// Presets: sólo calidad gráfica (modo de pantalla y FPS los elige cada uno).
const CS2_PRESETS = presets(
  ["setting.msaa_samples", "setting.videocfg_shadow_quality", "setting.videocfg_dynamic_shadows", "setting.videocfg_texture_detail",
    "setting.videocfg_particle_detail", "setting.videocfg_ao_detail", "setting.videocfg_hdr_detail", "setting.videocfg_fsr_detail",
    "setting.r_texturefilteringquality", "setting.shaderquality", "setting.r_csgo_cmaa_enable"],
  ["0", "0", "0", "0", "0", "0", "3", "0", "1", "0", "0"],   // Máximo FPS
  ["4", "1", "1", "1", "1", "0", "3", "0", "3", "0", "0"],   // Equilibrado
  ["8", "3", "1", "2", "3", "2", "-1", "0", "5", "1", "0"],  // Calidad
);
export type Cs2Preset = Preset;
export const cs2Preset = (p: Preset): Values => CS2_PRESETS[p];

/** Valores actuales (modo de pantalla combinado de fullscreen + nowindowborder). */
export function cs2Read(c: Cs2): Values {
  const v: Values = {};
  for (const k of [...CS2_FIELDS.map((f) => f.key), ...Object.keys(CS2_PRESETS.low)]) {
    if (k === "displaymode" || k === "fps_max") continue;
    const x = kvGet(c.video, k); if (x !== undefined) v[k] = x;
  }
  const fs = kvGet(c.video, "setting.fullscreen"), nb = kvGet(c.video, "setting.nowindowborder");
  v.displaymode = fs === "1" ? "full" : nb === "1" ? "borderless" : "window";
  v.fps_max = kvGet(c.machine, "fps_max") ?? "0";
  return v;
}

/** Aplica los valores a los textos de los dos archivos. */
export function cs2Apply(c: Cs2, v: Values): { video: string; machine: string } {
  let video = c.video, machine = c.machine;
  for (const [k, val] of Object.entries(v)) {
    if (k === "fps_max") { machine = kvSet(machine, "fps_max", val, "convars"); continue; }
    if (k === "displaymode") {
      video = kvSet(video, "setting.fullscreen", val === "full" ? "1" : "0", "video.cfg");
      video = kvSet(video, "setting.nowindowborder", val === "window" ? "0" : "1", "video.cfg");
      continue;
    }
    video = kvSet(video, k, val, "video.cfg");
  }
  // 2 = configurado por el usuario: si no, el juego puede autodetectar y pisar los valores.
  video = kvSet(video, "Autoconfig", "2", "video.cfg");
  return { video, machine };
}

// Cuenta de Steam usada más recientemente que tenga opciones de CS2, y sus dos archivos.
const CS2_LOCATE = String.raw`$steam=(Get-ItemProperty 'HKCU:\Software\Valve\Steam' -EA SilentlyContinue).SteamPath
if(-not $steam){ exit 0 }
$steam=$steam -replace '/','\'
$lu=Get-Content -LiteralPath "$steam\config\loginusers.vdf" -Raw -Encoding UTF8 -EA SilentlyContinue
$best=$null
# Bloque de cada cuenta respetando comillas (una "}" dentro del nombre no corta el bloque).
foreach($b in [regex]::Matches("$lu",'"(\d{17})"\s*\{((?:[^{}"]|"(?:[^"\\]|\\.)*")*)\}')){
  $id3=[UInt64]$b.Groups[1].Value - 76561197960265728
  $d="$steam\userdata\$id3\730\local\cfg"
  if(-not (Test-Path -LiteralPath "$d\cs2_video.txt")){ continue }
  $ts=if($b.Groups[2].Value -match '"Timestamp"\s+"(\d+)"'){ [int64]$Matches[1] } else { 0 }
  $pn=if($b.Groups[2].Value -match '"PersonaName"\s+"((?:[^"\\]|\\.)*)"'){ $Matches[1] } else { "$id3" }
  if(-not $best -or $ts -gt $best.ts){ $best=@{ ts=$ts; id="$id3"; name=$pn; dir=$d } }
}`;
const cs2Same = (account: string) => CS2_LOCATE + String.raw`
if(-not $best -or $best.id -ne '${account.replace(/\D/g, "")}'){ Write-Output 'ERROR'; exit 1 }
$dir=$best.dir`;
const CS2_FILES = ["cs2_video.txt", "cs2_machine_convars.vcfg"];

export async function cs2Load(): Promise<Cs2 | null> {
  const r = await runPowershell(CS2_LOCATE + String.raw`
if(-not $best){ exit 0 }
$v=Get-Content -LiteralPath "$($best.dir)\cs2_video.txt" -Raw -Encoding UTF8
$m=Get-Content -LiteralPath "$($best.dir)\cs2_machine_convars.vcfg" -Raw -Encoding UTF8 -EA SilentlyContinue
[pscustomobject]@{ account=$best.id; persona=$best.name; running=[bool](Get-Process cs2 -EA SilentlyContinue); nvidia=${NVIDIA_PS}
  video="$v"; machine="$m"; hasBackup=(Test-Path -LiteralPath "$($best.dir)\cs2_video.txt.gobak") } | ConvertTo-Json -Compress`);
  const j = lastJson(r.output);
  return j && j.video ? j : null;
}

/** Guarda (con el juego cerrado). La primera vez deja una copia .gobak de cada archivo.
 *  "changed": el juego cambió los archivos desde que se leyeron (no se escribe nada). */
export function cs2Save(c: Cs2, v: Values): Promise<SaveResult> {
  const out = cs2Apply(c, v);
  return saveFiles(cs2Same(c.account), ["cs2"], [[CS2_FILES[0], c.video, out.video], [CS2_FILES[1], c.machine, out.machine]]);
}
export const cs2Restore = (c: Cs2): Promise<SaveResult> => restoreFiles(cs2Same(c.account), ["cs2"], CS2_FILES);

export const CS2: GameAdapter<Cs2> = {
  id: "cs2", fields: CS2_FIELDS, presets: CS2_PRESETS,
  load: async () => { const c = await cs2Load(); return c && { who: c.persona, running: c.running, nvidia: c.nvidia, hasBackup: c.hasBackup, values: cs2Read(c), raw: c }; },
  save: cs2Save, restore: cs2Restore,
};

// ---- VALORANT ----
// Opciones de video en RiotUserSettings.ini de la última cuenta de Riot usada. Riot sólo escribe
// las que se cambiaron alguna vez: si falta una, el juego usa la suya ("predeterminado").
// gus/gusRoot: GameUserSettings.ini de la cuenta y el general (V-Sync; el juego escribe los dos).
export interface Val { folder: string; region: string; running: boolean; nvidia: boolean; text: string; gus: string; gusRoot: string; hasBackup: boolean }
const V = (k: string) => `EAres${k}`;
const Q3: [string, string][] = [["0", "lib.q.0"], ["1", "lib.q.1"], ["2", "lib.q.2"]];
const ONOFF: [string, string][] = [["True", "lib.q.on"], ["False", "lib.q.off"]];
export const VAL_FIELDS: Field[] = [
  // fpslimit combina LimitFramerateAlways (sí/no) y MaxFramerateAlways (el número).
  { key: "fpslimit", opts: [["off", "lib.go.noLimit"], ...["60", "120", "144", "165", "240", "300"].map((x): [string, string] => [x, x])] },
  { key: "vsync", opts: ONOFF },
  { key: V("IntSettingName::NvidiaReflexLowLatencySetting"), opts: [["0", "lib.q.off"], ["1", "lib.q.on"], ["2", "lib.go.boost"]], nvidiaOnly: true },
  { key: V("IntSettingName::MaterialQuality"), opts: Q3, def: "2" },
  { key: V("IntSettingName::TextureQuality"), opts: Q3 },
  { key: V("IntSettingName::DetailQuality"), opts: Q3 },
  { key: V("IntSettingName::UIQuality"), opts: Q3 },
  { key: V("IntSettingName::AntiAliasing"), opts: [["0", "lib.q.off"], ["1", "FXAA"], ["2", "2x MSAA"], ["3", "4x MSAA"]], def: "3" },
  { key: V("IntSettingName::AnisotropicFiltering"), opts: [["1", "1x"], ["2", "2x"], ["4", "4x"], ["8", "8x"], ["16", "16x"]] },
  { key: V("BoolSettingName::ShadowsEnabled"), opts: ONOFF },
  { key: V("IntSettingName::BloomQuality"), opts: [["1", "lib.q.on"], ["0", "lib.q.off"]] },
  // La opción del juego es "Distorsión"; el archivo guarda lo contrario (DisableDistortion).
  { key: V("BoolSettingName::DisableDistortion"), opts: [["False", "lib.q.on"], ["True", "lib.q.off"]] },
  { key: V("BoolSettingName::VignetteEnabled"), opts: ONOFF },
  { key: V("BoolSettingName::AdaptiveSharpenEnabled"), opts: ONOFF },
];
const VAL_PRESETS = presets(
  [V("IntSettingName::MaterialQuality"), V("IntSettingName::TextureQuality"), V("IntSettingName::DetailQuality"), V("IntSettingName::UIQuality"),
    V("IntSettingName::AntiAliasing"), V("IntSettingName::AnisotropicFiltering"), V("BoolSettingName::ShadowsEnabled"),
    V("IntSettingName::BloomQuality"), V("BoolSettingName::DisableDistortion"), V("BoolSettingName::VignetteEnabled")],
  ["0", "0", "0", "0", "1", "4", "False", "0", "True", "False"],    // Máximo FPS
  ["1", "1", "1", "1", "2", "8", "True", "0", "True", "False"],     // Equilibrado
  ["2", "2", "2", "2", "3", "16", "True", "1", "False", "True"],    // Calidad
);
const LIMIT = V("BoolSettingName::LimitFramerateAlways"), MAXFPS = V("FloatSettingName::MaxFramerateAlways");

const GUS = "/Script/ShooterGame.ShooterGameUserSettings";
export function valRead(text: string, gus = ""): Values {
  const v: Values = {};
  for (const f of VAL_FIELDS) {
    if (f.key === "fpslimit" || f.key === "vsync") continue;
    const x = iniGet(text, f.key) ?? f.def; if (x !== undefined) v[f.key] = x;
  }
  const max = iniGet(text, MAXFPS);
  v.fpslimit = iniGet(text, LIMIT) === "True" && max ? String(Math.round(Number(max))) : "off";
  const vs = iniGet(gus, "bUseVSync"); if (vs !== undefined) v.vsync = vs;
  return v;
}
/** Aplica los valores: RiotUserSettings.ini y, para V-Sync, los dos GameUserSettings.ini. */
export function valApply(c: { text: string; gus: string; gusRoot: string }, v: Values): { text: string; gus: string; gusRoot: string } {
  let { text, gus, gusRoot } = c;
  for (const [k, val] of Object.entries(v)) {
    if (k === "vsync") {
      if (gus) gus = iniSet(gus, "bUseVSync", val, GUS);
      if (gusRoot) gusRoot = iniSet(gusRoot, "bUseVSync", val, GUS);
      continue;
    }
    if (k === "fpslimit") {
      text = iniSet(text, LIMIT, val === "off" ? "False" : "True", "Settings");
      if (val !== "off") text = iniSet(text, MAXFPS, val, "Settings");
      continue;
    }
    text = iniSet(text, k, val, "Settings");
  }
  return { text, gus, gusRoot };
}

// Última cuenta (LastKnownUser) y su carpeta <puuid>-<región> más reciente.
const VAL_LOCATE = String.raw`$base="$env:LOCALAPPDATA\VALORANT\Saved\Config"
$last=("$(Get-Content -LiteralPath "$base\WindowsClient\RiotLocalMachine.ini" -EA SilentlyContinue | Where-Object { $_ -like 'LastKnownUser=*' } | Select-Object -First 1)" -replace '^LastKnownUser=','').Trim()
$best=$null
if($last){ $best=Get-ChildItem -LiteralPath $base -Directory -EA SilentlyContinue | Where-Object { $_.Name.StartsWith("$last-",[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath "$($_.FullName)\Windows\RiotUserSettings.ini") } | Sort-Object { (Get-Item -LiteralPath "$($_.FullName)\Windows\RiotUserSettings.ini").LastWriteTime } -Descending | Select-Object -First 1 }`;
const VAL_PROCS = ["VALORANT-Win64-Shipping", "VALORANT"];
const VAL_FILES = ["RiotUserSettings.ini", String.raw`..\WindowsClient\GameUserSettings.ini`, String.raw`..\..\WindowsClient\GameUserSettings.ini`];
const valSame = (folder: string) => VAL_LOCATE + String.raw`
if(-not $best -or $best.Name -ne ${psq(folder)}){ Write-Output 'ERROR'; exit 1 }
$dir=Join-Path $best.FullName 'Windows'`;

export async function valLoad(): Promise<Val | null> {
  const r = await runPowershell(VAL_LOCATE + String.raw`
if(-not $best){ exit 0 }
$enc=New-Object System.Text.UTF8Encoding $false
$f=Join-Path $best.FullName 'Windows\RiotUserSettings.ini'
$g=Join-Path $best.FullName 'WindowsClient\GameUserSettings.ini'; $gr=Join-Path $base 'WindowsClient\GameUserSettings.ini'
[pscustomobject]@{ folder=$best.Name; region=($best.Name -replace '^.*-',''); running=[bool](Get-Process ${VAL_PROCS.map(psq).join(",")} -EA SilentlyContinue); nvidia=${NVIDIA_PS}
  text=[IO.File]::ReadAllText($f, $enc); gus=$(if(Test-Path -LiteralPath $g){ [IO.File]::ReadAllText($g, $enc) } else { '' }); gusRoot=$(if(Test-Path -LiteralPath $gr){ [IO.File]::ReadAllText($gr, $enc) } else { '' })
  hasBackup=(@("$f.gobak","$g.gobak","$gr.gobak") | Where-Object { Test-Path -LiteralPath $_ }).Count -gt 0 } | ConvertTo-Json -Compress`);
  const j = lastJson(r.output);
  return j && typeof j.text === "string" && j.folder ? j : null;
}

export const VALORANT: GameAdapter<Val> = {
  id: "val", fields: VAL_FIELDS, presets: VAL_PRESETS,
  load: async () => { const c = await valLoad(); return c && { who: c.region.toUpperCase(), running: c.running, nvidia: c.nvidia, hasBackup: c.hasBackup, values: valRead(c.text, c.gus || c.gusRoot), raw: c }; },
  // Sólo los archivos que cambian (rutas relativas a <cuenta>\Windows).
  save: (c, v) => {
    // Sin ningún GameUserSettings.ini no hay dónde guardar la V-Sync: no decir "guardado".
    if ("vsync" in v && !c.gus && !c.gusRoot) return Promise.resolve<SaveResult>("error");
    const o = valApply(c, v);
    const files: [string, string, string][] = [[VAL_FILES[0], c.text, o.text], [VAL_FILES[1], c.gus, o.gus], [VAL_FILES[2], c.gusRoot, o.gusRoot]];
    return saveFiles(valSame(c.folder), VAL_PROCS, files.filter(([, a, b]) => a !== b));
  },
  restore: (c) => restoreFiles(valSame(c.folder), VAL_PROCS, VAL_FILES),
};

/** Módulo de opciones del juego, si está soportado. */
export function gameAdapter(g: { id: string; appId?: string }): GameAdapter | null {
  if (g.appId === "730") return CS2 as GameAdapter;
  if (g.id === "riot:valorant") return VALORANT as GameAdapter;
  return null;
}
