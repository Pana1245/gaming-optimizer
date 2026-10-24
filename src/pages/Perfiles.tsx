import { useRef, useState } from "react";
import { Page } from "../components/ui";
import { PROFILES, type Profile } from "../profiles";
import { opName } from "../lib/opNames";
import { applyOp, loadLedger, saveLedger } from "../lib/engine";
import { runPowershell } from "../lib/api";
import { notify } from "../lib/notify";
import { useI18n, pick } from "../lib/i18n";
import { trLog } from "../lib/logI18n";
import { useGameMode } from "../lib/gameMode";
import { GAME_ADAPTERS, type Values } from "../lib/gameSettings";
import { ALL_CATEGORIES, BACKUP } from "./Optimizaciones";
import { getSystemInfo } from "../lib/api";
import { TWEAK_EN } from "../catalogEn";
import { TWEAK_PT } from "../catalogPt";
import type { Tweak } from "../catalog";

const Bolt = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" /></svg>
);

export default function Perfiles() {
  const { t, lang } = useI18n();
  const nameOf = (p: Profile) => pick(lang, p.name, p.nameEn, p.namePt);
  const planOf = (p: Profile) => pick(lang, p.planLabel, p.planLabelEn, p.planLabelPt);
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem("profile_active"));
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>(() => [t("profiles.logIntro")]);
  const logRef = useRef<HTMLDivElement>(null);
  const busy = applyingId !== null;
  const { setPro } = useGameMode();
  // Cambiar las opciones de video de los juegos es opcional: cambia cómo se ven.
  const [withGames, setWithGames] = useState(() => localStorage.getItem("profile_games") === "1");
  const toggleGames = (v: boolean) => { localStorage.setItem("profile_games", v ? "1" : "0"); setWithGames(v); };

  const addLog = (s: string) => {
    setLog((l) => [...l, s]);
    queueMicrotask(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight));
  };

  // Opciones de video de cada juego soportado que esté en esta PC (sin archivo = no instalado:
  // se saltea). Con el juego abierto no se toca. Se deshace desde Biblioteca → ⚙.
  const applyGames = async (g: NonNullable<Profile["games"]>) => {
    for (const a of GAME_ADAPTERS) {
      const c = await a.load().catch(() => null);
      if (!c) continue;
      const nvidia = (k: string) => c.nvidia || !a.fields.find((f) => f.key === k)?.nvidiaOnly;
      // "max" = la opción "Sin límite" de ese juego (la primera: "0" u "off" según el juego).
      const fps = g.fps === "max" ? a.fields.find((f) => f.key === a.fpsKey)?.opts[0][0] : g.fps;
      const want: Values = { ...(g.preset && a.presets ? a.presets[g.preset] : {}), ...(fps && a.fpsKey ? { [a.fpsKey]: fps } : {}) };
      const diff = Object.fromEntries(Object.entries(want).filter(([k, v]) => nvidia(k) && c.values[k] !== v));
      if (!Object.keys(want).length) continue;
      const what = [g.preset && a.presets ? t(`lib.go.preset.${g.preset}`) : "", fps && a.fpsKey ? (g.fps === "max" ? t("lib.go.noLimit") : `${fps} FPS`) : ""].filter(Boolean).join(" · ");
      if (!Object.keys(diff).length) { addLog(`✓ ${a.name}: ${what} ${t("profiles.gameSame")}`); continue; }
      const r = c.running ? "running" : await a.save(c.raw, diff);
      addLog(r === "ok" ? `✓ ${a.name}: ${what}` : `✗ ${a.name}: ${t(r === "running" ? "profiles.gameOpen" : "profiles.gameFail")}`);
    }
  };

  // Optimizaciones de esa sección, con el mismo respaldo (registro + punto de restauración):
  // sin respaldo no se aplica ninguna. Se deshacen en Restaurar, no en el Motor.
  const applyTweaks = async (names: string[]) => {
    const winVer = await getSystemInfo().then((i) => i.win_ver).catch(() => 11);
    const all = ALL_CATEGORIES.flatMap((c) => c.tweaks);
    const list = names.map((n) => all.find((tw) => tw.name === n)).filter((tw): tw is Tweak => !!tw && (!tw.os || tw.os === winVer));
    if (!list.length) return;
    addLog(t("profiles.optBackup"));
    const bk = await runPowershell(BACKUP);
    if (!bk.ok || !Number(bk.output.match(/Backup del registro: (\d+) ramas/)?.[1] ?? 0)) { addLog(`✗ ${t("profiles.optNoBackup")}`); return; }
    for (const tw of list) {
      const r = await runPowershell(tw.script);
      addLog(`${r.ok ? "✓" : "✗"} ${pick(lang, tw.name, TWEAK_EN[tw.name], TWEAK_PT[tw.name])}`);
    }
    addLog(t("profiles.optUndo"));
  };

  const apply = async (p: Profile) => {
    setApplyingId(p.id);
    addLog(`\n${t("profiles.applyingPre")} ${p.emoji} ${nameOf(p)} —`);
    try {
      const ledger = await loadLedger();
      let ok = 0;
      // Cada op por separado: si una fallaba, el throw salteaba el saveLedger y las que
      // YA se habían aplicado quedaban en el registro sin entrada para deshacerlas.
      for (const op of p.ops) {
        try {
          const e = await applyOp(op);
          ledger.push(e);
          addLog(`${e.verified ? "✓" : "✗"} ${opName(op, lang)}`);
          if (e.verified) ok++;
        } catch (err) {
          addLog(`✗ ${opName(op, lang)} — ${t(err instanceof Error ? err.message : String(err))}`);
        }
      }
      await saveLedger(ledger);
      const planRes = await runPowershell(p.planScript);
      addLog(planRes.ok ? `✓ ${planOf(p)}` : `✗ ${planOf(p)} — ${t("profiles.planFail")}`);
      addLog(`${ok}/${p.ops.length} ${t("profiles.verified")}`);
      setPro(p.gmPro);
      addLog(`✓ Auto Game-Mode: ${p.gmPro ? "Power" : "Lite"}`);
      if (p.tweaks) await applyTweaks(p.tweaks);
      if (withGames && p.games) await applyGames(p.games);
      // Sólo marcamos el perfil como activo si el plan de energía se aplicó de
      // verdad: si falló, no persistimos un "activo" cuyo plan nunca se aplicó.
      if (planRes.ok) {
        localStorage.setItem("profile_active", p.id);
        setActiveId(p.id);
      }
      // "Aplicado" sólo si se aplicó algo de verdad (antes salía aunque fallara todo).
      if (ok > 0 && planRes.ok) notify(`${p.emoji} ${t("profiles.notifyPre")} ${nameOf(p)} ${t("profiles.notifyApplied")}`, `${ok} ${t("profiles.notifyBody")} ${planOf(p)}.`);
    } catch (err) {
      addLog(`✗ ${t("profiles.applyErr")} ${t(err instanceof Error ? err.message : String(err))}`);
    } finally {
      setApplyingId(null);
    }
  };

  const activeProfile = PROFILES.find((p) => p.id === activeId);

  return (
    <Page tkey="page.profiles">

      <div className="grid grid-cols-2 auto-rows-max gap-4 flex-1 min-h-0 overflow-y-auto pr-1 pb-1">
        {PROFILES.map((p) => {
          const active = activeId === p.id;
          const isApplying = applyingId === p.id;
          return (
            <div
              key={p.id}
              className={`relative rounded-xl border p-5 flex flex-col bg-surface transition-colors ${active ? "border-accent/45" : "border-line hover:border-line-2"}`}
            >

              {/* header */}
              <div className="flex items-center gap-3.5 mb-3.5">
                <div className="w-11 h-11 rounded-lg flex items-center justify-center text-[22px] shrink-0"
                  style={{ background: `${p.color}14`, boxShadow: `inset 0 0 0 1px ${p.color}2e` }}>
                  {p.emoji}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[16px] font-semibold text-text">{nameOf(p)}</h3>
                    {active && (
                      <span className="text-[9.5px] font-semibold tracking-[0.1em] px-2 py-[3px] rounded-full bg-accent/15 text-accent">{t("profiles.active")}</span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-text-mute mt-0.5 leading-snug">{pick(lang, p.desc, p.descEn, p.descPt)}</p>
                </div>
              </div>

              {/* viñetas */}
              <ul className="space-y-1.5 flex-1">
                {pick(lang, p.bullets, p.bulletsEn, p.bulletsPt).map((b) => (
                  <li key={b} className="text-[12.5px] text-text-dim flex items-start gap-2.5">
                    <span className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color, opacity: 0.8 }} />
                    <span className="leading-snug">{b}</span>
                  </li>
                ))}
              </ul>

              {/* footer */}
              <div className="flex items-center justify-between gap-3 pt-3.5 mt-3.5 border-t border-line">
                <span className="text-[12px] text-text-mute flex items-center gap-1.5">
                  <Bolt /> {planOf(p)}
                </span>
                <button
                  onClick={() => apply(p)}
                  disabled={busy}
                  className={`btn shrink-0 ${active ? "btn-ghost text-accent" : "btn-ghost"}`}
                >
                  {isApplying ? t("profiles.applying") : active ? t("profiles.activeBtn") : t("common.apply")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <label className="mt-3 shrink-0 flex items-start gap-2.5 cursor-pointer select-none">
        <input type="checkbox" checked={withGames} onChange={(e) => toggleGames(e.target.checked)} disabled={busy} className="mt-[3px] shrink-0" style={{ accentColor: "var(--color-accent)" }} />
        <span className="text-[12.5px] text-text-dim leading-snug">
          {t("profiles.games")} <span className="text-text-mute">{t("profiles.gamesHint")}</span>
        </span>
      </label>

      {/* registro */}
      <div className="mt-4 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="section-label">{t("common.log")}</span>
          {activeProfile && (
            <span className="text-[12px] text-text-mute">
              {t("profiles.activeLabel")} <span style={{ color: activeProfile.color }}>{activeProfile.emoji} {nameOf(activeProfile)}</span>
            </span>
          )}
        </div>
        <div ref={logRef} className="h-[96px] overflow-y-auto rounded-xl border border-line bg-[#0b0b0d] px-4 py-3 font-mono text-[12.5px] leading-relaxed text-text-dim whitespace-pre-wrap">
          {trLog(log.join("\n"), lang)}
        </div>
      </div>
    </Page>
  );
}
