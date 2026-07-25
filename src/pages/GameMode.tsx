import { useState } from "react";
import { motion } from "framer-motion";
import { useGameMode } from "../lib/gameMode";
import { detectGames, type DetectedGame } from "../lib/detect";
import NeonCard, { HudTitle } from "../components/NeonCard";
import { useI18n } from "../lib/i18n";

export default function GameMode() {
  const { enabled, setEnabled, pro, setPro, games, addGame, removeGame, playing, log } = useGameMode();
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<DetectedGame[] | null>(null);

  const submit = () => { addGame(input); setInput(""); };

  const scan = async () => {
    setScanning(true);
    setFound(null);
    const r = await detectGames();
    setFound(r);
    setScanning(false);
  };
  const newOnes = (found ?? []).filter((f) => !games.includes(f.exe));
  const addAll = () => { newOnes.forEach((f) => addGame(f.exe)); };

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.gamemode" />

      {/* Toggle principal + estado + modo pro */}
      <NeonCard className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[15px] font-semibold text-text">Auto Game-Mode</div>
            <div className="text-[13.5px] mt-1" style={{ color: playing ? "#00e676" : "#8a8a8f" }}>
              {!enabled ? t("gm.off")
                : playing ? `🎮 ${t("gm.playingPre")} ${playing} — ${t("gm.gamerActive")}`
                : t("gm.watching")}
            </div>
          </div>
          <button onClick={() => setEnabled(!enabled)}
            className={`relative w-14 h-7 rounded-full transition-colors shrink-0 ${enabled ? "bg-accent" : "bg-line-2"}`}>
            <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-black"
              style={{ left: enabled ? 30 : 3 }} />
          </button>
        </div>
        <div className="flex items-center justify-between gap-5 mt-5 pt-4 border-t border-line/60">
          <div className="max-w-[470px]">
            <div className="text-[14px] font-semibold text-text">{t("gm.proTitle")}</div>
            <p className="text-[12.5px] text-text-mute mt-1.5 leading-relaxed">{t("gm.proHint")}</p>
          </div>
          <button onClick={() => setPro(!pro)}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${pro ? "bg-accent" : "bg-line-2"}`}>
            <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-black"
              style={{ left: pro ? 22 : 3 }} />
          </button>
        </div>
      </NeonCard>

      <div className="flex-1 grid grid-cols-[1fr_320px] gap-6 min-h-0">
        {/* Lista de juegos */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2.5">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={t("gm.addPlaceholder")}
              className="flex-1 h-9 px-3 rounded-lg bg-surface border border-line focus:border-accent outline-none text-[13px] text-text placeholder:text-text-mute transition" />
            <button onClick={submit} className="btn btn-ghost">{t("gm.add")}</button>
            <button onClick={scan} disabled={scanning} className="btn btn-primary">
              {scanning ? t("gm.scanning") : t("gm.detect")}
            </button>
          </div>

          {/* Resultado de la detección */}
          {found && (
            <div className="mb-2.5 rounded-xl border border-accent/30 bg-accent/5 p-3">
              {found.length === 0 ? (
                <p className="text-[13px] text-text-dim">{t("gm.foundNone")}</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] text-text">
                      {t("gm.foundPre")} <b>{found.length}</b> {t("gm.gamesWord")} {newOnes.length > 0 ? `(${newOnes.length} ${t("gm.newWord")})` : t("gm.allThere")}
                    </span>
                    {newOnes.length > 0 && (
                      <button onClick={addAll} className="text-[12.5px] text-accent hover:underline">{t("gm.addAll")}</button>
                    )}
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-0.5">
                    {found.map((f) => (
                      <div key={f.exe} className="flex items-center gap-2 text-[12.5px]">
                        <span className="text-text-mute w-10 shrink-0">{f.source}</span>
                        <span className="font-mono text-text-dim truncate flex-1">{f.exe}</span>
                        {games.includes(f.exe)
                          ? <span className="text-text-mute shrink-0">{t("gm.already")}</span>
                          : <button onClick={() => addGame(f.exe)} className="text-accent hover:underline shrink-0">{t("gm.addOne")}</button>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto rounded-xl border border-line divide-y divide-line/60">
            {games.map((g) => (
              <div key={g} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 min-w-0 text-[13px] text-text-dim font-mono truncate">{g}</span>
                <button onClick={() => removeGame(g)}
                  className="text-[13px] text-text-mute hover:text-[#ff5470] transition shrink-0">{t("gm.remove")}</button>
              </div>
            ))}
            {games.length === 0 && <div className="px-4 py-3 text-text-mute text-sm">{t("gm.noGames")}</div>}
          </div>
        </div>

        {/* Registro */}
        <div className="flex flex-col min-h-0">
          <span className="section-label mb-2.5">{t("gm.activity")}</span>
          <div className="flex-1 overflow-y-auto rounded-xl bg-surface border border-line p-4 font-mono text-[13px] leading-relaxed text-text-dim whitespace-pre-wrap">
            {log.join("\n")}
          </div>
        </div>
      </div>
    </div>
  );
}
