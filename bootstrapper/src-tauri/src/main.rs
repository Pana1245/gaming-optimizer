#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// El instalador NSIS real, embebido dentro de este binario en tiempo de compilación.
/// Así el bootstrapper es un único .exe autocontenido.
const SETUP: &[u8] = include_bytes!("../embedded/setup.exe");

/// Runtime COMPLETO de WebView2 (instalador offline oficial de Microsoft), embebido.
/// Lo necesita cualquier app Tauri, incluido ESTE instalador, y se instala sólo si falta.
/// Antes venía el instalador online: necesitaba internet y los Windows "debloateados"
/// (Tiny11, AtlasOS…) bloquean su descarga, así que había que bajar aparte el offline.
const WEBVIEW2: &[u8] = include_bytes!("../embedded/webview2offline.exe");

/// ¿Está instalado el runtime de WebView2? Lo detecta por el registro de EdgeUpdate.
#[cfg(windows)]
fn webview2_installed() -> bool {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    const GUID: &str = "{F3017226-FE2A-4295-8BDB-FAD1F97CE7C8}";
    let candidates = [
        (HKEY_LOCAL_MACHINE, format!("SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{GUID}")),
        (HKEY_LOCAL_MACHINE, format!("SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{GUID}")),
        (HKEY_CURRENT_USER, format!("SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{GUID}")),
    ];
    for (root, path) in candidates {
        if let Ok(k) = RegKey::predef(root).open_subkey(&path) {
            if let Ok(pv) = k.get_value::<String, _>("pv") {
                if !pv.is_empty() && pv != "0.0.0.0" {
                    return true;
                }
            }
        }
    }
    false
}

/// Textos de los avisos que salen ANTES de la ventana (sin WebView2 no hay interfaz):
/// en el idioma de Windows (español, portugués o, si no, inglés).
#[cfg(windows)]
fn texts() -> [&'static str; 3] {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetUserDefaultUILanguage() -> u16;
    }
    match unsafe { GetUserDefaultUILanguage() } & 0x3ff {
        0x0a => [
            "Gaming Optimizer necesita Microsoft Edge WebView2, que no está en esta PC.\n\nViene incluido en este instalador: se instala ahora (tarda alrededor de un minuto, no hace falta internet) y después se abre el instalador.",
            "No se pudo instalar Microsoft Edge WebView2.\n\nVolvé a abrir el instalador y aceptá el aviso de Windows (UAC). Si sigue fallando, reiniciá la PC y probá de nuevo.",
            "Instalar Gaming Optimizer",
        ],
        0x16 => [
            "O Gaming Optimizer precisa do Microsoft Edge WebView2, que não está neste PC.\n\nEle vem incluído neste instalador: será instalado agora (leva cerca de um minuto, não precisa de internet) e depois o instalador abre.",
            "Não foi possível instalar o Microsoft Edge WebView2.\n\nAbra o instalador de novo e aceite o aviso do Windows (UAC). Se continuar falhando, reinicie o PC e tente de novo.",
            "Instalar Gaming Optimizer",
        ],
        _ => [
            "Gaming Optimizer needs Microsoft Edge WebView2, which isn't on this PC.\n\nIt's included in this installer: it will be installed now (takes about a minute, no internet needed) and then the installer opens.",
            "Microsoft Edge WebView2 couldn't be installed.\n\nOpen the installer again and accept the Windows prompt (UAC). If it keeps failing, restart the PC and try again.",
            "Install Gaming Optimizer",
        ],
    }
}

/// Aviso nativo de Windows (no depende de WebView2).
#[cfg(windows)]
fn message_box(text: &str, caption: &str, error: bool) {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(hwnd: *mut std::ffi::c_void, text: *const u16, caption: *const u16, utype: u32) -> i32;
    }
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let (t, c) = (wide(text), wide(caption));
    // MB_ICONERROR (0x10) o MB_ICONINFORMATION (0x40), al frente (MB_SETFOREGROUND).
    let icon = if error { 0x10 } else { 0x40 };
    unsafe {
        MessageBoxW(std::ptr::null_mut(), t.as_ptr(), c.as_ptr(), icon | 0x0001_0000);
    }
}

/// Si falta WebView2, lo instala desde el runtime embebido ANTES de crear la ventana
/// (anda sin internet). En PCs que ya lo tienen (Win11 y casi todo Win10) es instantáneo.
/// Devuelve false si no se pudo: sin WebView2 la ventana no puede abrir.
#[cfg(windows)]
fn ensure_webview2() -> bool {
    if webview2_installed() {
        return true;
    }
    let [notice, failed, caption] = texts();
    message_box(notice, caption, false);
    let tmp = std::env::temp_dir().join("MicrosoftEdgeWebView2RuntimeInstallerX64.exe");
    if std::fs::write(&tmp, WEBVIEW2).is_ok() {
        // Para todos los usuarios (pide UAC): la app corre como administrador y, si el
        // permiso lo da OTRA cuenta, esa cuenta no vería un WebView2 instalado por-usuario.
        let ps = format!(
            "try {{ $p = Start-Process -FilePath '{}' -ArgumentList '/silent','/install' -Verb RunAs -Wait -PassThru; exit $p.ExitCode }} catch {{ exit 1223 }}",
            tmp.display().to_string().replace('\'', "''")
        );
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
        // UAC cancelado (o falló): al menos para este usuario, que no pide permiso.
        if !webview2_installed() {
            let _ = Command::new(&tmp).args(["/silent", "/install"]).status();
        }
        let _ = std::fs::remove_file(&tmp);
    }
    if webview2_installed() {
        return true;
    }
    message_box(failed, caption, true);
    false
}
#[cfg(not(windows))]
fn ensure_webview2() -> bool {
    true
}

/// Escribe el NSIS a temporal y lo ejecuta en modo silencioso (/S) con elevación (UAC).
/// Espera a que termine y devuelve el código de salida. El NSIS hace la instalación
/// real, así que el auto-update y el desinstalador siguen funcionando igual.
/// `async`: un comando síncrono corre en el hilo principal y la ventana quedaba
/// congelada ("No responde") durante toda la instalación.
#[tauri::command(async)]
fn install() -> Result<i32, String> {
    let tmp = std::env::temp_dir().join("GamingOptimizer_setup.exe");
    std::fs::write(&tmp, SETUP).map_err(|e| format!("No se pudo preparar el instalador: {e}"))?;

    // La ruta va entre comillas simples de PowerShell: con un usuario como "D'Angelo"
    // (%TEMP% = C:\Users\D'Angelo\...) el script no parseaba y la instalación fallaba.
    let ps = format!(
        "$ErrorActionPreference='Stop'; try {{ $p = Start-Process -FilePath '{}' -ArgumentList '/S' -Verb RunAs -Wait -PassThru; exit $p.ExitCode }} catch {{ exit 1223 }}",
        tmp.display().to_string().replace('\'', "''")
    );
    let status = Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
        .status()
        .map_err(|e| format!("No se pudo lanzar el instalador: {e}"))?;

    let code = status.code().unwrap_or(-1);
    if code == 1223 {
        return Err("cancelado".into());
    }
    if code != 0 {
        return Err(format!("El instalador terminó con código {code}."));
    }
    Ok(code)
}

/// Abre la app recién instalada, buscando su ruta en el registro de desinstalación.
#[tauri::command]
fn launch() -> Result<(), String> {
    // El exe instalado se llama app.exe (binario Tauri), y DisplayIcon/InstallLocation
    // vienen del registro CON comillas → hay que sacarlas. Preferimos DisplayIcon (ruta
    // directa al exe); si no, InstallLocation + app.exe (o GamingOptimizer.exe de respaldo).
    let ps = "$ErrorActionPreference='SilentlyContinue'; \
        $roots=@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',\
        'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',\
        'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); \
        $k = Get-ItemProperty $roots | Where-Object { $_.DisplayName -like 'GamingOptimizer*' } | Select-Object -First 1; \
        $exe=$null; \
        if ($k.DisplayIcon) { $di=([string]$k.DisplayIcon).Trim([char]34); $ci=$di.LastIndexOf(','); if($ci -gt 2){ $di=$di.Substring(0,$ci) }; if (Test-Path -LiteralPath $di) { $exe=$di } } \
        if (-not $exe -and $k.InstallLocation) { $loc=([string]$k.InstallLocation).Trim([char]34); $c1=Join-Path $loc 'app.exe'; $c2=Join-Path $loc 'GamingOptimizer.exe'; if (Test-Path -LiteralPath $c1) { $exe=$c1 } elseif (Test-Path -LiteralPath $c2) { $exe=$c2 } } \
        if ($exe) { Start-Process -FilePath $exe }";
    Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    // Garantizar WebView2 antes de que Tauri intente crear la ventana (si no, en PCs
    // sin WebView2 la app muere con "Could not find the WebView2 Runtime").
    if !ensure_webview2() {
        return;
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![install, launch])
        .run(tauri::generate_context!())
        .expect("error al iniciar el instalador");
}
