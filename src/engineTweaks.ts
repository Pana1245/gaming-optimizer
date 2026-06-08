// Tweaks estructurados como operaciones de registro: el Motor puede leer el
// valor previo, aplicar, verificar que quedó, y deshacer con exactitud.
export interface RegOp {
  id: string;
  name: string;
  desc: string;
  group: string;
  risk?: "advanced";
  os?: 10 | 11;
  key: string;          // ruta PowerShell, ej: HKCU:\Software\...
  prop: string;         // nombre del valor
  type: "DWord" | "String";
  value: number | string;
}

export const ENGINE_TWEAKS: RegOp[] = [
  // ── Gaming ───────────────────────────────────────────────────────────────
  { id: "gamemode", group: "Gaming", name: "Game Mode de Windows", desc: "Prioriza recursos para el juego en primer plano.",
    key: String.raw`HKCU:\Software\Microsoft\GameBar`, prop: "AutoGameModeEnabled", type: "DWord", value: 1 },
  { id: "gamedvr", group: "Gaming", name: "Deshabilitar Game DVR", desc: "Apaga la grabación en segundo plano que causa tirones.",
    key: String.raw`HKCU:\System\GameConfigStore`, prop: "GameDVR_Enabled", type: "DWord", value: 0 },
  { id: "hags", group: "Gaming", name: "Hardware GPU Scheduling (HAGS)", desc: "Deja que la GPU gestione su planificación: menos latencia.",
    key: String.raw`HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers`, prop: "HwSchMode", type: "DWord", value: 2 },
  { id: "sysresp", group: "Gaming", name: "System Responsiveness = 0", desc: "Quita la reserva de CPU para tareas de fondo.", risk: "advanced",
    key: String.raw`HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile`, prop: "SystemResponsiveness", type: "DWord", value: 0 },

  // ── Escritorio / interfaz ─────────────────────────────────────────────────
  { id: "dark1", group: "Apariencia", name: "Modo oscuro (apps)", desc: "Tema oscuro en las aplicaciones.",
    key: String.raw`HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize`, prop: "AppsUseLightTheme", type: "DWord", value: 0 },
  { id: "dark2", group: "Apariencia", name: "Modo oscuro (sistema)", desc: "Tema oscuro en el sistema (barra, menús).",
    key: String.raw`HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize`, prop: "SystemUsesLightTheme", type: "DWord", value: 0 },
  { id: "transp", group: "Apariencia", name: "Deshabilitar transparencia", desc: "Apaga la transparencia (ahorra algo de GPU).",
    key: String.raw`HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize`, prop: "EnableTransparency", type: "DWord", value: 0 },
  { id: "ext", group: "Explorador", name: "Mostrar extensiones de archivo", desc: "Muestra .exe, .txt, etc.",
    key: String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced`, prop: "HideFileExt", type: "DWord", value: 0 },
  { id: "hidden", group: "Explorador", name: "Mostrar archivos ocultos", desc: "Muestra archivos y carpetas ocultos.",
    key: String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced`, prop: "Hidden", type: "DWord", value: 1 },
  { id: "align", group: "Explorador", name: "Barra de tareas a la izquierda", desc: "Alinea el menú Inicio a la izquierda.", os: 11,
    key: String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced`, prop: "TaskbarAl", type: "DWord", value: 0 },
  { id: "seconds", group: "Explorador", name: "Segundos en el reloj", desc: "Muestra los segundos en el reloj de la barra.", os: 11,
    key: String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced`, prop: "ShowSecondsInSystemClock", type: "DWord", value: 1 },

  // ── Privacidad ────────────────────────────────────────────────────────────
  { id: "telemetry", group: "Privacidad", name: "Deshabilitar telemetría", desc: "Pone la recolección de datos en el mínimo.",
    key: String.raw`HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection`, prop: "AllowTelemetry", type: "DWord", value: 0 },
  { id: "bing", group: "Privacidad", name: "Quitar Bing del menú Inicio", desc: "Desactiva las sugerencias web en la búsqueda.",
    key: String.raw`HKCU:\Software\Policies\Microsoft\Windows\Explorer`, prop: "DisableSearchBoxSuggestions", type: "DWord", value: 1 },
  { id: "consumer", group: "Privacidad", name: "Deshabilitar Consumer Features", desc: "Quita apps sugeridas y anuncios.",
    key: String.raw`HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent`, prop: "DisableWindowsConsumerFeatures", type: "DWord", value: 1 },

  // ── Sistema ───────────────────────────────────────────────────────────────
  { id: "verbose", group: "Sistema", name: "Mensajes de inicio detallados", desc: "Muestra qué hace Windows al iniciar/apagar.",
    key: String.raw`HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System`, prop: "VerboseStatus", type: "DWord", value: 1 },
  { id: "noreboot", group: "Sistema", name: "No reiniciar solo tras updates", desc: "Evita reinicios automáticos con sesión abierta.",
    key: String.raw`HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU`, prop: "NoAutoRebootWithLoggedOnUsers", type: "DWord", value: 1 },
];
