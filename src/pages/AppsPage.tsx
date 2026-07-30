import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { APP_CATALOG } from "../apps";
import { runPowershell } from "../lib/api";
import { useInstaller } from "../lib/installer";
import { useScrollMemory } from "../lib/useScrollMemory";
import { HudTitle } from "../components/NeonCard";
import Modal from "../components/Modal";
import { useI18n } from "../lib/i18n";

const INSTALLED_NAMES = `$names=@()
$roots=@('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')
foreach($r in $roots){ Get-ItemProperty $r -EA SilentlyContinue | Where-Object DisplayName | ForEach-Object { $names+=$_.DisplayName } }
Get-AppxPackage -EA SilentlyContinue | ForEach-Object { $names+=$_.Name }
($names | Sort-Object -Unique) -join '|'`;

const itemV = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

export default function AppsPage() {
  // El estado de la instalación vive en el InstallerProvider (global) para que no se
  // corte ni pierda el progreso al cambiar de sección.
  const { t } = useI18n();
  const { running, log, progress, done, install, clearDone } = useInstaller();
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const logRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const scrollRef = useScrollMemory<HTMLDivElement>("apps");

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Auto-scroll del log (incluso al volver a la sección con una instalación en curso).
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [log]);

  const setAll = (v: boolean) => {
    const n: Record<string, boolean> = {};
    APP_CATALOG.forEach((c) => c.apps.forEach((a) => (n[a.id] = v)));
    setSel(n);
  };

  useEffect(() => {
    runPowershell(INSTALLED_NAMES).then((r) => {
      if (!mounted.current) return;
      const hay = r.output.toLowerCase();
      const set = new Set<string>();
      APP_CATALOG.forEach((c) => c.apps.forEach((a) => {
        const n = a.name.toLowerCase();
        if (n.length >= 3 && hay.includes(n)) set.add(a.id);
      }));
      setInstalled(set);
    }).catch(() => {});
  }, []);

  const selected = useMemo(
    () => APP_CATALOG.flatMap((c) => c.apps).filter((a) => sel[a.id]),
    [sel]
  );

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.apps" />

      <div className="flex-1 grid grid-cols-[1fr_340px] gap-6 min-h-0">
        <motion.div ref={scrollRef} className={`overflow-y-auto pr-3 -mr-3 space-y-7 transition-opacity ${running ? "pointer-events-none opacity-50" : ""}`}
          initial="hidden" animate="show"
          variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
          {APP_CATALOG.map((c) => {
            const selCount = c.apps.filter((a) => sel[a.id]).length;
            const allOn = selCount === c.apps.length;
            return (
              <motion.section key={c.category} variants={itemV}>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                  <h2 className="section-label">{c.category}</h2>
                  <span className="text-[12px] text-text-mute">{selCount}/{c.apps.length}</span>
                  <button
                    onClick={() => setSel((s) => {
                      const n = { ...s };
                      c.apps.forEach((a) => (n[a.id] = !allOn));
                      return n;
                    })}
                    className="ml-auto text-[12px] text-text-mute hover:text-accent transition"
                  >
                    {allOn ? t("apps.catRemove") : t("apps.catAll")}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 rounded-xl border border-line p-1">
                  {c.apps.map((a) => {
                    const on = !!sel[a.id];
                    const inst = installed.has(a.id);
                    return (
                      <div key={a.id}
                        onClick={() => setSel((s) => ({ ...s, [a.id]: !on }))}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer hover:bg-white/[0.025] transition-colors">
                        <div className={`w-[16px] h-[16px] rounded border shrink-0 flex items-center justify-center transition-all ${on ? "bg-accent border-accent" : "border-line-2"}`}>
                          {on && <svg viewBox="0 0 16 16" className="w-2.5 h-2.5"><path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" fill="none" stroke="#000" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <img src={`https://www.google.com/s2/favicons?domain=${a.domain}&sz=32`}
                          alt="" className="w-4 h-4 rounded-sm opacity-90"
                          onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                        <span className={`text-[13px] truncate ${on ? "text-text" : "text-text-dim"}`}>{a.name}</span>
                        {inst && <span title={t("apps.installedTitle")} className="ml-auto text-[11px] text-accent shrink-0">{t("apps.installed")}</span>}
                      </div>
                    );
                  })}
                </div>
              </motion.section>
            );
          })}
        </motion.div>

        <div className="flex flex-col min-h-0">
          <span className="section-label mb-2.5">{t("common.progress")}</span>
          <div ref={logRef} className="flex-1 overflow-y-auto rounded-xl bg-surface border border-line p-4 font-mono text-[13px] leading-relaxed text-text-dim whitespace-pre-wrap">
            {log.join("\n")}
          </div>
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-line">
        {running && (
          <div className="h-[3px] rounded-full bg-line overflow-hidden mb-4">
            <motion.div className="h-full bg-accent" animate={{ width: `${progress * 100}%` }}
              transition={{ ease: "easeOut", duration: 0.3 }} />
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button disabled={running} onClick={() => setAll(true)} className="btn btn-ghost">{t("common.selectAll")}</button>
            <button disabled={running} onClick={() => setAll(false)} className="btn btn-ghost">{t("common.deselect")}</button>
            <span className="text-[13px] text-text-mute ml-1">{selected.length} {t("apps.sel")}</span>
          </div>
          <button disabled={running || selected.length === 0} onClick={() => install(selected)} className="btn btn-primary px-6">
            {running ? t("apps.installing") : `${t("apps.installBtn")} (${selected.length})`}
          </button>
        </div>
      </div>

      <Modal open={!!done} title={t("apps.doneTitle")} onClose={clearDone}>{done || ""}</Modal>
    </div>
  );
}
