import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { runPowershell } from "../lib/api";
import NeonCard, { HudTitle } from "../components/NeonCard";
import { Spinner, IndeterminateBar } from "../components/Feedback";

const SCRIPTS = {
  list: `$root="C:\\OptimizacionBackup"; if(Test-Path $root){ Get-ChildItem $root -Directory | Sort-Object Name -Descending | Select-Object -ExpandProperty Name }`,
  checkpoint: `Enable-ComputerRestore -Drive "C:\\" -ErrorAction SilentlyContinue
Checkpoint-Computer -Description "Gaming Optimizer (manual)" -RestorePointType "MODIFY_SETTINGS"
Write-Output "Punto de restauracion creado correctamente."`,
  restore: `$root="C:\\OptimizacionBackup"
if(!(Test-Path $root)){ Write-Output "No hay backups disponibles."; return }
$last = Get-ChildItem $root -Directory | Sort-Object Name -Descending | Select-Object -First 1
if(!$last){ Write-Output "No hay backups disponibles."; return }
Write-Output "Restaurando backup: $($last.Name)"
$regs = Get-ChildItem $last.FullName -Filter *.reg
if(!$regs){ Write-Output "El backup no tiene archivos .reg."; return }
foreach($r in $regs){ reg import $r.FullName 2>&1 | Out-Null; Write-Output ("  OK  " + $r.Name) }
Write-Output "Registro restaurado. Reinicia el PC para aplicar."`,
};

export default function RestaurarPage() {
  const [log, setLog] = useState<string[]>(["Listo."]);
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (s: string) => setLog((l) => {
    const n = [...l, s];
    queueMicrotask(() => logRef.current?.scrollTo(0, logRef.current!.scrollHeight));
    return n;
  });

  const loadBackups = () =>
    runPowershell(SCRIPTS.list).then((r) =>
      setBackups(r.output.split("\n").map((s) => s.trim()).filter(Boolean)));

  useEffect(() => { loadBackups(); }, []);

  const action = async (key: keyof typeof SCRIPTS, title: string) => {
    if (busy) return;
    setBusy(true);
    addLog(`▸ ${title}`);
    const r = await runPowershell(SCRIPTS[key]);
    r.output.split("\n").forEach((l) => l.trim() && addLog("  " + l.trim()));
    setBusy(false);
    loadBackups();
  };

  const openRstrui = () => runPowershell("Start-Process rstrui.exe");

  const Card = ({ title, desc, btn, onClick, primary }: {
    title: string; desc: string; btn: string; onClick: () => void; primary?: boolean;
  }) => (
    <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } } }}>
      <NeonCard>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[14px] font-medium text-text">{title}</div>
            <div className="text-[12px] text-text-dim mt-0.5">{desc}</div>
          </div>
          <motion.button whileTap={{ scale: 0.96 }} disabled={busy} onClick={onClick}
            className={`shrink-0 px-4 h-9 rounded-lg text-[13px] font-medium transition disabled:opacity-40
              ${primary ? "bg-accent text-black hover:bg-[#1aff8a] font-semibold" : "text-text-dim hover:text-text border border-line hover:border-line-2"}`}>
            {btn}
          </motion.button>
        </div>
      </NeonCard>
    </motion.div>
  );

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.restore" />

      <div className="flex-1 grid grid-cols-[1fr_340px] gap-6 min-h-0">
        <motion.div className="space-y-3 overflow-y-auto pr-3 -mr-3"
          initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
          <Card title="Restaurar último backup" primary
            desc="Reimporta el registro guardado antes de la última optimización."
            btn="Restaurar" onClick={() => action("restore", "Restaurar último backup")} />
          <Card title="Crear punto de restauración"
            desc="Genera un punto de restauración del sistema ahora mismo."
            btn="Crear" onClick={() => action("checkpoint", "Crear punto de restauración")} />
          <Card title="Restaurar sistema de Windows"
            desc="Abre la herramienta nativa de Windows (rstrui)."
            btn="Abrir" onClick={openRstrui} />

          <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } } }}>
            <NeonCard>
              <span className="section-label">Backups disponibles</span>
              {backups.length ? (
                <div className="mt-3 space-y-1.5 font-mono text-[12px] text-text-dim">
                  {backups.map((b) => (
                    <div key={b} className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-accent" />{b}
                    </div>
                  ))}
                </div>
              ) : <div className="text-text-mute text-[12px] mt-2">Todavía no hay backups. Se crean al optimizar.</div>}
            </NeonCard>
          </motion.div>
        </motion.div>

        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2.5 h-4">
            <span className="section-label">Salida</span>
            {busy && <Spinner size={12} />}
          </div>
          {busy && <IndeterminateBar className="mb-2" />}
          <div ref={logRef} className="flex-1 overflow-y-auto rounded-xl bg-surface border border-line p-4 font-mono text-[12px] leading-relaxed text-text-dim whitespace-pre-wrap">
            {log.join("\n")}
          </div>
        </div>
      </div>
    </div>
  );
}
