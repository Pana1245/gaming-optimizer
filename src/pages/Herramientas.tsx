import { useEffect, useRef, useState } from "react";
import { Page, Badge, SectionTitle, List, Row, type Tone } from "../components/ui";
import Modal from "../components/Modal";
import { runPowershell } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { trLog } from "../lib/logI18n";
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
          setLockMsg(`✗ ${t("tools.kill.protected")}: ${l.name}`);
        else if (o === "GONE")
          setLockMsg(`✓ ${l.name} ${t("tools.kill.already")}`);
        else if (o === "OK")
          setLockMsg(`✓ ${l.name} ${t("tools.kill.closed")}`);
        else
          setLockMsg(`✗ ${t("tools.kill.fail")} ${l.name}`);
      }
    } catch (err) {
      if (mounted.current) setLockMsg(`✗ ${t("tools.unlock.killErr")} ${err instanceof Error ? err.message : String(err)}`);
    }
    await scan();
  };

  const wuInfo = wu ? { text: t(`tools.wu.${wu.state}`), color: WU_COLOR[wu.state] ?? WU_COLOR.active } : null;

  const wuTone: Tone = !wu ? "neutral" : wu.state === "active" ? "ok" : wu.state === "paused" ? "warn" : "danger";

  return (
    <Page tkey="page.tools" scroll>
      <div className="max-w-[820px] space-y-4 pb-2">
        {/* Windows Update */}
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-semibold text-text">Windows Update</span>
            {wuInfo && <Badge tone={wuTone}>{wuInfo.text}{wu?.until ? ` · ${t("tools.wu.until")} ${wu.until}` : ""}</Badge>}
          </div>
          <p className="text-[12.5px] text-text-mute mt-1.5">{t("tools.wu.hint")}</p>
          <div className="flex gap-2 mt-4">
            <button onClick={() => wuAction(WU_PAUSE)} disabled={wuBusy} className="btn btn-ghost">{t("tools.wu.pause")}</button>
            <button onClick={() => wuAction(WU_DISABLE)} disabled={wuBusy} className="btn btn-ghost">{t("tools.wu.disable")}</button>
            <button onClick={() => wuAction(WU_ENABLE)} disabled={wuBusy} className="btn btn-primary">{t("tools.wu.enable")}</button>
          </div>
        </div>

        {/* ¿Qué está usando este archivo? */}
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="text-[15px] font-semibold text-text">{t("tools.unlock.title")}</div>
          <p className="text-[12.5px] text-text-mute mt-1.5">{t("tools.unlock.hint")}</p>
          <div className="flex items-center gap-2 mt-4">
            <input value={path} onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && scan()}
              placeholder={t("tools.lockPh")}
              className="flex-1 h-9 px-3 rounded-lg bg-[#0b0b0d] border border-line focus:border-line-2 outline-none text-[13px] text-text placeholder:text-text-mute font-mono transition" />
            <button onClick={scan} disabled={scanning} className="btn btn-primary">{scanning ? t("tools.unlock.scanning") : t("tools.unlock.scan")}</button>
          </div>

          {lockMsg && (
            <p className="text-[12.5px] mt-3" style={{ color: lockMsg.startsWith("✓") ? "#3ddc84" : "#ff8a65" }}>{trLog(lockMsg, lang)}</p>
          )}

          {lockers && lockers.length > 0 && (
            <div className="mt-4">
              <SectionTitle>{lockers.length} {t("tools.unlock.usingCount")}</SectionTitle>
              <List>
                {lockers.map((l) => (
                  <Row key={l.pid} title={<span className="font-mono">{l.name}</span>} desc={`PID ${l.pid}`}
                    right={<button onClick={() => setConfirmKill(l)} className="btn btn-ghost h-8 px-3 text-[12.5px] !text-[#ff6b84] !border-[#ff547033] hover:!bg-[#ff5470]/[0.08]">{t("tools.unlock.kill")}</button>} />
                ))}
              </List>
            </div>
          )}
        </div>
      </div>

      <Modal open={!!confirmKill} title={t("tools.kill.title")}
        onClose={() => setConfirmKill(null)}
        onConfirm={() => confirmKill && doKill(confirmKill)}
        confirmText={t("tools.unlock.kill")} closeText={t("common.cancel")}>
        {confirmKill
          ? `${confirmKill.name} · PID ${confirmKill.pid}\n\n${t("tools.kill.warn")}`
          : ""}
      </Modal>
    </Page>
  );
}
