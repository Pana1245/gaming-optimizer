<div align="center">

# 🐺 Gaming Optimizer

**Optimizador de Windows para gaming** — rápido, reversible y con un diseño minimalista.

![Plataforma](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?logo=windows)
![Stack](https://img.shields.io/badge/Tauri%20%2B%20React%20%2B%20Rust-24C8DB)
![Licencia](https://img.shields.io/badge/Licencia-MIT-00e676)

</div>

---

## ✨ Características

| Sección | Qué hace |
|---|---|
| 🚀 **Optimizaciones** | +60 tweaks de rendimiento, red y privacidad. Crea backup + punto de restauración automático. Etiquetas de riesgo 🟢/🟡. |
| 🛡️ **Motor de Cambios** | Aplica tweaks **leyendo el valor previo, verificando que quedó, y con historial para deshacer uno por uno**. Auditado y reversible. |
| 🎮 **Auto Game-Mode** | Un daemon detecta cuándo abrís un juego, activa el modo gamer y **revierte solo** al cerrarlo. |
| 🧹 **Limpieza** | Analiza y libera espacio (temporales, cachés, papelera…). Muestra los MB liberados. |
| ⏻ **Inicio** | Gestor de programas de arranque con interruptores. |
| 📦 **Instalar Apps** | ~96 apps vía `winget`, detecta las ya instaladas. |
| 🗑️ **Desinstalar** | Quita programas + **Force Removal** de restos (estilo Geek Uninstaller). Quita bloatware. |
| ↩️ **Restaurar** | Restaura backups del registro y puntos de restauración. |
| 🔧 **Reparar** | SFC, DISM (salida **en vivo**), reset de red, reiniciar Explorer. |
| 📊 **Sistema** | Monitor CPU/RAM/SSD en tiempo real + info de hardware. |

Además: **auto-actualización**, **notificaciones**, **idioma ES/EN**, barra de título custom y guía integrada.

---

## 🛠️ Stack

- **Frontend:** React + TypeScript + Tailwind CSS v4 + Framer Motion
- **Backend:** Rust (Tauri v2)
- **Tamaño:** ~10–16 MB · usa el WebView2 del sistema (no empaqueta navegador)

## 🚀 Build desde el código

```bash
# Requisitos: Node.js, Rust (rustup) y las build tools de MSVC
npm install
npm run tauri build
```

El ejecutable queda en `src-tauri/target/release/`.

## 🔄 Auto-actualización

La app consulta las **Releases** de este repo y se actualiza sola. Cada versión publica:
`*-setup.exe`, `*-setup.exe.sig` y `latest.json`.

---

## 🙏 Créditos

Algunos tweaks de la categoría **"Más Tweaks · WinUtil"** fueron adaptados de
[**WinUtil**](https://github.com/ChrisTitusTech/winutil) de **Chris Titus Tech** (licencia MIT).
Ver [`CREDITS.md`](CREDITS.md).

## ⚠️ Aviso

Esta herramienta modifica ajustes del sistema (registro, servicios, etc.). Aunque crea backups
automáticos, **usala bajo tu responsabilidad**. Requiere permisos de administrador.

## 📄 Licencia

MIT © Dani Dev
