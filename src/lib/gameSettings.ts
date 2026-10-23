// Ajustes DENTRO del juego (como NVIDIA App, pero sin depender de la placa): se editan los
// archivos de opciones que el propio juego guarda, con el juego cerrado. No se toca el proceso
// ni los archivos del juego, sólo sus opciones (lo mismo que cambia su menú).
import { runPowershell } from "./api";

// ---- Formato KeyValues de Valve: líneas "clave"<tabs>"valor" ----
const lineRx = (key: string) => new RegExp(`^(\\s*"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s+")([^"]*)(".*)$`, "m");

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

// ---- Counter-Strike 2 ----
export interface Cs2 { account: string; persona: string; running: boolean; nvidia: boolean; video: string; machine: string; hasBackup: boolean }
export type Cs2Values = Record<string, string>;

// Clave -> opciones válidas (valor del archivo). fps_max vive en cs2_machine_convars.vcfg.
export const CS2_FIELDS: { key: string; opts: string[]; nvidiaOnly?: boolean }[] = [
  { key: "displaymode", opts: ["full", "borderless", "window"] },
  { key: "fps_max", opts: ["0", "60", "120", "144", "165", "240", "300", "400"] },
  { key: "setting.mat_vsync", opts: ["0", "1"] },
  { key: "setting.r_low_latency", opts: ["0", "1", "2"], nvidiaOnly: true },
  { key: "setting.msaa_samples", opts: ["0", "2", "4", "8"] },
  { key: "setting.videocfg_shadow_quality", opts: ["0", "1", "2", "3"] },
  { key: "setting.videocfg_texture_detail", opts: ["0", "1", "2"] },
  { key: "setting.videocfg_particle_detail", opts: ["0", "1", "2", "3"] },
  { key: "setting.videocfg_ao_detail", opts: ["0", "1", "2"] },
  { key: "setting.r_texturefilteringquality", opts: ["0", "1", "2", "3", "4", "5"] },
  { key: "setting.shaderquality", opts: ["0", "1"] },
];

const Q = (low: string[], mid: string[], high: string[]) => ({ low, mid, high });
// Presets: sólo calidad gráfica (modo de pantalla y FPS los elige cada uno).
const PRESET_KEYS = ["setting.msaa_samples", "setting.videocfg_shadow_quality", "setting.videocfg_dynamic_shadows", "setting.videocfg_texture_detail",
  "setting.videocfg_particle_detail", "setting.videocfg_ao_detail", "setting.videocfg_hdr_detail", "setting.videocfg_fsr_detail",
  "setting.r_texturefilteringquality", "setting.shaderquality", "setting.r_csgo_cmaa_enable"];
const PRESET_VALUES = Q(
  ["0", "0", "0", "0", "0", "0", "3", "0", "1", "0", "0"],   // Máximo FPS
  ["4", "1", "1", "1", "1", "0", "3", "0", "3", "0", "0"],   // Equilibrado
  ["8", "3", "1", "2", "3", "2", "-1", "0", "5", "1", "0"],  // Calidad
);
export type Cs2Preset = keyof typeof PRESET_VALUES;
export const cs2Preset = (p: Cs2Preset): Cs2Values => Object.fromEntries(PRESET_KEYS.map((k, i) => [k, PRESET_VALUES[p][i]]));

/** Valores actuales (modo de pantalla combinado de fullscreen + nowindowborder). */
export function cs2Read(c: Cs2): Cs2Values {
  const v: Cs2Values = {};
  for (const k of [...CS2_FIELDS.map((f) => f.key), ...PRESET_KEYS]) {
    if (k === "displaymode" || k === "fps_max") continue;
    const x = kvGet(c.video, k); if (x !== undefined) v[k] = x;
  }
  const fs = kvGet(c.video, "setting.fullscreen"), nb = kvGet(c.video, "setting.nowindowborder");
  v.displaymode = fs === "1" ? "full" : nb === "1" ? "borderless" : "window";
  v.fps_max = kvGet(c.machine, "fps_max") ?? "0";
  return v;
}

/** Aplica los valores a los textos de los dos archivos. */
export function cs2Apply(c: Cs2, v: Cs2Values): { video: string; machine: string } {
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
$lu=Get-Content -LiteralPath "$steam\config\loginusers.vdf" -Raw -EA SilentlyContinue
$best=$null
foreach($b in [regex]::Matches("$lu",'"(\d{17})"\s*\{([^}]*)\}')){
  $id3=[UInt64]$b.Groups[1].Value - 76561197960265728
  $dir="$steam\userdata\$id3\730\local\cfg"
  if(-not (Test-Path -LiteralPath "$dir\cs2_video.txt")){ continue }
  $ts=if($b.Groups[2].Value -match '"Timestamp"\s+"(\d+)"'){ [int64]$Matches[1] } else { 0 }
  $pn=if($b.Groups[2].Value -match '"PersonaName"\s+"([^"]*)"'){ $Matches[1] } else { "$id3" }
  if(-not $best -or $ts -gt $best.ts){ $best=@{ ts=$ts; id="$id3"; name=$pn; dir=$dir } }
}`;

export async function cs2Load(): Promise<Cs2 | null> {
  const r = await runPowershell(CS2_LOCATE + String.raw`
if(-not $best){ exit 0 }
$v=Get-Content -LiteralPath "$($best.dir)\cs2_video.txt" -Raw -Encoding UTF8
$m=Get-Content -LiteralPath "$($best.dir)\cs2_machine_convars.vcfg" -Raw -Encoding UTF8 -EA SilentlyContinue
[pscustomobject]@{ account=$best.id; persona=$best.name; running=[bool](Get-Process cs2 -EA SilentlyContinue)
  nvidia=[bool](@(Get-CimInstance Win32_VideoController -EA SilentlyContinue) | Where-Object { $_.Name -match 'NVIDIA' })
  video="$v"; machine="$m"; hasBackup=(Test-Path -LiteralPath "$($best.dir)\cs2_video.txt.gobak") } | ConvertTo-Json -Compress`);
  try { const j = JSON.parse(r.output.trim().split("\n").pop() || ""); return j && j.video ? j : null; } catch { return null; }
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

/** Guarda (con el juego cerrado). La primera vez deja una copia .gobak de cada archivo. */
export async function cs2Save(c: Cs2, v: Cs2Values): Promise<"ok" | "running" | "error"> {
  const out = cs2Apply(c, v);
  const r = await runPowershell(CS2_LOCATE + String.raw`
if(-not $best -or $best.id -ne '${c.account.replace(/\D/g, "")}'){ Write-Output 'ERROR'; exit 1 }
if(Get-Process cs2 -EA SilentlyContinue){ Write-Output 'RUNNING'; exit 0 }
$enc=New-Object System.Text.UTF8Encoding $false
foreach($f in @(@('cs2_video.txt','${b64(out.video)}'),@('cs2_machine_convars.vcfg','${b64(out.machine)}'))){
  $p=Join-Path $best.dir $f[0]
  if((Test-Path -LiteralPath $p) -and -not (Test-Path -LiteralPath "$p.gobak")){ Copy-Item -LiteralPath $p -Destination "$p.gobak" }
  if($f[1]){ [IO.File]::WriteAllText($p, $enc.GetString([Convert]::FromBase64String($f[1])), $enc) }
}
Write-Output 'OK'`);
  return /RUNNING/.test(r.output) ? "running" : /OK/.test(r.output) ? "ok" : "error";
}

/** Vuelve a los archivos como estaban antes del primer cambio. */
export async function cs2Restore(c: Cs2): Promise<"ok" | "running" | "error"> {
  const r = await runPowershell(CS2_LOCATE + String.raw`
if(-not $best -or $best.id -ne '${c.account.replace(/\D/g, "")}'){ Write-Output 'ERROR'; exit 1 }
if(Get-Process cs2 -EA SilentlyContinue){ Write-Output 'RUNNING'; exit 0 }
foreach($f in 'cs2_video.txt','cs2_machine_convars.vcfg'){ $p=Join-Path $best.dir $f; if(Test-Path -LiteralPath "$p.gobak"){ Move-Item -LiteralPath "$p.gobak" -Destination $p -Force } }
Write-Output 'OK'`);
  return /RUNNING/.test(r.output) ? "running" : /OK/.test(r.output) ? "ok" : "error";
}
