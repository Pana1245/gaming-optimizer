import { useState } from "react";
import { motion } from "framer-motion";
import { useGameMode } from "../lib/gameMode";
import NeonCard, { HudTitle } from "../components/NeonCard";

export default function GameMode() {
  const { enabled, setEnabled, games, addGame, removeGame, playing, log } = useGameMode();
  const [input, setInput] = useState("");

  const submit = () => { addGame(input); setInput(""); };

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
          <button onClick={() => setEnabled(!enabled)}
            className={`relative w-14 h-7 rounded-full transition-colors shrink-0 ${enabled ? "bg-accent" : "bg-line-2"}`}>
            <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-black"
              style={{ left: enabled ? 30 : 3 }} />
          </button>
        </div>
        <p className="text-[11px] text-text-mute mt-3">
          Funciona en segundo plano: aunque cambies de sección o cierres esta pantalla, el modo gamer se activa solo.
        </p>
      </NeonCard>

      <div className="flex-1 grid grid-cols-[1fr_320px] gap-6 min-h-0">
        {/* Lista de juegos */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2.5">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="agregar juego (ej: juego.exe)"
              className="flex-1 h-9 px-3 rounded-lg bg-surface border border-line focus:border-accent outline-none text-[13px] text-text placeholder:text-text-mute transition" />
            <button onClick={submit} className="btn btn-ghost">Agregar</button>
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
