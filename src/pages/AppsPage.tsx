import { useEffect, useMemo, useRef, useState } from "react";
import { APP_CATALOG } from "../apps";
import { runPowershell } from "../lib/api";
import { useInstaller } from "../lib/installer";
import { useScrollMemory } from "../lib/useScrollMemory";
import { Page, SectionTitle, Switch, Badge, Check, LogPanel, Progress, Empty } from "../components/ui";
import Modal from "../components/Modal";
import { useI18n, pick } from "../lib/i18n";
import { trLog } from "../lib/logI18n";

const INSTALLED_NAMES = `$names=@()
$roots=@('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')
foreach($r in $roots){ Get-ItemProperty $r -EA SilentlyContinue | Where-Object DisplayName | ForEach-Object { $names+=$_.DisplayName } }
Get-AppxPackage -EA SilentlyContinue | ForEach-Object { $names+=$_.Name }
($names | Sort-Object -Unique) -join '|'`;

export default function AppsPage() {
  // El estado de la instalación vive en el InstallerProvider (global) para que no se
  // corte ni pierda el progreso al cambiar de sección.
  const { t, lang } = useI18n();
  const { running, log, progress, done, install, clearDone } = useInstaller();
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [hideInstalled, setHideInstalled] = useState(false);
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

  // Búsqueda y filtro "ocultar instaladas".
  const q = query.trim().toLowerCase();
  const cats = APP_CATALOG.map((c) => ({
    ...c,
    apps: c.apps.filter((a) => (!q || a.name.toLowerCase().includes(q)) && !(hideInstalled && installed.has(a.id))),
  })).filter((c) => c.apps.length > 0);

  return (
    <Page tkey="page.apps" actions={<>
      <button disabled={running} onClick={() => setAll(true)} className="btn btn-ghost">{t("common.selectAll")}</button>
      <button disabled={running} onClick={() => setAll(false)} className="btn btn-ghost">{t("common.deselect")}</button>
      <button disabled={running || selected.length === 0} onClick={() => install(selected)} className="btn btn-primary px-5">
        {running ? t("apps.installing") : `${t("apps.installBtn")}${selected.length ? ` (${selected.length})` : ""}`}
      </button>
    </>}>
      {running && <div className="-mt-3 mb-5 shrink-0"><Progress value={progress} /></div>}

      <div className="flex-1 grid grid-cols-[1fr_320px] gap-6 min-h-0">
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-3 mb-4 shrink-0">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-mute" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("apps.search")}
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface border border-line focus:border-line-2 outline-none text-[13px] text-text placeholder:text-text-mute transition" />
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-text-dim shrink-0 cursor-pointer">
              <Switch size="sm" on={hideInstalled} onChange={setHideInstalled} label={t("apps.hideInstalled")} />
              {t("apps.hideInstalled")}
            </label>
          </div>

          <div ref={scrollRef} className={`flex-1 overflow-y-auto pr-3 -mr-3 space-y-6 pb-2 transition-opacity ${running ? "pointer-events-none opacity-50" : ""}`}>
            {cats.length === 0 && <Empty>{t("unins.noResults")}</Empty>}
            {cats.map((c) => {
              const selCount = c.apps.filter((a) => sel[a.id]).length;
              const allOn = selCount === c.apps.length;
              return (
                <section key={c.category}>
                  <SectionTitle dot={c.color} right={<>
                    <span className="tabular-nums">{selCount}/{c.apps.length}</span>
                    <button onClick={() => setSel((s) => { const n = { ...s }; c.apps.forEach((a) => (n[a.id] = !allOn)); return n; })}
                      className="text-text-mute hover:text-accent transition-colors">{allOn ? t("apps.catRemove") : t("apps.catAll")}</button>
                  </>}>
                    {pick(lang, c.category, c.categoryEn, c.categoryPt)}
                  </SectionTitle>
                  <div className="grid grid-cols-2 gap-2">
                    {c.apps.map((a) => {
                      const on = !!sel[a.id];
                      const inst = installed.has(a.id);
                      return (
                        <div key={a.id} onClick={() => setSel((s) => ({ ...s, [a.id]: !on }))}
                          className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors
                            ${on ? "border-accent/50 bg-accent/[0.05]" : "border-line bg-surface hover:border-line-2"}`}>
                          <div className="w-8 h-8 rounded-md grid place-items-center shrink-0 bg-white/[0.04]">
                            <img src={`https://www.google.com/s2/favicons?domain=${a.domain}&sz=64`} alt="" className="w-[18px] h-[18px] rounded-sm"
                              onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-[13px] truncate ${on ? "text-text" : "text-text-dim group-hover:text-text"}`}>{a.name}</div>
                            {inst && <div className="mt-0.5"><Badge tone="ok">{t("apps.installed")}</Badge></div>}
                          </div>
                          <Check on={on} />
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <LogPanel ref={logRef} label={t("common.progress")}>{trLog(log.join("\n"), lang)}</LogPanel>
      </div>

      <Modal open={!!done} title={t("apps.doneTitle")} onClose={clearDone}>{trLog(done || "", lang)}</Modal>
    </Page>
  );
}
