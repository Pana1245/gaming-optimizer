import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { HudTitle } from "../components/NeonCard";
import { PROFILES, type Profile } from "../profiles";
import { applyOp, loadLedger, saveLedger } from "../lib/engine";
import { runPowershell } from "../lib/api";
import { notify } from "../lib/notify";
import { useI18n } from "../lib/i18n";

const Bolt = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" /></svg>
);

export default function Perfiles() {
  const { t, lang } = useI18n();
  const nameOf = (p: Profile) => (lang === "en" ? p.nameEn : p.name);
  const planOf = (p: Profile) => (lang === "en" ? p.planLabelEn : p.planLabel);
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
      for (const op of p.ops) {
        const e = await applyOp(op);
        ledger.push(e);
        addLog(`${e.verified ? "✓" : "✗"} ${op.name}`);
        if (e.verified) ok++;
      }
      await saveLedger(ledger);
      const planRes = await runPowershell(p.planScript);
      addLog(planRes.ok ? `✓ ${planOf(p)}` : `✗ ${planOf(p)} — no se pudo cambiar el plan de energía`);
      addLog(`${ok}/${p.ops.length} ${t("profiles.verified")}`);
      localStorage.setItem("profile_active", p.id);
      setActiveId(p.id);
      notify(`${p.emoji} ${t("profiles.notifyPre")} ${nameOf(p)} ${t("profiles.notifyApplied")}`, `${ok} ${t("profiles.notifyBody")} ${planOf(p)}.`);
    } catch (err) {
      addLog(`✗ ${t("profiles.applyErr")} ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setApplyingId(null);
    }
  };

  const activeProfile = PROFILES.find((p) => p.id === activeId);

  return (
    <div className="h-full flex flex-col px-8 py-7 overflow-hidden">
      <HudTitle tkey="page.profiles" />

      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        {PROFILES.map((p) => {
          const active = activeId === p.id;
          const isApplying = applyingId === p.id;
          return (
            <motion.div
              key={p.id}
              whileHover={{ y: -3 }}
              transition={{ type: "spring", stiffness: 400, damping: 26 }}
              className="relative rounded-2xl border p-5 flex flex-col overflow-hidden"
              style={{
                borderColor: active ? `${p.color}66` : "#1c1c1f",
                background: `linear-gradient(158deg, ${p.color}12 0%, #0d0d10 52%)`,
                boxShadow: active
                  ? `0 0 0 1px ${p.color}44, 0 10px 34px ${p.color}1f`
                  : "inset 0 1px 0 rgba(255,255,255,0.045), 0 1px 2px rgba(0,0,0,0.4)",
              }}
            >
              {/* barra de acento + marca de agua */}
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${p.color}, ${p.color}00 78%)` }} />
              <span className="absolute -right-3 -top-4 text-[72px] leading-none opacity-[0.06] pointer-events-none select-none">{p.emoji}</span>

              {/* header */}
              <div className="flex items-center gap-3.5 mb-3.5">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-[24px] shrink-0"
                  style={{ background: `radial-gradient(circle at 30% 25%, ${p.color}38, ${p.color}10)`, boxShadow: `inset 0 0 0 1px ${p.color}44, 0 0 18px ${p.color}26` }}>
                  {p.emoji}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[16px] font-semibold text-text">{nameOf(p)}</h3>
                    {active && (
                      <span className="text-[9px] font-bold tracking-[0.12em] px-2 py-[3px] rounded-full"
                        style={{ background: `${p.color}1f`, color: p.color, boxShadow: `inset 0 0 0 1px ${p.color}44` }}>{t("profiles.active")}</span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-text-mute mt-0.5 leading-snug">{lang === "en" ? p.descEn : p.desc}</p>
                </div>
              </div>

              {/* viñetas */}
              <ul className="space-y-1.5 flex-1">
                {(lang === "en" ? p.bulletsEn : p.bullets).map((b) => (
                  <li key={b} className="text-[12.5px] text-text-dim flex items-start gap-2.5">
                    <span className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color, boxShadow: `0 0 6px ${p.color}aa` }} />
                    <span className="leading-snug">{b}</span>
                  </li>
                ))}
              </ul>

              {/* footer */}
              <div className="flex items-center justify-between gap-3 pt-3.5 mt-3.5 border-t border-white/[0.06]">
                <span className="text-[11.5px] text-text-mute flex items-center gap-1.5" style={{ color: `${p.color}cc` }}>
                  <Bolt /> {planOf(p)}
                </span>
                <button
                  onClick={() => apply(p)}
                  disabled={busy}
                  className="h-9 px-5 rounded-lg text-[13px] font-semibold transition hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100"
                  style={active
                    ? { background: `${p.color}1f`, color: p.color, boxShadow: `inset 0 0 0 1px ${p.color}55` }
                    : { background: p.color, color: "#05140c", boxShadow: `0 4px 16px ${p.color}33` }}
                >
                  {isApplying ? t("profiles.applying") : active ? t("profiles.activeBtn") : t("common.apply")}
                </button>
              </div>
            </motion.div>
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
        <div ref={logRef} className="h-[104px] overflow-y-auto rounded-xl bg-[#08080a] border border-line p-3.5 font-mono text-[12.5px] leading-relaxed text-text-dim whitespace-pre-wrap">
          {log.join("\n")}
        </div>
      </div>
    </div>
  );
}
