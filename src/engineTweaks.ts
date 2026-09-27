// Tweaks estructurados como operaciones de registro: el Motor puede leer el
// valor previo, aplicar, verificar que quedó, y deshacer con exactitud.
export interface RegOp {
  id: string;
  name: string;
  desc: string;
  nameEn?: string;
  descEn?: string;
  namePt?: string;
  descPt?: string;
  group: string;
  risk?: "advanced";
  os?: 10 | 11;
  key: string;          // ruta PowerShell, ej: HKCU:\Software\...
  prop: string;         // nombre del valor
  type: "DWord" | "String";
  value: number | string;
  // Ya está en Optimizaciones: no se lista en el Motor (evita ofrecer lo mismo en
  // dos lugares), pero se sigue usando para el puntaje "Optimizado %" del Panel.
  motorHidden?: boolean;
}

export const ENGINE_TWEAKS: RegOp[] = [
  // ── Gaming ───────────────────────────────────────────────────────────────
  { id: "gamemode", motorHidden: true, group: "Gaming", name: "Game Mode de Windows", desc: "Prioriza recursos para el juego en primer plano.", nameEn: "Windows Game Mode", descEn: "Prioritizes resources for the foreground game.", namePt: "Modo de Jogo do Windows", descPt: "Prioriza recursos para o jogo em primeiro plano.",
    key: String.raw`HKCU:\Software\Microsoft\GameBar`, prop: "AutoGameModeEnabled", type: "DWord", value: 1 },
  { id: "gamedvr", motorHidden: true, group: "Gaming", name: "Deshabilitar Game DVR", desc: "Apaga la grabación en segundo plano que causa tirones.", nameEn: "Disable Game DVR", descEn: "Turns off background recording that causes stutter.", namePt: "Desativar Game DVR", descPt: "Desliga a gravação em segundo plano que causa travadinhas.",
    key: String.raw`HKCU:\System\GameConfigStore`, prop: "GameDVR_Enabled", type: "DWord", value: 0 },
  { id: "hags", motorHidden: true, group: "Gaming", name: "Hardware GPU Scheduling (HAGS)", desc: "Deja que la GPU gestione su planificación: menos latencia.", nameEn: "Hardware GPU Scheduling (HAGS)", descEn: "Lets the GPU manage its own scheduling: lower latency.", namePt: "Agendamento de GPU por hardware (HAGS)", descPt: "Deixa a GPU gerenciar o próprio agendamento: menos latência.",
    key: String.raw`HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers`, prop: "HwSchMode", type: "DWord", value: 2 },
  { id: "sysresp", motorHidden: true, group: "Gaming", name: "System Responsiveness = 0", desc: "Quita la reserva de CPU para tareas de fondo.", nameEn: "System Responsiveness = 0", descEn: "Removes the CPU reserve for background tasks.", namePt: "System Responsiveness = 0", descPt: "Remove a reserva de CPU para tarefas em segundo plano.", risk: "advanced",
    key: String.raw`HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile`, prop: "SystemResponsiveness", type: "DWord", value: 0 },

  // ── Rendimiento (fuera del puntaje del Panel: bajan la seguridad a propósito) ──
  // VBS / Integridad de memoria (HVCI): vienen activos en Windows 11 y cuestan FPS
  // (Microsoft sugiere apagarlos para jugar). Son dos valores → dos ops, cada una
  // deshacible por separado. Si no existían, deshacer borra el valor (vuelve al
  // default de Windows). Requieren reiniciar.
  { id: "hvci", group: "Rendimiento", risk: "advanced",
    name: "Desactivar Integridad de memoria (HVCI)", desc: "Más FPS en Windows 11, a cambio de menos protección contra drivers maliciosos. Reiniciá para aplicar.",
    nameEn: "Disable Memory Integrity (HVCI)", descEn: "More FPS on Windows 11, at the cost of less protection against malicious drivers. Restart to apply.", namePt: "Desativar Integridade de memória (HVCI)", descPt: "Mais FPS no Windows 11, em troca de menos proteção contra drivers maliciosos. Reinicie para aplicar.",
    key: String.raw`HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity`, prop: "Enabled", type: "DWord", value: 0 },
  { id: "vbs", group: "Rendimiento", risk: "advanced",
    name: "Desactivar VBS (seguridad basada en virtualización)", desc: "Apaga la capa de virtualización que usa la Integridad de memoria. Reiniciá para aplicar.",
    nameEn: "Disable VBS (virtualization-based security)", descEn: "Turns off the virtualization layer Memory Integrity runs on. Restart to apply.", namePt: "Desativar VBS (segurança baseada em virtualização)", descPt: "Desliga a camada de virtualização usada pela Integridade de memória. Reinicie para aplicar.",
    key: String.raw`HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard`, prop: "EnableVirtualizationBasedSecurity", type: "DWord", value: 0 },

  // ── Escritorio / interfaz ─────────────────────────────────────────────────
  { id: "dark1", motorHidden: true, group: "Apariencia", name: "Modo oscuro (apps)", desc: "Tema oscuro en las aplicaciones.", nameEn: "Dark mode (apps)", descEn: "Dark theme in apps.", namePt: "Modo escuro (apps)", descPt: "Tema escuro nos aplicativos.",
    key: String.raw`HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize`, prop: "AppsUseLightTheme", type: "DWord", value: 0 },
  { id: "dark2", motorHidden: true, group: "Apariencia", name: "Modo oscuro (sistema)", desc: "Tema oscuro en el sistema (barra, menús).", nameEn: "Dark mode (system)", descEn: "Dark theme in the system (taskbar, menus).", namePt: "Modo escuro (sistema)", descPt: "Tema escuro no sistema (barra, menus).",
    key: String.raw`HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize`, prop: "SystemUsesLightTheme", type: "DWord", value: 0 },
  { id: "transp", motorHidden: true, group: "Apariencia", name: "Deshabilitar transparencia", desc: "Apaga la transparencia (ahorra algo de GPU).", nameEn: "Disable transparency", descEn: "Turns off transparency (saves some GPU).", namePt: "Desativar transparência", descPt: "Desliga a transparência (economiza um pouco de GPU).",
    key: String.raw`HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize`, prop: "EnableTransparency", type: "DWord", value: 0 },
  { id: "ext", group: "Explorador", name: "Mostrar extensiones de archivo", desc: "Muestra .exe, .txt, etc.", nameEn: "Show file extensions", descEn: "Shows .exe, .txt, etc.", namePt: "Mostrar extensões de arquivo", descPt: "Mostra .exe, .txt, etc.",
    key: String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced`, prop: "HideFileExt", type: "DWord", value: 0 },
  { id: "hidden", group: "Explorador", name: "Mostrar archivos ocultos", desc: "Muestra archivos y carpetas ocultos.", nameEn: "Show hidden files", descEn: "Shows hidden files and folders.", namePt: "Mostrar arquivos ocultos", descPt: "Mostra arquivos e pastas ocultos.",
    key: String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced`, prop: "Hidden", type: "DWord", value: 1 },
  { id: "align", group: "Explorador", name: "Barra de tareas a la izquierda", desc: "Alinea el menú Inicio a la izquierda.", nameEn: "Taskbar aligned left", descEn: "Aligns the Start menu to the left.", namePt: "Barra de tarefas à esquerda", descPt: "Alinha o menu Iniciar à esquerda.", os: 11,
    key: String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced`, prop: "TaskbarAl", type: "DWord", value: 0 },
  { id: "seconds", group: "Explorador", name: "Segundos en el reloj", desc: "Muestra los segundos en el reloj de la barra.", nameEn: "Seconds on the clock", descEn: "Shows seconds on the taskbar clock.", namePt: "Segundos no relógio", descPt: "Mostra os segundos no relógio da barra de tarefas.", os: 11,
    key: String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced`, prop: "ShowSecondsInSystemClock", type: "DWord", value: 1 },

  // ── Privacidad ────────────────────────────────────────────────────────────
  { id: "telemetry", motorHidden: true, group: "Privacidad", name: "Deshabilitar telemetría", desc: "Pone la recolección de datos en el mínimo.", nameEn: "Disable telemetry", descEn: "Sets data collection to the minimum.", namePt: "Desativar telemetria", descPt: "Coloca a coleta de dados no mínimo.",
    key: String.raw`HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection`, prop: "AllowTelemetry", type: "DWord", value: 0 },
  { id: "bing", group: "Privacidad", name: "Quitar Bing del menú Inicio", desc: "Desactiva las sugerencias web en la búsqueda.", nameEn: "Remove Bing from Start menu", descEn: "Disables web suggestions in search.", namePt: "Remover o Bing do menu Iniciar", descPt: "Desativa as sugestões da web na pesquisa.",
    key: String.raw`HKCU:\Software\Policies\Microsoft\Windows\Explorer`, prop: "DisableSearchBoxSuggestions", type: "DWord", value: 1 },
  { id: "consumer", group: "Privacidad", name: "Deshabilitar Consumer Features", desc: "Quita apps sugeridas y anuncios.", nameEn: "Disable Consumer Features", descEn: "Removes suggested apps and ads.", namePt: "Desativar Consumer Features", descPt: "Remove apps sugeridos e anúncios.",
    key: String.raw`HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent`, prop: "DisableWindowsConsumerFeatures", type: "DWord", value: 1 },

  // ── Sistema ───────────────────────────────────────────────────────────────
  { id: "verbose", group: "Sistema", name: "Mensajes de inicio detallados", desc: "Muestra qué hace Windows al iniciar/apagar.", nameEn: "Verbose startup messages", descEn: "Shows what Windows is doing at startup/shutdown.", namePt: "Mensagens de inicialização detalhadas", descPt: "Mostra o que o Windows está fazendo ao iniciar/desligar.",
    key: String.raw`HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System`, prop: "VerboseStatus", type: "DWord", value: 1 },
  { id: "noreboot", group: "Sistema", name: "No reiniciar solo tras updates", desc: "Evita reinicios automáticos con sesión abierta.", nameEn: "No auto-restart after updates", descEn: "Prevents automatic restarts while you're signed in.", namePt: "Não reiniciar sozinho após atualizações", descPt: "Evita reinícios automáticos com a sessão aberta.",
    key: String.raw`HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU`, prop: "NoAutoRebootWithLoggedOnUsers", type: "DWord", value: 1 },
];
