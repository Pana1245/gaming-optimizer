import { useEffect, useMemo, useRef, useState } from "react";
import { ENGINE_TWEAKS } from "../engineTweaks";
import { opName, opDesc, ledgerName } from "../lib/opNames";
import { getSystemInfo } from "../lib/api";
import { applyOp, undoEntry, loadLedger, saveLedger, type LedgerEntry } from "../lib/engine";
import { useScrollMemory } from "../lib/useScrollMemory";
import EnergyCheckbox from "../components/EnergyCheckbox";
import { Page, Tabs, SectionTitle, List, Row, Badge, LogPanel, Empty } from "../components/ui";
import { IndeterminateBar } from "../components/Feedback";
import { useI18n } from "../lib/i18n";
import { trLog } from "../lib/logI18n";

const fmtTime = (ts: number) => new Date(ts).toLocaleString();

export default function Motor() {
  const { t, lang } = useI18n();
  const showVal = (v: string) => (v === "__ABSENT__" ? t("motor.notExisted") : v);
  const [winVer, setWinVer] = useState(11);
  const [tab, setTab] = useState<"apply" | "history">("apply");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [log, setLog] = useState<string[]>(() => [t("motor.logIntro")]);
  const [busy, setBusy] = useState(false);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const listRef = useScrollMemory<HTMLDivElement>("motor");

  useEffect(() => {
    getSystemInfo().then((i) => setWinVer(i.win_ver)).catch(() => {});
    loadLedger().then(setLedger).catch(() => {});
  }, []);

  const tweaks = useMemo(() => ENGINE_TWEAKS.filter((t) => !t.motorHidden && (!t.os || t.os === winVer)), [winVer]);
  const groups = useMemo(() => [...new Set(tweaks.map((t) => t.group))], [tweaks]);
  const selected = tweaks.filter((t) => sel[t.id]);

  const addLog = (s: string) => setLog((l) => {
    const n = [...l, s];
    queueMicrotask(() => logRef.current?.scrollTo(0, logRef.current!.scrollHeight));
    return n;
  });

  const apply = async () => {
    setBusy(true);
    setLog([t("motor.applying")]);
    const newEntries: LedgerEntry[] = [];
    let ok = 0;
    for (const op of selected) {
      if (mounted.current) addLog(`▸ ${opName(op, lang)}`);
      try {
        const e = await applyOp(op);
        newEntries.push(e);
        if (e.verified) ok++;
        if (mounted.current)
          addLog(e.verified ? `  ✓ ${t("motor.verified")}  (${showVal(e.prior)} → ${e.value})` : `  ✗ ${t("motor.notVerified")}`);
      } catch (err) {
        // No persistimos la entrada: si falló el apply, no debe quedar como reversible.
        if (mounted.current) addLog(`  ✗ ${t("motor.errorPre")} ${t(err instanceof Error ? err.message : String(err))}`);
      }
    }
    // Persistir SIEMPRE, aunque el usuario haya navegado durante el apply: los cambios
    // ya se hicieron en el registro; no guardarlos los dejaría aplicados pero sin
    // registro (imposibles de deshacer desde el Historial).
    const updated = [...ledger, ...newEntries];
    await saveLedger(updated);
    if (mounted.current) {
      setLedger(updated);
      addLog(`\n${t("motor.appliedSummary").replace("{ok}", String(ok)).replace("{total}", String(selected.length))}`);
      setBusy(false);
    }
  };

  const undo = async (e: LedgerEntry) => {
    setBusy(true);
    const ok = await undoEntry(e);
    if (!ok) {
      addLog(`✗ ${t("motor.undoFail").replace("{name}", ledgerName(e, lang))}`);
      if (mounted.current) setBusy(false);
      return;
    }
    const updated = ledger.map((x) => (x.id === e.id ? { ...x, undone: true } : x));
    await saveLedger(updated);
    if (mounted.current) { setLedger(updated); setBusy(false); }
  };

  const undoAll = async () => {
    setBusy(true);
    const active = ledger.filter((e) => !e.undone);
    // Sólo marcamos como deshecho lo que realmente se pudo revertir.
    const failed = new Set<string>();
    for (const e of active) { if (!(await undoEntry(e))) failed.add(e.id); }
    const updated = ledger.map((x) => (failed.has(x.id) ? x : { ...x, undone: true }));
    await saveLedger(updated);
    if (mounted.current) {
      setLedger(updated);
      if (failed.size) addLog(`✗ ${t("motor.undoAllFail").replace("{n}", String(failed.size))}`);
      setBusy(false);
    }
  };

  const activeCount = ledger.filter((e) => !e.undone).length;
  const history = [...ledger].reverse();

  const applyActions = <>
    <button disabled={busy} onClick={() => setSel(Object.fromEntries(tweaks.map((tw) => [tw.id, true])))} className="btn btn-ghost">{t("common.selectAll")}</button>
    <button disabled={busy} onClick={() => setSel({})} className="btn btn-ghost">{t("common.deselect")}</button>
    <button disabled={busy || selected.length === 0} onClick={apply} className="btn btn-primary px-5">
      {busy ? t("gpu.applying") : `${t("motor.applyVerified")} (${selected.length})`}
    </button>
  </>;
  const historyActions = (
    <button disabled={busy || activeCount === 0} onClick={undoAll} className="btn btn-ghost">{t("motor.undoAll")}</button>
  );

  return (
    <Page tkey="page.engine" actions={tab === "apply" ? applyActions : historyActions}>
      <div className="flex items-center justify-between mb-5 shrink-0">
        <Tabs value={tab} onChange={setTab} items={[
          { id: "apply", label: t("motor.tabApply") },
          { id: "history", label: `${t("motor.tabHistory")}${activeCount ? ` (${activeCount})` : ""}` },
        ]} />
        {tab === "history" && (
          <span className="text-[12.5px] text-text-mute">{t("motor.activeCount").replace("{active}", String(activeCount)).replace("{total}", String(ledger.length))}</span>
        )}
      </div>
      {busy && <div className="-mt-2 mb-4 shrink-0"><IndeterminateBar /></div>}

      {tab === "apply" ? (
        <div className="flex-1 grid grid-cols-[1fr_320px] gap-6 min-h-0">
          <div ref={listRef} className={`overflow-y-auto pr-3 -mr-3 space-y-6 pb-2 ${busy ? "pointer-events-none opacity-50" : ""}`}>
            {groups.map((g) => (
              <section key={g}>
                <SectionTitle>{t(`motor.group.${g}`)}</SectionTitle>
                <List>
                  {tweaks.filter((tw) => tw.group === g).map((tw) => (
                    <EnergyCheckbox key={tw.id} label={opName(tw, lang)} desc={opDesc(tw, lang)}
                      risk={tw.risk === "advanced" ? "advanced" : "safe"}
                      checked={!!sel[tw.id]}
                      onChange={(v) => setSel((s) => ({ ...s, [tw.id]: v }))} />
                  ))}
                </List>
              </section>
            ))}
          </div>
          <LogPanel ref={logRef} label={t("motor.verification")}>{trLog(log.join("\n"), lang)}</LogPanel>
        </div>
      ) : (
        <div ref={listRef} className="flex-1 overflow-y-auto pr-2 -mr-2 pb-2">
          {history.length === 0 ? (
            <Empty>{t("motor.noHistory")}</Empty>
          ) : (
            <List>
              {history.map((e) => (
                <Row key={e.id} muted={e.undone}
                  title={ledgerName(e, lang)}
                  desc={<span className="font-mono">{showVal(e.prior)} → {e.value} · {fmtTime(e.ts)}</span>}
                  right={<>
                    {e.undone
                      ? <Badge>{t("motor.undone")}</Badge>
                      : <Badge tone={e.verified ? "ok" : "danger"}>{e.verified ? t("motor.tipVerified") : t("motor.tipNotVerified")}</Badge>}
                    {!e.undone && <button disabled={busy} onClick={() => undo(e)} className="btn btn-ghost h-8 px-3 text-[12.5px]">{t("motor.undoBtn")}</button>}
                  </>} />
              ))}
            </List>
          )}
        </div>
      )}
    </Page>
  );
}
