import { useEffect, useMemo, useRef, useState } from "react";
import { ENGINE_TWEAKS } from "../engineTweaks";
import { getSystemInfo } from "../lib/api";
import { applyOp, undoEntry, loadLedger, saveLedger, type LedgerEntry } from "../lib/engine";
import { useScrollMemory } from "../lib/useScrollMemory";
import EnergyCheckbox from "../components/EnergyCheckbox";
import { HudTitle } from "../components/NeonCard";
import { IndeterminateBar } from "../components/Feedback";

const fmtTime = (ts: number) => new Date(ts).toLocaleString();
const showVal = (v: string) => (v === "__ABSENT__" ? "(no existía)" : v);

export default function Motor() {
  const [winVer, setWinVer] = useState(11);
  const [tab, setTab] = useState<"apply" | "history">("apply");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [log, setLog] = useState<string[]>(["Listo. Cada cambio se lee, aplica, verifica y queda en el historial."]);
  const [busy, setBusy] = useState(false);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const listRef = useScrollMemory<HTMLDivElement>("motor");

  useEffect(() => {
    getSystemInfo().then((i) => setWinVer(i.win_ver)).catch(() => {});
    loadLedger().then(setLedger).catch(() => {});
  }, []);

  const tweaks = useMemo(() => ENGINE_TWEAKS.filter((t) => !t.os || t.os === winVer), [winVer]);
  const groups = useMemo(() => [...new Set(tweaks.map((t) => t.group))], [tweaks]);
  const selected = tweaks.filter((t) => sel[t.id]);

  const addLog = (s: string) => setLog((l) => {
    const n = [...l, s];
    queueMicrotask(() => logRef.current?.scrollTo(0, logRef.current!.scrollHeight));
    return n;
  });

  const apply = async () => {
    setBusy(true);
    setLog(["Aplicando con verificación…"]);
    const newEntries: LedgerEntry[] = [];
    let ok = 0;
    for (const op of selected) {
      addLog(`▸ ${op.name}`);
      const e = await applyOp(op);
      if (!mounted.current) return;
      newEntries.push(e);
      if (e.verified) {
        ok++;
        addLog(`  ✓ verificado  (${showVal(e.prior)} → ${e.value})`);
      } else {
        addLog(`  ✗ no se pudo verificar (quedó distinto al valor esperado)`);
      }
    }
    const updated = [...ledger, ...newEntries];
    setLedger(updated);
    await saveLedger(updated);
    addLog(`\n${ok}/${selected.length} aplicados y verificados. Quedaron en el Historial (reversibles).`);
    setBusy(false);
  };

  const undo = async (e: LedgerEntry) => {
    setBusy(true);
    await undoEntry(e);
    if (!mounted.current) return;
    const updated = ledger.map((x) => (x.id === e.id ? { ...x, undone: true } : x));
    setLedger(updated);
    await saveLedger(updated);
    setBusy(false);
  };

  const undoAll = async () => {
    setBusy(true);
    const active = ledger.filter((e) => !e.undone);
    for (const e of active) { await undoEntry(e); if (!mounted.current) return; }
    const updated = ledger.map((x) => ({ ...x, undone: true }));
    setLedger(updated);
    await saveLedger(updated);
    setBusy(false);
  };

  const activeCount = ledger.filter((e) => !e.undone).length;
  const history = [...ledger].reverse();

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.engine" />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg bg-surface border border-line w-max">
        {(["apply", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 h-7 rounded-md text-[12.5px] transition ${tab === t ? "bg-white/[0.06] text-text" : "text-text-dim hover:text-text"}`}>
            {t === "apply" ? "Aplicar" : `Historial${activeCount ? ` (${activeCount})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "apply" ? (
        <>
          <div className="flex-1 grid grid-cols-[1fr_340px] gap-6 min-h-0">
            <div ref={listRef} className={`overflow-y-auto pr-3 -mr-3 space-y-6 ${busy ? "pointer-events-none opacity-50" : ""}`}>
              {groups.map((g) => (
                <section key={g}>
                  <h2 className="section-label mb-2">{g}</h2>
                  <div className="rounded-xl border border-line divide-y divide-line/60">
                    {tweaks.filter((t) => t.group === g).map((t) => (
                      <div key={t.id} className="px-3">
                        <EnergyCheckbox label={t.name} desc={t.desc}
                          risk={t.risk === "advanced" ? "advanced" : "safe"}
                          checked={!!sel[t.id]}
                          onChange={(v) => setSel((s) => ({ ...s, [t.id]: v }))} />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="flex flex-col min-h-0">
              <span className="section-label mb-2.5">Verificación</span>
              <div ref={logRef} className="flex-1 overflow-y-auto rounded-xl bg-surface border border-line p-4 font-mono text-[12px] leading-relaxed text-text-dim whitespace-pre-wrap">
                {log.join("\n")}
              </div>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-line">
            {busy && <IndeterminateBar className="mb-4" />}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => setSel(Object.fromEntries(tweaks.map((t) => [t.id, true])))} className="btn btn-ghost">Seleccionar todo</button>
                <button disabled={busy} onClick={() => setSel({})} className="btn btn-ghost">Deseleccionar</button>
              </div>
              <button disabled={busy || selected.length === 0} onClick={apply} className="btn btn-primary px-6">
                {busy ? "Aplicando…" : `Aplicar verificado (${selected.length})`}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] text-text-mute">{activeCount} cambios activos · {ledger.length} en total</span>
            <button disabled={busy || activeCount === 0} onClick={undoAll} className="btn btn-ghost">Deshacer todo</button>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto pr-2 -mr-2">
            {history.length === 0 ? (
              <div className="text-text-mute text-sm">Todavía no aplicaste ningún cambio con el motor.</div>
            ) : (
              <div className="rounded-xl border border-line divide-y divide-line/60">
                {history.map((e) => (
                  <div key={e.id} className={`flex items-center gap-3 px-4 py-3 ${e.undone ? "opacity-45" : ""}`}>
                    <span title={e.verified ? "Verificado" : "No verificado"}
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: e.verified ? "#00e676" : "#ff5470" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-text truncate">{e.name}</div>
                      <div className="text-[11px] text-text-mute font-mono truncate">
                        {showVal(e.prior)} → {e.value} · {fmtTime(e.ts)}
                      </div>
                    </div>
                    {e.undone ? (
                      <span className="text-[11px] text-text-mute shrink-0">deshecho</span>
                    ) : (
                      <button disabled={busy} onClick={() => undo(e)} className="btn btn-ghost shrink-0">Deshacer</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
