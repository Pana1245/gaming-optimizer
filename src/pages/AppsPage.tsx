import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { APP_CATALOG } from "../apps";
import { runPowershell } from "../lib/api";
import { notify } from "../lib/notify";
import { useScrollMemory } from "../lib/useScrollMemory";
import { HudTitle } from "../components/NeonCard";
import Modal from "../components/Modal";

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
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [log, setLog] = useState<string[]>(["Listo."]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const logRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const scrollRef = useScrollMemory<HTMLDivElement>("apps");

  const setAll = (v: boolean) => {
    const n: Record<string, boolean> = {};
    APP_CATALOG.forEach((c) => c.apps.forEach((a) => (n[a.id] = v)));
    setSel(n);
  };

  useEffect(() => {
    runPowershell(INSTALLED_NAMES).then((r) => {
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

  const addLog = (s: string) => setLog((l) => {
    const n = [...l, s];
    queueMicrotask(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight));
    return n;
  });

  const install = async () => {
    setRunning(true);
    setProgress(0);
    setLog(["Listo."]);
    addLog(`Instalando ${selected.length} aplicaciones vía winget…`);
    let ok = 0;
    for (let i = 0; i < selected.length; i++) {
      const app = selected[i];
      addLog(`▸ ${app.name}`);
      const cmd = `winget install --id "${app.id}" --exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity`;
      const r = await runPowershell(cmd);
      if (!mounted.current) return;
      const already = /already installed|ya está instalad/i.test(r.output);
      if (r.ok || already) { ok++; addLog(already ? "  ✓ Ya estaba instalado" : "  ✓ Instalado"); }
      else addLog(`  ✗ ${(r.output.split("\n").find((l) => l.trim()) || "Error").slice(0, 80)}`);
      setProgress((i + 1) / selected.length);
    }
    addLog(`Completado: ${ok}/${selected.length} aplicaciones.`);
    setRunning(false);
    notify("Instalación completada", `${ok}/${selected.length} aplicaciones instaladas.`);
    setDone(`${ok}/${selected.length} aplicaciones instaladas.`);
  };

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
                  <span className="text-[11px] text-text-mute">{selCount}/{c.apps.length}</span>
                  <button
                    onClick={() => setSel((s) => {
                      const n = { ...s };
                      c.apps.forEach((a) => (n[a.id] = !allOn));
                      return n;
                    })}
                    className="ml-auto text-[11px] text-text-mute hover:text-accent transition"
                  >
                    {allOn ? "Quitar" : "Todo"}
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
                        {inst && <span title="Ya instalado" className="ml-auto text-[10px] text-accent shrink-0">✓ instalado</span>}
                      </div>
                    );
                  })}
                </div>
              </motion.section>
            );
          })}
        </motion.div>

        <div className="flex flex-col min-h-0">
          <span className="section-label mb-2.5">Progreso</span>
          <div ref={logRef} className="flex-1 overflow-y-auto rounded-xl bg-surface border border-line p-4 font-mono text-[12px] leading-relaxed text-text-dim whitespace-pre-wrap">
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
            <button disabled={running} onClick={() => setAll(true)} className="btn btn-ghost">Seleccionar todo</button>
            <button disabled={running} onClick={() => setAll(false)} className="btn btn-ghost">Deseleccionar</button>
            <span className="text-[13px] text-text-mute ml-1">{selected.length} sel.</span>
          </div>
          <button disabled={running || selected.length === 0} onClick={install} className="btn btn-primary px-6">
            {running ? "Instalando…" : `Instalar (${selected.length})`}
          </button>
        </div>
      </div>

      <Modal open={!!done} title="Instalación completada" onClose={() => setDone(null)}>{done || ""}</Modal>
    </div>
  );
}
