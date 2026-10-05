import { useRef, useState } from "react";
import { Page } from "../components/ui";
import { PROFILES, type Profile } from "../profiles";
import { opName } from "../lib/opNames";
import { applyOp, loadLedger, saveLedger } from "../lib/engine";
import { runPowershell } from "../lib/api";
import { notify } from "../lib/notify";
import { useI18n, pick } from "../lib/i18n";
import { trLog } from "../lib/logI18n";

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

  const addLog = (s: string) => {
    setLog((l) => [...l, s]);
    queueMicrotask(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight));
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
      // Sólo marcamos el perfil como activo si el plan de energía se aplicó de
      // verdad: si falló, no persistimos un "activo" cuyo plan nunca se aplicó.
      if (planRes.ok) {
        localStorage.setItem("profile_active", p.id);
        setActiveId(p.id);
      }
      notify(`${p.emoji} ${t("profiles.notifyPre")} ${nameOf(p)} ${t("profiles.notifyApplied")}`, `${ok} ${t("profiles.notifyBody")} ${planOf(p)}.`);
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
