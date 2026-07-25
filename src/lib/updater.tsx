import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdStatus = "idle" | "checking" | "available" | "none" | "error";

interface Ctx {
  upd: Update | null;
  status: UpdStatus;
  installing: boolean;
  /** Consulta el endpoint. Devuelve el estado resultante. */
  checkNow: () => Promise<UpdStatus>;
  install: () => Promise<void>;
  dismiss: () => void;
}

const UpdaterCtx = createContext<Ctx>({
  upd: null, status: "idle", installing: false,
  checkNow: async () => "idle", install: async () => {}, dismiss: () => {},
});

export const useUpdater = () => useContext(UpdaterCtx);

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const [upd, setUpd] = useState<Update | null>(null);
  const [status, setStatus] = useState<UpdStatus>("idle");
  const [installing, setInstalling] = useState(false);

  const checkNow = async (): Promise<UpdStatus> => {
    setStatus("checking");
    try {
      const u = await check();
      if (u) { setUpd(u); setStatus("available"); return "available"; }
      setUpd(null); setStatus("none"); return "none";
    } catch {
      setStatus("error"); return "error";
    }
  };

  // Chequeo automático al iniciar (silencioso si falla).
  useEffect(() => { checkNow(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const install = async () => {
    if (!upd) return;
    setInstalling(true);
    try {
      await upd.downloadAndInstall();
      await relaunch();
    } catch {
      setInstalling(false);
      setUpd(null);
      setStatus("error");
    }
  };

  const dismiss = () => { setUpd(null); setStatus((s) => (s === "available" ? "idle" : s)); };

  return (
    <UpdaterCtx.Provider value={{ upd, status, installing, checkNow, install, dismiss }}>
      {children}
    </UpdaterCtx.Provider>
  );
}
