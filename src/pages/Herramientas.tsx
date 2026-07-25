import { useEffect, useRef, useState } from "react";
import NeonCard, { HudTitle } from "../components/NeonCard";
import { runPowershell } from "../lib/api";
import {
  WU_DISABLE, WU_ENABLE, WU_PAUSE, getWuStatus,
  whoLocks, killProc, type Locker,
} from "../lib/tools";

const WU_LABEL: Record<string, { text: string; color: string }> = {
  active: { text: "Activo (updates automáticos)", color: "#00e676" },
  paused: { text: "En pausa", color: "#ffd24a" },
  disabled: { text: "Desactivado", color: "#ff8a65" },
};

export default function Herramientas() {
  const [wu, setWu] = useState<{ state: string; until?: string } | null>(null);
  const [wuBusy, setWuBusy] = useState(false);
  const [path, setPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lockers, setLockers] = useState<Locker[] | null>(null);
  const [lockMsg, setLockMsg] = useState<string | null>(null);
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
      if (mounted.current) setLockMsg(`✗ Windows Update: ${err instanceof Error ? err.message : String(err)}`);
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
      if (r.status === "noexist") setLockMsg("No existe esa ruta.");
      else if (r.status === "none") setLockMsg("✓ Ningún proceso lo está usando — podés borrarlo/moverlo.");
      else setLockers(r.lockers);
    } catch (err) {
      if (mounted.current) setLockMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (mounted.current) setScanning(false);
    }
  };

  const kill = async (pid: number) => {
    try {
      await killProc(pid);
    } catch (err) {
      if (mounted.current) setLockMsg(`✗ No pude cerrar el proceso: ${err instanceof Error ? err.message : String(err)}`);
    }
    await scan();
  };

  const wuInfo = wu ? WU_LABEL[wu.state] ?? WU_LABEL.active : null;

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
                {wuInfo.text}{wu?.until ? ` · hasta ${wu.until}` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2.5">
          <button onClick={() => wuAction(WU_PAUSE)} disabled={wuBusy} className="btn btn-ghost">Pausar 5 semanas</button>
          <button onClick={() => wuAction(WU_DISABLE)} disabled={wuBusy} className="btn btn-ghost">Desactivar</button>
          <button onClick={() => wuAction(WU_ENABLE)} disabled={wuBusy} className="btn btn-primary">Reactivar</button>
        </div>
        <p className="text-[11.5px] text-text-mute mt-3">
          Útil para que no se descarguen updates ni te reinicie en medio de una partida. "Reactivar" lo deja como de fábrica.
        </p>
      </NeonCard>

      {/* Desbloquear archivo */}
      <NeonCard>
        <span className="section-label">¿Qué está usando este archivo?</span>
        <p className="text-[12px] text-text-mute mt-1 mb-3">
          Cuando Windows te dice "no se puede eliminar, el archivo está en uso", pegá la ruta acá para ver qué programa lo tiene tomado (y cerrarlo).
        </p>
        <div className="flex items-center gap-2 mb-3">
          <input value={path} onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && scan()}
            placeholder="C:\ruta\al\archivo.ext"
            className="flex-1 h-9 px-3 rounded-lg bg-surface border border-line focus:border-accent outline-none text-[13px] text-text placeholder:text-text-mute font-mono transition" />
          <button onClick={scan} disabled={scanning} className="btn btn-primary">{scanning ? "Analizando…" : "Analizar"}</button>
        </div>

        {lockMsg && (
          <p className="text-[13px]" style={{ color: lockMsg.startsWith("✓") ? "#00e676" : "#ff8a65" }}>{lockMsg}</p>
        )}

        {lockers && lockers.length > 0 && (
          <div className="rounded-xl border border-line divide-y divide-line/60 overflow-hidden">
            <div className="px-4 py-2 text-[12px] text-text-mute bg-surface">
              {lockers.length} proceso(s) usando el archivo:
            </div>
            {lockers.map((l) => (
              <div key={l.pid} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 text-[13px] text-text-dim font-mono">{l.name} <span className="text-text-mute">· PID {l.pid}</span></span>
                <button onClick={() => kill(l.pid)} className="text-[13px] text-[#ff5470] hover:underline shrink-0">Cerrar proceso</button>
              </div>
            ))}
          </div>
        )}
      </NeonCard>
    </div>
  );
}
