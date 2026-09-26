// Traducción al inglés de los mensajes que imprimen los scripts de PowerShell en los
// registros (logs) de cada sección. Los scripts escriben en español; en vez de volver
// bilingüe cada script, cada panel de log pasa sus líneas por trLog() al mostrarlas,
// así también se traduce lo que ya estaba en pantalla si cambiás de idioma.
// Las salidas nativas de Windows (SFC, DISM, netsh…) llegan en el idioma del sistema
// y se dejan tal cual. Si una línea no está acá, se muestra sin cambios.

const EXACT: Record<string, string> = {
  "Listo.": "Ready.",
  "Aceleracion del mouse deshabilitada": "Mouse acceleration disabled",
  "Activacion por voz deshabilitada": "Voice activation disabled",
  "Activity History deshabilitado": "Activity History disabled",
  "Algoritmo de Nagle deshabilitado": "Nagle's algorithm disabled",
  "Apps Microsoft eliminadas": "Microsoft apps removed",
  "Apps de terceros eliminadas": "Third-party apps removed",
  "Apps del Inicio desancladas (metodo alternativo)": "Start menu apps unpinned (alternate method)",
  "Apps del Inicio desancladas (reinicia para ver los cambios)": "Start menu apps unpinned (restart to see the changes)",
  "Apps en segundo plano deshabilitadas": "Background apps disabled",
  "Archivos ocultos visibles": "Hidden files visible",
  "Automatico": "Automatic",
  "AVISO: no se pudo crear punto de restauracion": "WARNING: couldn't create a restore point",
  "BSOD detallado activado": "Detailed BSOD enabled",
  "Barra de tareas a la izquierda": "Taskbar aligned left",
  "Barra de tareas simplificada (buscador conservado)": "Taskbar simplified (search kept)",
  "Bing en Inicio desactivado": "Bing in Start disabled",
  "Bloatware eliminado (Sycnex DebloatAll)": "Bloatware removed (Sycnex DebloatAll)",
  "Boton Chat/Teams eliminado de la barra de tareas": "Chat/Teams button removed from the taskbar",
  "Caché de iconos reconstruida": "Icon cache rebuilt",
  "Consumer features desactivado": "Consumer features disabled",
  "Copilot desactivado": "Copilot disabled",
  "Core Parking deshabilitado — todos los nucleos activos": "Core Parking disabled — all cores active",
  "Creando punto de restauracion...": "Creating restore point...",
  "DNS anterior restaurado": "Previous DNS restored",
  "DNS aplicado": "DNS applied",
  "DNS automatico restaurado": "Automatic DNS restored",
  "Delay del menu reducido": "Menu delay reduced",
  "Desinstalador ejecutado": "Uninstaller run",
  "Desinstalador ejecutado (modo usuario)": "Uninstaller run (user mode)",
  "Edge debloated": "Edge debloated",
  "Efectos visuales optimizados": "Visual effects optimized",
  "El backup no tiene archivos .reg.": "The backup has no .reg files.",
  "Eliminando bloatware...": "Removing bloatware...",
  "Explorador reiniciado": "File Explorer restarted",
  "Extensiones visibles": "File extensions visible",
  "FSO deshabilitado": "FSO disabled",
  "Finalizar tarea habilitado": "End task enabled",
  "Game Mode habilitado": "Game Mode enabled",
  "HAGS habilitado": "HAGS enabled",
  "HPET desactivado (reinicia para aplicar)": "HPET disabled (restart to apply)",
  "Hibernación desactivada": "Hibernation disabled",
  "HomeGroup desactivado": "HomeGroup disabled",
  "Hora en UTC (dual-boot)": "Time set to UTC (dual-boot)",
  "ID publicitario y Cortana deshabilitados": "Advertising ID and Cortana disabled",
  "IPv6 desactivado": "IPv6 disabled",
  "LSO deshabilitado": "LSO disabled",
  "Mensajes de inicio detallados": "Verbose startup messages",
  "Menú contextual clásico activado": "Classic context menu enabled",
  "Modo oscuro activado": "Dark mode enabled",
  "No hay backups disponibles.": "No backups available.",
  "No se pudo cambiar el plan de energia": "Couldn't change the power plan",
  "Notificaciones de apps deshabilitadas": "App notifications disabled",
  "NumLock activado al inicio": "NumLock on at startup",
  "OneDrive deshabilitado": "OneDrive disabled",
  "OneDrive desinstalado (tus archivos en la carpeta OneDrive se conservan).": "OneDrive uninstalled (your files in the OneDrive folder are kept).",
  "Panel de Widgets desactivado": "Widgets panel disabled",
  "Paquete UWP eliminado": "UWP package removed",
  "Permisos configurados (camara/microfono/videos mantenidos)": "Permissions set (camera/microphone/videos kept)",
  "Plan de energia: Alto rendimiento": "Power plan: High performance",
  "Plan de energia: Maximo rendimiento (Ultimate Performance)": "Power plan: Maximum performance (Ultimate Performance)",
  "Plan: ahorro de energia": "Plan: power saver",
  "Plan: alto rendimiento": "Plan: high performance",
  "Plan: equilibrado": "Plan: balanced",
  "Plan: maximo rendimiento": "Plan: maximum performance",
  "Print Spooler deshabilitado": "Print Spooler disabled",
  "Prioridad CPU configurada": "CPU priority set",
  "Punto de restauracion creado OK": "Restore point created OK",
  "Punto de restauracion creado correctamente.": "Restore point created successfully.",
  "QoS bandwidth al 100 para juegos": "QoS bandwidth at 100% for games",
  "Recall desactivado": "Recall disabled",
  "Red reseteada. Reinicia para aplicar.": "Network reset. Restart to apply.",
  "Registro restaurado. Reinicia el PC para aplicar.": "Registry restored. Restart the PC to apply.",
  "Reinicio automático desactivado": "Automatic restart disabled",
  "Remote Registry deshabilitado": "Remote Registry disabled",
  "Segundos en el reloj activados": "Seconds on the clock enabled",
  "Servicios Xbox deshabilitados": "Xbox services disabled",
  "Sticky Keys desactivado": "Sticky Keys disabled",
  "Storage Sense desactivado": "Storage Sense disabled",
  "Sugerencias del Inicio desactivadas": "Start menu suggestions disabled",
  "SysMain deshabilitado": "SysMain disabled",
  "TCP optimizado": "TCP optimized",
  "Tareas de telemetria deshabilitadas": "Telemetry tasks disabled",
  "Telemetria deshabilitada": "Telemetry disabled",
  "Telemetría de PowerShell desactivada": "PowerShell telemetry disabled",
  "Teredo deshabilitado": "Teredo disabled",
  "Timer Resolution configurado (activo al reiniciar)": "Timer Resolution set (active after restart)",
  "Transparencia deshabilitada": "Transparency disabled",
  "Ubicación desactivada": "Location disabled",
  "Verifica que la Proteccion del sistema este activada y que haya espacio en disco.": "Check that System Protection is on and that there's free disk space.",
  "Wi-Fi Sense desactivado": "Wi-Fi Sense disabled",
  "Windows Defender deshabilitado (reinicia para aplicar completamente)": "Windows Defender disabled (restart to fully apply)",
  "Windows Search deshabilitado": "Windows Search disabled",
  "Windows Update desactivado": "Windows Update disabled",
  "Windows Update reactivado": "Windows Update re-enabled",
  "Xbox Game Bar deshabilitado": "Xbox Game Bar disabled",
  "Plan de energia configurado": "Power plan set",
  "No encontre adaptador NVIDIA en el registro.": "No NVIDIA adapter found in the registry.",
  "No encontre adaptador AMD/Radeon en el registro.": "No AMD/Radeon adapter found in the registry.",
};

const RX: [RegExp, string][] = [
  [/^Backup del registro: (\d+) ramas exportadas$/, "Registry backup: $1 branches exported"],
  [/^Backup en: (.+)$/, "Backup at: $1"],
  [/^Accesos directos rotos eliminados: (\d+)$/, "Broken shortcuts deleted: $1"],
  [/^Dominios de telemetria bloqueados: (\d+)$/, "Telemetry domains blocked: $1"],
  [/^MSI mode activado en (\d+) GPU\(s\)\. Reinicia para aplicar\.$/, "MSI mode enabled on $1 GPU(s). Restart to apply."],
  [/^No se pudo crear el punto de restauracion: ?(.*)$/, "Couldn't create the restore point: $1"],
  [/^No se pudo ejecutar el desinstalador: ?(.*)$/, "Couldn't run the uninstaller: $1"],
  [/^Restauración incompleta: ?(.*)$/, "Restore incomplete: $1"],
  [/^Restaurando backup: (.+)$/, "Restoring backup: $1"],
  [/^Restos eliminados: (\d+)\/(\d+) — (\d+) en uso \(cerrá la app o reiniciá y reintentá\)$/, "Leftovers deleted: $1/$2 — $3 in use (close the app or restart and try again)"],
  [/^Restos eliminados: (\d+)\/(\d+)$/, "Leftovers deleted: $1/$2"],
  [/^Timer Resolution: ([\d.,]+)ms \(objetivo: 1ms\)$/, "Timer Resolution: $1ms (target: 1ms)"],
  [/^Updates pausados hasta (.+)$/, "Updates paused until $1"],
  [/^Apps de Microsoft removidas: (\d+)$/, "Microsoft apps removed: $1"],
  [/^Bloatware de terceros removido: (\d+)$/, "Third-party bloatware removed: $1"],
  [/^NVIDIA: maximo rendimiento aplicado a (\d+) adaptador\(es\)\. Reinicia para que tome efecto\.$/, "NVIDIA: maximum performance applied to $1 adapter(s). Restart to take effect."],
  [/^AMD: maximo rendimiento aplicado a (\d+) adaptador\(es\)\. Reinicia para que tome efecto\.$/, "AMD: maximum performance applied to $1 adapter(s). Restart to take effect."],
];

// Prefijo que se conserva: sangría, [hora], y símbolos de estado (✓ ✗ ▸ ↩ ↪ ⚠ …).
const PREFIX = /^(\s*(?:\[[^\]]*\]\s*)?(?:[✓✗▸↩↪⚠•·\-]\s*)*)([\s\S]*?)(\s*)$/u;

function one(line: string): string {
  const m = line.match(PREFIX);
  if (!m) return line;
  const [, pre, body, post] = m;
  const hit = EXACT[body];
  if (hit) return pre + hit + post;
  for (const [rx, rep] of RX) if (rx.test(body)) return pre + body.replace(rx, rep) + post;
  return line;
}

/** Traduce una o varias líneas de log al inglés (no-op en español). */
export function trLog(text: string, lang: string): string {
  if (lang !== "en" || !text) return text;
  return text.split("\n").map(one).join("\n");
}
