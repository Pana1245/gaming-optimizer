#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use std::process::Command;

/// El instalador NSIS real, embebido dentro de este binario en tiempo de compilación.
/// Así el bootstrapper es un único .exe autocontenido.
const SETUP: &[u8] = include_bytes!("../embedded/setup.exe");

/// Escribe el NSIS a temporal y lo ejecuta en modo silencioso (/S) con elevación (UAC).
/// Espera a que termine y devuelve el código de salida. El NSIS hace la instalación
/// real, así que el auto-update y el desinstalador siguen funcionando igual.
#[tauri::command]
fn install() -> Result<i32, String> {
    let tmp = std::env::temp_dir().join("GamingOptimizer_setup.exe");
    std::fs::write(&tmp, SETUP).map_err(|e| format!("No se pudo preparar el instalador: {e}"))?;

    let ps = format!(
        "$ErrorActionPreference='Stop'; try {{ $p = Start-Process -FilePath '{}' -ArgumentList '/S' -Verb RunAs -Wait -PassThru; exit $p.ExitCode }} catch {{ exit 1223 }}",
        tmp.display()
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
    let ps = "$ErrorActionPreference='SilentlyContinue'; \
        $roots=@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',\
        'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',\
        'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); \
        $k = Get-ItemProperty $roots | Where-Object { $_.DisplayName -like 'GamingOptimizer*' } | Select-Object -First 1; \
        if ($k -and $k.InstallLocation) { $exe = Join-Path $k.InstallLocation 'GamingOptimizer.exe'; if (Test-Path $exe) { Start-Process $exe } }";
    Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![install, launch])
        .run(tauri::generate_context!())
        .expect("error al iniciar el instalador");
}
