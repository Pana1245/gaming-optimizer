// Permisos de apps (Configuración → Privacidad) que Optimizaciones puede bloquear, uno
// por uno, desde el menú "Elegir cuáles". Cada uno es una clave de ConsentStore con
// Value = Allow / Deny.
//
// RECOMENDADO = datos personales que los juegos y casi ninguna app de escritorio usan.
// No se recomiendan los que rompen cosas al bloquearlos: Ubicación (Mapas, Clima),
// Bluetooth/radios (apaga el Bluetooth: era el motivo de "Reactivar → Bluetooth"),
// Micrófono y Cámara (Discord, llamadas), archivos (Fotos, editores) y captura de
// pantalla (Recortes, grabadores). Antes se bloqueaban 21 permisos de una sola vez.
// "Notificaciones" y "Activación por voz" tienen su propia fila en Optimizaciones.

export type PermGroup = "personal" | "devices" | "files";
export interface Perm {
  id: string;
  name: string; nameEn: string; namePt: string;
  group: PermGroup;
  rec: boolean;
  /** Qué deja de andar si se bloquea (sólo en los no recomendados). */
  warn?: string; warnEn?: string; warnPt?: string;
}

const p = (group: PermGroup, rec: boolean, id: string, name: string, nameEn: string, namePt: string,
  warn?: string, warnEn?: string, warnPt?: string): Perm => ({ id, name, nameEn, namePt, group, rec, warn, warnEn, warnPt });

export const PERMS: Perm[] = [
  p("personal", true, "userAccountInformation", "Información de la cuenta", "Account info", "Informações da conta"),
  p("personal", true, "contacts", "Contactos", "Contacts", "Contatos"),
  p("personal", true, "appointments", "Calendario", "Calendar", "Calendário"),
  p("personal", true, "email", "Correo electrónico", "Email", "Email"),
  p("personal", true, "userDataTasks", "Tareas", "Tasks", "Tarefas"),
  p("personal", true, "phoneCall", "Llamadas telefónicas", "Phone calls", "Chamadas telefônicas"),
  p("personal", true, "phoneCallHistory", "Historial de llamadas", "Call history", "Histórico de chamadas"),
  p("personal", true, "chat", "Mensajes (SMS)", "Messaging (SMS)", "Mensagens (SMS)"),
  p("personal", true, "appDiagnostics", "Diagnóstico de otras apps", "App diagnostics", "Diagnóstico de apps"),
  p("devices", false, "location", "Ubicación", "Location", "Localização",
    "Mapas, Clima y “Encontrar mi dispositivo”", "Maps, Weather and “Find my device”", "Mapas, Clima e “Localizar dispositivo”"),
  p("devices", false, "radios", "Bluetooth y radios", "Bluetooth & radios", "Bluetooth e rádios",
    "puede apagar el Bluetooth", "can turn Bluetooth off", "pode desligar o Bluetooth"),
  p("devices", false, "bluetoothSync", "Dispositivos sin emparejar", "Unpaired devices", "Dispositivos não pareados",
    "auriculares y controles Bluetooth", "Bluetooth headsets and controllers", "fones e controles Bluetooth"),
  p("devices", false, "microphone", "Micrófono", "Microphone", "Microfone",
    "Discord, chat de voz de los juegos", "Discord, in-game voice chat", "Discord, chat de voz dos jogos"),
  p("devices", false, "webcam", "Cámara", "Camera", "Câmera",
    "videollamadas y streaming", "video calls and streaming", "chamadas de vídeo e streaming"),
  p("devices", true, "gazeInput", "Seguimiento ocular", "Eye tracking", "Rastreamento ocular"),
  p("devices", true, "activity", "Actividad física (movimiento)", "Motion activity", "Atividade física (movimento)"),
  p("devices", true, "backgroundSpatialPerception", "Percepción espacial (realidad mixta)", "Spatial perception (mixed reality)", "Percepção espacial (realidade mista)"),
  p("files", false, "documentsLibrary", "Documentos", "Documents", "Documentos",
    "apps de la Tienda que abren tus archivos", "Store apps that open your files", "apps da Loja que abrem seus arquivos"),
  p("files", false, "picturesLibrary", "Imágenes", "Pictures", "Imagens",
    "la app Fotos", "the Photos app", "o app Fotos"),
  p("files", false, "videosLibrary", "Videos", "Videos", "Vídeos",
    "Películas y TV, editores de video", "Movies & TV, video editors", "Filmes e TV, editores de vídeo"),
  p("files", false, "broadFileSystemAccess", "Todo el sistema de archivos", "Entire file system", "Todo o sistema de arquivos",
    "gestores de archivos de la Tienda", "Store file managers", "gerenciadores de arquivos da Loja"),
  p("files", false, "graphicsCaptureProgrammatic", "Captura de pantalla", "Screen capture", "Captura de tela",
    "Recortes y grabadores de pantalla", "Snipping Tool and screen recorders", "Ferramenta de Captura e gravadores de tela"),
  p("files", false, "graphicsCaptureWithoutBorder", "Captura sin borde", "Borderless capture", "Captura sem borda",
    "grabadores de pantalla", "screen recorders", "gravadores de tela"),
];

export const PERMS_RECOMMENDED = PERMS.filter((x) => x.rec).map((x) => x.id);

const BASE = String.raw`HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore`;
const LM = String.raw`HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore`;
const psList = (xs: string[]) => "@(" + xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(",") + ")";

/** Bloquea (Deny) sólo los permisos elegidos. Restaurar lo revierte (el backup exporta ConsentStore). */
export const permsDeny = (ids: string[]) => String.raw`$base='${BASE}'
$n=0
foreach($p in ${psList(PERMS.filter((x) => ids.includes(x.id)).map((x) => x.id))}){
  $path="$base\$p"
  if(!(Test-Path $path)){ New-Item -Path $path -Force | Out-Null }
  Set-ItemProperty -Path $path -Name 'Value' -Value 'Deny' -Type String -Force
  if((Get-ItemProperty -Path $path -Name Value -EA SilentlyContinue).Value -eq 'Deny'){ $n++ }
}
Write-Output ("Permisos bloqueados: " + $n)`;

/** Estado actual de cada permiso: "id=Deny" si está bloqueado para este usuario o para
 *  todo el equipo (HKLM), "id=Allow" si no. */
export const PERMS_STATE = String.raw`foreach($p in ${psList(PERMS.map((x) => x.id))}){
  $u=(Get-ItemProperty "${BASE}\$p" -Name Value -EA SilentlyContinue).Value
  $m=(Get-ItemProperty "${LM}\$p" -Name Value -EA SilentlyContinue).Value
  if($u -eq 'Deny' -or $m -eq 'Deny'){ "$p=Deny" } else { "$p=Allow" }
}`;
