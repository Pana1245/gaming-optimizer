import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { startGameWatch, stopGameWatch, runPowershell } from "../lib/api";
import { ensureNotify, notify } from "../lib/notify";
import NeonCard, { HudTitle } from "../components/NeonCard";

const GAMER_ON = String.raw`$hp = powercfg -list | Select-String 'Ultimate|High performance|Alto rendimiento' | Select-Object -First 1
if($hp){ $g=($hp -split '\s+')[3]; powercfg /setactive $g }
Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile' SystemResponsiveness 0 -Type DWord -Force -EA SilentlyContinue
Write-Output OK`;

const GAMER_OFF = String.raw`$b = powercfg -list | Select-String 'Balanced|Equilibrado' | Select-Object -First 1
if($b){ $g=($b -split '\s+')[3]; powercfg /setactive $g }
Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile' SystemResponsiveness 20 -Type DWord -Force -EA SilentlyContinue
Write-Output OK`;

const DEFAULT_GAMES = [
  "valorant.exe", "valorant-win64-shipping.exe", "cs2.exe", "csgo.exe",
  "leagueclient.exe", "league of legends.exe", "fortniteclient-win64-shipping.exe",
  "gta5.exe", "rainbowsix.exe", "overwatch.exe", "r5apex.exe", "dota2.exe",
  "eldenring.exe", "cyberpunk2077.exe", "rocketleague.exe",
];

const loadGames = (): string[] => {
  try { const s = localStorage.getItem("gm_games"); if (s) return JSON.parse(s); } catch {}
  return DEFAULT_GAMES;
};

export default function GameMode() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem("gm_enabled") === "1");
  const [games, setGames] = useState<string[]>(loadGames);
  const [playing, setPlaying] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>(["Listo. Activá el modo y elegí a qué juegos vigilar."]);
  const [input, setInput] = useState("");
  const playingRef = useRef<string | null>(null);
  playingRef.current = playing;

  const addLog = (s: string) =>
    setLog((l) => [...l.slice(-40), `[${new Date().toLocaleTimeString()}] ${s}`]);

  // Listeners de eventos del daemon (una vez)
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
      addLog(`↩ Juego cerrado → restaurando`);
      notify("Modo Gamer desactivado", "El juego se cerró. Volví al estado normal.");
      await runPowershell(GAMER_OFF);
      setPlaying(null);
    }).then((u) => uns.push(u));
    return () => uns.forEach((u) => u());
  }, []);

  // Arranca/detiene el daemon según enabled / games
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
    return () => { if (enabled) stopGameWatch(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, games]);

  const addGame = () => {
    const g = input.trim().toLowerCase();
    if (g && !games.includes(g)) {
      const n = [...games, g];
      setGames(n); localStorage.setItem("gm_games", JSON.stringify(n));
    }
    setInput("");
  };
  const removeGame = (g: string) => {
    const n = games.filter((x) => x !== g);
    setGames(n); localStorage.setItem("gm_games", JSON.stringify(n));
  };

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.gamemode" />

      {/* Toggle principal + estado */}
      <NeonCard className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[15px] font-semibold text-text">Auto Game-Mode</div>
            <div className="text-[12.5px] mt-1" style={{ color: playing ? "#00e676" : "#8a8a8f" }}>
              {!enabled ? "Desactivado"
                : playing ? `🎮 Jugando a ${playing} — modo gamer activo`
                : "● Vigilando juegos en segundo plano…"}
            </div>
          </div>
          <button onClick={() => setEnabled((v) => !v)}
            className={`relative w-14 h-7 rounded-full transition-colors shrink-0 ${enabled ? "bg-accent" : "bg-line-2"}`}>
            <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-black"
              style={{ left: enabled ? 30 : 3 }} />
          </button>
        </div>
      </NeonCard>

      <div className="flex-1 grid grid-cols-[1fr_320px] gap-6 min-h-0">
        {/* Lista de juegos */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2.5">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGame()}
              placeholder="agregar juego (ej: juego.exe)"
              className="flex-1 h-9 px-3 rounded-lg bg-surface border border-line focus:border-accent outline-none text-[13px] text-text placeholder:text-text-mute transition" />
            <button onClick={addGame} className="btn btn-ghost">Agregar</button>
          </div>
          <div className="flex-1 overflow-y-auto rounded-xl border border-line divide-y divide-line/60">
            {games.map((g) => (
              <div key={g} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 min-w-0 text-[13px] text-text-dim font-mono truncate">{g}</span>
                <button onClick={() => removeGame(g)}
                  className="text-[12px] text-text-mute hover:text-[#ff5470] transition shrink-0">Quitar</button>
              </div>
            ))}
            {games.length === 0 && <div className="px-4 py-3 text-text-mute text-sm">Sin juegos. Agregá alguno arriba.</div>}
          </div>
        </div>

        {/* Registro */}
        <div className="flex flex-col min-h-0">
          <span className="section-label mb-2.5">Actividad</span>
          <div className="flex-1 overflow-y-auto rounded-xl bg-surface border border-line p-4 font-mono text-[12px] leading-relaxed text-text-dim whitespace-pre-wrap">
            {log.join("\n")}
          </div>
        </div>
      </div>
    </div>
  );
}
