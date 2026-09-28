import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGameMode } from "../lib/gameMode";
import { detectGames, type DetectedGame } from "../lib/detect";
import { Page, Switch, SectionTitle, List, Row, Badge, LogPanel } from "../components/ui";
import { useI18n } from "../lib/i18n";
import { trLog } from "../lib/logI18n";

export default function GameMode() {
  const { enabled, setEnabled, pro, setPro, games, addGame, removeGame, playing, log } = useGameMode();
  const { t, lang } = useI18n();
  const [input, setInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<DetectedGame[] | null>(null);
  // Iniciar con Windows (tarea programada elevada, arranca minimizado en la bandeja).
  const [autostart, setAutostart] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoErr, setAutoErr] = useState(false);
  useEffect(() => { invoke<boolean>("autostart_get").then(setAutostart).catch(() => {}); }, []);
  const toggleAutostart = async () => {
    setAutoBusy(true); setAutoErr(false);
    try { setAutostart(await invoke<boolean>("autostart_set", { enable: !autostart })); }
    catch { setAutoErr(true); }
    setAutoBusy(false);
  };

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
    <Page tkey="page.gamemode">
      {/* Estado + interruptor principal */}
      <div className={`rounded-xl border p-5 mb-5 flex items-center gap-4 shrink-0 transition-colors ${playing ? "border-accent/40 bg-accent/[0.05]" : "border-line bg-surface"}`}>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${!enabled ? "bg-line-2" : playing ? "bg-accent" : "bg-accent/60 animate-pulse"}`} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-text">Auto Game-Mode</div>
          <div className="text-[13px] mt-0.5" style={{ color: playing ? "var(--color-accent)" : "#a1a1a9" }}>
            {!enabled ? t("gm.off")
              : playing ? `🎮 ${t("gm.playingPre")} ${playing} — ${t("gm.gamerActive")}`
              : t("gm.watching").replace(/^●\s*/, "")}
          </div>
        </div>
        <Switch on={enabled} onChange={setEnabled} label="Auto Game-Mode" />
      </div>

      <div className="flex-1 grid grid-cols-[1fr_320px] gap-6 min-h-0">
        {/* Juegos vigilados */}
        <div className="flex flex-col min-h-0">
          <SectionTitle right={<span className="tabular-nums">{games.length}</span>}>{t("gm.gamesTitle")}</SectionTitle>
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={t("gm.addPlaceholder")}
              className="flex-1 h-9 px-3 rounded-lg bg-surface border border-line focus:border-line-2 outline-none text-[13px] text-text placeholder:text-text-mute font-mono transition" />
            <button onClick={submit} className="btn btn-ghost">{t("gm.add")}</button>
            <button onClick={scan} disabled={scanning} className="btn btn-primary">
              {scanning ? t("gm.scanning") : t("gm.detect")}
            </button>
          </div>

          {/* Resultado de la detección */}
          {found && (
            <div className="mb-3 rounded-xl border border-accent/25 bg-accent/[0.04] p-3.5 shrink-0">
              {found.length === 0 ? (
                <p className="text-[13px] text-text-dim">{t("gm.foundNone")}</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] text-text">
                      {t("gm.foundPre")} <b>{found.length}</b> {t("gm.gamesWord")} {newOnes.length > 0 ? `(${newOnes.length} ${t("gm.newWord")})` : t("gm.allThere")}
                    </span>
                    {newOnes.length > 0 && <button onClick={addAll} className="btn btn-ghost h-7 px-2.5 text-[12px]">{t("gm.addAll")}</button>}
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {found.map((f) => (
                      <div key={f.exe} className="flex items-center gap-2 text-[12.5px]">
                        <Badge>{f.source}</Badge>
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

          <div className="flex-1 min-h-0 overflow-y-auto pb-1">
            {games.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-2 px-4 py-8 text-center text-[13px] text-text-mute">{t("gm.noGames")}</div>
            ) : (
              <List>
                {games.map((g) => (
                  <Row key={g} title={<span className="font-mono text-text-dim">{g}</span>}
                    right={<button onClick={() => removeGame(g)} className="text-[12.5px] text-text-mute hover:text-[#ff6b84] transition-colors opacity-0 group-hover:opacity-100">{t("gm.remove")}</button>} />
                ))}
              </List>
            )}
          </div>
        </div>

        {/* Opciones + actividad */}
        <div className="flex flex-col min-h-0 gap-5">
          <div className="shrink-0">
            <SectionTitle>{t("gm.options")}</SectionTitle>
            <List>
              <div className="px-4 py-3.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] text-text">{t("gm.proTitle")}</div>
                  <p className="text-[12px] text-text-mute mt-1 leading-relaxed">{t("gm.proHint")}</p>
                </div>
                <Switch size="sm" on={pro} onChange={setPro} label={t("gm.proTitle")} />
              </div>
              <div className="px-4 py-3.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] text-text">{t("gm.autostartTitle")}</div>
                  <p className="text-[12px] text-text-mute mt-1 leading-relaxed">{t("gm.trayHint")}</p>
                  {autoErr && <p className="text-[12px] text-[#ff6b84] mt-1">{t("gm.autostartErr")}</p>}
                </div>
                <Switch size="sm" on={autostart} onChange={() => toggleAutostart()} disabled={autoBusy} label={t("gm.autostartTitle")} />
              </div>
            </List>
          </div>
          <LogPanel className="flex-1" label={t("gm.activity")}>{trLog(log.join("\n"), lang)}</LogPanel>
        </div>
      </div>
    </Page>
  );
}
