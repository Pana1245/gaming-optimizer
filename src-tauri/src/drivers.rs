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
fn desktop_open(url: &str, args: &str) -> windows::core::Result<()> {
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
            let argv = if args.is_empty() { VARIANT::default() } else { VARIANT::from(BSTR::from(args)) };
            shell.ShellExecute(&BSTR::from(url), &argv, &none, &VARIANT::from(BSTR::from("open")), &VARIANT::from(1i32))
        })();
        if init.is_ok() {
            CoUninitialize();
        }
        r
    }
}

/// Comando de apertura del navegador elegido para https (ej. ChromeHTML, MSEdgeHTM, FirefoxURL-…).
#[cfg(windows)]
fn default_browser() -> Option<String> {
    use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER};
    use winreg::RegKey;
    let prog: String = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice")
        .ok()?
        .get_value("ProgId")
        .ok()?;
    RegKey::predef(HKEY_CLASSES_ROOT).open_subkey(format!(r"{prog}\shell\open\command")).ok()?.get_value("").ok()
}

/// Separa `"C:\…\chrome.exe" --single-argument %1` en (exe, argumentos con la URL).
/// Los navegadores de la Tienda (sin .exe) devuelven None y se usa el respaldo siguiente.
fn browser_cmd(cmd: &str, url: &str) -> Option<(String, String)> {
    let cmd = cmd.trim();
    let (exe, rest) = match cmd.strip_prefix('"') {
        Some(r) => r.split_once('"')?,
        None => match cmd.to_ascii_lowercase().find(".exe") {
            Some(i) => cmd.split_at(i + 4),
            None => return None,
        },
    };
    if !exe.to_ascii_lowercase().ends_with(".exe") || !std::path::Path::new(exe).is_file() {
        return None;
    }
    // La URL ya viene validada (sin espacios ni comillas), se puede pegar tal cual.
    let args = if rest.contains("%1") || rest.contains("%L") {
        rest.replace("%1", url).replace("%L", url)
    } else {
        format!("{rest} \"{url}\"")
    };
    Some((exe.to_string(), args.trim().to_string()))
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
        if std::thread::spawn(move || desktop_open(&u, "").is_ok()).join().unwrap_or(false) {
            return Ok(());
        }
    }
    // Respaldo 1 (sin escritorio accesible, p. ej. la app abierta con otra cuenta): el .exe
    // del navegador predeterminado. Este sí hereda los permisos de administrador.
    #[cfg(windows)]
    if let Some((exe, args)) = default_browser().and_then(|c| browser_cmd(&c, &url)) {
        use std::os::windows::process::CommandExt;
        if std::process::Command::new(&exe).raw_arg(&args).spawn().is_ok() {
            return Ok(());
        }
    }
    // Respaldo 2: Explorer (en algunas PCs abre una carpeta en vez del navegador).
    std::process::Command::new(crate::sys_exe("explorer.exe", true))
        .arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// ¿Es un destino de juego permitido? Protocolos de launchers con su forma exacta, o un
/// .exe que existe. Los argumentos sólo con caracteres simples (los del Riot Client).
fn valid_launch(target: &str, args: &str) -> bool {
    let simple = |s: &str, extra: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || extra.contains(c));
    let ok_target = if let Some(id) = target.strip_prefix("steam://rungameid/") {
        !id.is_empty() && id.chars().all(|c| c.is_ascii_digit())
    } else if let Some(rest) = target.strip_prefix("com.epicgames.launcher://apps/") {
        rest.strip_suffix("?action=launch&silent=true").is_some_and(|id| simple(id, "%._-"))
    } else if let Some(app) = target.strip_prefix(r"shell:AppsFolder\") {
        simple(app, "._-!")
    } else {
        let p = std::path::Path::new(target);
        p.is_absolute() && target.to_ascii_lowercase().ends_with(".exe") && p.is_file() && !target.contains('"')
    };
    ok_target && (args.is_empty() || simple(args, " =._-"))
}

/// Lanza un juego como un doble clic en el escritorio: sin los permisos de administrador
/// de la app (el juego y su anti-cheat corren como el usuario, igual que desde su launcher).
#[tauri::command]
pub fn launch_game(target: String, args: Option<String>) -> Result<(), String> {
    let args = args.unwrap_or_default();
    if !valid_launch(&target, &args) {
        return Err("destino inválido".into());
    }
    #[cfg(windows)]
    {
        let (t, a) = (target.clone(), args.clone());
        if std::thread::spawn(move || desktop_open(&t, &a).is_ok()).join().unwrap_or(false) {
            return Ok(());
        }
    }
    // Sin escritorio accesible: los protocolos los resuelve Explorer; un .exe no se lanza
    // desde acá para no darle permisos de administrador al juego.
    if target.contains("://") || target.starts_with("shell:") {
        return std::process::Command::new(crate::sys_exe("explorer.exe", true)).arg(&target).spawn().map(|_| ()).map_err(|e| e.to_string());
    }
    Err("no se pudo lanzar el juego".into())
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

    #[test]
    fn valida_destinos_de_juegos() {
        assert!(valid_launch("steam://rungameid/730", ""));
        assert!(!valid_launch("steam://rungameid/730;calc", ""));
        assert!(valid_launch("com.epicgames.launcher://apps/fn%3A4fe75bbc%3AFortnite?action=launch&silent=true", ""));
        assert!(!valid_launch("com.epicgames.launcher://apps/x?action=uninstall", ""));
        assert!(valid_launch(r"shell:AppsFolder\Microsoft.MinecraftUWP_8wekyb3d8bbwe!Game", ""));
        assert!(!valid_launch(r"shell:AppsFolder\x & calc", ""));
        assert!(valid_launch(r"C:\Windows\notepad.exe", "--launch-product=valorant --launch-patchline=live"));
        assert!(!valid_launch(r"C:\Windows\notepad.exe", r#""; calc"#));
        assert!(!valid_launch(r"C:\no\existe.exe", ""));
        assert!(!valid_launch("https://evil.com", ""));
    }

    #[cfg(windows)]
    #[test]
    fn arma_el_comando_del_navegador() {
        let exe = r"C:\Windows\notepad.exe"; // existe en toda PC; lo que se prueba es el armado
        let u = "https://www.gigabyte.com/Search?kw=B550M%20AORUS";
        // Chrome / Edge
        assert_eq!(browser_cmd(&format!(r#""{exe}" --single-argument %1"#), u), Some((exe.into(), format!("--single-argument {u}"))));
        // Firefox
        assert_eq!(browser_cmd(&format!(r#""{exe}" -osint -url "%1""#), u), Some((exe.into(), format!(r#"-osint -url "{u}""#))));
        // Sin comillas y sin %1
        assert_eq!(browser_cmd(exe, u), Some((exe.into(), format!(r#""{u}""#))));
        // App de la Tienda / exe inexistente
        assert_eq!(browser_cmd("", u), None);
        assert_eq!(browser_cmd(r#""C:\no\existe.exe" %1"#, u), None);
    }

    // Lee el navegador predeterminado real de esta PC (no abre nada).
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn detecta_navegador_predeterminado() {
        let c = default_browser().expect("sin navegador predeterminado");
        println!("comando: {c}\narmado: {:?}", browser_cmd(&c, "https://www.gigabyte.com/"));
        assert!(browser_cmd(&c, "https://www.gigabyte.com/").is_some());
    }

    // Abre de verdad una pestaña en el navegador predeterminado (por el escritorio, no Explorer).
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn abre_en_el_navegador() {
        desktop_open("https://www.gigabyte.com/Search?kw=B550M%20AORUS%20ELITE", "").unwrap();
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
