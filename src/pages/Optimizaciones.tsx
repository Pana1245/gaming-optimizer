import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CATEGORIES } from "../catalog";
import { EXTRA_TWEAKS, EXTRA_CATEGORIES } from "../extraCatalog";
import { TWEAK_DESC } from "../tweakDesc";
import { runPowershell, getSystemInfo } from "../lib/api";
import { notify } from "../lib/notify";
import { useScrollMemory } from "../lib/useScrollMemory";
import EnergyCheckbox from "../components/EnergyCheckbox";
import { HudTitle } from "../components/NeonCard";
import Modal from "../components/Modal";

// Categorías base + tweaks nuevos fusionados por id + categorías extra (WinUtil)
const ALL_CATEGORIES = [
  ...CATEGORIES.map((c) => ({
    ...c,
    tweaks: [...c.tweaks, ...(EXTRA_TWEAKS[c.id] || [])],
  })),
  ...EXTRA_CATEGORIES,
];

// Tweaks marcados como avanzados (además de los que traen risk:"advanced")
const ADVANCED = new Set([
  "Prioridad CPU máxima para juegos",
  "Timer Resolution — 1ms (reduce micro-stutters)",
  "Core Parking OFF — todos los núcleos activos",
  "[Sycnex] Remove ALL Bloatware (lista completa)",
  "[Sycnex] Remove Bloatware por lista negra",
  "Reservar 0% de ancho de banda para QoS",
  "Desanclar todas las apps del menu Inicio",
]);

const BACKUP = `
$date    = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backDir = "C:\\OptimizacionBackup\\$date"
New-Item -ItemType Directory -Path $backDir -Force | Out-Null
Write-Output "Creando punto de restauracion..."
try {
    Enable-ComputerRestore -Drive "C:\\" -ErrorAction Stop
    Checkpoint-Computer -Description "Gaming Optimizer - $date" -RestorePointType "MODIFY_SETTINGS" -ErrorAction Stop
    Write-Output "Punto de restauracion creado OK"
} catch { Write-Output "AVISO: no se pudo crear punto de restauracion" }
Write-Output "Backup en: $backDir"
`;

const MODO_GAMER: Record<string, number[]> = {
  gaming: [0, 1, 3, 4, 5, 7, 8],
  network: [0, 1, 2],
  visual: [0, 1],
};

export default function Optimizaciones() {
  const [winVer, setWinVer] = useState(11);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [log, setLog] = useState<string[]>(["Listo."]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [canReboot, setCanReboot] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const scrollRef = useScrollMemory<HTMLDivElement>("opt");

  const cats = useMemo(
    () => ALL_CATEGORIES.map((c) => ({
      ...c,
      tweaks: c.tweaks.filter((t) => !t.os || t.os === winVer),
    })).filter((c) => c.tweaks.length > 0),
    [winVer]
  );

  useEffect(() => {
    const init: Record<string, boolean> = {};
    ALL_CATEGORIES.forEach((c) => c.tweaks.forEach((_, i) => (init[`${c.id}:${i}`] = true)));
    setSel(init);
    getSystemInfo().then((info) => setWinVer(info.win_ver)).catch(() => {});
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  const addLog = (s: string) => setLog((l) => [...l, s]);
  const setAll = (v: boolean) => {
    const n: Record<string, boolean> = {};
    cats.forEach((c) => c.tweaks.forEach((_, i) => (n[`${c.id}:${i}`] = v)));
    setSel(n);
  };
  const modoGamer = () => {
    const n: Record<string, boolean> = {};
    cats.forEach((c) => c.tweaks.forEach((_, i) => (n[`${c.id}:${i}`] = false)));
    Object.entries(MODO_GAMER).forEach(([cid, idx]) =>
      idx.forEach((i) => (n[`${cid}:${i}`] = true)));
    setSel(n);
  };

  const selectedList = () =>
    cats.flatMap((c) => c.tweaks
      .map((t, i) => ({ t, key: `${c.id}:${i}` }))
      .filter(({ key }) => sel[key])
      .map(({ t }) => t));

  const run = async () => {
    setConfirm(false);
    const list = selectedList();
    setRunning(true);
    setProgress(0);
    setLog(["Listo."]);
    addLog("PASO 1/2 — Creando backup...");
    const bk = await runPowershell(BACKUP);
    bk.output.split("\n").forEach((l) => l.trim() && addLog("  " + l.trim()));
    addLog(`PASO 2/2 — Aplicando ${list.length} optimizaciones...`);
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      addLog(`▸ ${list[i].name}`);
      const r = await runPowershell(list[i].script);
      if (!mounted.current) return;
      if (r.ok) ok++;
      addLog(`  ${r.ok ? "✓" : "✗"} ${(r.output.split("\n")[0] || "OK").trim()}`);
      setProgress((i + 1) / list.length);
    }
    addLog(`Completado: ${ok}/${list.length} optimizaciones aplicadas.`);
    setRunning(false);
    setCanReboot(true);
    notify("Optimización completada", `${ok}/${list.length} optimizaciones aplicadas.`);
    setDone(`${ok}/${list.length} optimizaciones aplicadas.\nReiniciá el PC para aplicar todos los cambios.`);
  };

  const reboot = () => runPowershell("shutdown /r /t 3");

  const count = selectedList().length;

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.opt" />

      <div className="flex-1 grid grid-cols-[1fr_340px] gap-6 min-h-0">
        {/* Lista */}
        <motion.div
          ref={scrollRef}
          className={`overflow-y-auto pr-3 -mr-3 space-y-7 transition-opacity ${running ? "pointer-events-none opacity-50" : ""}`}
          initial="hidden" animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        >
          {cats.map((c) => {
            const selCount = c.tweaks.filter((_, i) => sel[`${c.id}:${i}`]).length;
            return (
              <motion.section
                key={c.id}
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
                }}
              >
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                  <h2 className="section-label">{c.name}</h2>
                  <span className="text-[11px] text-text-mute">{selCount}/{c.tweaks.length}</span>
                </div>
                {c.id === "winutil" && (
                  <p className="text-[11px] text-text-mute -mt-1.5 mb-2">
                    Adaptados de WinUtil · Chris Titus Tech (MIT)
                  </p>
                )}
                <div className="rounded-xl border border-line divide-y divide-line/60">
                  {c.tweaks.map((t, i) => (
                    <div key={i} className="px-3">
                      <EnergyCheckbox
                        label={t.name}
                        badge={t.os ? `W${t.os}` : undefined}
                        risk={t.risk === "advanced" || ADVANCED.has(t.name) ? "advanced" : "safe"}
                        desc={TWEAK_DESC[t.name]}
                        checked={!!sel[`${c.id}:${i}`]}
                        onChange={(v) => setSel((s) => ({ ...s, [`${c.id}:${i}`]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </motion.section>
            );
          })}
        </motion.div>

        {/* Log */}
        <div className="flex flex-col min-h-0">
          <span className="section-label mb-2.5">Progreso</span>
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto rounded-xl bg-surface border border-line p-4 font-mono text-[12px] leading-relaxed text-text-dim whitespace-pre-wrap"
          >
            {log.join("\n")}
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="mt-6 pt-5 border-t border-line">
        {running && (
          <div className="h-[3px] rounded-full bg-line overflow-hidden mb-4">
            <motion.div
              className="h-full bg-accent"
              animate={{ width: `${progress * 100}%` }}
              transition={{ ease: "easeOut", duration: 0.3 }}
            />
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button disabled={running} onClick={() => setAll(true)} className="btn btn-ghost">Seleccionar todo</button>
            <button disabled={running} onClick={() => setAll(false)} className="btn btn-ghost">Deseleccionar</button>
            <button disabled={running} onClick={modoGamer} className="btn btn-ghost">Modo Gamer</button>
          </div>
          <button
            disabled={running}
            onClick={() => (count === 0 ? setDone("No hay optimizaciones seleccionadas.") : setConfirm(true))}
            className="btn btn-primary px-6"
          >
            {running ? "Optimizando…" : `Aplicar${count ? ` (${count})` : ""}`}
          </button>
        </div>
      </div>

      <Modal open={confirm} title="Confirmar optimización" onClose={() => setConfirm(false)}
        onConfirm={run} confirmText="Aplicar" closeText="Cancelar">
        {`Se aplicarán ${count} optimizaciones.\nSe creará un backup automático antes de empezar.`}
      </Modal>
      <Modal open={!!done} title="Resultado" onClose={() => { setDone(null); setCanReboot(false); }}
        onConfirm={canReboot ? () => { reboot(); setDone(null); setCanReboot(false); } : undefined}
        confirmText="Reiniciar ahora" closeText="Después">
        {done || ""}
      </Modal>
    </div>
  );
}
