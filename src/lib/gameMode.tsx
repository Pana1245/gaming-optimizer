import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { startGameWatch, stopGameWatch, runPowershell, clearStandbyRam } from "./api";
import { ensureNotify, notify } from "./notify";

// Guarda el plan de energía y SystemResponsiveness previos para restaurarlos al salir.
const GUID_RX = String.raw`([0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})`;

const GAMER_ON = String.raw`$p='HKCU:\Software\GamingOptimizer'; if(!(Test-Path $p)){ New-Item $p -Force | Out-Null }
$as=powercfg /getactivescheme
if($as -match '${GUID_RX}'){ Set-ItemProperty $p PrevPlan $matches[1] -Force }
$sysp='HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'
$cr=(Get-ItemProperty $sysp -Name SystemResponsiveness -EA SilentlyContinue).SystemResponsiveness
if($null -eq $cr){ $cr=20 }
Set-ItemProperty $p PrevResp $cr -Force
$hp=powercfg -list | Select-String 'Ultimate|High performance|Alto rendimiento' | Select-Object -First 1
if($hp -and "$hp" -match '${GUID_RX}'){ powercfg /setactive $matches[1] } else { powercfg /setactive SCHEME_MAX }
Set-ItemProperty $sysp SystemResponsiveness 0 -Type DWord -Force -EA SilentlyContinue
Write-Output OK`;

const GAMER_OFF = String.raw`$p='HKCU:\Software\GamingOptimizer'
$prev=(Get-ItemProperty $p -Name PrevPlan -EA SilentlyContinue).PrevPlan
if($prev){ powercfg /setactive $prev } else { powercfg /setactive SCHEME_BALANCED }
$pr=(Get-ItemProperty $p -Name PrevResp -EA SilentlyContinue).PrevResp
$sysp='HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'
if($null -ne $pr){ Set-ItemProperty $sysp SystemResponsiveness $pr -Type DWord -Force -EA SilentlyContinue }
Write-Output OK`;

// Apps de fondo a las que se les baja la prioridad mientras jugás (Discord queda
// en Normal para no afectar la voz). Se restauran al cerrar el juego.
const BG_APPS = "'spotify','chrome','msedge','firefox','opera','brave','slack','onedrive','dropbox','steamwebhelper','epicgameslauncher','googledrivefs'";
// Antes de bajar a Idle, guardamos la prioridad original de cada app (por nombre)
// en el registro, para restaurarla tal cual al cerrar el juego en vez de forzar
// 'Normal' (que pisaba prioridades personalizadas del usuario).
const BG_LOWER = String.raw`$bg=@(${BG_APPS}); $p='HKCU:\Software\GamingOptimizer'; if(!(Test-Path $p)){ New-Item $p -Force | Out-Null }
$saved=@{}; $n=0
foreach($x in $bg){ Get-Process -Name $x -EA SilentlyContinue | ForEach-Object {
  try{ if(-not $saved.ContainsKey($x)){ $saved[$x]=$_.PriorityClass.ToString() }; $_.PriorityClass='Idle'; $n++ }catch{}
} }
$pairs=@(); foreach($e in $saved.GetEnumerator()){ $pairs += ($e.Key + '=' + $e.Value) }
Set-ItemProperty $p BgPrios ($pairs -join ';') -Force
Write-Output ("BG=" + $n)`;
const BG_RESTORE = String.raw`$bg=@(${BG_APPS}); $p='HKCU:\Software\GamingOptimizer'
$raw=(Get-ItemProperty $p -Name BgPrios -EA SilentlyContinue).BgPrios
$map=@{}; if($raw){ foreach($pair in ($raw -split ';')){ $kv=$pair -split '=',2; if($kv.Count -eq 2){ $map[$kv[0]]=$kv[1] } } }
foreach($x in $bg){ Get-Process -Name $x -EA SilentlyContinue | ForEach-Object {
  $target='Normal'; if($map.ContainsKey($x)){ $target=$map[$x] }
  try{ $_.PriorityClass=$target }catch{}
} }
Remove-ItemProperty $p -Name BgPrios -EA SilentlyContinue
Write-Output OK`;
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
}
const GameModeCtx = createContext<Ctx>({
  enabled: false, setEnabled: () => {}, pro: true, setPro: () => {},
  games: [], addGame: () => {}, removeGame: () => {}, playing: null, log: [],
});

/** Controla el Auto Game-Mode a nivel de toda la app (siempre montado).
 *  Así el modo gamer se aplica esté donde esté el usuario, y se reanuda al abrir. */
export function GameModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem("gm_enabled") === "1");
  const [pro, setProState] = useState(() => localStorage.getItem("gm_pro") !== "0");
  const [games, setGames] = useState<string[]>(loadGames);
  const [playing, setPlaying] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>(["Listo. Activá el modo y elegí a qué juegos vigilar."]);
  const playingRef = useRef<string | null>(null);
  playingRef.current = playing;
  const proRef = useRef(pro);
  proRef.current = pro;

  const addLog = (s: string) =>
    setLog((l) => [...l.slice(-60), `[${new Date().toLocaleTimeString()}] ${s}`]);

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
    const uns: UnlistenFn[] = [];
    listen<string>("game-on", (e) => {
      const g = e.payload;
      enqueue(async () => {
        setPlaying(g);
        addLog(`🎮 ${g} detectado → activando Modo Gamer`);
        notify("🎮 Modo Gamer activado", `Detecté ${g}. Optimizando para jugar.`);
        await runPowershell(GAMER_ON);
        if (proRef.current) {
          await runPowershell(prioScript(g));
          const bg = await runPowershell(BG_LOWER);
          const ram = await clearStandbyRam(localStorage.getItem("lang") || "es");
          const bgN = bg.output.match(/BG=(\d+)/)?.[1] ?? "0";
          addLog(`⚡ Pro: prioridad Alta · ${bgN} apps de fondo bajadas · ${ram.ok ? "RAM liberada" : "RAM sin cambios"}`);
        }
      });
    }).then((u) => uns.push(u));
    listen("game-off", () => {
      enqueue(async () => {
        addLog("↩ Juego cerrado → restaurando");
        notify("Modo Gamer desactivado", "El juego se cerró. Volví al estado normal.");
        await runPowershell(GAMER_OFF);
        if (proRef.current) await runPowershell(BG_RESTORE);
        setPlaying(null);
      });
    }).then((u) => uns.push(u));
    return () => uns.forEach((u) => u());
  }, []);

  // Arranca/detiene el daemon según enabled/games (también al iniciar si quedó activado).
  useEffect(() => {
    localStorage.setItem("gm_enabled", enabled ? "1" : "0");
    if (enabled) {
      ensureNotify();
      startGameWatch(games);
      addLog(`Vigilando ${games.length} juegos…${pro ? " (modo pro)" : ""}`);
    } else {
      stopGameWatch();
      if (playingRef.current) { runPowershell(GAMER_OFF); runPowershell(BG_RESTORE); setPlaying(null); }
      addLog("Auto Game-Mode desactivado.");
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
    <GameModeCtx.Provider value={{ enabled, setEnabled, pro, setPro, games, addGame, removeGame, playing, log }}>
      {children}
    </GameModeCtx.Provider>
  );
}

export const useGameMode = () => useContext(GameModeCtx);
