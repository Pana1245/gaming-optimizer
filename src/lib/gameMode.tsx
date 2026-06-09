import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { startGameWatch, stopGameWatch, runPowershell } from "./api";
import { ensureNotify, notify } from "./notify";

const GAMER_ON = String.raw`$hp = powercfg -list | Select-String 'Ultimate|High performance|Alto rendimiento' | Select-Object -First 1
if($hp){ $g=($hp -split '\s+')[3]; powercfg /setactive $g }
Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile' SystemResponsiveness 0 -Type DWord -Force -EA SilentlyContinue
Write-Output OK`;

const GAMER_OFF = String.raw`$b = powercfg -list | Select-String 'Balanced|Equilibrado' | Select-Object -First 1
if($b){ $g=($b -split '\s+')[3]; powercfg /setactive $g }
Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile' SystemResponsiveness 20 -Type DWord -Force -EA SilentlyContinue
Write-Output OK`;

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
  games: string[];
  addGame: (g: string) => void;
  removeGame: (g: string) => void;
  playing: string | null;
  log: string[];
}
const GameModeCtx = createContext<Ctx>({
  enabled: false, setEnabled: () => {}, games: [], addGame: () => {}, removeGame: () => {},
  playing: null, log: [],
});

/** Controla el Auto Game-Mode a nivel de toda la app (siempre montado).
 *  Así el modo gamer se aplica esté donde esté el usuario, y se reanuda al abrir. */
export function GameModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem("gm_enabled") === "1");
  const [games, setGames] = useState<string[]>(loadGames);
  const [playing, setPlaying] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>(["Listo. Activá el modo y elegí a qué juegos vigilar."]);
  const playingRef = useRef<string | null>(null);
  playingRef.current = playing;

  const addLog = (s: string) =>
    setLog((l) => [...l.slice(-60), `[${new Date().toLocaleTimeString()}] ${s}`]);

  // Listeners de eventos del daemon — una sola vez, a nivel app.
  useEffect(() => {
    const uns: UnlistenFn[] = [];
    listen<string>("game-on", async (e) => {
      const g = e.payload;
      setPlaying(g);
      addLog(`🎮 ${g} detectado → activando Modo Gamer`);
      notify("🎮 Modo Gamer activado", `Detecté ${g}. Optimizando para jugar.`);
      await runPowershell(GAMER_ON);
    }).then((u) => uns.push(u));
    listen("game-off", async () => {
      addLog("↩ Juego cerrado → restaurando");
      notify("Modo Gamer desactivado", "El juego se cerró. Volví al estado normal.");
      await runPowershell(GAMER_OFF);
      setPlaying(null);
    }).then((u) => uns.push(u));
    return () => uns.forEach((u) => u());
  }, []);

  // Arranca/detiene el daemon según enabled/games (también al iniciar si quedó activado).
  useEffect(() => {
    localStorage.setItem("gm_enabled", enabled ? "1" : "0");
    if (enabled) {
      ensureNotify();
      startGameWatch(games);
      addLog(`Vigilando ${games.length} juegos…`);
    } else {
      stopGameWatch();
      if (playingRef.current) { runPowershell(GAMER_OFF); setPlaying(null); }
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
    <GameModeCtx.Provider value={{ enabled, setEnabled, games, addGame, removeGame, playing, log }}>
      {children}
    </GameModeCtx.Provider>
  );
}

export const useGameMode = () => useContext(GameModeCtx);
