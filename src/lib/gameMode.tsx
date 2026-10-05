import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { startGameWatch, stopGameWatch, runPowershell, clearStandbyRam } from "./api";
import { ensureNotify, notify } from "./notify";
import { useI18n } from "./i18n";
import { BG_CATALOG, BG_RECOMMENDED } from "../bgApps";

// Guarda el plan de energía y SystemResponsiveness previos para restaurarlos al salir.
const GUID_RX = String.raw`([0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})`;

// GmActive=1 mientras el modo gamer está aplicado. Si la app se cerraba en pleno juego
// ("Salir" en la bandeja, cuelgue, apagado), el próximo juego guardaba como "previo" el
// plan de ALTO RENDIMIENTO y el plan original del usuario se perdía para siempre. Con la
// marca, el previo sólo se guarda una vez, y al abrir la app se restaura (RECOVER).
const GAMER_ON = String.raw`$p='HKCU:\Software\GamingOptimizer'; if(!(Test-Path $p)){ New-Item $p -Force | Out-Null }
$sysp='HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'
if((Get-ItemProperty $p -Name GmActive -EA SilentlyContinue).GmActive -ne 1){
  $as=powercfg /getactivescheme
  if($as -match '${GUID_RX}'){ Set-ItemProperty $p PrevPlan $matches[1] -Force }
  $cr=(Get-ItemProperty $sysp -Name SystemResponsiveness -EA SilentlyContinue).SystemResponsiveness
  if($null -eq $cr){ $cr=20 }
  Set-ItemProperty $p PrevResp $cr -Force
  Set-ItemProperty $p GmActive 1 -Type DWord -Force
}
# Por prioridad: primero Máximo rendimiento (Ultimate) en cualquier idioma, después Alto rendimiento.
# Antes se tomaba la primera línea que coincidía: en Windows en español "Máximo rendimiento" no
# coincidía con 'Ultimate' y siempre terminaba activando "Alto rendimiento".
$list=powercfg -list; $hp=$null
foreach($rx in 'Gaming Optimizer|Ultimate|M.ximo rendimiento|Desempenho M.ximo|Ultimative Leistung|Performances optimales','High performance|Alto rendimiento|Alto desempenho|H.chstleistung|Performances .lev.es'){
  $hp=$list | Select-String $rx | Select-Object -First 1; if($hp){ break }
}
if($hp -and "$hp" -match '${GUID_RX}'){ powercfg /setactive $matches[1] } else { powercfg /setactive SCHEME_MAX }
Set-ItemProperty $sysp SystemResponsiveness 0 -Type DWord -Force -EA SilentlyContinue
Write-Output OK`;

const GAMER_OFF = String.raw`$p='HKCU:\Software\GamingOptimizer'
$prev=(Get-ItemProperty $p -Name PrevPlan -EA SilentlyContinue).PrevPlan
if($prev){ powercfg /setactive $prev } else { powercfg /setactive SCHEME_BALANCED }
$pr=(Get-ItemProperty $p -Name PrevResp -EA SilentlyContinue).PrevResp
$sysp='HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'
if($null -ne $pr){ Set-ItemProperty $sysp SystemResponsiveness $pr -Type DWord -Force -EA SilentlyContinue }
Remove-ItemProperty $p -Name GmActive -EA SilentlyContinue
Write-Output OK`;

// Apps de fondo a las que se les baja la prioridad mientras jugás: las que el usuario
// eligió en Auto Game-Mode (ver bgApps.ts; Discord nunca, para no cortar la voz). Se
// restauran al cerrar el juego.
const psNames = (ids: string[]) => ids.map((x) => `'${x.replace(/'/g, "''")}'`).join(",");
// Antes de bajar a Idle, guardamos la prioridad original de cada proceso POR PID
// (no por nombre) en el registro, para restaurar exactamente lo que bajamos —
// aunque haya dos procesos con el mismo .exe y prioridades distintas.
// Si quedó una lista sin restaurar (la app se cerró en pleno juego), se conserva la
// prioridad ORIGINAL de esos procesos: si no, se guardaba "Idle" y quedaban en Idle.
const BG_LOWER = (apps: string[]) => String.raw`$bg=@(${psNames(apps)}); $p='HKCU:\Software\GamingOptimizer'; if(!(Test-Path $p)){ New-Item $p -Force | Out-Null }
$old=@{}
$raw=(Get-ItemProperty $p -Name BgPrios -EA SilentlyContinue).BgPrios
if($raw){ foreach($pair in ($raw -split ';')){ $kv=$pair -split '=',2; if($kv.Count -eq 2){ $old[$kv[0]]=$kv[1] } } }
$saved=@(); $n=0
foreach($x in $bg){ Get-Process -Name $x -EA SilentlyContinue | ForEach-Object {
  try{ $id=$_.Id.ToString(); $prio=if($old.ContainsKey($id)){ $old[$id] }else{ $_.PriorityClass.ToString() }; $_.PriorityClass='Idle'; $saved += ($id + '=' + $prio); $n++ }catch{}
} }
Set-ItemProperty $p BgPrios ($saved -join ';') -Force
Write-Output ("BG=" + $n)`;
const BG_RESTORE = String.raw`$p='HKCU:\Software\GamingOptimizer'
$raw=(Get-ItemProperty $p -Name BgPrios -EA SilentlyContinue).BgPrios
# Sólo si sigue en Idle (la que pusimos): si el PID ya es OTRO proceso (se cerró y se
# reusó el número, ej. tras reiniciar) o el usuario la cambió, no se toca.
if($raw){ foreach($pair in ($raw -split ';')){ $kv=$pair -split '=',2; if($kv.Count -eq 2){ try{ $pr=Get-Process -Id ([int]$kv[0]) -EA Stop; if("$($pr.PriorityClass)" -eq 'Idle'){ $pr.PriorityClass=$kv[1] } }catch{} } } }
Remove-ItemProperty $p -Name BgPrios -EA SilentlyContinue
Write-Output OK`;
// Al abrir la app: si quedó el modo gamer aplicado de una sesión que no terminó bien,
// se restaura (plan de energía, SystemResponsiveness y prioridades de fondo).
const RECOVER = String.raw`$p='HKCU:\Software\GamingOptimizer'
$on=(Get-ItemProperty $p -Name GmActive -EA SilentlyContinue).GmActive -eq 1
$bg=[bool](Get-ItemProperty $p -Name BgPrios -EA SilentlyContinue).BgPrios
Write-Output ("GM=" + [int]$on + ";BG=" + [int]$bg)`;
const prioScript = (exe: string) => {
  const base = exe.replace(/\.exe$/i, "").replace(/'/g, "''");
  return `Get-Process -Name '${base}' -EA SilentlyContinue | ForEach-Object { try{ $_.PriorityClass='High' }catch{} }; Write-Output OK`;
};

export const DEFAULT_GAMES = [
  "valorant.exe", "valorant-win64-shipping.exe", "cs2.exe", "csgo.exe",
  "leagueclient.exe", "league of legends.exe", "fortniteclient-win64-shipping.exe",
  "gta5.exe", "rainbowsix.exe", "overwatch.exe", "r5apex.exe", "dota2.exe",
  "eldenring.exe", "cyberpunk2077.exe", "rocketleague.exe",
];

type LogMsg = (t: (k: string) => string) => string;
interface LogEntry { ts: number | null; msg: LogMsg }

// Apps de fondo elegidas (por defecto, las recomendadas). Sólo ids conocidos del catálogo.
const loadBg = (): string[] => {
  try {
    const s = localStorage.getItem("gm_bg");
    if (s) { const v = JSON.parse(s); if (Array.isArray(v)) return BG_CATALOG.map((x) => x.id).filter((id) => v.includes(id)); }
  } catch { /* sin storage o dañado: recomendadas */ }
  return BG_RECOMMENDED;
};

const loadGames = (): string[] => {
  try { const s = localStorage.getItem("gm_games"); if (s) return JSON.parse(s); } catch {}
  return DEFAULT_GAMES;
};

interface Ctx {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  pro: boolean;
  setPro: (v: boolean) => void;
  games: string[];
  addGame: (g: string) => void;
  removeGame: (g: string) => void;
  playing: string | null;
  log: string[];
  bgApps: string[];
  setBgApps: (ids: string[]) => void;
}
const GameModeCtx = createContext<Ctx>({
  enabled: false, setEnabled: () => {}, pro: true, setPro: () => {},
  games: [], addGame: () => {}, removeGame: () => {}, playing: null, log: [],
  bgApps: [], setBgApps: () => {},
});

/** Controla el Auto Game-Mode a nivel de toda la app (siempre montado).
 *  Así el modo gamer se aplica esté donde esté el usuario, y se reanuda al abrir. */
export function GameModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem("gm_enabled") === "1");
  const [pro, setProState] = useState(() => localStorage.getItem("gm_pro") !== "0");
  const [games, setGames] = useState<string[]>(loadGames);
  const [playing, setPlaying] = useState<string | null>(null);
  const [bgApps, setBgAppsState] = useState<string[]>(loadBg);
  // El listener de game-on se registra una vez: lee la lista ACTUAL vía ref (sólo cambia acá).
  const bgRef = useRef(bgApps);
  const setBgApps = (ids: string[]) => {
    try { localStorage.setItem("gm_bg", JSON.stringify(ids)); } catch { /* sólo esta sesión */ }
    bgRef.current = ids;
    setBgAppsState(ids);
  };
  const { t } = useI18n();
  // Los listeners se registran una sola vez: leen el idioma ACTUAL vía ref.
  const tRef = useRef(t);
  tRef.current = t;
  const tr = (k: string) => tRef.current(k);
  // La actividad se guarda como "mensaje por traducir" (no como texto ya traducido):
  // así, si cambiás de idioma, todo el registro se muestra en el idioma nuevo.
  const [entries, setEntries] = useState<LogEntry[]>(() => [{ ts: null, msg: (tt) => tt("gml.ready") }]);
  const playingRef = useRef<string | null>(null);
  playingRef.current = playing;
  const proRef = useRef(pro);
  proRef.current = pro;
  // ¿Se aplicaron las optimizaciones "pro" en la sesión de juego actual? Al cerrar
  // el juego hay que restaurar según lo que realmente se aplicó, no según el toggle
  // actual (el usuario pudo apagar Pro mientras jugaba y si no, las prioridades y
  // apps de fondo quedaban modificadas para siempre).
  const appliedProRef = useRef(false);

  const addLog = (msg: LogMsg) => setEntries((l) => [...l.slice(-60), { ts: Date.now(), msg }]);
  const log = entries.map((e) => (e.ts ? `[${new Date(e.ts).toLocaleTimeString()}] ` : "") + e.msg(t));

  const setPro = (v: boolean) => { localStorage.setItem("gm_pro", v ? "1" : "0"); setProState(v); };

  // Cola secuencial de operaciones. game-on y game-off son asíncronos; sin esto
  // podían intercalarse (si el juego se cierra mientras game-on aún aplica
  // cambios, game-off terminaba primero y game-on seguía optimizando sin juego).
  // Encolando, siempre corren de a uno y en orden de llegada.
  const opChain = useRef<Promise<void>>(Promise.resolve());
  const enqueue = (fn: () => Promise<void>) => {
    opChain.current = opChain.current.then(fn).catch(() => {});
    return opChain.current;
  };

  // Listeners de eventos del daemon — una sola vez, a nivel app.
  useEffect(() => {
    // Recuperación al arrancar: se encola ANTES que cualquier game-on, así un juego que
    // ya esté abierto vuelve a aplicar el modo gamer después de restaurar.
    enqueue(async () => {
      const r = await runPowershell(RECOVER);
      if (/GM=1/.test(r.output)) await runPowershell(GAMER_OFF);
      if (/BG=1/.test(r.output)) await runPowershell(BG_RESTORE);
    });
    const uns: UnlistenFn[] = [];
    // StrictMode (dev) desmonta antes de que listen() resuelva: sin esto quedaban
    // listeners duplicados y cada juego se procesaba dos veces.
    let disposed = false;
    const keep = (u: UnlistenFn) => (disposed ? u() : uns.push(u));
    listen<string>("game-on", (e) => {
      const g = e.payload;
      enqueue(async () => {
        setPlaying(g);
        addLog((tt) => tt("gml.detected").replace("{g}", g));
        notify(tr("gml.onTitle"), tr("gml.onBody").replace("{g}", g));
        await runPowershell(GAMER_ON);
        if (proRef.current) {
          await runPowershell(prioScript(g));
          // Sin apps elegidas no se toca nada (BG_LOWER guardaría una lista vacía igual).
          const bg = bgRef.current.length ? await runPowershell(BG_LOWER(bgRef.current)) : { ok: true, output: "BG=0" };
          // Marcar YA: prioScript y BG_LOWER ya modificaron procesos, así que
          // game-off debe restaurar aunque lo que sigue (clearStandbyRam) falle.
          appliedProRef.current = true;
          const ram = await clearStandbyRam(localStorage.getItem("lang") || "es");
          const bgN = bg.output.match(/BG=(\d+)/)?.[1] ?? "0";
          addLog((tt) => tt("gml.pro").replace("{n}", bgN).replace("{ram}", tt(ram.ok ? "gml.ramFreed" : "gml.ramSame")));
        }
      });
    }).then(keep);
    listen("game-off", () => {
      enqueue(async () => {
        addLog((tt) => tt("gml.closed"));
        notify(tr("gml.offTitle"), tr("gml.offBody"));
        await runPowershell(GAMER_OFF);
        if (appliedProRef.current) { await runPowershell(BG_RESTORE); appliedProRef.current = false; }
        setPlaying(null);
      });
    }).then(keep);
    return () => { disposed = true; uns.forEach((u) => u()); };
  }, []);

  // Arranca/detiene el daemon según enabled/games (también al iniciar si quedó activado).
  // Solo se registra en la actividad cuando algo cambió de verdad: al abrir la app con el
  // modo apagado no hace falta un "desactivado" (y StrictMode no duplica líneas en dev).
  const lastWatch = useRef<{ enabled: boolean; games: string[] } | null>(null);
  useEffect(() => {
    localStorage.setItem("gm_enabled", enabled ? "1" : "0");
    const prev = lastWatch.current;
    // Encendido: se registra al activarse o si cambió la lista. Apagado: solo si antes estaba activo.
    const changed = enabled ? !prev?.enabled || prev.games !== games : !!prev?.enabled;
    lastWatch.current = { enabled, games };
    if (enabled) {
      ensureNotify();
      startGameWatch(games);
      const n = String(games.length), withPro = pro;
      if (changed) addLog((tt) => tt("gml.watching").replace("{n}", n) + (withPro ? tt("gml.proSuffix") : ""));
    } else {
      stopGameWatch();
      if (playingRef.current) {
        enqueue(async () => {
          await runPowershell(GAMER_OFF);
          if (appliedProRef.current) { await runPowershell(BG_RESTORE); appliedProRef.current = false; }
          setPlaying(null);
        });
      }
      if (changed) addLog((tt) => tt("gml.off"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, games]);

  const addGame = (raw: string) => {
    const g = raw.trim().toLowerCase();
    setGames((cur) => {
      if (!g || cur.includes(g)) return cur;
      const n = [...cur, g];
      localStorage.setItem("gm_games", JSON.stringify(n));
      return n;
    });
  };
  const removeGame = (g: string) =>
    setGames((cur) => {
      const n = cur.filter((x) => x !== g);
      localStorage.setItem("gm_games", JSON.stringify(n));
      return n;
    });

  return (
    <GameModeCtx.Provider value={{ enabled, setEnabled, pro, setPro, games, addGame, removeGame, playing, log, bgApps, setBgApps }}>
      {children}
    </GameModeCtx.Provider>
  );
}

export const useGameMode = () => useContext(GameModeCtx);
