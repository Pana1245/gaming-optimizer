import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { runStream } from "../lib/api";
import NeonCard, { HudTitle } from "../components/NeonCard";
import { Spinner, IndeterminateBar } from "../components/Feedback";
import { useI18n } from "../lib/i18n";

const ACTIONS = [
  { id: "sfc", title: "Reparar archivos del sistema (SFC)", desc: "Escanea y repara archivos de Windows dañados. Puede tardar varios minutos.",
    btn: "Ejecutar SFC", script: String.raw`sfc /scannow 2>&1; exit $LASTEXITCODE` },
  { id: "dism", title: "Reparar imagen de Windows (DISM)", desc: "Restaura la salud de la imagen del sistema. Requiere internet.",
    btn: "Ejecutar DISM", script: String.raw`DISM /Online /Cleanup-Image /RestoreHealth 2>&1; exit $LASTEXITCODE` },
  { id: "net", title: "Resetear la red", desc: "Winsock + IP + caché DNS. Soluciona problemas de conexión.",
    btn: "Resetear red", script: String.raw`netsh winsock reset | Out-Null; netsh int ip reset | Out-Null; ipconfig /flushdns | Out-Null; ipconfig /release | Out-Null; ipconfig /renew | Out-Null; Write-Output "Red reseteada. Reinicia para aplicar."` },
  { id: "explorer", title: "Reiniciar el Explorador", desc: "Refresca la barra de tareas y el escritorio si quedaron colgados.",
    btn: "Reiniciar Explorer", script: String.raw`Stop-Process -Name explorer -Force; Start-Sleep 1; Start-Process explorer; Write-Output "Explorador reiniciado"` },
  { id: "iconcache", title: "Reconstruir caché de iconos", desc: "Arregla iconos en blanco o corruptos.",
    btn: "Reconstruir", script: String.raw`Stop-Process -Name explorer -Force -EA SilentlyContinue; Remove-Item "$env:LocalAppData\IconCache.db" -Force -EA SilentlyContinue; Remove-Item "$env:LocalAppData\Microsoft\Windows\Explorer\iconcache_*" -Force -EA SilentlyContinue; Start-Process explorer; Write-Output "Caché de iconos reconstruida"` },
];

export default function Reparar() {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>(() => [t("common.ready")]);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (s: string) => setLog((l) => {
    const n = [...l, s];
    queueMicrotask(() => logRef.current?.scrollTo(0, logRef.current!.scrollHeight));
    return n;
  });

  const run = async (a: typeof ACTIONS[number]) => {
    if (busy) return;
    setBusy(a.id);
    const title = t(`repair.${a.id}.title`);
    addLog(`▸ ${title}…`);
    if (a.id === "sfc" || a.id === "dism") addLog("  " + t("repair.mayTake"));
    const lines: string[] = [];
    const res = await runStream(a.script, (line) => { lines.push(line); addLog("  " + line); });
    const out = lines.join("\n").toLowerCase();
    // No damos "completado" por defecto: si el código de salida no fue 0, lo decimos.
    let summary = res.ok ? `✓ ${title} — ${t("repair.completed")}` : `⚠ ${title} — ${t("repair.errCode")} ${res.code})`;
    if (a.id === "sfc") {
      if (out.includes("did not find any integrity") || out.includes("no encontró ninguna infracción"))
        summary = `✓ ${t("repair.sfc.clean")}`;
      else if (out.includes("successfully repaired") || out.includes("reparó correctamente") || out.includes("reparados correctamente"))
        summary = `✓ ${t("repair.sfc.fixed")}`;
      else if (out.includes("unable to fix") || out.includes("no pudo reparar"))
        summary = `⚠ ${t("repair.sfc.unfixable")}`;
    } else if (a.id === "dism") {
      if (out.includes("no component store corruption") || out.includes("no se detectó daño") || out.includes("completed successfully") || out.includes("se completó correctamente"))
        summary = `✓ ${t("repair.dism.ok")}`;
      else if (out.includes("error"))
        summary = `⚠ ${t("repair.dism.err")}`;
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
                    <div className="text-[14px] font-medium text-text">{t(`repair.${a.id}.title`)}</div>
                    <div className="text-[13px] text-text-dim mt-0.5">{t(`repair.${a.id}.desc`)}</div>
                  </div>
                  <motion.button whileTap={{ scale: 0.96 }} onClick={() => run(a)} disabled={!!busy}
                    className="shrink-0 px-4 h-9 rounded-lg text-[13px] font-medium text-text-dim hover:text-text border border-line hover:border-line-2 transition disabled:opacity-40">
                    {busy === a.id ? t("repair.running") : t(`repair.${a.id}.btn`)}
                  </motion.button>
                </div>
              </NeonCard>
            </motion.div>
          ))}
        </motion.div>

        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2.5 h-4">
            <span className="section-label">{t("repair.output")}</span>
            {busy && <Spinner size={12} />}
          </div>
          {busy && <IndeterminateBar className="mb-2" />}
          <div ref={logRef} className="flex-1 overflow-y-auto rounded-xl bg-surface border border-line p-4 font-mono text-[13px] leading-relaxed text-text-dim whitespace-pre-wrap">
            {log.join("\n")}
          </div>
        </div>
      </div>
    </div>
  );
}
