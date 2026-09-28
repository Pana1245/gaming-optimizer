import { useRef, useState, type ReactNode } from "react";
import { runStream } from "../lib/api";
import { Page, ActionCard, LogPanel } from "../components/ui";
import { IconShieldCheck, IconLayers, IconGlobe, IconReset, IconApps } from "../components/icons";
import { Spinner, IndeterminateBar } from "../components/Feedback";
import { useI18n } from "../lib/i18n";
import { trLog } from "../lib/logI18n";

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

const REPAIR_ICONS: Record<string, ReactNode> = {
  sfc: <IconShieldCheck />, dism: <IconLayers />, net: <IconGlobe />, explorer: <IconReset />, iconcache: <IconApps />,
};

export default function Reparar() {
  const { t, lang } = useI18n();
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
    <Page tkey="page.repair">
      {busy && <div className="-mt-3 mb-5 shrink-0"><IndeterminateBar /></div>}
      <div className="flex-1 grid grid-cols-[1fr_320px] gap-6 min-h-0">
        <div className="space-y-3 overflow-y-auto pr-3 -mr-3 pb-2">
          {ACTIONS.map((a) => (
            <ActionCard key={a.id} icon={REPAIR_ICONS[a.id]} title={t(`repair.${a.id}.title`)} desc={t(`repair.${a.id}.desc`)}
              action={<button onClick={() => run(a)} disabled={!!busy} className="btn btn-ghost">
                {busy === a.id ? t("repair.running") : t(`repair.${a.id}.btn`)}
              </button>} />
          ))}
        </div>
        <LogPanel ref={logRef} label={<span className="flex items-center gap-2">{t("repair.output")}{busy && <Spinner size={12} />}</span>}>
          {trLog(log.join("\n"), lang)}
        </LogPanel>
      </div>
    </Page>
  );
}
