mod drivers;
mod speedtest;
mod tray;

use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use sysinfo::System;
use tauri::{Emitter, Manager};

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
        // Forzar salida UTF-8: el backend lee stdout como UTF-8, pero powershell.exe
        // escribe en el codepage OEM de la consola → los acentos volvían como '?'
        // (en literales y en nombres del registro). Con esto se decodifican bien.
        let full = format!("$ProgressPreference='SilentlyContinue';\ntry{{[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)}}catch{{}}\n{script}");
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
        // Forzar salida UTF-8: el backend lee stdout como UTF-8, pero powershell.exe
        // escribe en el codepage OEM de la consola → los acentos volvían como '?'
        // (en literales y en nombres del registro). Con esto se decodifican bien.
        let full = format!("$ProgressPreference='SilentlyContinue';\ntry{{[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)}}catch{{}}\n{script}");
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
                // BufReader: sin él, .bytes() hace una llamada al sistema por byte.
                for b in std::io::BufReader::new(se).bytes() {
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

        // stdout también en un hilo, para poder aplicar timeout en el principal.
        let stdout = child.stdout.take();
        let app_out = app.clone();
        let line_ev_out = line_ev.clone();
        let t_out = std::thread::spawn(move || {
            if let Some(out) = stdout {
                // Leer byte a byte y emitir en cada \n o \r (captura el % de SFC/DISM)
                let mut buf = Vec::new();
                for b in std::io::BufReader::new(out).bytes() {
                    match b {
                        Ok(b'\n') | Ok(b'\r') => {
                            if !buf.is_empty() {
                                let line = String::from_utf8_lossy(&buf).trim_end().to_string();
                                if !line.is_empty() { let _ = app_out.emit(&line_ev_out, line); }
                                buf.clear();
                            }
                        }
                        Ok(byte) => buf.push(byte),
                        Err(_) => break,
                    }
                }
                if !buf.is_empty() {
                    let line = String::from_utf8_lossy(&buf).trim_end().to_string();
                    if !line.is_empty() { let _ = app_out.emit(&line_ev_out, line); }
                }
            }
        });

        // Timeout generoso (SFC/DISM pueden tardar de verdad). Si se agota, se mata
        // todo el árbol de procesos para no dejar nada colgado ni sin cancelar.
        use wait_timeout::ChildExt;
        let (ok, code) = match child.wait_timeout(std::time::Duration::from_secs(1800)) {
            Ok(Some(s)) => (s.success(), s.code().unwrap_or(-1)),
            Ok(None) => {
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
                let _ = app.emit(&line_ev, "Tiempo de espera agotado; proceso cancelado.".to_string());
                (false, -1)
            }
            Err(_) => (false, -1),
        };
        let _ = t_out.join();
        let _ = t_err.join();
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

#[derive(Serialize, Clone)]
pub struct GpuEntry {
    pub name: String,
    pub vram_gb: f64,
}

#[derive(Serialize)]
pub struct SysInfo {
    pub windows: String,
    pub cpu: String,
    pub cores: usize,
    pub threads: usize,
    pub ram_gb: f64,
    /// Placa principal (la de más VRAM) — se mantiene por compatibilidad.
    pub gpu: String,
    /// Todas las placas físicas (iGPU + dGPU), de mayor a menor VRAM.
    pub gpus: Vec<GpuEntry>,
    pub win_ver: u32,
}

/// Lista las placas de video FÍSICAS (PNPDeviceID PCI\*, descarta adaptadores
/// virtuales tipo Parsec/escritorio remoto) ordenadas por VRAM real. No usa
/// Win32_VideoController.AdapterRAM para ordenar: es uint32 y se traba en 4 GB
/// (una RTX 3070 de 8 GB reporta 4 GB), así que una integrada podía "ganarle" a la
/// dedicada. La VRAM sale de HardwareInformation.qwMemorySize/MemorySize del registro.
const GPU_LIST_PS: &str = r#"try{[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)}catch{}
$vram=@{}
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
  try {
    $p=Get-ItemProperty $_.PSPath -EA SilentlyContinue
    if($p.DriverDesc){
      $m=[uint64]0
      $q=$p.'HardwareInformation.qwMemorySize'
      if($q){ $m=[uint64]$q }
      else {
        $s=$p.'HardwareInformation.MemorySize'
        if($s -is [byte[]] -and $s.Length -ge 4){ $m=[uint64][BitConverter]::ToUInt32($s,0) }
        elseif($s){ $m=[uint64][uint32]$s }
      }
      if(-not $vram.ContainsKey($p.DriverDesc) -or $m -gt $vram[$p.DriverDesc]){ $vram[$p.DriverDesc]=$m }
    }
  } catch {}
}
$list=@(Get-CimInstance Win32_VideoController | Where-Object { $_.PNPDeviceID -like 'PCI\*' })
if($list.Count -eq 0){ $list=@(Get-CimInstance Win32_VideoController) }
$list | ForEach-Object {
  $v=[uint64]0
  if($vram.ContainsKey($_.Name)){ $v=$vram[$_.Name] }
  if(-not $v -and $_.AdapterRAM){ $v=[uint64]$_.AdapterRAM }
  [pscustomobject]@{ n=$_.Name; v=$v }
} | Sort-Object v -Descending | ForEach-Object { $_.n + "`t" + $_.v }"#;

fn detect_gpus() -> Vec<GpuEntry> {
    let utf16: Vec<u8> = GPU_LIST_PS.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    let encoded = general_purpose::STANDARD.encode(utf16);
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &encoded]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let out = cmd
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();
    out.lines()
        .filter_map(|l| {
            let mut it = l.splitn(2, '\t');
            let name = it.next()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            let bytes: f64 = it.next().and_then(|b| b.trim().parse().ok()).unwrap_or(0.0);
            Some(GpuEntry { name, vram_gb: (bytes / 1_073_741_824.0 * 10.0).round() / 10.0 })
        })
        .collect()
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
            v.split(['.', ' '])
                .filter_map(|s| s.parse::<u32>().ok())
                .next_back()
        })
        .unwrap_or(0);
    let win_ver = if build >= 22000 { 11 } else { 10 };

    // GPU vía PowerShell (sysinfo no expone GPU): todas las físicas, la principal primero.
    let gpus = detect_gpus();
    let gpu = gpus.first().map(|g| g.name.clone()).unwrap_or_default();

    SysInfo {
        windows: os_long,
        cpu: cpu_name,
        cores,
        threads,
        ram_gb: (ram_gb * 10.0).round() / 10.0,
        gpu,
        gpus,
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
    // Reenviar los argumentos (ej. --minimized) para no perderlos al elevar.
    let args: Vec<String> = std::env::args().skip(1).map(|a| format!("\"{}\"", a.replace('"', ""))).collect();
    let args_h = HSTRING::from(args.join(" "));
    unsafe {
        let r = ShellExecuteW(
            None,
            w!("runas"),
            PCWSTR(exe_h.as_ptr()),
            if args.is_empty() { PCWSTR::null() } else { PCWSTR(args_h.as_ptr()) },
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

/// Carpeta de datos con permisos seguros: dueño Administradores, SYSTEM/Administradores
/// control total y Usuarios SOLO lectura. Si un usuario estándar creara la carpeta antes
/// (queda como dueño), podría reemplazar el ledger o el script de Timer Resolution, que
/// corre con privilegios máximos al iniciar sesión → escalada de privilegios.
#[cfg(windows)]
fn secure_data_dir(dir: &std::path::Path) {
    let d = dir.to_string_lossy().to_string();
    let mut c = Command::new("icacls");
    c.args([d.as_str(), "/setowner", "*S-1-5-32-544", "/T", "/C", "/Q"]);
    c.creation_flags(CREATE_NO_WINDOW);
    let _ = c.status();
    let mut c = Command::new("icacls");
    c.args([d.as_str(), "/inheritance:r", "/grant:r", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-32-545:(OI)(CI)RX", "/T", "/C", "/Q"]);
    c.creation_flags(CREATE_NO_WINDOW);
    let _ = c.status();
}
#[cfg(not(windows))]
fn secure_data_dir(_dir: &std::path::Path) {}

fn ledger_bak() -> std::path::PathBuf { ledger_file().with_extension("json.bak") }

fn valid_json(s: &str) -> bool { serde_json::from_str::<serde_json::Value>(s).is_ok() }

/// Lee el ledger de cambios (JSON). Si está dañado (ej. corte de luz mientras se
/// escribía), usa la copia de respaldo. Devuelve "[]" si no hay ninguno válido.
#[tauri::command]
fn ledger_read() -> String {
    for f in [ledger_file(), ledger_bak()] {
        if let Ok(s) = std::fs::read_to_string(&f) {
            if valid_json(&s) { return s; }
        }
    }
    "[]".into()
}

/// Guarda el ledger de forma ATÓMICA: escribe un temporal y lo reemplaza (antes se
/// escribía directo: un corte a mitad dejaba el JSON truncado y se perdía el historial
/// para deshacer). La versión anterior queda como .bak.
#[tauri::command]
fn ledger_write(content: String) -> bool {
    if !valid_json(&content) { return false; }
    let f = ledger_file();
    if let Some(dir) = f.parent() {
        let _ = std::fs::create_dir_all(dir);
        // Una vez por sesión, exista o no de antes (un usuario estándar pudo crearla primero).
        static SECURED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
        if !SECURED.swap(true, std::sync::atomic::Ordering::SeqCst) { secure_data_dir(dir); }
    }
    let tmp = f.with_extension("json.tmp");
    if std::fs::write(&tmp, &content).is_err() { return false; }
    if f.exists() { let _ = std::fs::copy(&f, ledger_bak()); }
    std::fs::rename(&tmp, &f).is_ok()
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

// ---- Motor: operaciones de registro nativas (reemplazan el PowerShell) -------
// Atómicas, sin spawn de powershell.exe ni problemas de escaping. La app corre
// elevada, así que puede escribir HKLM/HKCU.
#[derive(Serialize)]
pub struct RegApplyResult {
    pub prior: String,
    pub now: String,
    pub ok: bool,
}

#[cfg(windows)]
fn reg_root(key: &str) -> Option<(winreg::RegKey, String)> {
    use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, HKEY_USERS};
    use winreg::RegKey;
    let (root_id, rest) = if let Some(r) = key.strip_prefix("HKCU:\\").or_else(|| key.strip_prefix("HKCU\\")) {
        (HKEY_CURRENT_USER, r)
    } else if let Some(r) = key.strip_prefix("HKLM:\\").or_else(|| key.strip_prefix("HKLM\\")) {
        (HKEY_LOCAL_MACHINE, r)
    } else if let Some(r) = key.strip_prefix("HKCR:\\").or_else(|| key.strip_prefix("HKCR\\")) {
        (HKEY_CLASSES_ROOT, r)
    } else if let Some(r) = key.strip_prefix("HKU:\\").or_else(|| key.strip_prefix("HKU\\")) {
        (HKEY_USERS, r)
    } else {
        return None;
    };
    Some((RegKey::predef(root_id), rest.to_string()))
}

#[cfg(windows)]
fn parse_dword(v: &str) -> Option<u32> {
    let v = v.trim();
    if let Some(hex) = v.strip_prefix("0x").or_else(|| v.strip_prefix("0X")) {
        u32::from_str_radix(hex, 16).ok()
    } else {
        v.parse::<u32>().ok()
    }
}

#[cfg(windows)]
fn reg_read(subkey: &winreg::RegKey, prop: &str, kind: &str) -> String {
    if kind == "DWord" {
        subkey.get_value::<u32, _>(prop).map(|v| v.to_string()).unwrap_or_else(|_| "__ABSENT__".into())
    } else {
        subkey.get_value::<String, _>(prop).unwrap_or_else(|_| "__ABSENT__".into())
    }
}

#[cfg(windows)]
fn regtype_to_u32(t: &winreg::enums::RegType) -> u32 {
    use winreg::enums::RegType::*;
    match t {
        REG_NONE => 0, REG_SZ => 1, REG_EXPAND_SZ => 2, REG_BINARY => 3, REG_DWORD => 4,
        REG_DWORD_BIG_ENDIAN => 5, REG_LINK => 6, REG_MULTI_SZ => 7, REG_RESOURCE_LIST => 8,
        REG_FULL_RESOURCE_DESCRIPTOR => 9, REG_RESOURCE_REQUIREMENTS_LIST => 10, REG_QWORD => 11,
    }
}
#[cfg(windows)]
fn u32_to_regtype(n: u32) -> Option<winreg::enums::RegType> {
    use winreg::enums::RegType::*;
    Some(match n {
        0 => REG_NONE, 1 => REG_SZ, 2 => REG_EXPAND_SZ, 3 => REG_BINARY, 4 => REG_DWORD,
        5 => REG_DWORD_BIG_ENDIAN, 6 => REG_LINK, 7 => REG_MULTI_SZ, 8 => REG_RESOURCE_LIST,
        9 => REG_FULL_RESOURCE_DESCRIPTOR, 10 => REG_RESOURCE_REQUIREMENTS_LIST, 11 => REG_QWORD,
        _ => return None,
    })
}

/// Valor previo para el ledger. Si existe pero con OTRO tipo (ej. "1" como texto donde
/// el tweak escribe DWORD), antes se leía como "__ABSENT__" y al deshacer se BORRABA el
/// valor original. Ahora se guarda en crudo (__RAW__:tipo:hex) y se restaura exacto.
#[cfg(windows)]
fn reg_prior(subkey: &winreg::RegKey, prop: &str, kind: &str) -> String {
    let typed = reg_read(subkey, prop, kind);
    if typed != "__ABSENT__" { return typed; }
    match subkey.get_raw_value(prop) {
        Ok(raw) => {
            let hex: String = raw.bytes.iter().map(|b| format!("{b:02x}")).collect();
            format!("__RAW__:{}:{}", regtype_to_u32(&raw.vtype), hex)
        }
        Err(_) => "__ABSENT__".into(),
    }
}

/// Lee el valor previo, escribe, y relee para verificar. `kind` = "DWord" | "String".
#[cfg(windows)]
#[tauri::command]
fn reg_apply(key: String, prop: String, kind: String, value: String) -> RegApplyResult {
    let empty = || RegApplyResult { prior: String::new(), now: String::new(), ok: false };
    let Some((root, path)) = reg_root(&key) else { return empty(); };
    // create_subkey crea la clave si no existe (como New-Item -Force).
    let subkey = match root.create_subkey(&path) {
        Ok((k, _)) => k,
        Err(_) => return empty(),
    };
    let prior = reg_prior(&subkey, &prop, &kind);
    let ok = if kind == "DWord" {
        match parse_dword(&value) {
            Some(n) => subkey.set_value(&prop, &n).is_ok(),
            None => false,
        }
    } else {
        subkey.set_value(&prop, &value).is_ok()
    };
    let now = reg_read(&subkey, &prop, &kind);
    RegApplyResult { prior, now, ok }
}

/// Deshace: si el valor no existía (`__ABSENT__`) lo borra; si existía, lo restaura.
#[cfg(windows)]
#[tauri::command]
fn reg_undo(key: String, prop: String, kind: String, prior: String) -> bool {
    let Some((root, path)) = reg_root(&key) else { return false; };
    let subkey = match root.create_subkey(&path) {
        Ok((k, _)) => k,
        Err(_) => return false,
    };
    if let Some(rest) = prior.strip_prefix("__RAW__:") {
        // Valor original de otro tipo: se restaura en crudo (tipo + bytes exactos).
        let Some((t, hex)) = rest.split_once(':') else { return false; };
        let Some(vtype) = t.parse::<u32>().ok().and_then(u32_to_regtype) else { return false; };
        if hex.len() % 2 != 0 { return false; }
        let bytes: Option<Vec<u8>> = (0..hex.len()).step_by(2).map(|i| u8::from_str_radix(&hex[i..i + 2], 16).ok()).collect();
        let Some(bytes) = bytes else { return false; };
        return subkey.set_raw_value(&prop, &winreg::RegValue { bytes, vtype }).is_ok();
    }
    if prior == "__ABSENT__" {
        // Éxito si se borró o si ya no estaba.
        subkey.delete_value(&prop).is_ok()
            || (subkey.get_value::<u32, _>(&prop).is_err() && subkey.get_value::<String, _>(&prop).is_err())
    } else if kind == "DWord" {
        match parse_dword(&prior) {
            Some(n) => subkey.set_value(&prop, &n).is_ok(),
            None => false,
        }
    } else {
        subkey.set_value(&prop, &prior).is_ok()
    }
}

#[cfg(not(windows))]
#[tauri::command]
fn reg_apply(_key: String, _prop: String, _kind: String, _value: String) -> RegApplyResult {
    RegApplyResult { prior: String::new(), now: String::new(), ok: false }
}
#[cfg(not(windows))]
#[tauri::command]
fn reg_undo(_key: String, _prop: String, _kind: String, _prior: String) -> bool {
    false
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
        // Una sola instancia: si se abre de nuevo, se trae al frente la que ya corre.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main(app)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            sys: Mutex::new(System::new_all()),
            game_watch: Mutex::new(Arc::new(AtomicBool::new(false))),
        })
        .setup(|app| {
            tray::setup(app)?;
            // La ventana arranca oculta (tauri.conf: visible=false): se muestra salvo
            // que la haya lanzado la tarea de inicio con Windows (--minimized).
            if !std::env::args().any(|a| a == tray::MINIMIZED_ARG) {
                tray::show_main(app.handle());
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        // Con Auto Game-Mode vigilando, cerrar la ventana la esconde en la bandeja
        // (sigue detectando juegos). "Salir" en el menú de la bandeja cierra del todo.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let watching = window
                    .app_handle()
                    .try_state::<AppState>()
                    .map(|s| s.game_watch.lock().map(|g| g.load(Ordering::SeqCst)).unwrap_or(false))
                    .unwrap_or(false);
                if watching {
                    api.prevent_close();
                    let _ = window.hide();
                    let _ = window.emit("hidden-to-tray", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            run_powershell, run_powershell_stream, stats, system_info,
            ledger_read, ledger_write, start_game_watch, stop_game_watch,
            clear_standby_ram, reg_apply, reg_undo,
            speedtest::speed_test, speedtest::speed_cancel,
            tray::tray_labels, tray::autostart_get, tray::autostart_set,
            drivers::drivers_fetch, drivers::open_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(all(test, windows))]
mod engine_tests {
    use super::*;
    use winreg::enums::HKEY_CURRENT_USER;

    // Valor original de OTRO tipo (texto "1" donde el tweak escribe DWORD): al deshacer
    // tiene que volver exacto (antes se borraba).
    #[test]
    fn deshacer_restaura_valor_de_otro_tipo() {
        let hk = winreg::RegKey::predef(HKEY_CURRENT_USER);
        let path = r"Software\GoEngineTest";
        let (k, _) = hk.create_subkey(path).unwrap();
        k.set_value("V", &"1").unwrap();
        let key = format!(r"HKCU:\{path}");
        let r = reg_apply(key.clone(), "V".into(), "DWord".into(), "0".into());
        assert!(r.ok, "apply");
        assert!(r.prior.starts_with("__RAW__:1:"), "prior en crudo: {}", r.prior);
        assert_eq!(k.get_value::<u32, _>("V").unwrap(), 0);
        assert!(reg_undo(key.clone(), "V".into(), "DWord".into(), r.prior.clone()), "undo");
        assert_eq!(k.get_value::<String, _>("V").unwrap(), "1");
        // Valor inexistente: al deshacer se borra
        let r2 = reg_apply(key.clone(), "W".into(), "DWord".into(), "5".into());
        assert_eq!(r2.prior, "__ABSENT__");
        assert!(reg_undo(key, "W".into(), "DWord".into(), r2.prior));
        assert!(k.get_raw_value("W").is_err());
        let _ = hk.delete_subkey_all(path);
    }

    #[test]
    fn json_invalido_se_rechaza() {
        assert!(valid_json("[]") && valid_json("[{\"a\":1}]"));
        assert!(!valid_json("[{\"a\":1}, {\"b\""));
    }
}
