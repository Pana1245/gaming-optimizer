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

/// Resultado final de un script en streaming: éxito y código de salida real.
#[derive(Serialize, Clone)]
pub struct StreamDone {
    pub ok: bool,
    pub code: i32,
}

/// Ejecuta un script PowerShell oculto (-EncodedCommand evita problemas de escaping).
/// `timeout_secs` es opcional (por defecto 600s) para cortar scripts colgados sin
/// matar operaciones largas legítimas (instalaciones, backups).
#[tauri::command]
async fn run_powershell(script: String, timeout_secs: Option<u64>) -> RunResult {
    tauri::async_runtime::spawn_blocking(move || {
        use wait_timeout::ChildExt;
        // ErrorActionPreference='Stop': un error de cmdlet no controlado corta el
        // script y hace que powershell.exe salga con código != 0, para que `ok` sea
        // real. Los scripts que toleran fallos usan -EA SilentlyContinue explícito.
        let full = format!("$ProgressPreference='SilentlyContinue';\n$ErrorActionPreference='Stop';\n{script}");
        // UTF-16LE -> base64 (formato que espera -EncodedCommand)
        let utf16: Vec<u8> = full.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        let encoded = general_purpose::STANDARD.encode(utf16);

        let mut cmd = Command::new("powershell.exe");
        cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &encoded])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => return RunResult { ok: false, output: e.to_string() },
        };
        // Drenar las tuberías en hilos para no bloquear si la salida es grande.
        let mut so = child.stdout.take().unwrap();
        let mut se = child.stderr.take().unwrap();
        let t_out = std::thread::spawn(move || { let mut b = Vec::new(); let _ = so.read_to_end(&mut b); b });
        let t_err = std::thread::spawn(move || { let mut b = Vec::new(); let _ = se.read_to_end(&mut b); b });

        let dur = std::time::Duration::from_secs(timeout_secs.unwrap_or(600));
        let status = match child.wait_timeout(dur) {
            Ok(Some(s)) => s,
            Ok(None) => {
                // Matar todo el árbol: powershell.exe pudo lanzar winget, instaladores
                // o Start-Process que seguirían modificando el equipo tras el timeout.
                #[cfg(windows)]
                {
                    let pid = child.id();
                    let mut tk = Command::new("taskkill");
                    tk.args(["/F", "/T", "/PID", &pid.to_string()]);
                    tk.creation_flags(CREATE_NO_WINDOW);
                    let _ = tk.output();
                }
                let _ = child.kill();
                let _ = child.wait();
                return RunResult { ok: false, output: "Tiempo de espera agotado".into() };
            }
            Err(e) => return RunResult { ok: false, output: e.to_string() },
        };
        let stdout = String::from_utf8_lossy(&t_out.join().unwrap_or_default()).trim().to_string();
        let stderr = String::from_utf8_lossy(&t_err.join().unwrap_or_default()).trim().to_string();
        let mut text = stdout;
        if !status.success() && !stderr.is_empty() && !stderr.contains("CLIXML") {
            if !text.is_empty() { text.push('\n'); }
            text.push_str(&stderr);
        }
        RunResult { ok: status.success(), output: text }
    })
    .await
    .unwrap_or(RunResult { ok: false, output: "error interno".into() })
}

/// Ejecuta PowerShell emitiendo cada línea en vivo como evento `ps-line-<id>`.
/// Emite `ps-done-<id>` al terminar. Para tareas largas (SFC, DISM).
#[tauri::command]
async fn run_powershell_stream(app: tauri::AppHandle, script: String, id: String) {
    tauri::async_runtime::spawn_blocking(move || {
        // ErrorActionPreference='Stop': un error de cmdlet no controlado corta el
        // script y hace que powershell.exe salga con código != 0, para que `ok` sea
        // real. Los scripts que toleran fallos usan -EA SilentlyContinue explícito.
        let full = format!("$ProgressPreference='SilentlyContinue';\n$ErrorActionPreference='Stop';\n{script}");
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

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit(&line_ev, format!("Error: {e}"));
                let _ = app.emit(&done_ev, StreamDone { ok: false, code: -1 });
                return;
            }
        };

        // Drenar stderr en un hilo aparte para no perder los errores ni bloquear.
        let stderr = child.stderr.take();
        let app_err = app.clone();
        let line_ev_err = line_ev.clone();
        let t_err = std::thread::spawn(move || {
            if let Some(se) = stderr {
                let mut buf = Vec::new();
                for b in se.bytes() {
                    match b {
                        Ok(b'\n') | Ok(b'\r') => {
                            if !buf.is_empty() {
                                let line = String::from_utf8_lossy(&buf).trim_end().to_string();
                                if !line.is_empty() { let _ = app_err.emit(&line_ev_err, line); }
                                buf.clear();
                            }
                        }
                        Ok(byte) => buf.push(byte),
                        Err(_) => break,
                    }
                }
                if !buf.is_empty() {
                    let line = String::from_utf8_lossy(&buf).trim_end().to_string();
                    if !line.is_empty() { let _ = app_err.emit(&line_ev_err, line); }
                }
            }
        });

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

        let status = child.wait();
        let _ = t_err.join();
        let (ok, code) = match status {
            Ok(s) => (s.success(), s.code().unwrap_or(-1)),
            Err(_) => (false, -1),
        };
        let _ = app.emit(&done_ev, StreamDone { ok, code });
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
    // Cada hilo del vigilante tiene su propio flag; al re-arrancar se reemplaza
    // (frenando el anterior) para evitar hilos duplicados.
    game_watch: Mutex<Arc<AtomicBool>>,
}

// ---- Auto Game-Mode: vigila procesos y avisa cuando entra/sale un juego ----
/// Arranca el vigilante. Emite `game-on` (con el nombre) y `game-off`.
#[tauri::command]
fn start_game_watch(app: tauri::AppHandle, state: tauri::State<AppState>, games: Vec<String>) {
    // Frena cualquier hilo previo y crea un flag nuevo para este hilo.
    let flag = Arc::new(AtomicBool::new(true));
    {
        let mut guard = state.game_watch.lock().unwrap();
        guard.store(false, Ordering::SeqCst);
        *guard = flag.clone();
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
    state.game_watch.lock().unwrap().store(false, Ordering::SeqCst);
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

    // Uso del disco del sistema (la unidad real de Windows, no siempre C:)
    let sysdrive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into()).to_uppercase();
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let mut disk = 0.0f32;
    for d in disks.list() {
        let mp = d.mount_point().to_string_lossy().to_uppercase();
        if mp.starts_with(&sysdrive) {
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
    // Toma el ultimo componente numerico del string de version, sea "22631",
    // "10.0.22631" o "10 22631" — antes fallaba con puntos y devolvia 0 (=> Win10
    // en maquinas Win11, ocultando los tweaks os:11).
    let build: u32 = System::os_version()
        .and_then(|v| {
            v.split(|c: char| c == '.' || c == ' ')
                .filter_map(|s| s.parse::<u32>().ok())
                .last()
        })
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

// ---- RAM Booster: baja el uso real de RAM (working sets + cache + standby) ---
/// Libera RAM como los "memory cleaners": vacia el working set de cada proceso,
/// descarga la cache de archivos del sistema y purga la standby list. Requiere admin.
#[cfg(windows)]
#[tauri::command]
fn clear_standby_ram(lang: String) -> RunResult {
    let en = lang == "en";
    use windows::core::{s, w};
    use windows::Win32::Foundation::{CloseHandle, HANDLE, LUID};
    use windows::Win32::Security::{
        AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES, SE_PRIVILEGE_ENABLED,
        TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES, TOKEN_QUERY,
    };
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};
    use windows::Win32::System::Threading::{
        GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_QUERY_INFORMATION, PROCESS_SET_QUOTA,
    };
    use windows::Win32::System::ProcessStatus::EmptyWorkingSet;
    use windows::Win32::System::Memory::SetSystemFileCacheSize;
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };

    // RAM disponible (bytes) y % de carga en este instante.
    unsafe fn read_mem() -> (u32, u64) {
        let mut ms = MEMORYSTATUSEX { dwLength: core::mem::size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
        let _ = GlobalMemoryStatusEx(&mut ms);
        (ms.dwMemoryLoad, ms.ullAvailPhys)
    }

    unsafe {
        // Habilitar privilegios: SeProfileSingleProcessPrivilege (standby) + SeIncreaseQuotaPrivilege (cache).
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &mut token).is_ok() {
            for name in [w!("SeProfileSingleProcessPrivilege"), w!("SeIncreaseQuotaPrivilege")] {
                let mut luid = LUID::default();
                if LookupPrivilegeValueW(None, name, &mut luid).is_ok() {
                    let tp = TOKEN_PRIVILEGES {
                        PrivilegeCount: 1,
                        Privileges: [LUID_AND_ATTRIBUTES { Luid: luid, Attributes: SE_PRIVILEGE_ENABLED }],
                    };
                    let _ = AdjustTokenPrivileges(token, false, Some(&tp), 0, None, None);
                }
            }
            let _ = CloseHandle(token);
        }

        let (load_before, avail_before) = read_mem();

        // 1) Vaciar el working set de cada proceso (esto es lo que baja el "usado").
        if let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            let mut entry = PROCESSENTRY32W { dwSize: core::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
            if Process32FirstW(snap, &mut entry).is_ok() {
                loop {
                    let pid = entry.th32ProcessID;
                    if pid != 0 {
                        if let Ok(h) = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA, false, pid) {
                            let _ = EmptyWorkingSet(h);
                            let _ = CloseHandle(h);
                        }
                    }
                    if Process32NextW(snap, &mut entry).is_err() { break; }
                }
            }
            let _ = CloseHandle(snap);
        }

        // 2) Descargar la cache de archivos del sistema.
        let _ = SetSystemFileCacheSize(usize::MAX, usize::MAX, 0);

        // 3) Purgar la standby list. NtSetSystemInformation(SystemMemoryListInformation=80, MemoryPurgeStandbyList=4).
        let mut purge_ok = false;
        if let Ok(ntdll) = LoadLibraryA(s!("ntdll.dll")) {
            if let Some(procaddr) = GetProcAddress(ntdll, s!("NtSetSystemInformation")) {
                let func: extern "system" fn(i32, *mut core::ffi::c_void, u32) -> i32 = core::mem::transmute(procaddr);
                let mut command: i32 = 4;
                purge_ok = func(80, &mut command as *mut _ as *mut core::ffi::c_void, 4) == 0;
            }
        }

        let (load_after, avail_after) = read_mem();
        let freed_mb = avail_after.saturating_sub(avail_before) / (1024 * 1024);

        let freed_word = if en { "Freed" } else { "Liberado" };
        let suffix = if purge_ok {
            ""
        } else if en {
            " (standby: needs admin)"
        } else {
            " (standby: requiere admin)"
        };
        RunResult {
            ok: true,
            output: format!("{} {} MB · RAM {}% → {}%{}", freed_word, freed_mb, load_before, load_after, suffix),
        }
    }
}

#[cfg(not(windows))]
#[tauri::command]
fn clear_standby_ram(_lang: String) -> RunResult {
    RunResult { ok: false, output: "only Windows".into() }
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
            game_watch: Mutex::new(Arc::new(AtomicBool::new(false))),
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
            ledger_read, ledger_write, start_game_watch, stop_game_watch,
            clear_standby_ram
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
