import { invoke } from "@tauri-apps/api/core";
import { runPowershell } from "./api";

// ─────────────────────────────────────────────────────────────────────────────
// Sección Drivers. Escanea la placa madre y los drivers "básicos" (video, red,
// audio, chipset, almacenamiento, Bluetooth) y los compara con la fuente OFICIAL:
//  · ASUS: API pública de soporte (lista exacta de drivers y BIOS de la placa).
//  · NVIDIA: el buscador oficial de drivers (misma consulta que usa nvidia.com).
//  · MSI / Gigabyte / ASRock / notebooks: sus sitios bloquean consultas
//    automáticas, así que se avisa por antigüedad y se abre su página oficial.
// La app NUNCA descarga ni instala: cada botón abre la página oficial en el navegador.
// ─────────────────────────────────────────────────────────────────────────────

export const SCAN = String.raw`$o = [ordered]@{}
$cs = Get-CimInstance Win32_ComputerSystem
$bb = Get-CimInstance Win32_BaseBoard
$bi = Get-CimInstance Win32_BIOS
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$ch = @((Get-CimInstance Win32_SystemEnclosure).ChassisTypes)
$o.board = [ordered]@{ maker = "$($bb.Manufacturer)".Trim(); model = "$($bb.Product)".Trim() }
$o.system = [ordered]@{ maker = "$($cs.Manufacturer)".Trim(); model = "$($cs.Model)".Trim() }
$o.bios = [ordered]@{ version = "$($bi.SMBIOSBIOSVersion)".Trim(); date = $(if ($bi.ReleaseDate) { $bi.ReleaseDate.ToString('yyyy-MM-dd') } else { '' }) }
$o.build = [int]$os.BuildNumber
$o.laptop = [bool](@($ch | Where-Object { $_ -in 8,9,10,11,12,14,18,21,30,31,32 }).Count)
$o.cpu = "$($cpu.Manufacturer)"
$o.drivers = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceClass -in 'DISPLAY','NET','MEDIA','SCSIADAPTER','HDC','SYSTEM','BLUETOOTH' -and $_.DeviceID } | ForEach-Object {
  [ordered]@{ cls = "$($_.DeviceClass)"; name = "$($_.DeviceName)"; provider = "$($_.DriverProviderName)"; version = "$($_.DriverVersion)"; date = $(if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { '' }); id = "$($_.DeviceID)" }
})
$o.missing = @(Get-CimInstance Win32_PnPEntity -Filter 'ConfigManagerErrorCode=28' | ForEach-Object { [ordered]@{ name = "$($_.Name)"; id = "$($_.PNPDeviceID)"; cls = "$($_.PNPClass)" } })
$o | ConvertTo-Json -Depth 4 -Compress`;

export interface Scan {
  board: { maker: string; model: string };
  system: { maker: string; model: string };
  bios: { version: string; date: string };
  build: number; laptop: boolean; cpu: string;
  drivers: RawDriver[];
  missing: { name: string; id: string; cls: string }[];
}
interface RawDriver { cls: string; name: string; provider: string; version: string; date: string; id: string }

export type Cat = "video" | "net" | "audio" | "chipset" | "storage" | "bt" | "bios" | "missing";
export type Status = "update" | "old" | "ok" | "installed" | "missing" | "generic";
export interface Link { url: string; src: string }            // src: "ASUS", "NVIDIA", "MSI"…
export interface Item {
  key: string; cat: Cat; name: string;
  version: string; date: string;                               // instalado
  latest?: { version: string; date: string };                 // última oficial (si se sabe)
  status: Status;
  link?: Link;
  sub?: string;                                                // subgrupo de chipset (me, serialio…)
}
export interface Result {
  vendor: Vendor; boardName: string; boardLink: Link; searchLink?: Link;
  compared: boolean;                                           // ¿hubo comparación con la lista oficial de la placa?
  items: Item[]; osLabel: string;
}
type Vendor = "asus" | "msi" | "gigabyte" | "asrock" | "oem" | "unknown";

// ── utilidades ───────────────────────────────────────────────────────────────
const nums = (v: string) => (v.match(/\d+/g) || []).map(Number);
/** >0 si a es más nueva que b. */
export function cmpVer(a: string, b: string): number {
  const x = nums(a), y = nums(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
const sameFamily = (a: string, b: string) => nums(a)[0] === nums(b)[0];
const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && +d.slice(0, 4) >= 2000;
const normDate = (d: string) => d.replace(/\//g, "-").slice(0, 10);
const yearsOld = (d: string) => validDate(d) ? (Date.now() - new Date(d).getTime()) / (365.25 * 864e5) : 0;
const enc = encodeURIComponent;

/** Versión de Windows del driver NVIDIA → versión "comercial" (32.0.16.1692 → 616.92). */
export function nvidiaVersion(v: string): string {
  const d = v.replace(/\./g, "").slice(-5);
  return d.length === 5 ? `${d.slice(0, 3)}.${d.slice(3)}` : v;
}

const fetchText = (url: string) => invoke<string>("drivers_fetch", { url });
// new URL() normaliza (ej. los espacios de "?model=PRIME H610M-K D4" pasan a %20).
export const openUrl = (url: string) => invoke("open_url", { url: new URL(url).href }).catch(() => {});

// ── clasificación de los drivers instalados ──────────────────────────────────
const VIRTUAL = /virtual|vpn|tap-|tap |wan miniport|hyper-v|loopback|kernel debug|wi-fi direct|personal area|remote ndis|broadcast|sonar|voicemeeter|vb-audio|splitcam|obs/i;

function classify(d: RawDriver): { cat: Cat; sub?: string } | null {
  const id = d.id.toUpperCase();
  const ms = /^microsoft$/i.test(d.provider.trim());
  const phys = id.startsWith("PCI\\") || id.startsWith("USB\\") || id.startsWith("HDAUDIO\\") || id.startsWith("ACPI\\");
  if (!phys || VIRTUAL.test(d.name)) return null;
  switch (d.cls) {
    case "DISPLAY": return id.startsWith("PCI\\") ? { cat: "video" } : null;
    case "NET": return id.startsWith("PCI\\") || id.startsWith("USB\\") ? { cat: "net", sub: /wi-?fi|wireless|802\.11|wlan/i.test(d.name) ? "wifi" : "lan" } : null;
    case "MEDIA":
      // Solo el códec de audio de la placa (el audio HDMI de la GPU viene con el driver de video).
      return id.startsWith("HDAUDIO\\") && !/nvidia|amd|ati |intel.*display|hdmi|displayport/i.test(d.name) ? { cat: "audio" } : null;
    case "SCSIADAPTER": case "HDC":
      return id.startsWith("PCI\\") && !ms ? { cat: "storage" } : null;
    case "BLUETOOTH":
      return (id.startsWith("USB\\") || id.startsWith("PCI\\")) && !ms ? { cat: "bt" } : null;
    case "SYSTEM": {
      if (ms || !/intel|amd|advanced micro/i.test(d.provider)) return null;
      const n = d.name;
      const sub = /management engine|\bmei\b/i.test(n) ? "me"
        : /serial ?io/i.test(n) ? "serialio"
        : /innovation platform|dynamic tuning|\bdtt\b/i.test(n) ? "ipf"
        : /\bgna\b|gaussian/i.test(n) ? "gna"
        : /amd|advanced micro/i.test(d.provider) ? "amd"
        : "inf";
      return { cat: "chipset", sub };
    }
  }
  return null;
}

/** Filas de drivers instalados (agrupando el chipset por subgrupo). */
function installedItems(scan: Scan): Item[] {
  const out: Item[] = [];
  const chip = new Map<string, Item>();
  for (const d of scan.drivers ?? []) {
    const c = classify(d);
    if (!c) continue;
    const date = validDate(d.date) ? d.date : "";
    if (c.cat === "chipset") {
      const prev = chip.get(c.sub!);
      if (!prev || cmpVer(d.version, prev.version) > 0) chip.set(c.sub!, { key: `chipset-${c.sub}`, cat: "chipset", sub: c.sub, name: d.name, version: d.version, date, status: "installed" });
      continue;
    }
    // Driver genérico de Windows en un dispositivo físico (ej. "Microsoft Basic Display Adapter").
    const generic = /^microsoft$/i.test(d.provider.trim());
    if (c.cat === "video" && /basic display|b[aá]sico de pantalla/i.test(d.name)) {
      out.push({ key: `video-basic-${d.id}`, cat: "missing", name: d.name, version: d.version, date, status: "missing" });
      continue;
    }
    out.push({ key: `${c.cat}-${d.id}`, cat: c.cat, sub: c.sub, name: d.name, version: d.version, date, status: generic ? "generic" : "installed" });
  }
  // El chipset INF de Intel no tiene un nombre útil: se muestra como "Intel Chipset".
  for (const it of chip.values()) {
    if (it.sub === "inf") it.name = "Intel Chipset Device Software";
    out.push(it);
  }
  for (const m of scan.missing ?? []) out.push({ key: `missing-${m.id}`, cat: "missing", name: m.name || m.id, version: "", date: "", status: "missing" });
  return out;
}

// ── fuentes oficiales por fabricante ─────────────────────────────────────────
function vendorOf(scan: Scan): Vendor {
  // Notebooks y equipos armados de marca: los drivers están en el soporte del fabricante del equipo.
  if (scan.laptop) return "oem";
  const m = scan.board.maker;
  if (/asus/i.test(m)) return "asus";
  if (/micro-star|\bmsi\b/i.test(m)) return "msi";
  if (/gigabyte/i.test(m)) return "gigabyte";
  if (/asrock/i.test(m)) return "asrock";
  if (/dell|hewlett|\bhp\b|lenovo|acer|medion|fujitsu/i.test(`${scan.system.maker}`)) return "oem";
  return "unknown";
}

function boardLinks(scan: Scan, v: Vendor): { page: Link; search?: Link } {
  const model = scan.board.model;
  const clean = model.replace(/\s*\(MS-\w+\)\s*/i, "").trim();
  const cpuV = /amd/i.test(scan.cpu) ? "AMD" : "Intel";
  switch (v) {
    case "asus": return {
      page: { src: "ASUS", url: `https://www.asus.com/supportonly/${enc(model)}/helpdesk_download/` },
      search: { src: "ASUS", url: `https://www.asus.com/support/search-results/?keyword=${enc(model)}` },
    };
    case "msi": return {
      page: { src: "MSI", url: `https://www.msi.com/Motherboard/${clean.replace(/\s+/g, "-")}/support#driver` },
      search: { src: "MSI", url: `https://www.msi.com/search/${enc(clean)}` },
    };
    case "gigabyte": return { page: { src: "Gigabyte", url: `https://www.gigabyte.com/Search?kw=${enc(clean)}` } };
    case "asrock": return {
      page: { src: "ASRock", url: `https://www.asrock.com/mb/${cpuV}/${enc(clean)}/index.asp#Download` },
      search: { src: "ASRock", url: `https://www.asrock.com/support/index.asp?cat=Drivers` },
    };
    default: {
      const maker = scan.system.maker, sys = `${maker} ${scan.system.model}`.trim();
      const oem: [RegExp, string, string][] = [
        [/dell/i, "Dell", "https://www.dell.com/support/home/"],
        [/hewlett|\bhp\b/i, "HP", "https://support.hp.com/drivers"],
        [/lenovo/i, "Lenovo", "https://pcsupport.lenovo.com/"],
        [/acer/i, "Acer", "https://www.acer.com/support"],
        [/asus/i, "ASUS", `https://www.asus.com/support/search-results/?keyword=${enc(scan.system.model)}`],
        [/micro-star|\bmsi\b/i, "MSI", `https://www.msi.com/search/${enc(scan.system.model)}`],
      ];
      const hit = oem.find(([rx]) => rx.test(maker));
      if (hit) return { page: { src: hit[1], url: hit[2] } };
      return { page: { src: "web", url: `https://www.google.com/search?q=${enc(`${sys || model} drivers`)}` } };
    }
  }
}

// ASUS: lista oficial de drivers (y BIOS) de la placa exacta.
interface AsusFile { Title: string; Version: string; ReleaseDate: string; DownloadUrl?: { Global?: string } }
interface AsusCat { Name: string; Files: AsusFile[] }
async function asusLists(model: string, win11: boolean): Promise<{ drivers: AsusCat[]; bios: AsusCat[] } | null> {
  const osid = win11 ? 52 : 45;
  try {
    const [d, b] = await Promise.all([
      fetchText(`https://www.asus.com/support/api/product.asmx/GetPDDrivers?website=global&model=${enc(model)}&osid=${osid}`),
      fetchText(`https://www.asus.com/support/api/product.asmx/GetPDBIOS?website=global&model=${enc(model)}`).catch(() => "{}"),
    ]);
    const drivers: AsusCat[] = JSON.parse(d)?.Result?.Obj ?? [];
    const bios: AsusCat[] = JSON.parse(b)?.Result?.Obj ?? [];
    return drivers.length ? { drivers, bios } : null;
  } catch { return null; }
}

const VENDOR_RX: [RegExp, RegExp][] = [
  [/realtek/i, /realtek/i], [/intel/i, /intel/i], [/killer/i, /killer|intel/i],
  [/mediatek|ralink/i, /mediatek|ralink/i], [/marvell|aquantia/i, /marvell|aquantia/i], [/qualcomm|atheros/i, /qualcomm|atheros/i],
  [/amd|advanced micro/i, /amd/i],
];
const vendorRx = (name: string) => VENDOR_RX.find(([rx]) => rx.test(name))?.[1];

/** Archivo oficial de ASUS que corresponde a un driver instalado. */
function asusMatch(it: Item, cats: AsusCat[]): AsusFile | undefined {
  const inCat = (rx: RegExp) => cats.filter((c) => rx.test(c.Name)).flatMap((c) => c.Files ?? []);
  let files: AsusFile[];
  let title: RegExp | undefined;
  switch (it.cat) {
    case "net": files = inCat(it.sub === "wifi" ? /wireless|wlan|wi-?fi/i : /^lan/i); title = vendorRx(it.name); break;
    case "audio": files = inCat(/audio/i); title = vendorRx(it.name); break;
    case "bt": files = inCat(/blue ?tooth/i); title = vendorRx(it.name); break;
    case "storage": files = inCat(/sata|raid|storage/i); title = /rapid storage|\brst\b|vmd/i.test(it.name) ? /rapid storage|\brst\b/i : /raid|nvme/i; break;
    case "video": files = inCat(/vga/i); title = /intel/i.test(it.name) ? /intel/i : /amd|radeon/i; break;
    case "chipset":
      files = inCat(/chipset|serial|mei|management/i);
      title = { me: /management engine|\bme\b/i, serialio: /serial ?io/i, ipf: /innovation platform|dynamic tuning|\bdtt\b/i, gna: /\bgna\b/i, amd: /amd.*chipset|chipset.*amd/i, inf: /intel.*chipset|chipset (driver|device)/i }[it.sub ?? "inf"];
      break;
    default: return undefined;
  }
  if (title) files = files.filter((f) => title!.test(f.Title));
  if (!files.length) return undefined;
  // Misma familia de versión primero (Realtek LAN: 10.x en Win10 vs 1168.x en Win11).
  // Dentro de la familia gana la versión más alta; si no hay de la misma familia, la más reciente.
  const fam = files.filter((f) => sameFamily(f.Version, it.version));
  if (fam.length) return fam.reduce((a, b) => (cmpVer(b.Version, a.Version) > 0 ? b : a));
  return files.reduce((a, b) => (normDate(b.ReleaseDate) > normDate(a.ReleaseDate) ? b : a));
}

// NVIDIA: última versión Game Ready para la placa detectada.
let nvCatalog: Promise<Document | null> | null = null;
const nvLookupTable = () => (nvCatalog ??= fetchText("https://www.nvidia.com/Download/API/lookupValueSearch.aspx?TypeID=3")
  .then((x) => new DOMParser().parseFromString(x, "text/xml")).catch(() => null));

async function nvidiaLatest(gpuName: string, win11: boolean): Promise<{ version: string; date: string; url: string } | null> {
  const name = gpuName.replace(/^NVIDIA\s+/i, "").trim();
  let psid = "120", pfid = "933";   // por defecto: RTX 30 (el driver Game Ready es el mismo para toda la línea GeForce actual)
  const doc = await nvLookupTable();
  if (doc) {
    const hit = [...doc.getElementsByTagName("LookupValue")].find((n) => n.getElementsByTagName("Name")[0]?.textContent?.trim().toLowerCase() === name.toLowerCase());
    if (hit) { psid = hit.getAttribute("ParentID") || psid; pfid = hit.getElementsByTagName("Value")[0]?.textContent?.trim() || pfid; }
    else if (!/geforce|rtx|gtx/i.test(name)) return null;   // Quadro/RTX A…: otra línea de drivers
  }
  try {
    const j = JSON.parse(await fetchText(`https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php?func=DriverManualLookup&psid=${psid}&pfid=${pfid}&osID=${win11 ? 135 : 57}&languageCode=1033&isWHQL=1&dch=1&sort1=0&numberOfResults=1`));
    const info = j?.IDS?.[0]?.downloadInfo;
    if (!info?.Version) return null;
    const dt = new Date(decodeURIComponent(info.ReleaseDateTime || ""));
    return { version: info.Version, date: isNaN(+dt) ? "" : dt.toISOString().slice(0, 10), url: decodeURIComponent(info.DetailsURL || "") || "https://www.nvidia.com/Download/index.aspx" };
  } catch { return null; }
}

const ageStatus = (it: Item, years: number): Status => (it.date && yearsOld(it.date) > years ? "old" : "installed");

// ── análisis completo ────────────────────────────────────────────────────────
export async function analyze(scan: Scan): Promise<Result> {
  const win11 = scan.build >= 22000;
  const vendor = vendorOf(scan);
  const links = boardLinks(scan, vendor);
  const items = installedItems(scan);
  const asus = vendor === "asus" ? await asusLists(scan.board.model, win11) : null;
  // Si ASUS no conoce el modelo, se usa su buscador en vez de un link roto.
  const boardLink = vendor === "asus" && !asus && links.search ? links.search : links.page;

  for (const it of items) {
    if (it.cat === "missing") { it.link = boardLink; continue; }
    if (it.cat === "video") {
      if (/nvidia/i.test(it.name)) {
        const inst = nvidiaVersion(it.version);
        it.version = inst;
        const nv = await nvidiaLatest(it.name, win11);
        if (nv) {
          it.latest = { version: nv.version, date: nv.date };
          it.status = cmpVer(nv.version, inst) > 0 ? "update" : "ok";
          it.link = { src: "NVIDIA", url: nv.url };
        } else {
          it.status = ageStatus(it, 0.5);
          it.link = { src: "NVIDIA", url: "https://www.nvidia.com/Download/index.aspx" };
        }
        continue;
      }
      if (/amd|radeon/i.test(it.name) && !asus) {
        it.status = ageStatus(it, 0.5);
        it.link = { src: "AMD", url: "https://www.amd.com/en/support/download/drivers.html" };
        continue;
      }
      if (/intel/i.test(it.name) && !asus) {
        it.status = ageStatus(it, 1);
        it.link = { src: "Intel", url: "https://www.intel.com/content/www/us/en/support/intel-driver-support-assistant.html" };
        continue;
      }
    }
    if (asus) {
      const f = asusMatch(it, asus.drivers);
      if (f) {
        it.latest = { version: f.Version, date: normDate(f.ReleaseDate) };
        const url = f.DownloadUrl?.Global;
        it.link = url && url.startsWith("https://") ? { src: "ASUS", url } : boardLink;
        // Driver genérico de Windows: se mantiene el aviso, pero con el link al oficial.
        if (it.status === "generic") continue;
        // El chipset INF de Intel informa la versión del .inf, no la del paquete: no se compara.
        // Intel ME numera por año/semana (2552 → 2603): se compara aunque cambie el primer número.
        const comparable = it.sub === "me" || sameFamily(f.Version, it.version);
        if (it.sub === "inf" || !comparable) it.status = ageStatus(it, 3) === "old" && it.latest.date > it.date ? "old" : "installed";
        else it.status = cmpVer(f.Version, it.version) > 0 ? "update" : "ok";
        continue;
      }
    }
    it.status = it.status === "generic" ? "generic" : ageStatus(it, 3);
    it.link = boardLink;
  }

  // BIOS
  const bios: Item = { key: "bios", cat: "bios", name: `BIOS ${scan.bios.version}`, version: scan.bios.version, date: validDate(scan.bios.date) ? scan.bios.date : "", status: "installed" };
  const bf = asus?.bios.find((c) => /bios/i.test(c.Name))?.Files?.[0];
  if (bf) {
    bios.latest = { version: bf.Version, date: normDate(bf.ReleaseDate) };
    bios.status = /^\d+$/.test(bf.Version) && /^\d+$/.test(scan.bios.version) ? (+bf.Version > +scan.bios.version ? "update" : "ok") : "installed";
    bios.link = { src: "ASUS", url: `https://www.asus.com/supportonly/${enc(scan.board.model)}/helpdesk_bios/` };
  } else {
    bios.status = ageStatus(bios, 2);
    bios.link = boardLink;
  }
  items.push(bios);

  const board = scan.laptop ? `${scan.system.maker} ${scan.system.model}` : `${scan.board.maker} ${scan.board.model}`;
  return {
    vendor, boardName: board.replace(/ASUSTeK COMPUTER INC\.?/i, "ASUS").replace(/Micro-Star International Co\., Ltd\.?/i, "MSI").replace(/\s+/g, " ").trim(),
    boardLink, searchLink: vendor === "asus" ? undefined : links.search, compared: !!asus, items,
    osLabel: win11 ? "Windows 11" : "Windows 10",
  };
}

export async function scanDrivers(): Promise<Scan> {
  const r = await runPowershell(SCAN);
  return JSON.parse(r.output.trim().split("\n").pop() || "");
}
