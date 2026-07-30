import { useEffect, useRef, useState } from "react";
import NeonCard, { HudTitle } from "../components/NeonCard";
import Modal from "../components/Modal";
import { runPowershell } from "../lib/api";
import { useI18n } from "../lib/i18n";
import {
  WU_DISABLE, WU_ENABLE, WU_PAUSE, getWuStatus,
  whoLocks, killProc, type Locker,
} from "../lib/tools";

const WU_COLOR: Record<string, string> = {
  active: "#00e676",
  paused: "#ffd24a",
  disabled: "#ff8a65",
};

export default function Herramientas() {
  const { t, lang } = useI18n();
  const [wu, setWu] = useState<{ state: string; until?: string } | null>(null);
  const [wuBusy, setWuBusy] = useState(false);
  const [path, setPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lockers, setLockers] = useState<Locker[] | null>(null);
  const [lockMsg, setLockMsg] = useState<string | null>(null);
  const [confirmKill, setConfirmKill] = useState<Locker | null>(null);
  const mounted = useRef(true);

  const refreshWu = () => getWuStatus().then((s) => mounted.current && setWu(s)).catch(() => {});
  useEffect(() => {
    mounted.current = true;
    refreshWu();
    return () => { mounted.current = false; };
  }, []);

  const wuAction = async (script: string) => {
    setWuBusy(true);
    try {
      await runPowershell(script);
    } catch (err) {
      if (mounted.current) setLockMsg(`✗ ${t("tools.wu.err")} ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await refreshWu();
      if (mounted.current) setWuBusy(false);
    }
  };

  const scan = async () => {
    const p = path.trim();
    if (!p) return;
    setScanning(true);
    setLockers(null);
    setLockMsg(null);
    try {
      const r = await whoLocks(p);
      if (!mounted.current) return;
      if (r.status === "noexist") setLockMsg(t("tools.unlock.noexist"));
      else if (r.status === "none") setLockMsg(t("tools.unlock.none"));
      else setLockers(r.lockers);
    } catch (err) {
      if (mounted.current) setLockMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (mounted.current) setScanning(false);
    }
  };

  const doKill = async (l: Locker) => {
    setConfirmKill(null);
    try {
      const r = await killProc(l.pid);
      const o = r.output.trim();
      if (mounted.current) {
        if (o.startsWith("PROTECTED"))
          setLockMsg(`✗ ${lang === "en" ? "Protected system process; not closed" : "Proceso crítico del sistema; no se cerró"}: ${l.name}`);
        else if (o === "GONE")
          setLockMsg(`✓ ${l.name} ${lang === "en" ? "was already closed" : "ya estaba cerrado"}`);
        else if (o === "OK")
          setLockMsg(`✓ ${l.name} ${lang === "en" ? "closed" : "cerrado"}`);
        else
          setLockMsg(`✗ ${lang === "en" ? "Couldn't close" : "No se pudo cerrar"} ${l.name}`);
      }
    } catch (err) {
      if (mounted.current) setLockMsg(`✗ ${t("tools.unlock.killErr")} ${err instanceof Error ? err.message : String(err)}`);
    }
    await scan();
  };

  const wuInfo = wu ? { text: t(`tools.wu.${wu.state}`), color: WU_COLOR[wu.state] ?? WU_COLOR.active } : null;

  return (
    <div className="h-full flex flex-col px-8 py-7 overflow-y-auto">
      <HudTitle tkey="page.tools" />

      {/* Windows Update */}
      <NeonCard className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="section-label">Windows Update</span>
            {wuInfo && (
              <span className="text-[12.5px] flex items-center gap-1.5" style={{ color: wuInfo.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: wuInfo.color }} />
                {wuInfo.text}{wu?.until ? ` · ${t("tools.wu.until")} ${wu.until}` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2.5">
          <button onClick={() => wuAction(WU_PAUSE)} disabled={wuBusy} className="btn btn-ghost">{t("tools.wu.pause")}</button>
          <button onClick={() => wuAction(WU_DISABLE)} disabled={wuBusy} className="btn btn-ghost">{t("tools.wu.disable")}</button>
          <button onClick={() => wuAction(WU_ENABLE)} disabled={wuBusy} className="btn btn-primary">{t("tools.wu.enable")}</button>
        </div>
        <p className="text-[11.5px] text-text-mute mt-3">
          {t("tools.wu.hint")}
        </p>
      </NeonCard>

      {/* Desbloquear archivo */}
      <NeonCard>
        <span className="section-label">{t("tools.unlock.title")}</span>
        <p className="text-[12px] text-text-mute mt-1 mb-3">
          {t("tools.unlock.hint")}
        </p>
        <div className="flex items-center gap-2 mb-3">
          <input value={path} onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && scan()}
            placeholder="C:\ruta\al\archivo.ext"
            className="flex-1 h-9 px-3 rounded-lg bg-surface border border-line focus:border-accent outline-none text-[13px] text-text placeholder:text-text-mute font-mono transition" />
          <button onClick={scan} disabled={scanning} className="btn btn-primary">{scanning ? t("tools.unlock.scanning") : t("tools.unlock.scan")}</button>
        </div>

        {lockMsg && (
          <p className="text-[13px]" style={{ color: lockMsg.startsWith("✓") ? "#00e676" : "#ff8a65" }}>{lockMsg}</p>
        )}

        {lockers && lockers.length > 0 && (
          <div className="rounded-xl border border-line divide-y divide-line/60 overflow-hidden">
            <div className="px-4 py-2 text-[12px] text-text-mute bg-surface">
              {lockers.length} {t("tools.unlock.usingCount")}
            </div>
            {lockers.map((l) => (
              <div key={l.pid} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 text-[13px] text-text-dim font-mono">{l.name} <span className="text-text-mute">· PID {l.pid}</span></span>
                <button onClick={() => setConfirmKill(l)} className="text-[13px] text-[#ff5470] hover:underline shrink-0">{t("tools.unlock.kill")}</button>
              </div>
            ))}
          </div>
        )}
      </NeonCard>

      <Modal open={!!confirmKill} title={lang === "en" ? "Close process?" : "¿Cerrar proceso?"}
        onClose={() => setConfirmKill(null)}
        onConfirm={() => confirmKill && doKill(confirmKill)}
        confirmText={lang === "en" ? "Close process" : "Cerrar proceso"} closeText="Cancelar">
        {confirmKill
          ? `${confirmKill.name} · PID ${confirmKill.pid}\n\n${lang === "en"
              ? "Forcing a process to close can lose unsaved work. Critical system processes are protected."
              : "Forzar el cierre de un proceso puede perder trabajo sin guardar. Los procesos críticos del sistema están protegidos."}`
          : ""}
      </Modal>
    </div>
  );
}
