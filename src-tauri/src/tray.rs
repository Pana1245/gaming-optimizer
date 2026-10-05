//! Bandeja del sistema + inicio con Windows.
//!
//! - Icono en la bandeja (junto al reloj) con menú Abrir / Salir; clic izquierdo abre.
//! - Si Auto Game-Mode está vigilando, cerrar la ventana la esconde en la bandeja en
//!   vez de cerrar la app (sigue detectando juegos). "Salir" del menú la cierra del todo.
//! - Inicio con Windows: la app necesita admin, así que un acceso en "Inicio" pediría
//!   UAC en cada arranque. Se usa una tarea programada al iniciar sesión con
//!   privilegios elevados (arranca sin preguntar) y con --minimized (directo a la bandeja).

use std::process::Command;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, Wry};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub const MINIMIZED_ARG: &str = "--minimized";
const TASK_NAME: &str = "GamingOptimizer Autostart";

pub struct TrayItems {
    open: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        // La interfaz pausa sus lecturas periódicas (temperaturas, uso) mientras está oculta.
        let _ = w.emit("window-shown", ());
    }
}

/// "Salir" de la bandeja. Si el modo gamer quedó aplicado (se sale en pleno juego), antes se
/// cerraba igual y el plan de energía quedaba en Alto rendimiento (y las apps de fondo en
/// prioridad baja) hasta volver a abrir la app. Ahora la interfaz lo restaura y cierra ella;
/// si no responde, se cierra igual a los 8 s. Sin nada que restaurar, cierra al instante.
fn quit_app(app: &AppHandle) {
    if !gamer_active() {
        app.exit(0);
        return;
    }
    let _ = app.emit("tray-quit", ());
    let h = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(8));
        h.exit(0);
    });
}

/// ¿Quedó algo del modo gamer sin restaurar? (marcas que escribe Auto Game-Mode).
#[cfg(windows)]
fn gamer_active() -> bool {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\GamingOptimizer")
        .map(|k| {
            k.get_value::<u32, _>("GmActive").map(|v| v == 1).unwrap_or(false)
                || k.get_value::<String, _>("BgPrios").map(|s| !s.is_empty()).unwrap_or(false)
        })
        .unwrap_or(false)
}
#[cfg(not(windows))]
fn gamer_active() -> bool {
    false
}

pub fn setup(app: &App) -> tauri::Result<()> {
    // Textos iniciales en español; la interfaz los cambia al idioma elegido (tray_labels).
    let open = MenuItem::with_id(app, "open", "Abrir Gaming Optimizer", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Gaming Optimizer")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => show_main(app),
            "quit" => quit_app(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    app.manage(TrayItems { open, quit });
    Ok(())
}

/// Traduce el menú de la bandeja al idioma de la interfaz.
#[tauri::command]
pub fn tray_labels(app: AppHandle, items: tauri::State<TrayItems>, open: String, quit: String, tooltip: String) {
    let _ = items.open.set_text(open);
    let _ = items.quit.set_text(quit);
    if let Some(t) = app.tray_by_id("main") {
        let _ = t.set_tooltip(Some(tooltip));
    }
}

fn powershell(script: &str) -> Option<std::process::Output> {
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.output().ok()
}

/// ¿Está activada la tarea de inicio con Windows?
/// `async`: lanza PowerShell (~1 s); como comando síncrono corría en el hilo principal
/// y congelaba la ventana al abrir Auto Game-Mode.
#[tauri::command(async)]
pub fn autostart_get() -> bool {
    powershell(&format!(
        "if (Get-ScheduledTask -TaskName '{TASK_NAME}' -EA SilentlyContinue) {{ 'YES' }} else {{ 'NO' }}"
    ))
    .map(|o| String::from_utf8_lossy(&o.stdout).contains("YES"))
    .unwrap_or(false)
}

/// Crea o borra la tarea de inicio con Windows. Devuelve el estado final.
#[tauri::command(async)]
pub fn autostart_set(enable: bool) -> Result<bool, String> {
    let script = if enable {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        // La ruta va entre comillas simples de PowerShell: se duplican las que tenga.
        let exe = exe.to_string_lossy().replace('\'', "''");
        // -Priority 4: las tareas programadas arrancan por defecto con prioridad 7
        // ("debajo de lo normal"); la app y todo lo que lanza (PowerShell del modo
        // gamer incluido) heredaban esa prioridad baja al iniciar con Windows.
        format!(
            "$user =[System.Security.Principal.WindowsIdentity]::GetCurrent().Name\n\
             $a = New-ScheduledTaskAction -Execute '{exe}' -Argument '{MINIMIZED_ARG}'\n\
             $t = New-ScheduledTaskTrigger -AtLogOn -User $user\n\
             $p = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest\n\
             $s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -Priority 4\n\
             Register-ScheduledTask -TaskName '{TASK_NAME}' -Action $a -Trigger $t -Principal $p -Settings $s -Force -ErrorAction Stop | Out-Null\n\
             'OK'"
        )
    } else {
        format!("Unregister-ScheduledTask -TaskName '{TASK_NAME}' -Confirm:$false -EA SilentlyContinue; 'OK'")
    };
    let out = powershell(&script).ok_or("no se pudo ejecutar PowerShell")?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    if !stdout.contains("OK") {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(autostart_get())
}
