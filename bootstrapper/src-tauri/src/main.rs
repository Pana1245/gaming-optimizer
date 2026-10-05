#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use std::process::Command;

/// El instalador NSIS real, embebido dentro de este binario en tiempo de compilación.
/// Así el bootstrapper es un único .exe autocontenido.
const SETUP: &[u8] = include_bytes!("../embedded/setup.exe");

/// Bootstrapper oficial de WebView2 (Microsoft), embebido. Se usa sólo si la PC no
/// tiene WebView2 (el runtime que necesita CUALQUIER app Tauri, incluido ESTE
/// instalador). Sin esto, en Windows sin WebView2 el instalador ni abre.
const WEBVIEW2: &[u8] = include_bytes!("../embedded/webview2setup.exe");

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

/// Si falta WebView2, lo instala (silencioso, por-usuario, sin UAC) ANTES de crear la
/// ventana. En PCs que ya lo tienen (Win11 y la mayoría de Win10) es instantáneo.
#[cfg(windows)]
fn ensure_webview2() {
    if webview2_installed() {
        return;
    }
    let tmp = std::env::temp_dir().join("MicrosoftEdgeWebview2Setup.exe");
    if std::fs::write(&tmp, WEBVIEW2).is_ok() {
        let _ = Command::new(&tmp).args(["/silent", "/install"]).status();
    }
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
    #[cfg(windows)]
    ensure_webview2();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![install, launch])
        .run(tauri::generate_context!())
        .expect("error al iniciar el instalador");
}
