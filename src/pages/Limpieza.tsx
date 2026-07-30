import { useEffect, useMemo, useRef, useState } from "react";
import { runPowershell } from "../lib/api";
import { notify } from "../lib/notify";
import EnergyCheckbox from "../components/EnergyCheckbox";
import { HudTitle } from "../components/NeonCard";
import { IndeterminateBar } from "../components/Feedback";
import Modal from "../components/Modal";
import { useI18n } from "../lib/i18n";

const sizeOnly = (paths: string) => String.raw`$ps=@(${paths})
$s=0; foreach($d in $ps){ if(Test-Path $d){ $s += (Get-ChildItem $d -Recurse -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum } }
Write-Output ("SIZE=" + [math]::Round($s/1MB,1))`;

// Mide ANTES y DESPUÉS y reporta la diferencia real: si un archivo está bloqueado
// (Chrome/Edge abierto), no se borra y no se cuenta como liberado.
const sizeAndClear = (paths: string) => String.raw`$ps=@(${paths})
$before=0; foreach($d in $ps){ if(Test-Path $d){ $before += (Get-ChildItem $d -Recurse -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum } }
foreach($d in $ps){ Remove-Item "$d\*" -Recurse -Force -EA SilentlyContinue }
$after=0; foreach($d in $ps){ if(Test-Path $d){ $after += (Get-ChildItem $d -Recurse -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum } }
Write-Output ("FREED=" + [math]::Round(($before-$after)/1MB,1))`;

interface Item { id: string; name: string; scan: string; clean: string; off?: boolean; }

const P = {
  temp: String.raw`"$env:windir\Temp", "$env:TEMP"`,
  prefetch: String.raw`"$env:windir\Prefetch"`,
  wer: String.raw`"$env:ProgramData\Microsoft\Windows\WER\ReportQueue", "$env:ProgramData\Microsoft\Windows\WER\ReportArchive"`,
  deliv: String.raw`"$env:windir\SoftwareDistribution\DeliveryOptimization"`,
  browsers: String.raw`"$env:LocalAppData\Google\Chrome\User Data\Default\Cache", "$env:LocalAppData\Microsoft\Edge\User Data\Default\Cache"`,
  shader: String.raw`"$env:LocalAppData\NVIDIA\DXCache", "$env:LocalAppData\D3DSCache"`,
};

const WU_SIZE = String.raw`$d="$env:windir\SoftwareDistribution\Download"
$s=if(Test-Path $d){(Get-ChildItem $d -Recurse -Force -EA SilentlyContinue|Measure-Object Length -Sum).Sum}else{0}`;
const RECYCLE_SIZE = String.raw`$shell=New-Object -ComObject Shell.Application; $bin=$shell.Namespace(10); $s=0
if($bin){ foreach($i in $bin.Items()){ try{ $s += $i.Size }catch{} } }`;
const THUMB_SIZE = String.raw`$d="$env:LocalAppData\Microsoft\Windows\Explorer"
$s=if(Test-Path $d){(Get-ChildItem $d -Filter thumbcache_* -Force -EA SilentlyContinue|Measure-Object Length -Sum).Sum}else{0}`;

const ITEMS: Item[] = [
  { id: "temp", name: "Archivos temporales (Windows + usuario)", scan: sizeOnly(P.temp), clean: sizeAndClear(P.temp) },
  { id: "prefetch", name: "Prefetch (Windows lo reconstruye; puede enlentecer los primeros arranques)", scan: sizeOnly(P.prefetch), clean: sizeAndClear(P.prefetch), off: true },
  { id: "wu", name: "Caché de Windows Update", scan: `${WU_SIZE}\nWrite-Output ("SIZE=" + [math]::Round($s/1MB,1))`,
    clean: `$svc=Get-Service wuauserv -EA SilentlyContinue\n$wasRunning=$svc -and $svc.Status -eq 'Running'\n$d="$env:windir\\SoftwareDistribution\\Download"\n$before=if(Test-Path $d){(Get-ChildItem $d -Recurse -Force -EA SilentlyContinue|Measure-Object Length -Sum).Sum}else{0}\nStop-Service wuauserv -Force -EA SilentlyContinue\nRemove-Item "$d\\*" -Recurse -Force -EA SilentlyContinue\n$after=if(Test-Path $d){(Get-ChildItem $d -Recurse -Force -EA SilentlyContinue|Measure-Object Length -Sum).Sum}else{0}\nif($wasRunning){ Start-Service wuauserv -EA SilentlyContinue }\nWrite-Output ("FREED=" + [math]::Round(($before-$after)/1MB,1))` },
  { id: "thumbs", name: "Caché de miniaturas", scan: `${THUMB_SIZE}\nWrite-Output ("SIZE=" + [math]::Round($s/1MB,1))`,
    clean: `${THUMB_SIZE}\n$before=$s\nRemove-Item "$d\\thumbcache_*" -Force -EA SilentlyContinue\n$after=if(Test-Path $d){(Get-ChildItem $d -Filter thumbcache_* -Force -EA SilentlyContinue|Measure-Object Length -Sum).Sum}else{0}\nWrite-Output ("FREED=" + [math]::Round(($before-$after)/1MB,1))` },
  { id: "wer", name: "Reportes de error (WER)", scan: sizeOnly(P.wer), clean: sizeAndClear(P.wer) },
  { id: "deliv", name: "Delivery Optimization", scan: sizeOnly(P.deliv), clean: sizeAndClear(P.deliv) },
  { id: "browsers", name: "Caché de navegadores (Chrome/Edge)", scan: sizeOnly(P.browsers), clean: sizeAndClear(P.browsers) },
  { id: "shader", name: "Shader cache (NVIDIA / DirectX)", scan: sizeOnly(P.shader), clean: sizeAndClear(P.shader) },
  { id: "recycle", name: "Papelera de reciclaje", scan: `${RECYCLE_SIZE}\nWrite-Output ("SIZE=" + [math]::Round($s/1MB,1))`,
    clean: `${RECYCLE_SIZE}\n$before=$s\nClear-RecycleBin -Force -EA SilentlyContinue\n$sh2=New-Object -ComObject Shell.Application; $bin2=$sh2.Namespace(10); $after=0\nif($bin2){ foreach($i in $bin2.Items()){ try{ $after += $i.Size }catch{} } }\nWrite-Output ("FREED=" + [math]::Round(($before-$after)/1MB,1))` },
];

const fmtMB = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(mb < 10 ? 1 : 0)} MB`);

export default function Limpieza() {
  const { t } = useI18n();
  const [sel, setSel] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ITEMS.map((i) => [i.id, !i.off])));
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [log, setLog] = useState<string[]>(() => [t("clean.logIntro")]);
  const [analyzing, setAnalyzing] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const selected = useMemo(() => ITEMS.filter((i) => sel[i.id]), [sel]);
  const busy = analyzing || running;
  const totalEstimated = selected.reduce((s, i) => s + (sizes[i.id] ?? 0), 0);

  const addLog = (s: string) => setLog((l) => {
    const n = [...l, s];
    queueMicrotask(() => logRef.current?.scrollTo(0, logRef.current!.scrollHeight));
    return n;
  });

  const analyze = async () => {
    setAnalyzing(true);
    setLog([t("clean.analyzing")]);
    const found: Record<string, number> = {};
    for (let i = 0; i < selected.length; i++) {
      const it = selected[i];
      const r = await runPowershell(it.scan);
      if (!mounted.current) return;
      const m = r.output.match(/SIZE=([\d.]+)/);
      found[it.id] = m ? parseFloat(m[1]) : 0;
      setSizes({ ...found });
      addLog(`  ${t(`clean.item.${it.id}`)}: ${fmtMB(found[it.id])}`);
    }
    const tot = Object.values(found).reduce((a, b) => a + b, 0);
    addLog(`\n${t("clean.estimated")} ${fmtMB(tot)}`);
    setAnalyzing(false);
  };

  const run = async () => {
    setConfirm(false);
    setRunning(true);
    setLog([t("clean.cleaning")]);
    let total = 0;
    for (let i = 0; i < selected.length; i++) {
      const it = selected[i];
      addLog(`▸ ${t(`clean.item.${it.id}`)}`);
      const r = await runPowershell(it.clean);
      if (!mounted.current) return;
      const m = r.output.match(/FREED=([\d.]+)/);
      const mb = m ? parseFloat(m[1]) : 0;
      total += mb;
      addLog(`  ✓ ${mb > 0 ? `${fmtMB(mb)} ${t("clean.freed")}` : t("clean.cleaned")}`);
    }
    addLog(`\n${t("clean.totalFreed")} ${fmtMB(total)}`);
    setRunning(false);
    setSizes({});
    notify(t("clean.notifyTitle"), `${t("clean.notifyBody")} ${fmtMB(total)}.`);
    setDone(`${t("clean.notifyBody")} ${fmtMB(total)} ${t("clean.doneBody")}`);
  };

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.clean" />

      <div className="flex-1 grid grid-cols-[1fr_340px] gap-6 min-h-0">
        <div className={`overflow-y-auto pr-3 -mr-3 transition-opacity ${busy ? "pointer-events-none opacity-50" : ""}`}>
          <div className="rounded-xl border border-line divide-y divide-line/60">
            {ITEMS.map((it) => (
              <div key={it.id} className="px-3">
                <EnergyCheckbox label={t(`clean.item.${it.id}`)}
                  badge={sizes[it.id] !== undefined ? fmtMB(sizes[it.id]) : undefined}
                  checked={!!sel[it.id]}
                  onChange={(v) => setSel((s) => ({ ...s, [it.id]: v }))} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col min-h-0">
          <span className="section-label mb-2.5">{t("common.progress")}</span>
          <div ref={logRef} className="flex-1 overflow-y-auto rounded-xl bg-surface border border-line p-4 font-mono text-[13px] leading-relaxed text-text-dim whitespace-pre-wrap">
            {log.join("\n")}
          </div>
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-line">
        {busy && <IndeterminateBar className="mb-4" />}
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-text-mute">
            {selected.length} {t("clean.selected")}
            {totalEstimated > 0 && <span className="text-accent"> · ~{fmtMB(totalEstimated)} {t("clean.toFree")}</span>}
          </span>
          <div className="flex gap-2">
            <button disabled={busy || selected.length === 0} onClick={analyze} className="btn btn-ghost">
              {analyzing ? t("clean.analyzing") : t("clean.analyze")}
            </button>
            <button disabled={busy || selected.length === 0} onClick={() => setConfirm(true)} className="btn btn-primary px-6">
              {running ? t("clean.cleaning") : t("clean.cleanNow")}
            </button>
          </div>
        </div>
      </div>

      <Modal open={confirm} title={t("clean.confirmTitle")} onClose={() => setConfirm(false)}
        onConfirm={run} confirmText={t("clean.confirmBtn")} closeText={t("common.cancel")}>
        {`${t("clean.confirmBody1")} ${selected.length} ${t("clean.confirmBody2")}${totalEstimated > 0 ? ` (~${fmtMB(totalEstimated)})` : ""}.\n${t("clean.confirmBody3")}`}
      </Modal>
      <Modal open={!!done} title={t("clean.doneTitle")} onClose={() => setDone(null)}>{done || ""}</Modal>
    </div>
  );
}
