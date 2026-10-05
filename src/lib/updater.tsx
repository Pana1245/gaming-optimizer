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
  // Arranca en "checking": al abrir la app se consulta enseguida (efecto de abajo).
  const [status, setStatus] = useState<UpdStatus>("checking");
  const [installing, setInstalling] = useState(false);

  const query = async (): Promise<{ u: Update | null; st: UpdStatus }> => {
    try {
      const u = await check();
      return { u, st: u ? "available" : "none" };
    } catch {
      return { u: null, st: "error" };
    }
  };
  const apply = ({ u, st }: { u: Update | null; st: UpdStatus }) => { setUpd(u); setStatus(st); return st; };
  const checkNow = async (): Promise<UpdStatus> => { setStatus("checking"); return apply(await query()); };

  // Chequeo automático al iniciar (silencioso si falla).
  useEffect(() => { query().then(apply); }, []);

  const install = async () => {
    // Sin la guarda, Enter/doble clic en "Actualizar" lanzaba dos descargas a la vez.
    if (!upd || installing) return;
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
