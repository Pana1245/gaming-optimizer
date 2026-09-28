<div align="center">

# 🐺 Gaming Optimizer

**Optimizador de Windows para gaming** — rápido, **reversible** y con un diseño minimalista.

![Plataforma](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?logo=windows)
![Stack](https://img.shields.io/badge/Tauri%20%2B%20React%20%2B%20Rust-24C8DB)
![Idioma](https://img.shields.io/badge/ES%20%7C%20EN%20%7C%20PT-3%20idiomas-9C27B0)
![Licencia](https://img.shields.io/badge/Licencia-MIT-00e676)
<br>
![Descargas totales](https://img.shields.io/github/downloads/Pana1245/gaming-optimizer/total?label=descargas&logo=github&color=00e676)
![Última versión](https://img.shields.io/github/v/release/Pana1245/gaming-optimizer?label=versión&color=0078D6)
![Descargas último release](https://img.shields.io/github/downloads/Pana1245/gaming-optimizer/latest/total?label=último%20release&color=24C8DB)

</div>

---

## 🌐 Sitio web

**[pana1245.github.io/gaming-optimizer](https://pana1245.github.io/gaming-optimizer/)** — página oficial con capturas y descarga.

## ⬇️ Descargar

Bajá el instalador desde la sección [**Releases**](https://github.com/Pana1245/gaming-optimizer/releases/latest):
el **instalador moderno** `GamingOptimizer-Installer.exe` (recomendado) o el clásico `GamingOptimizer_x64-setup.exe`.

> **SmartScreen** puede avisar *"Windows protegió tu PC"* porque el instalador está auto-firmado.
> Elegí **"Más información" → "Ejecutar de todas formas"**. Una vez instalado, se **auto-actualiza** solo.

---

## ✨ Características

| Sección | Qué hace |
|---|---|
| 📊 **Panel** | Tu sistema de un vistazo: puntaje de optimización, uso en vivo de CPU/RAM/disco, temperaturas reales y accesos rápidos (**RAM Booster**, test de velocidad…). |
| 🩺 **Chequeo de PC** | Encuentra lo que le quita rendimiento a tu PC: **monitor a menos Hz** de los que soporta (se arregla con un clic), **RAM sin XMP/EXPO** o en single channel, **salud de los discos** estilo CrystalDiskInfo (SMART, sectores dañados, desgaste, temperatura), driver de video viejo, plan de energía, Modo de juego, memoria virtual e inicio. |
| 🎯 **Perfiles** | Configuraciones completas con un clic (Competitivo, Streaming, Equilibrado, Ahorro). Todo reversible. |
| 🚀 **Optimizaciones** | +60 tweaks de rendimiento, red y privacidad. Backup + punto de restauración automático. Etiqueta **Avanzado** en los ajustes sensibles. |
| 🖥️ **Gráficos** | Tweaks universales de GPU + máximo rendimiento NVIDIA/AMD y monitor en vivo por `nvidia-smi`. |
| 🛡️ **Motor de Cambios** | Aplica tweaks **leyendo el valor previo, verificando que quedó, y con historial para deshacer uno por uno**. Auditado y reversible. Incluye desactivar **VBS / Integridad de memoria** (más FPS en Windows 11). |
| 🎮 **Auto Game-Mode** | Un daemon detecta cuándo abrís un juego, activa el modo gamer y **revierte solo** al cerrarlo. Queda en la **bandeja del sistema** y puede **iniciar con Windows**. |
| 🌐 **Red** | **Test de velocidad real** (16 descargas / 10 subidas en paralelo, velocímetro en vivo, ping, jitter y bufferbloat), **test de conexión para jugar** (jitter y pérdida hacia internet y hacia tu router) y cambio de DNS. |
| 🧹 **Limpieza** | Analiza y libera espacio (temporales, cachés, papelera…). Muestra los MB liberados. |
| ⏻ **Inicio** | Gestor de programas de arranque con interruptores (no destructivo). |
| 📦 **Instalar Apps** | ~87 apps vía `winget` — **instalación forzosa** que evita el bug de la Microsoft Store, con reintento. |
| 🗑️ **Desinstalar** | Quita programas + **Force Removal** de restos (estilo Geek Uninstaller). Quita bloatware. |
| ↩️ **Restaurar** | Restaura backups del registro y puntos de restauración. |
| 🔧 **Reparar** | SFC, DISM (salida **en vivo**), reset de red, reiniciar Explorer. |
| 🛟 **Reactivar** | Para el usuario **no técnico**: vuelve a activar con un clic lo que se haya desactivado — Bluetooth, permisos de apps, impresora, búsqueda, antivirus, plan de energía, OneDrive. |
| 🔧 **Herramientas** | Control de Windows Update + desbloqueo de archivos en uso (Restart Manager). |
| 📊 **Sistema** | Monitor CPU/RAM/SSD en tiempo real + info de hardware. |

Además: **auto-actualización** (con botón manual "Buscar actualizaciones"), **notificaciones**, **idioma ES/EN/PT**, buscador de secciones (**Ctrl+K**), barra de título custom y guía integrada.

---

## 📸 Capturas

<div align="center">
  <img src="docs/img/panel.png" width="82%" alt="Panel de Gaming Optimizer" />
</div>

<table>
  <tr>
    <td width="50%"><img src="docs/img/chequeo.png" alt="Chequeo de PC" /><p align="center"><b>Chequeo de PC 🩺</b></p></td>
    <td width="50%"><img src="docs/img/red.png" alt="Test de velocidad" /><p align="center"><b>Red · Test de velocidad</b></p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/img/optimizaciones.png" alt="Optimizaciones" /><p align="center"><b>Optimizaciones</b></p></td>
    <td width="50%"><img src="docs/img/gamemode.png" alt="Auto Game-Mode" /><p align="center"><b>Auto Game-Mode 🎮</b></p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/img/graficos.png" alt="Gráficos · GPU" /><p align="center"><b>Gráficos · GPU</b></p></td>
    <td width="50%"><img src="docs/img/motor.png" alt="Motor de Cambios" /><p align="center"><b>Motor de Cambios 🛡️</b></p></td>
  </tr>
</table>

---

## 🛠️ Stack

- **Frontend:** React + TypeScript + Tailwind CSS v4 + Framer Motion
- **Backend:** Rust (Tauri v2)
- **Tamaño:** ~5 MB de instalador · usa el WebView2 del sistema (no empaqueta navegador)

## 🚀 Build desde el código

```bash
# Requisitos: Node.js, Rust (rustup) y las build tools de MSVC
npm install
npm run tauri build
```

El instalador queda en `src-tauri/target/release/bundle/nsis/`.

## 🔄 Auto-actualización

La app consulta las **Releases** de este repo y se actualiza sola (o con el botón **Buscar actualizaciones** de la barra inferior). Cada versión publica tres assets: `*-setup.exe`, `*-setup.exe.sig` y `latest.json`.

---

## 🔏 Firma de código · Code Signing

Windows code signing for **Gaming Optimizer** is provided free of charge by
[**SignPath.io**](https://about.signpath.io/), with a free code signing certificate
from the [**SignPath Foundation**](https://signpath.org/).

> Gaming Optimizer usa el programa de firma gratuita de la **SignPath Foundation** para
> firmar sus instaladores. Hasta que la firma esté activa en cada release, SmartScreen puede
> seguir avisando (ver arriba).

---

## 🙏 Créditos

Algunos tweaks de la categoría **"Más Tweaks · WinUtil"** fueron adaptados de
[**WinUtil**](https://github.com/ChrisTitusTech/winutil) de **Chris Titus Tech** (licencia MIT).
Ver [`CREDITS.md`](CREDITS.md).

## ⚠️ Aviso

Esta herramienta modifica ajustes del sistema (registro, servicios, etc.) y requiere permisos de
administrador. Aunque crea backups automáticos y casi todo es reversible (Motor + sección Reactivar),
algunos tweaks marcados como avanzados 🟡 son agresivos — **usala bajo tu responsabilidad**.

## 🔒 Privacidad

Gaming Optimizer **no recolecta ni transmite ningún dato personal** — todo corre localmente en tu
PC. Ver [`PRIVACY.md`](PRIVACY.md).

## 📄 Licencia

MIT © Dani Dev — ver [`LICENSE`](LICENSE).
