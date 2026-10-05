import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

/** ¿Se ve la ventana? false si está oculta en la bandeja o minimizada. Las páginas lo usan
 *  para pausar sus lecturas periódicas: antes el Panel seguía abriendo un PowerShell cada
 *  10 s para las temperaturas aunque la app estuviera escondida en la bandeja. */
export function useAppVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVis);
    // El webview no siempre avisa al esconderse en la bandeja: el backend lo informa.
    const uns = [
      listen("hidden-to-tray", () => setVisible(false)),
      listen("window-shown", () => setVisible(true)),
    ];
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      uns.forEach((p) => p.then((f) => f()).catch(() => { /* sin backend (dev en navegador) */ }));
    };
  }, []);
  return visible;
}
