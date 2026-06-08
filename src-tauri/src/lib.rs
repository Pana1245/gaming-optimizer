use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use sysinfo::System;
use tauri::Emitter;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize)]
pub struct RunResult {
    pub ok: bool,
    pub output: String,
}

/// Ejecuta un script PowerShell oculto (-EncodedCommand evita problemas de escaping).
#[tauri::command]
async fn run_powershell(script: String) -> RunResult {
    tauri::async_runtime::spawn_blocking(move || {
        let full = format!("$ProgressPreference='SilentlyContinue';\n{script}");
        // UTF-16LE -> base64 (formato que espera -EncodedCommand)
        let utf16: Vec<u8> = full.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        let encoded = general_purpose::STANDARD.encode(utf16);

        let mut cmd = Command::new("powershell.exe");
        cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &encoded]);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        match cmd.output() {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                let mut text = stdout;
                if !out.status.success() && !stderr.is_empty() && !stderr.contains("CLIXML") {
                    if !text.is_empty() { text.push('\n'); }
                    text.push_str(&stderr);
                }
                RunResult { ok: out.status.success(), output: text }
            }
            Err(e) => RunResult { ok: false, output: e.to_string() },
        }
    })
    .await
    .unwrap_or(RunResult { ok: false, output: "error interno".into() })
}

/// Ejecuta PowerShell emitiendo cada línea en vivo como evento `ps-line-<id>`.
/// Emite `ps-done-<id>` al terminar. Para tareas largas (SFC, DISM).
#[tauri::command]
async fn run_powershell_stream(app: tauri::AppHandle, script: String, id: String) {
    tauri::async_runtime::spawn_blocking(move || {
        let full = format!("$ProgressPreference='SilentlyContinue';\n{script}");
        let utf16: Vec<u8> = full.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        let encoded = general_purpose::STANDARD.encode(utf16);

        let mut cmd = Command::new("powershell.exe");
        cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &encoded])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let line_ev = format!("ps-line-{id}");
        let done_ev = format!("ps-done-{id}");

        match cmd.spawn() {
            Ok(mut child) => {
                if let Some(out) = child.stdout.take() {
                    // Leer byte a byte y emitir en cada \n o \r (captura el % de SFC/DISM)
                    let mut buf = Vec::new();
                    for b in out.bytes() {
                        match b {
                            Ok(b'\n') | Ok(b'\r') => {
                                if !buf.is_empty() {
                                    let line = String::from_utf8_lossy(&buf).trim_end().to_string();
                                    if !line.is_empty() { let _ = app.emit(&line_ev, line); }
                                    buf.clear();
                                }
                            }
                            Ok(byte) => buf.push(byte),
                            Err(_) => break,
                        }
                    }
                    if !buf.is_empty() {
                        let line = String::from_utf8_lossy(&buf).trim_end().to_string();
                        if !line.is_empty() { let _ = app.emit(&line_ev, line); }
                    }
                }
                let _ = child.wait();
            }
            Err(e) => { let _ = app.emit(&line_ev, format!("Error: {e}")); }
        }
        let _ = app.emit(&done_ev, ());
    });
}

#[derive(Serialize)]
pub struct Stats {
    pub cpu: f32,
    pub ram: f32,
    pub disk: f32,
}

struct AppState {
    sys: Mutex<System>,
    game_watch: Arc<AtomicBool>,
}

// ---- Auto Game-Mode: vigila procesos y avisa cuando entra/sale un juego ----
/// Arranca el vigilante. Emite `game-on` (con el nombre) y `game-off`.
#[tauri::command]
fn start_game_watch(app: tauri::AppHandle, state: tauri::State<AppState>, games: Vec<String>) {
    let flag = state.game_watch.clone();
    if flag.swap(true, Ordering::SeqCst) {
        return; // ya estaba corriendo
    }
    let targets: Vec<String> = games.iter().map(|g| g.to_lowercase()).collect();
    std::thread::spawn(move || {
        let mut sys = System::new();
        let mut active: Option<String> = None;
        while flag.load(Ordering::SeqCst) {
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            let mut found: Option<String> = None;
            for p in sys.processes().values() {
                let name = p.name().to_string_lossy().to_lowercase();
                if targets.iter().any(|t| !t.is_empty() && name == *t) {
                    found = Some(p.name().to_string_lossy().into_owned());
                    break;
                }
            }
            match (&active, &found) {
                (None, Some(g)) => {
                    active = Some(g.clone());
                    let _ = app.emit("game-on", g.clone());
                }
                (Some(_), None) => {
                    active = None;
                    let _ = app.emit("game-off", ());
                }
                _ => {}
            }
            std::thread::sleep(std::time::Duration::from_secs(3));
        }
    });
}

/// Detiene el vigilante.
#[tauri::command]
fn stop_game_watch(state: tauri::State<AppState>) {
    state.game_watch.store(false, Ordering::SeqCst);
}

/// Uso instantáneo de CPU, RAM y disco del sistema (%).
#[tauri::command]
fn stats(state: tauri::State<AppState>) -> Stats {
    let mut sys = state.sys.lock().unwrap();
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    let cpu = sys.global_cpu_usage();
    let total = sys.total_memory() as f32;
    let used = sys.used_memory() as f32;
    let ram = if total > 0.0 { used / total * 100.0 } else { 0.0 };

    // Uso del disco del sistema (C:)
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let mut disk = 0.0f32;
    for d in disks.list() {
        let mp = d.mount_point().to_string_lossy();
        if mp.starts_with("C:") {
            let dt = d.total_space() as f32;
            if dt > 0.0 {
                disk = (dt - d.available_space() as f32) / dt * 100.0;
            }
            break;
        }
    }
    Stats { cpu, ram, disk }
}

#[derive(Serialize)]
pub struct SysInfo {
    pub windows: String,
    pub cpu: String,
    pub cores: usize,
    pub threads: usize,
    pub ram_gb: f64,
    pub gpu: String,
    pub win_ver: u32,
}

/// Información estática del equipo.
#[tauri::command]
async fn system_info() -> SysInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_name = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_default();
    let threads = sys.cpus().len();
    let cores = sys.physical_core_count().unwrap_or(threads);
    let ram_gb = (sys.total_memory() as f64) / 1_073_741_824.0;
    let os_long = System::long_os_version().unwrap_or_default();
    let build: u32 = System::os_version()
        .and_then(|v| v.split(' ').last().map(|s| s.to_string()))
        .and_then(|b| b.parse().ok())
        .unwrap_or(0);
    let win_ver = if build >= 22000 { 11 } else { 10 };

    // GPU vía PowerShell (sysinfo no expone GPU)
    let gpu = {
        let script = "(Get-CimInstance Win32_VideoController | Where-Object { $_.AdapterRAM -gt 0 } | Sort-Object AdapterRAM -Descending | Select-Object -First 1).Name";
        let utf16: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        let encoded = general_purpose::STANDARD.encode(utf16);
        let mut cmd = Command::new("powershell.exe");
        cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &encoded]);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default()
    };

    SysInfo {
        windows: os_long,
        cpu: cpu_name,
        cores,
        threads,
        ram_gb: (ram_gb * 10.0).round() / 10.0,
        gpu,
        win_ver,
    }
}

// ---- Elevación a administrador (solo Windows, solo release) ----------------
#[cfg(windows)]
#[allow(dead_code)]
fn is_elevated() -> bool {
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION::default();
        let mut ret_len = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut core::ffi::c_void),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut ret_len,
        )
        .is_ok();
        let _ = CloseHandle(token);
        ok && elevation.TokenIsElevated != 0
    }
}

#[cfg(windows)]
#[allow(dead_code)]
fn relaunch_as_admin() -> bool {
    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let Ok(exe) = std::env::current_exe() else { return false; };
    let exe_h = HSTRING::from(exe.as_os_str());
    unsafe {
        let r = ShellExecuteW(
            None,
            w!("runas"),
            PCWSTR(exe_h.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        );
        r.0 as isize > 32
    }
}

// ---- Ledger persistente del motor reversible -------------------------------
fn ledger_file() -> std::path::PathBuf {
    let base = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".into());
    std::path::Path::new(&base).join("GamingOptimizer").join("ledger.json")
}

/// Lee el ledger de cambios (JSON). Devuelve "[]" si no existe.
#[tauri::command]
fn ledger_read() -> String {
    std::fs::read_to_string(ledger_file()).unwrap_or_else(|_| "[]".into())
}

/// Guarda el ledger de cambios.
#[tauri::command]
fn ledger_write(content: String) -> bool {
    let f = ledger_file();
    if let Some(dir) = f.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    std::fs::write(f, content).is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // En release, si no somos admin, relanzar con UAC y salir.
    #[cfg(all(windows, not(debug_assertions)))]
    {
        if !is_elevated() && relaunch_as_admin() {
            std::process::exit(0);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            sys: Mutex::new(System::new_all()),
            game_watch: Arc::new(AtomicBool::new(false)),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            run_powershell, run_powershell_stream, stats, system_info,
            ledger_read, ledger_write, start_game_watch, stop_game_watch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
