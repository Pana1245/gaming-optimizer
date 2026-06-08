import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import Modal from "./Modal";

export default function UpdateBanner() {
  const [upd, setUpd] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Chequea una actualización al iniciar (silencioso si falla)
    check().then((u) => { if (u) setUpd(u); }).catch(() => {});
  }, []);

  const install = async () => {
    if (!upd) return;
    setInstalling(true);
    try {
      await upd.downloadAndInstall();
      await relaunch();
    } catch {
      setInstalling(false);
      setUpd(null);
    }
  };

  return (
    <Modal
      open={!!upd}
      title={`Actualización disponible${upd?.version ? ` · v${upd.version}` : ""}`}
      onClose={() => setUpd(null)}
      onConfirm={install}
      confirmText={installing ? "Instalando…" : "Actualizar ahora"}
      closeText="Después"
    >
      {upd?.body?.trim() || "Hay una nueva versión de Gaming Optimizer disponible. Se descargará e instalará automáticamente."}
    </Modal>
  );
}
