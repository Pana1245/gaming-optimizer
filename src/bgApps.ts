// Apps de fondo a las que Auto Game-Mode (modo Pro) les baja la prioridad a "Inactiva"
// mientras jugás; al cerrar el juego se restaura la que tenían. `id` = nombre del proceso
// (sin .exe), como lo usa Get-Process. Bajar la prioridad no cierra nada: la app sigue
// andando, sólo cede la CPU al juego.
//
// RECOMENDADO = las 12 que se frenaban siempre (por defecto no cambia nada) + Vivaldi.
// No se recomiendan apps con llamadas (Teams, WhatsApp, Telegram: el audio se entrecorta)
// ni launchers que algunos juegos necesitan activos (EA, Ubisoft, Battle.net: su overlay
// puede trabarse). Discord NO está: frenarlo corta la voz.
export type BgGroup = "browsers" | "apps" | "launchers" | "sync";
export interface BgApp { id: string; name: string; nameEn?: string; namePt?: string; group: BgGroup; rec: boolean }

const a = (group: BgGroup, rec: boolean, id: string, name: string, nameEn?: string, namePt?: string): BgApp => ({ id, name, nameEn, namePt, group, rec });

export const BG_CATALOG: BgApp[] = [
  a("browsers", true, "chrome", "Google Chrome"),
  a("browsers", true, "msedge", "Microsoft Edge"),
  a("browsers", true, "firefox", "Firefox"),
  a("browsers", true, "opera", "Opera / Opera GX"),
  a("browsers", true, "brave", "Brave"),
  a("browsers", true, "vivaldi", "Vivaldi"),
  a("apps", true, "spotify", "Spotify"),
  a("apps", true, "slack", "Slack"),
  a("apps", false, "whatsapp", "WhatsApp"),
  a("apps", false, "telegram", "Telegram"),
  a("apps", false, "ms-teams", "Microsoft Teams"),
  a("apps", false, "ccxprocess", "Adobe Creative Cloud"),
  a("launchers", true, "steamwebhelper", "Steam (tienda y chat)", "Steam (store & chat)", "Steam (loja e chat)"),
  a("launchers", true, "epicgameslauncher", "Epic Games Launcher"),
  a("launchers", false, "eadesktop", "EA app"),
  a("launchers", false, "upc", "Ubisoft Connect"),
  a("launchers", false, "battle.net", "Battle.net"),
  a("sync", true, "onedrive", "OneDrive"),
  a("sync", true, "dropbox", "Dropbox"),
  a("sync", true, "googledrivefs", "Google Drive"),
  a("sync", false, "iclouddrive", "iCloud Drive"),
];

export const BG_RECOMMENDED = BG_CATALOG.filter((x) => x.rec).map((x) => x.id);

/** Nombres (en minúsculas, sin .exe) de los procesos abiertos ahora. */
export const RUNNING_PROCS = String.raw`(@(Get-Process -EA SilentlyContinue | ForEach-Object { $_.ProcessName.ToLower() }) | Sort-Object -Unique) -join '|'`;
