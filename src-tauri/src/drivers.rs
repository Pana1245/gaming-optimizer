// Sección Drivers: consultas a las fuentes OFICIALES de los fabricantes y apertura
// de sus páginas en el navegador. La app nunca descarga ni instala drivers: el
// usuario los baja desde el sitio oficial, en su navegador.
use std::time::Duration;

// Solo estos servidores (APIs públicas de soporte de ASUS y del buscador de
// drivers de NVIDIA). Cualquier otra URL se rechaza.
const ALLOWED_HOSTS: &[&str] = &["www.asus.com", "gfwsl.geforce.com", "www.nvidia.com"];

fn host_of(url: &str) -> Option<&str> {
    let rest = url.strip_prefix("https://")?;
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    Some(&rest[..end])
}

/// GET de texto (JSON/XML) a una fuente oficial permitida.
#[tauri::command]
pub async fn drivers_fetch(url: String) -> Result<String, String> {
    let host = host_of(&url).ok_or("url inválida")?;
    if !ALLOWED_HOSTS.contains(&host) {
        return Err(format!("host no permitido: {host}"));
    }
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(25))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) GamingOptimizer")
        .build()
        .map_err(|e| e.to_string())?;
    let r = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Err(format!("HTTP {}", r.status().as_u16()));
    }
    r.text().await.map_err(|e| e.to_string())
}

/// Le pide al escritorio (el Explorer del usuario, sin permisos de administrador) que
/// abra la URL, como un doble clic en un acceso directo: navegador predeterminado y
/// NO elevado. Es el método documentado por Microsoft (IShellDispatch2 del escritorio).
#[cfg(windows)]
fn desktop_open(url: &str) -> windows::core::Result<()> {
    use windows::core::{Interface, BSTR};
    use windows::Win32::System::Com::*;
    use windows::Win32::System::Variant::VARIANT;
    use windows::Win32::UI::Shell::*;
    unsafe {
        let init = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let r = (|| {
            let sw: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_LOCAL_SERVER)?;
            let loc = VARIANT::from(CSIDL_DESKTOP as i32);
            let mut hwnd = 0i32;
            let disp = sw.FindWindowSW(&loc, &VARIANT::default(), SWC_DESKTOP, &mut hwnd, SWFO_NEEDDISPATCH)?;
            let browser: IShellBrowser = disp.cast::<IServiceProvider>()?.QueryService(&SID_STopLevelBrowser)?;
            let view: IShellFolderViewDual = browser.QueryActiveShellView()?.GetItemObject::<IDispatch>(SVGIO_BACKGROUND)?.cast()?;
            let shell: IShellDispatch2 = view.Application()?.cast()?;
            let none = VARIANT::default();
            shell.ShellExecute(&BSTR::from(url), &none, &none, &VARIANT::from(BSTR::from("open")), &VARIANT::from(1i32))
        })();
        if init.is_ok() {
            CoUninitialize();
        }
        r
    }
}

/// Abre una página https en el navegador predeterminado, sin heredar los permisos de
/// administrador de la app.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let ok = url.starts_with("https://")
        && url.len() < 2048
        && !url.chars().any(|c| c.is_whitespace() || c == '"' || c.is_control());
    if !ok {
        return Err("url inválida".into());
    }
    // En su propio hilo: COM necesita su apartamento y así no se traba la ventana.
    #[cfg(windows)]
    {
        let u = url.clone();
        if std::thread::spawn(move || desktop_open(&u).is_ok()).join().unwrap_or(false) {
            return Ok(());
        }
    }
    // Respaldo (sin escritorio accesible, p. ej. la app abierta con otra cuenta):
    // Explorer en algunas PCs abre una carpeta en vez del navegador, por eso va segundo.
    std::process::Command::new("explorer.exe")
        .arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rechaza_hosts_no_permitidos() {
        let r = tauri::async_runtime::block_on(drivers_fetch("https://example.com/x".into()));
        assert!(r.is_err());
        let r = tauri::async_runtime::block_on(drivers_fetch("http://www.asus.com/x".into()));
        assert!(r.is_err());
        assert!(open_url("https://a.com/x y".into()).is_err());
        assert!(open_url("file:///C:/Windows".into()).is_err());
    }

    // Abre de verdad una pestaña en el navegador predeterminado (por el escritorio, no Explorer).
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn abre_en_el_navegador() {
        desktop_open("https://www.gigabyte.com/Search?kw=B550M%20AORUS%20ELITE").unwrap();
    }

    // Consulta real a las fuentes oficiales (requiere internet): cargo test -- --ignored
    #[test]
    #[ignore]
    fn consulta_asus_y_nvidia() {
        let asus = tauri::async_runtime::block_on(drivers_fetch(
            "https://www.asus.com/support/api/product.asmx/GetPDDrivers?website=global&model=PRIME%20H610M-K%20D4&osid=45".into(),
        )).expect("asus");
        assert!(asus.contains("\"Obj\""));
        let nv = tauri::async_runtime::block_on(drivers_fetch(
            "https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php?func=DriverManualLookup&psid=120&pfid=933&osID=57&languageCode=1033&isWHQL=1&dch=1&sort1=0&numberOfResults=1".into(),
        )).expect("nvidia");
        assert!(nv.contains("\"Version\""));
        let cat = tauri::async_runtime::block_on(drivers_fetch(
            "https://www.nvidia.com/Download/API/lookupValueSearch.aspx?TypeID=3".into(),
        )).expect("catalogo");
        assert!(cat.contains("GeForce RTX 3070"));
    }
}
