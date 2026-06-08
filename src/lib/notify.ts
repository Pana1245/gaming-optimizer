import {
  isPermissionGranted, requestPermission, sendNotification,
} from "@tauri-apps/plugin-notification";

let granted = false;

/** Pide permiso de notificaciones una vez al iniciar. */
export async function ensureNotify(): Promise<void> {
  try {
    granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
  } catch {
    granted = false;
  }
}

/** Manda una notificación nativa (silenciosa si no hay permiso). */
export function notify(title: string, body: string): void {
  try {
    if (granted) sendNotification({ title, body });
  } catch {}
}
