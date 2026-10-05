// Prueba de fuego en un Windows REAL y descartable (GitHub Actions, con admin): ejecuta los
// scripts de la app tal cual los corre el backend y valida lo que la app lee de ellos.
//   1. Lectura: detecciones y escaneos (Chequeo, Drivers, Inicio, Desinstalar, menús…).
//   2. Aplicar y restaurar: backup → TODOS los tweaks de Optimizaciones (menús con todo
//      marcado) → Restaurar → se compara el registro, los servicios y las tareas con el
//      estado de antes.
//   3. Funciones: Auto Game-Mode, Inicio, Limpieza, Desinstalar, Herramientas, Reparar,
//      Reactivar, Perfiles, Gráficos, winget y Red (al final: toca el DNS).
// Uso (en Windows, como admin): node tests/windows/build.mjs && node tests/windows/out/smoke.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { runPs, takeStderr, encodeScript } from "./tauri-mock";

import { BACKUP, ALL_CATEGORIES } from "./.src/pages/Optimizaciones";
import { restoreScript } from "./.src/pages/RestaurarPage";
import { CHEQUEO_SCAN } from "./.src/pages/Chequeo";
import { STARTUP_LIST, toggleScript } from "./.src/pages/Inicio";
import { CLEAN_ITEMS } from "./.src/pages/Limpieza";
import { dnsScript, SAVE_DNS_PREV, RESTORE_DNS_PREV, CURRENT_DNS, CONN_TEST, DNS_TEST } from "./.src/pages/Red";
import { REPAIR_ACTIONS } from "./.src/pages/Reparar";
import { uninstallScript, scanLeftovers, deleteLeftovers, stillInstalled } from "./.src/pages/Desinstalar";
import { INSTALLED_NAMES } from "./.src/pages/AppsPage";
import { FIXES } from "./.src/pages/Reactivar";
import { UNINSTALL_LIST, iconsScript, type UApp } from "./.src/lib/uninstall";
import { GAMER_ON, GAMER_OFF, BG_LOWER, BG_RESTORE, RECOVER } from "./.src/lib/gameMode";
import { ACCOUNT_CHECK } from "./.src/components/AccountWarning";
import { DEDUPE } from "./.src/lib/powerDedupe";
import { scanDrivers, analyze } from "./.src/lib/drivers";
import { readScore, readTemps } from "./.src/lib/metrics";
import { getWuStatus, WU_PAUSE, WU_ENABLE, WU_DISABLE, whoLocks } from "./.src/lib/tools";
import { detectGames } from "./.src/lib/detect";
import { BLOAT_DETECT, BLOAT_APPS, bloatCustom, bloatInstalled } from "./.src/bloat";
import { PERMS, PERMS_STATE, permsDeny } from "./.src/perms";
import { SVCS, SVCS_STATE, SVC_BACKUP_NAMES, svcDisable } from "./.src/services";
import { RUNNING_PROCS } from "./.src/bgApps";
import { WINGET_SETUP } from "./.src/lib/wingetSetup";
import { APP_CATALOG, isAppInstalled } from "./.src/apps";
import { runStream } from "./.src/lib/api";
import { NV_MAXPERF, NV_RESTORE, AMD_MAXPERF, AMD_RESTORE } from "./.src/lib/gpu";
import { PROFILES } from "./.src/profiles";
import type { Tweak } from "./.src/catalog";

// ── Mini framework ──────────────────────────────────────────────────────────
type Status = "ok" | "aviso" | "falla";
interface Result { phase: string; name: string; status: Status; detail: string; secs: number; stderr: string }
const results: Result[] = [];
let phase = "";

/** `envOk`: el fallo puede ser propio de Windows Server (sin Bluetooth, Tienda, GPU…): aviso. */
async function test(name: string, fn: () => Promise<string | void>, opts: { envOk?: boolean } = {}) {
  takeStderr();
  const t0 = Date.now();
  let status: Status = "ok", detail: string;
  try {
    detail = (await fn()) || "";
  } catch (e) {
    status = opts.envOk ? "aviso" : "falla";
    detail = e instanceof Error ? e.message : String(e);
  }
  const stderr = takeStderr();
  if (status === "ok" && stderr) status = "aviso";
  const r = { phase, name, status, detail: detail.slice(0, status === "ok" ? 600 : 6000), secs: Math.round((Date.now() - t0) / 100) / 10, stderr: stderr.slice(0, 1500) };
  results.push(r);
  const icon = status === "ok" ? "✓" : status === "aviso" ? "!" : "✗";
  console.log(`${icon} [${phase}] ${name} (${r.secs}s)${detail ? ` — ${r.detail.split("\n")[0]}` : ""}`);
  if (status !== "ok") { if (detail.includes("\n")) console.log(indent(r.detail)); if (stderr) console.log(indent("stderr: " + r.stderr)); }
}
const indent = (s: string) => s.split("\n").map((l) => "      " + l).join("\n");
function must(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }
const lastJson = (out: string) => JSON.parse(out.trim().split("\n").pop() || "");
const ps = async (script: string, timeout = 600) => runPs(script, timeout);
const ok = async (script: string, timeout = 600) => {
  const r = await ps(script, timeout);
  must(r.ok, `código de salida ${r.code}: ${r.output.slice(0, 400)}`);
  return r.output;
};
const first = (s: string) => s.trim().split("\n")[0]?.trim() ?? "";

// Todos los scripts que la app manda a PowerShell entran en la línea de comandos de
// Windows (-EncodedCommand): el límite de CreateProcess es 32767 caracteres.
const CMDLINE_MAX = 32767 - 120;

// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`Windows ${os.release()} · ${os.cpus().length} CPU · admin: ${await isAdmin()}`);

  // ── 0. Límite de la línea de comandos ──────────────────────────────────────
  phase = "Límites";
  await test("Todos los scripts entran en la línea de comandos de Windows", async () => {
    const all: [string, string][] = [
      ["BACKUP", BACKUP], ["Chequeo", CHEQUEO_SCAN], ["Inicio", STARTUP_LIST], ["Desinstalar (lista)", UNINSTALL_LIST],
      ["winget", WINGET_SETUP], ["bloat (todo)", bloatCustom(BLOAT_APPS.map((a) => a.id))], ["Restaurar", restoreScript("x")],
      ...ALL_CATEGORIES.flatMap((c) => c.tweaks.map((t) => [`Tweak ${t.name}`, scriptOf(t)] as [string, string])),
    ];
    const big = all.map(([n, s]) => [n, encodeScript(s).length] as const).filter(([, l]) => l > CMDLINE_MAX);
    must(!big.length, big.map(([n, l]) => `${n}: ${l} caracteres`).join("\n"));
    return `${all.length} scripts, el más grande: ${Math.max(...all.map(([, s]) => encodeScript(s).length))} caracteres`;
  });

  // ── 1. Lectura ─────────────────────────────────────────────────────────────
  phase = "Lectura";
  await test("Chequeo de PC: escaneo", async () => {
    const d = lastJson(await ok(CHEQUEO_SCAN));
    must(Array.isArray(d.displays) && d.ram && Array.isArray(d.disks) && d.sys && d.power, "faltan campos: " + Object.keys(d).join(","));
    return `${d.disks.length} discos, ${d.ram.gb} GB RAM, plan ${d.power.name || d.power.guid}, ${d.startupOn} apps de inicio`;
  });
  await test("Drivers: escaneo + análisis", async () => {
    const r = await analyze(await scanDrivers());
    return `${r.boardName} · ${r.items.length} ítems · fuente ${r.boardLink.src}`;
  });
  await test("Inicio: lista", async () => `${parseList(await ok(STARTUP_LIST)).length} entradas`);
  let uninstallApps: UApp[] = [];
  await test("Desinstalar: lista de programas", async () => {
    uninstallApps = parseList(await ok(UNINSTALL_LIST, 300)) as unknown as UApp[];
    must(uninstallApps.length > 0, "lista vacía");
    return `${uninstallApps.length} programas`;
  });
  await test("Desinstalar: iconos", async () => {
    const chunk = uninstallApps.slice(0, 20).map((a) => ({ key: a.key, type: a.type, icon: a.icon, location: a.location }));
    const map = JSON.parse((await ok(iconsScript(chunk))) || "{}");
    return `${Object.keys(map).length}/${chunk.length} con icono`;
  });
  await test("Instalar Apps: detección de instaladas", async () => {
    const names = (await ok(INSTALLED_NAMES)).split("|").map((x) => x.trim()).filter(Boolean);
    const found = APP_CATALOG.flatMap((c) => c.apps).filter((a) => isAppInstalled(a, names)).map((a) => a.name);
    // El runner de GitHub trae Git, 7-Zip y Chrome.
    for (const n of ["Git", "7-Zip", "Google Chrome"]) must(found.includes(n), `no detectó ${n} (detectadas: ${found.join(", ")})`);
    return found.join(" · ");
  });
  await test("Bloatware: detección", async () => {
    const out = await ok(BLOAT_DETECT, 300);
    const d = JSON.parse(out.trim().split("\n").pop() || "[]");
    const names = (Array.isArray(d) ? d : [d]).filter((x) => typeof x === "string");
    return `${names.length} paquetes quitables · del catálogo: ${[...bloatInstalled(names)].join(", ") || "ninguno"}`;
  });
  await test("Permisos: estado", async () => {
    const lines = (await ok(PERMS_STATE)).split("\n").filter((l) => /^\w+=(Allow|Deny)$/.test(l.trim()));
    must(lines.length === PERMS.length, `${lines.length}/${PERMS.length} líneas válidas`);
    return `${lines.filter((l) => l.includes("Deny")).length} bloqueados`;
  });
  await test("Servicios: estado", async () => {
    const lines = (await ok(SVCS_STATE)).split("\n").filter((l) => /^[\w.]+=\w+$/.test(l.trim()));
    must(lines.length === SVC_BACKUP_NAMES.length, `${lines.length}/${SVC_BACKUP_NAMES.length} líneas`);
    return lines.map((l) => l.trim()).join(" ");
  });
  await test("Auto Game-Mode: apps abiertas", async () => {
    const out = await ok(RUNNING_PROCS);
    must(out.split("|").includes("powershell"), "no aparece powershell en la lista");
    return `${out.split("|").length} procesos`;
  });
  await test("Panel: puntaje de optimización", async () => { const s = await readScore(); must(s.total > 0, "total 0"); return `${s.applied}/${s.total}`; });
  await test("Panel: temperaturas", async () => { const t = await readTemps(); return `CPU ${t.cpu ?? "N/D"} · GPU ${t.gpu ?? "N/D"}`; });
  await test("Herramientas: estado de Windows Update", async () => { const s = await getWuStatus(); return s.state; });
  await test("Red: DNS actual", async () => { const o = await ok(CURRENT_DNS); must(o.trim(), "vacío"); return o.trim(); });
  await test("Red: test de conexión", async () => {
    const d = lastJson(await ok(CONN_TEST, 300));
    must(d.net && typeof d.net.loss === "number", "JSON inesperado");
    return `internet ${d.net.ok ? `${d.net.avg} ms` : "sin respuesta (ICMP bloqueado en la nube)"} · router ${d.gw?.ok ? "ok" : "—"}`;
  }, { envOk: true });
  await test("Cuenta de la app vs escritorio", async () => first(await ok(ACCOUNT_CHECK)));
  await test("Auto Game-Mode: detectar juegos", async () => `${(await detectGames()).length} juegos`);
  await test("Planes de energía duplicados", async () => first(await ok(DEDUPE)));
  for (const it of CLEAN_ITEMS) {
    await test(`Limpieza: medir ${it.id}`, async () => { const o = await ok(it.scan, 300); must(/SIZE=[\d.]+/.test(o), o); return o.match(/SIZE=[\d.]+/)![0]; });
  }
  await test("Herramientas: quién usa un archivo", async () => {
    const f = path.join(os.tmpdir(), "go-lock-test.txt");
    fs.writeFileSync(f, "x");
    const fd = fs.openSync(f, "r+");
    try {
      const r = await whoLocks(f);
      must(r.status === "ok" && r.lockers.some((l) => l.pid === process.pid), `no encontró a node (pid ${process.pid}): ${JSON.stringify(r)}`);
      return r.lockers.map((l) => `${l.name}:${l.pid}`).join(", ");
    } finally { fs.closeSync(fd); fs.rmSync(f, { force: true }); }
  });

  // ── 2. Aplicar todo y restaurar ────────────────────────────────────────────
  phase = "Aplicar y restaurar";
  const snapScript = snapshotScript();
  let before = "", backupName = "";
  await test("Estado previo (servicios y tareas)", async () => { before = await ok(snapScript); return `${before.split("\n").length} entradas`; });
  await test("Backup", async () => {
    const o = await ok(BACKUP, 900);
    const n = Number(o.match(/Backup del registro: (\d+) ramas/)?.[1] ?? 0);
    must(n > 0, "no exportó ninguna rama:\n" + o);
    backupName = o.match(/Backup en: .*\\([^\\\s]+)\s*$/m)?.[1] ?? "";
    must(backupName, "no informó la carpeta del backup");
    return `${n} ramas · ${backupName} · ${/creado OK/.test(o) ? "con punto de restauración" : "sin punto de restauración"}`;
  });
  for (const c of ALL_CATEGORIES) for (const tw of c.tweaks) {
    await test(`Tweak: ${tw.name}`, async () => {
      const line = first(await ok(scriptOf(tw), 900));
      // La primera línea es lo que la app muestra en el log: no puede ser un error ni una tabla.
      must(!/error occurred|^ERROR|exception|^TaskPath|^Name\s+|denied|denegado/i.test(line), `salida confusa: ${line}`);
      return line;
    }, { envOk: ENV_DEPENDENT.has(tw.name) });
  }
  await test("Restaurar", async () => {
    must(backupName, "no hay backup");
    const o = await ok(restoreScript(backupName), 900);
    must(!/incompleta|ERROR/.test(o), o);
    must(/Registro restaurado/.test(o), o);
    return o.split("\n").filter((l) => /restaurados|quitaron|quitada/i.test(l)).map((l) => l.trim()).join(" · ");
  });
  await test("Registro igual que antes", async () => {
    const o = await ok(compareScript(backupName), 900);
    const diffs = o.split("\n").filter((l) => /^(DIFF|FALTA)/.test(l));
    must(!diffs.length, `${diffs.length} diferencias:\n` + diffs.slice(0, 40).join("\n"));
    return "sin diferencias";
  });
  await test("Servicios, tareas y sistema iguales que antes", async () => {
    const after = await ok(snapScript);
    const norm = (s: string) => s.split("\n").map((l) => l.trim().replace(/\|Running$/, "|Ready")).filter(Boolean);
    const b = new Set(norm(before)), a = norm(after);
    const changed = a.filter((l) => !b.has(l));
    must(!changed.length, "cambiaron:\n" + changed.map((l) => `${l}  (antes: ${norm(before).find((x) => x.startsWith(l.split("|").slice(0, 2).join("|") + "|")) ?? "—"})`).join("\n"));
    return "sin cambios";
  });

  await test("Restaurar: Core Parking en el plan que se usa", async () => {
    // En la pasada general el plan cambia antes (Máximo rendimiento) y Core Parking toca ese
    // plan nuevo. Acá se aplica solo, sobre Equilibrado, y Restaurar tiene que devolverlo.
    const orig = (await ok("powercfg /getactivescheme")).match(/[0-9a-f-]{36}/i)?.[0] ?? "";
    await ok("powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e");
    try {
      const before = await ok(CPU_VALUES);
      must(before.includes("X|cpu|"), "no se pudieron leer los valores del procesador");
      const name = (await ok(BACKUP, 900)).match(/Backup en: .*\\([^\\\s]+)\s*$/m)?.[1] ?? "";
      must(name, "no informó la carpeta del backup");
      const cp = ALL_CATEGORIES.flatMap((c) => c.tweaks).find((t) => t.name.startsWith("Core Parking"))!;
      await ok(cp.script);
      must((await ok(CPU_VALUES)) !== before, "el tweak no cambió nada");
      const o = await ok(restoreScript(name), 900);
      const after = await ok(CPU_VALUES);
      must(after === before, `quedó distinto:\n${after}\nantes:\n${before}\n${o.split("\n").filter((l) => /Sistema/.test(l)).join(" ")}`);
      return before.split("\n").map((l) => l.split("|").slice(2).join("=")).join(" ");
    } finally { if (orig) await ps(`powercfg /setactive ${orig}`); }
  });

  // ── 3. Funciones ───────────────────────────────────────────────────────────
  phase = "Funciones";
  await gameModeTests();
  await startupTests();
  for (const it of CLEAN_ITEMS) {
    await test(`Limpieza: limpiar ${it.id}`, async () => { const o = await ok(it.clean, 600); must(/FREED=[\d.-]+/.test(o), o); return o.match(/FREED=[\d.-]+/)![0]; });
  }
  await uninstallTests();
  await test("Herramientas: pausar Windows Update", async () => { await ok(WU_PAUSE); const s = await getWuStatus(); must(s.state === "paused", s.state); return `hasta ${s.until}`; });
  await test("Herramientas: deshabilitar Windows Update", async () => { await ok(WU_DISABLE); const s = await getWuStatus(); must(s.state === "disabled", s.state); return s.state; });
  await test("Herramientas: reactivar Windows Update", async () => { await ok(WU_ENABLE); const s = await getWuStatus(); must(s.state === "active", s.state); return s.state; });
  for (const p of PROFILES) await test(`Perfiles: plan de energía ${p.id}`, async () => first(await ok(p.planScript)));
  for (const [n, s] of [["NVIDIA máx.", NV_MAXPERF(false)], ["NVIDIA restaurar", NV_RESTORE(false)], ["AMD máx.", AMD_MAXPERF(false)], ["AMD restaurar", AMD_RESTORE(false)]] as const)
    await test(`Gráficos: ${n}`, async () => first(await ok(s)));
  await repairTests();
  for (const f of FIXES) {
    await test(`Reactivar: ${f.id}`, async () => first(await ok(f.script, 900)), { envOk: ["bluetooth", "busqueda", "edge", "onedrive", "impresora"].includes(f.id) });
  }
  await test("Instalar Apps: instalar winget (App Installer)", async () => {
    const lines: string[] = [];
    const r = await runStream(WINGET_SETUP, (l) => lines.push(l));
    must(r.ok && lines.includes("@ok"), `código ${r.code}:\n${lines.join("\n")}`);
    return lines.filter((l) => l.startsWith("@step")).join(" ");
  }, { envOk: true });
  await networkTests();
}

// ── Pruebas por función ─────────────────────────────────────────────────────
async function gameModeTests() {
  const activePlan = async () => (await ok("powercfg /getactivescheme")).match(/[0-9a-f-]{36}/i)?.[0] ?? "";
  const orig = await activePlan();
  const plan0 = "381b4222-f694-41f0-9685-ff5bb260df2e"; // Equilibrado
  await ok(`powercfg /setactive ${plan0}`);
  const fake = path.join(os.tmpdir(), "chrome.exe");
  fs.copyFileSync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "PING.EXE"), fake);
  const child = spawn(fake, ["-n", "600", "127.0.0.1"], { windowsHide: true, stdio: "ignore" });
  const prio = async () => (await ok(`(Get-Process -Id ${child.pid}).PriorityClass`)).trim();
  let prio0 = "";
  try {
    await test("Auto Game-Mode: activar (juego abierto)", async () => {
      const o = await ok(GAMER_ON);
      const p = await activePlan();
      must(p && p !== plan0, `el plan no cambió (${p})`);
      must(/GM=1/.test(await ok(RECOVER)), "no quedó la marca GmActive");
      return `${first(o)} · plan ${plan0.slice(0, 8)} → ${p.slice(0, 8)}`;
    });
    await test("Auto Game-Mode: frenar apps de fondo", async () => {
      prio0 = await prio(); // en el runner de GitHub los procesos arrancan en BelowNormal
      const o = await ok(BG_LOWER(["chrome"]));
      must(/BG=1/.test(o), o);
      must((await prio()) === "Idle", `prioridad: ${await prio()}`);
      return "chrome → Idle";
    });
    await test("Auto Game-Mode: restaurar apps de fondo", async () => {
      await ok(BG_RESTORE);
      must((await prio()) === prio0, `prioridad: ${await prio()} (antes: ${prio0})`);
      return `chrome → ${prio0}`;
    });
    await test("Auto Game-Mode: desactivar (juego cerrado)", async () => {
      await ok(GAMER_OFF);
      must((await activePlan()) === plan0, "no volvió al plan original");
      must(/GM=0;BG=0/.test(await ok(RECOVER)), "quedaron marcas");
      return "plan original restaurado";
    });
  } finally { child.kill(); if (orig) await ps(`powercfg /setactive ${orig}`); }
}

async function startupTests() {
  const name = "GO Smoke Test";
  await ok(`New-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '${name}' -Value 'cmd.exe /c exit' -PropertyType String -Force | Out-Null`);
  const find = async () => parseList(await ok(STARTUP_LIST)).find((e) => e.name === name) as { enabled: boolean; scope: "HKCU" } | undefined;
  try {
    await test("Inicio: desactivar y activar", async () => {
      const e = await find();
      must(e && e.enabled, "no apareció o no está activa");
      await ok(toggleScript({ name, cmd: "", scope: "HKCU", enabled: true }, false));
      must((await find())?.enabled === false, "no quedó desactivada");
      await ok(toggleScript({ name, cmd: "", scope: "HKCU", enabled: false }, true));
      must((await find())?.enabled === true, "no volvió a activarse");
      return "ok";
    });
  } finally {
    await ps(`Remove-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '${name}' -EA SilentlyContinue; Remove-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run' -Name '${name}' -EA SilentlyContinue`);
  }
}

async function uninstallTests() {
  // Programa de prueba: su desinstalador borra su clave y su carpeta.
  const dir = "C:\\Program Files\\GO Smoke App";
  const key = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\GOSmokeApp";
  await ok(String.raw`New-Item -ItemType Directory -Force -Path '${dir}' | Out-Null
Set-Content -LiteralPath '${dir}\uninst.cmd' -Value @('@reg delete "${key}" /f >nul 2>&1', '@rd /s /q "${dir}\data" >nul 2>&1', '@exit /b 0') -Encoding ASCII
New-Item -ItemType Directory -Force -Path '${dir}\data' | Out-Null
New-Item -Force -Path 'Registry::${key}' | Out-Null
Set-ItemProperty 'Registry::${key}' DisplayName 'GO Smoke App'
Set-ItemProperty 'Registry::${key}' Publisher 'Gaming Optimizer Test'
Set-ItemProperty 'Registry::${key}' InstallLocation '${dir}'
Set-ItemProperty 'Registry::${key}' UninstallString '"${dir}\uninst.cmd"'
New-Item -ItemType Directory -Force -Path "$env:ProgramData\GO Smoke App" | Out-Null`);
  const app = (parseList(await ok(UNINSTALL_LIST, 300)) as unknown as UApp[]).find((a) => a.name === "GO Smoke App");
  await test("Desinstalar: aparece en la lista", async () => { must(app, "no aparece"); return `${app.scope} · ${app.key}`; });
  if (!app) return;
  await test("Desinstalar: desinstalar", async () => {
    const o = await ok(uninstallScript(app), 300);
    must(/EXIT:0/.test(o), o);
    must(/GONE/.test(await ok(stillInstalled(app))), "la clave de desinstalación sigue");
    return first(o);
  });
  await test("Desinstalar: buscar y borrar restos", async () => {
    const d = JSON.parse((await ok(scanLeftovers(app), 300)) || "[]");
    const items = (Array.isArray(d) ? d : [d]) as { type: string; path: string }[];
    must(items.some((i) => i.path.toLowerCase().includes("go smoke app")), "no encontró los restos: " + JSON.stringify(items));
    const o = await ok(deleteLeftovers(items.map(({ type, path: p }) => ({ type, path: p }))), 300);
    must(!fs.existsSync(dir) && !fs.existsSync(path.join(process.env.ProgramData ?? "C:\\ProgramData", "GO Smoke App")), "quedaron carpetas: " + o);
    return first(o);
  });
}

async function repairTests() {
  const sfc = REPAIR_ACTIONS.find((a) => a.id === "sfc")!;
  await test("Reparar: SFC (lectura de la salida en UTF-16)", async () => {
    // /verifyonly: misma salida que /scannow, sin reparar.
    const lines: string[] = [];
    const r = await runStream(sfc.script.replace("/scannow", "/verifyonly"), (l) => lines.push(l.replace(/\0/g, "")));
    const text = lines.join("\n");
    must(!text.includes("\0") && /[a-z]{4,}/i.test(text), "salida ilegible:\n" + text.slice(0, 400));
    must(/resource protection|protecci/i.test(text), "no aparece el resultado de SFC:\n" + text.slice(-600));
    return `código ${r.code} · ${lines.filter((l) => /resource protection|protecci/i.test(l)).pop()}`;
  }, { envOk: true });
  for (const id of ["explorer", "iconcache"]) {
    const a = REPAIR_ACTIONS.find((x) => x.id === id)!;
    await test(`Reparar: ${id}`, async () => {
      const lines: string[] = [];
      const r = await runStream(a.script, (l) => lines.push(l));
      must(r.ok, `código ${r.code}: ${lines.join(" | ")}`);
      return lines.pop() ?? "";
    });
  }
}

async function networkTests() {
  await test("Red: medir DNS", async () => {
    const d = lastJson(await ok(DNS_TEST, 300));
    must(Array.isArray(d) && d.length > 0, "JSON inesperado");
    return d.map((x: { h: string; ms: number }) => `${x.h}=${x.ms}`).join(" ");
  });
  await test("Red: guardar DNS previo", async () => first(await ok(SAVE_DNS_PREV)));
  await test("Red: aplicar Cloudflare", async () => {
    await ok(dnsScript(["1.1.1.1", "1.0.0.1"]));
    const cur = await ok(CURRENT_DNS);
    must(cur.includes("1.1.1.1"), `DNS actual: ${cur}`);
    must((await ps("Resolve-DnsName github.com -Type A -EA Stop | Out-Null; 'OK'")).output.includes("OK"), "no resuelve nombres");
    return cur.trim();
  });
  await test("Red: volver a automático", async () => {
    await ok(dnsScript(null));
    must((await ps("Resolve-DnsName github.com -Type A -EA Stop | Out-Null; 'OK'")).output.includes("OK"), "no resuelve nombres");
    return first(await ok(CURRENT_DNS));
  });
  await test("Red: restaurar DNS previo", async () => first((await ps(RESTORE_DNS_PREV)).output));
}

// ── Utilidades ──────────────────────────────────────────────────────────────
// Menús de Optimizaciones con TODO marcado (lo más exigente).
function scriptOf(tw: Tweak): string {
  if (tw.picker === "bloat") return bloatCustom(BLOAT_APPS.map((a) => a.id));
  if (tw.picker === "perms") return permsDeny(PERMS.map((x) => x.id));
  if (tw.picker === "svc") return svcDisable(SVCS.map((x) => x.id));
  return tw.script;
}
// En Windows Server no existen (o no se pueden cambiar) y es esperable que fallen.
const ENV_DEPENDENT = new Set([
  "Desinstalar Microsoft Edge (si usás otro navegador)", "Desactivar HPET (timer de alta precisión)",
  "Desanclar todas las apps del menu Inicio", "Deshabilitar Windows Defender (ADVERTENCIA: reduce proteccion)",
  "Desactivar Recall (captura de IA)", "Deshabilitar Large Send Offload (LSO)", "Plan de energía: Máximo rendimiento",
]);

function parseList(out: string): Record<string, unknown>[] {
  const d = JSON.parse(out.trim() || "[]");
  return Array.isArray(d) ? d : [d];
}

async function isAdmin() {
  return (await runPs("([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrators')")).output.trim();
}

// Servicios y tareas que guarda el backup (se leen del propio script de BACKUP).
function snapshotScript() {
  const svcs = BACKUP.match(/foreach\(\$sn in (@\([^)]*\))\)/)?.[1] ?? "@()";
  const tasks = BACKUP.match(/foreach\(\$tp in (@\([^)]*\))\)/)?.[1] ?? "@()";
  return String.raw`foreach($n in ${svcs}){ $v=(Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$n" -Name Start -EA SilentlyContinue).Start; if($null -ne $v){ "S|$n|$v" } }
foreach($tp in ${tasks}){ $t=Get-ScheduledTask -TaskPath ((Split-Path $tp) + '\') -TaskName (Split-Path $tp -Leaf) -EA SilentlyContinue; if($t){ "T|$tp|$($t.State)" } }
"P|TimerRes|" + [bool](Get-ScheduledTask -TaskName 'GamingOptimizer_TimerRes' -EA SilentlyContinue)
if((powercfg /getactivescheme | Out-String) -match '[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}'){ "X|plan|" + $Matches[0] }
"X|hibernate|" + (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' -Name HibernateEnabled -EA SilentlyContinue).HibernateEnabled
$be=(bcdedit /enum '{current}' 2>$null | Out-String)
foreach($e in 'useplatformclock','disabledynamictick'){ "X|$e|" + $(if($be -match "(?im)^$e\s+(\S+)"){ $Matches[1] } else { '' }) }
Get-PnpDevice -EA SilentlyContinue | Where-Object { $_.InstanceId -like 'ACPI\PNP0103*' } | ForEach-Object { "X|hpet|$($_.InstanceId)|$($_.Status)" }
"X|teredo|" + (Get-NetTeredoConfiguration -EA SilentlyContinue).Type
Get-NetAdapterLso -EA SilentlyContinue | ForEach-Object { "X|lso|$($_.Name)|$($_.IPv4Enabled)|$($_.IPv6Enabled)" }
Get-NetAdapterBinding -ComponentID ms_tcpip6 -EA SilentlyContinue | ForEach-Object { "X|ipv6|$($_.Name)|$($_.Enabled)" }
"X|rtOff|" + (Get-MpPreference -EA SilentlyContinue).DisableRealtimeMonitoring
"X|autotuning|" + (Get-NetTCPSetting -SettingName Internet -EA SilentlyContinue).AutoTuningLevelLocal
"X|rss|" + (Get-NetOffloadGlobalSetting -EA SilentlyContinue).ReceiveSideScaling
${CPU_VALUES}
"X|hosts|" + ((@(Get-Content "$env:windir\System32\drivers\etc\hosts" -EA SilentlyContinue) | Where-Object { $_.Trim() }) -join ' / ')`;
}

// Valores del procesador que cambia "Core Parking OFF", en el plan activo.
const CPU_VALUES = String.raw`foreach($cs in 'CPMINCORES','CPMAXCORES','PROCTHROTTLEMIN','PROCTHROTTLEMAX'){ foreach($q in '/q','/qh'){ $hx=@([regex]::Matches((powercfg $q SCHEME_CURRENT SUB_PROCESSOR $cs 2>$null | Out-String), '0x[0-9a-fA-F]{8}') | ForEach-Object { $_.Value }); if($hx.Count -ge 2){ "X|cpu|$cs|" + $hx[-2] + '|' + $hx[-1]; break } } }`;

// Re-exporta cada rama del backup y la compara con la copia de antes de los tweaks.
// Se ignoran datos que Windows cambia solo (DHCP de las placas de red).
function compareScript(name: string) {
  return String.raw`$dir=Join-Path "$env:SystemDrive\OptimizacionBackup" '${name.replace(/'/g, "''")}'
$tmp=Join-Path $env:TEMP 'go-cmp'; Remove-Item $tmp -Recurse -Force -EA SilentlyContinue; New-Item $tmp -ItemType Directory | Out-Null
$volatile='(?i)^"(Lease|T1|T2|Dhcp|IPAddress|SubnetMask|DefaultGateway|AddressType|IsServerNapAware)'
# [clave] → valores, con los valores de varias líneas (hex con '\' al final) unidos en una.
function Get-Sec($lines){
  $h=[ordered]@{}; $k=$null; $buf=''
  foreach($l in $lines){
    if($l.EndsWith('\')){ $buf+=$l.TrimEnd('\').Trim(); continue }
    $l=$buf + $l.Trim(); $buf=''
    if($l -match '^\[(.+)\]$'){ $k=$Matches[1].ToLower(); $h[$k]=New-Object 'System.Collections.Generic.List[string]'; continue }
    if($k -and $l){ $h[$k].Add($l) }
  }
  $h
}
foreach($f in Get-ChildItem -LiteralPath $dir -Filter *.reg){
  if($f.BaseName -eq 'defender-features'){ continue }
  $old=Get-Sec @(Get-Content -LiteralPath $f.FullName -Encoding Unicode)
  $key=@($old.Keys)[0]
  $new=Join-Path $tmp $f.Name
  reg export $key $new /y > $null 2>&1
  if($LASTEXITCODE -ne 0){ Write-Output ("FALTA " + $f.BaseName + ": " + $key); continue }
  $cur=Get-Sec @(Get-Content -LiteralPath $new -Encoding Unicode)
  foreach($k in $old.Keys){
    if(-not $cur.Contains($k)){ Write-Output ("DIFF " + $f.BaseName + " falta la subclave " + $k); continue }
    foreach($v in $old[$k]){ if(-not $cur[$k].Contains($v) -and $v -notmatch $volatile){ Write-Output ("DIFF " + $f.BaseName + " [" + $k + "] <= " + $v) } }
    foreach($v in $cur[$k]){ if(-not $old[$k].Contains($v) -and $v -notmatch $volatile){ Write-Output ("DIFF " + $f.BaseName + " [" + $k + "] => " + $v) } }
  }
  # Subclaves nuevas (no en las ramas que se guardan sin subclaves)
  if($old.Count -gt 1){ foreach($k in $cur.Keys){ if(-not $old.Contains($k)){ Write-Output ("DIFF " + $f.BaseName + " subclave nueva " + $k) } } }
}
foreach($a in @(Get-ChildItem -LiteralPath $dir -Filter *.absent)){
  $k=(Get-Content -LiteralPath $a.FullName -Raw).Trim()
  if(Test-Path -LiteralPath ('Registry::' + $k)){ Write-Output ("DIFF " + $a.BaseName + " quedó una clave que no existía: " + $k) }
}
'FIN'`;
}

// ── Informe ─────────────────────────────────────────────────────────────────
main().catch((e) => { console.error("ERROR GENERAL:", e); results.push({ phase: "General", name: "La prueba se cortó", status: "falla", detail: String(e?.stack ?? e), secs: 0, stderr: "" }); })
  .finally(() => {
    const n = (s: Status) => results.filter((r) => r.status === s).length;
    const sum = [
      `## Prueba de fuego en Windows`,
      `**${n("ok")} ok · ${n("aviso")} avisos · ${n("falla")} fallas** (de ${results.length})`, "",
      "| | Fase | Prueba | Detalle | s |", "|---|---|---|---|---|",
      ...results.map((r) => `| ${r.status === "ok" ? "✅" : r.status === "aviso" ? "⚠️" : "❌"} | ${r.phase} | ${r.name} | ${(r.detail.split("\n")[0] + (r.stderr ? ` · stderr: ${r.stderr.split("\n")[0]}` : "")).replace(/\|/g, "\\|").slice(0, 200)} | ${r.secs} |`),
    ].join("\n");
    fs.mkdirSync(path.join("tests", "windows", "out"), { recursive: true });
    fs.writeFileSync(path.join("tests", "windows", "out", "results.json"), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join("tests", "windows", "out", "summary.md"), sum);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, sum + "\n");
    console.log(`\n${n("ok")} ok · ${n("aviso")} avisos · ${n("falla")} fallas`);
    process.exit(n("falla") ? 1 : 0);
  });
