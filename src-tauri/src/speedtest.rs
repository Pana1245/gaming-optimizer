//! Test de velocidad REAL contra la red de Cloudflare (el mismo backend que usa
//! speed.cloudflare.com; elige solo el servidor más cercano). Satura la línea con
//! varias conexiones en paralelo: primero bajada, después subida, 10 s cada una.
//! Los primeros 2 s de cada fase no cuentan (arranque lento de TCP), como en los
//! medidores serios. Además mide la latencia en reposo y BAJO CARGA (bufferbloat:
//! el ping que tenés cuando la línea está llena, lo que se siente al jugar si
//! alguien descarga en la casa).
//!
//! Progreso en vivo por el evento "speed-progress"; resultado final por "speed-done".

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use bytes::Bytes;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const BASE: &str = "https://speed.cloudflare.com";
const DOWN_STREAMS: usize = 8;
const UP_STREAMS: usize = 6;
const PHASE_SECS: f64 = 10.0;
const WARMUP_SECS: f64 = 2.0;
const DOWN_REQ_BYTES: u64 = 25_000_000;
const UP_REQ_BYTES: usize = 8 * 1024 * 1024;
const UP_CHUNK: usize = 64 * 1024;

static RUNNING: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone)]
struct Progress {
    phase: &'static str,
    mbps: f64,
    pct: f64,
}

#[derive(Serialize, Clone, Default)]
pub struct SpeedResult {
    ok: bool,
    cancelled: bool,
    /// Clave de i18n (vacía si no hubo error).
    error: String,
    down_mbps: f64,
    up_mbps: f64,
    ping_ms: f64,
    down_loaded_ms: f64,
    up_loaded_ms: f64,
    bytes_used: u64,
    colo: String,
    country: String,
}

fn cancelled() -> bool {
    CANCEL.load(Ordering::Relaxed)
}

fn median(mut v: Vec<f64>) -> f64 {
    if v.is_empty() {
        return 0.0;
    }
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = v.len();
    if n % 2 == 1 { v[n / 2] } else { (v[n / 2 - 1] + v[n / 2]) / 2.0 }
}

fn round1(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}

fn client() -> Option<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .pool_max_idle_per_host(16)
        .user_agent("GamingOptimizer-speedtest")
        .build()
        .ok()
}

/// Tiempo de ida y vuelta de un pedido vacío en una conexión ya abierta, descontando
/// lo que el servidor tardó en procesarlo (cabecera Server-Timing, como hace
/// speed.cloudflare.com): queda la latencia de red real.
async fn latency_once(c: &reqwest::Client) -> Option<f64> {
    let t = Instant::now();
    let resp = tokio::time::timeout(Duration::from_secs(3), c.get(format!("{BASE}/__down?bytes=0")).send())
        .await
        .ok()?
        .ok()?;
    let ms = t.elapsed().as_secs_f64() * 1000.0;
    // Ej: "cfSpeedEdge;dur=2, cfSpeedWorker;dur=19" → se suman todas las etapas.
    let server_ms: f64 = resp
        .headers()
        .get_all("server-timing")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(','))
        .filter_map(|m| m.split(';').find_map(|p| p.trim().strip_prefix("dur=")))
        .filter_map(|d| d.trim().parse::<f64>().ok())
        .sum();
    let _ = resp.bytes().await;
    Some((ms - server_ms).max(0.1))
}

/// Mide latencia en paralelo mientras la línea está saturada. Usa su propio cliente
/// para no esperar detrás de las conexiones ocupadas.
async fn probe_loop(stop: Arc<AtomicBool>) -> Vec<f64> {
    let mut v = Vec::new();
    let Some(c) = client() else { return v };
    // Dejar que la carga arranque antes de medir.
    tokio::time::sleep(Duration::from_millis(1500)).await;
    while !stop.load(Ordering::Relaxed) && !cancelled() {
        if let Some(ms) = latency_once(&c).await {
            v.push(ms);
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    v
}

async fn down_worker(c: reqwest::Client, counter: Arc<AtomicU64>, stop: Arc<AtomicBool>) {
    while !stop.load(Ordering::Relaxed) && !cancelled() {
        let req = c.get(format!("{BASE}/__down?bytes={DOWN_REQ_BYTES}")).send();
        // Un rechazo (403/429…) nunca se cuenta como datos: el cuerpo es un error.
        let resp = match tokio::time::timeout(Duration::from_secs(5), req).await {
            Ok(Ok(r)) if r.status().is_success() => Some(r),
            _ => None,
        };
        let Some(mut resp) = resp else {
            tokio::time::sleep(Duration::from_millis(250)).await;
            continue;
        };
        loop {
            if stop.load(Ordering::Relaxed) || cancelled() {
                return;
            }
            match tokio::time::timeout(Duration::from_secs(3), resp.chunk()).await {
                Ok(Ok(Some(b))) => {
                    counter.fetch_add(b.len() as u64, Ordering::Relaxed);
                }
                _ => break,
            }
        }
    }
}

async fn up_worker(c: reqwest::Client, counter: Arc<AtomicU64>, stop: Arc<AtomicBool>, chunk: Bytes) {
    let chunks = UP_REQ_BYTES / UP_CHUNK;
    while !stop.load(Ordering::Relaxed) && !cancelled() {
        let (cnt, st, ch) = (counter.clone(), stop.clone(), chunk.clone());
        // El cuerpo se genera en streaming y cuenta cada bloque a medida que la red lo
        // pide; si termina la fase, corta el cuerpo en el acto.
        let body = futures_util::stream::unfold(0usize, move |i| {
            let (cnt, st, ch) = (cnt.clone(), st.clone(), ch.clone());
            async move {
                if i >= chunks || st.load(Ordering::Relaxed) || cancelled() {
                    return None;
                }
                cnt.fetch_add(ch.len() as u64, Ordering::Relaxed);
                Some((Ok::<Bytes, std::io::Error>(ch), i + 1))
            }
        });
        let req = c
            .post(format!("{BASE}/__up"))
            .header("Content-Type", "application/octet-stream")
            .body(reqwest::Body::wrap_stream(body))
            .send();
        if !matches!(tokio::time::timeout(Duration::from_secs(20), req).await, Ok(Ok(_))) {
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }
}

/// Corre una fase (bajada o subida). Devuelve (Mbps, bytes totales, latencias bajo carga).
async fn run_phase(app: &AppHandle, phase: &'static str, streams: usize, chunk: Bytes) -> (f64, u64, Vec<f64>) {
    let counter = Arc::new(AtomicU64::new(0));
    let stop = Arc::new(AtomicBool::new(false));
    let Some(c) = client() else { return (0.0, 0, Vec::new()) };

    let mut workers = Vec::new();
    for _ in 0..streams {
        let (c, cnt, st) = (c.clone(), counter.clone(), stop.clone());
        workers.push(if phase == "download" {
            tauri::async_runtime::spawn(down_worker(c, cnt, st))
        } else {
            tauri::async_runtime::spawn(up_worker(c, cnt, st, chunk.clone()))
        });
    }
    let probe = tauri::async_runtime::spawn(probe_loop(stop.clone()));

    let start = Instant::now();
    let mut warm: Option<(f64, u64)> = None;
    let mut window: VecDeque<(f64, u64)> = VecDeque::new();
    loop {
        tokio::time::sleep(Duration::from_millis(250)).await;
        let t = start.elapsed().as_secs_f64();
        let b = counter.load(Ordering::Relaxed);
        if warm.is_none() && t >= WARMUP_SECS {
            warm = Some((t, b));
        }
        // Velocidad "en vivo": ventana deslizante de ~1 s.
        window.push_back((t, b));
        while window.len() > 5 {
            window.pop_front();
        }
        let (t0, b0) = *window.front().unwrap_or(&(0.0, 0));
        let live = if t > t0 { (b - b0) as f64 * 8.0 / (t - t0) / 1e6 } else { 0.0 };
        let _ = app.emit("speed-progress", Progress { phase, mbps: round1(live), pct: (t / PHASE_SECS).min(1.0) });
        if t >= PHASE_SECS || cancelled() {
            break;
        }
    }
    stop.store(true, Ordering::Relaxed);
    let end_t = start.elapsed().as_secs_f64();
    let end_b = counter.load(Ordering::Relaxed);
    for w in workers {
        w.abort();
    }
    let lat = probe.await.unwrap_or_default();
    let (wt, wb) = warm.unwrap_or((0.0, 0));
    let mbps = if end_t > wt { (end_b.saturating_sub(wb)) as f64 * 8.0 / (end_t - wt) / 1e6 } else { 0.0 };
    (mbps, end_b, lat)
}

async fn run(app: &AppHandle) -> SpeedResult {
    // reqwest viene sin proveedor criptográfico elegido (lo comparte con el updater).
    let _ = rustls::crypto::ring::default_provider().install_default();
    let mut r = SpeedResult::default();
    let Some(c) = client() else {
        r.error = "net.st.errConnect".into();
        return r;
    };

    // Servidor (colo = aeropuerto de la ubicación de Cloudflare) y país.
    let trace = tokio::time::timeout(Duration::from_secs(6), c.get(format!("{BASE}/cdn-cgi/trace")).send()).await;
    match trace {
        Ok(Ok(resp)) => {
            if let Ok(txt) = resp.text().await {
                for l in txt.lines() {
                    if let Some(v) = l.strip_prefix("colo=") { r.colo = v.to_string(); }
                    if let Some(v) = l.strip_prefix("loc=") { r.country = v.to_string(); }
                }
            }
        }
        _ => {
            r.error = "net.st.errConnect".into();
            return r;
        }
    }

    // Latencia en reposo.
    let _ = app.emit("speed-progress", Progress { phase: "ping", mbps: 0.0, pct: 0.0 });
    let mut pings = Vec::new();
    for _ in 0..8 {
        if let Some(ms) = latency_once(&c).await {
            pings.push(ms);
        }
    }
    r.ping_ms = round1(median(pings));

    // Bloque de subida pseudoaleatorio (que ninguna capa pueda comprimirlo).
    let mut buf = vec![0u8; UP_CHUNK];
    let mut x: u64 = 0x9E37_79B9_7F4A_7C15;
    for b in buf.iter_mut() {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        *b = x as u8;
    }
    let chunk = Bytes::from(buf);

    let (d, db, dl) = run_phase(app, "download", DOWN_STREAMS, chunk.clone()).await;
    r.down_mbps = round1(d);
    r.down_loaded_ms = round1(median(dl));
    r.bytes_used = db;
    if cancelled() {
        r.cancelled = true;
        return r;
    }
    let (u, ub, ul) = run_phase(app, "upload", UP_STREAMS, chunk).await;
    r.up_mbps = round1(u);
    r.up_loaded_ms = round1(median(ul));
    r.bytes_used = db + ub;
    r.cancelled = cancelled();
    r.ok = !r.cancelled && d > 0.0;
    if !r.ok && !r.cancelled {
        r.error = "net.st.errNoData".into();
    }
    r
}

/// Arranca el test en segundo plano. Devuelve false si ya hay uno corriendo.
#[tauri::command]
pub fn speed_test(app: AppHandle) -> bool {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return false;
    }
    CANCEL.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn(async move {
        let res = run(&app).await;
        RUNNING.store(false, Ordering::SeqCst);
        let _ = app.emit("speed-done", res);
    });
    true
}

#[tauri::command]
pub fn speed_cancel() {
    CANCEL.store(true, Ordering::SeqCst);
}
