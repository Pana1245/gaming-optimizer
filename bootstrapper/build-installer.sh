#!/usr/bin/env bash
# Genera el instalador moderno de un solo archivo (GamingOptimizer-Installer.exe).
#
#   Pasos:
#   1. Buildea el NSIS real de la app (firmado, para que el auto-update siga andando).
#   2. Copia ese setup.exe dentro del bootstrapper (se embebe vía include_bytes!).
#   3. Buildea el bootstrapper release -> exe único con el NSIS adentro.
#
# Uso:  bash bootstrapper/build-installer.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"          # .../tauri-app/bootstrapper
APP="$(cd "$HERE/.." && pwd)"                   # .../tauri-app
cd "$APP"

VER="$(node -p "require('./src-tauri/tauri.conf.json').version")"
echo "== Gaming Optimizer Installer v$VER =="

echo "[1/3] Buildeando NSIS firmado..."
export TAURI_SIGNING_PRIVATE_KEY="$(cat ../updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run tauri build

SETUP="src-tauri/target/release/bundle/nsis/GamingOptimizer_${VER}_x64-setup.exe"
[ -f "$SETUP" ] || { echo "ERROR: no se encontró $SETUP"; exit 1; }

echo "[2/3] Embebiendo setup.exe en el bootstrapper..."
cp "$SETUP" "$HERE/src-tauri/embedded/setup.exe"

echo "[3/3] Buildeando el bootstrapper (release)..."
# Mantener la versión del bootstrapper en sync con la app.
cd "$HERE/src-tauri"
cargo build --release
OUT_DIR="target/release"
cp "$OUT_DIR/go-installer.exe" "$OUT_DIR/GamingOptimizer-Installer.exe"

echo ""
echo "LISTO -> $HERE/src-tauri/$OUT_DIR/GamingOptimizer-Installer.exe"
echo "(recordá bumpear 'version' en bootstrapper/src-tauri/{Cargo.toml,tauri.conf.json} al subir de versión)"
