import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { runStream } from "../lib/api";
import NeonCard, { HudTitle } from "../components/NeonCard";
import { Spinner, IndeterminateBar } from "../components/Feedback";

const ACTIONS = [
  { id: "sfc", title: "Reparar archivos del sistema (SFC)", desc: "Escanea y repara archivos de Windows dañados. Puede tardar varios minutos.",
    btn: "Ejecutar SFC", script: String.raw`sfc /scannow 2>&1 | Out-String | Write-Output` },
  { id: "dism", title: "Reparar imagen de Windows (DISM)", desc: "Restaura la salud de la imagen del sistema. Requiere internet.",
    btn: "Ejecutar DISM", script: String.raw`DISM /Online /Cleanup-Image /RestoreHealth 2>&1 | Out-String | Write-Output` },
  { id: "net", title: "Resetear la red", desc: "Winsock + IP + caché DNS. Soluciona problemas de conexión.",
    btn: "Resetear red", script: String.raw`netsh winsock reset | Out-Null; netsh int ip reset | Out-Null; ipconfig /flushdns | Out-Null; ipconfig /release | Out-Null; ipconfig /renew | Out-Null; Write-Output "Red reseteada. Reinicia para aplicar."` },
  { id: "explorer", title: "Reiniciar el Explorador", desc: "Refresca la barra de tareas y el escritorio si quedaron colgados.",
    btn: "Reiniciar Explorer", script: String.raw`Stop-Process -Name explorer -Force; Start-Sleep 1; Start-Process explorer; Write-Output "Explorador reiniciado"` },
  { id: "iconcache", title: "Reconstruir caché de iconos", desc: "Arregla iconos en blanco o corruptos.",
    btn: "Reconstruir", script: String.raw`Stop-Process -Name explorer -Force -EA SilentlyContinue; Remove-Item "$env:LocalAppData\IconCache.db" -Force -EA SilentlyContinue; Remove-Item "$env:LocalAppData\Microsoft\Windows\Explorer\iconcache_*" -Force -EA SilentlyContinue; Start-Process explorer; Write-Output "Caché de iconos reconstruida"` },
];

export default function Reparar() {
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>(["Listo."]);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (s: string) => setLog((l) => {
    const n = [...l, s];
    queueMicrotask(() => logRef.current?.scrollTo(0, logRef.current!.scrollHeight));
    return n;
  });

  const run = async (a: typeof ACTIONS[number]) => {
    if (busy) return;
    setBusy(a.id);
    addLog(`▸ ${a.title}…`);
    if (a.id === "sfc" || a.id === "dism") addLog("  (puede tardar varios minutos — verás el avance acá)");
    const lines: string[] = [];
    await runStream(a.script, (line) => { lines.push(line); addLog("  " + line); });
    const t = lines.join("\n").toLowerCase();
    let summary = `✓ ${a.title} — completado`;
    if (a.id === "sfc") {
      if (t.includes("did not find any integrity") || t.includes("no encontró ninguna infracción"))
        summary = "✓ SFC: no se encontraron archivos dañados";
      else if (t.includes("successfully repaired") || t.includes("reparó correctamente") || t.includes("reparados correctamente"))
        summary = "✓ SFC: archivos dañados reparados";
      else if (t.includes("unable to fix") || t.includes("no pudo reparar"))
        summary = "⚠ SFC: encontró errores que no pudo reparar (ejecutá DISM y reintentá)";
    } else if (a.id === "dism") {
      if (t.includes("no component store corruption") || t.includes("no se detectó daño") || t.includes("completed successfully") || t.includes("se completó correctamente"))
        summary = "✓ DISM: imagen restaurada / sin corrupción";
      else if (t.includes("error"))
        summary = "⚠ DISM: terminó con errores";
    }
    addLog(`  ${summary}`);
    setBusy(null);
  };

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.repair" />

      <div className="flex-1 grid grid-cols-[1fr_340px] gap-6 min-h-0">
        <motion.div className="space-y-3 overflow-y-auto pr-3 -mr-3"
          initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
          {ACTIONS.map((a) => (
            <motion.div key={a.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } } }}>
              <NeonCard>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium text-text">{a.title}</div>
                    <div className="text-[12px] text-text-dim mt-0.5">{a.desc}</div>
                  </div>
                  <motion.button whileTap={{ scale: 0.96 }} onClick={() => run(a)} disabled={!!busy}
                    className="shrink-0 px-4 h-9 rounded-lg text-[13px] font-medium text-text-dim hover:text-text border border-line hover:border-line-2 transition disabled:opacity-40">
                    {busy === a.id ? "Ejecutando…" : a.btn}
                  </motion.button>
                </div>
              </NeonCard>
            </motion.div>
          ))}
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
