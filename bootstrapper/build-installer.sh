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

echo "[2/3] Embebiendo setup.exe + WebView2 offline en el bootstrapper..."
mkdir -p "$HERE/src-tauri/embedded"
cp "$SETUP" "$HERE/src-tauri/embedded/setup.exe"
# Runtime COMPLETO de WebView2 (instalador offline oficial de Microsoft, ~210 MB,
# gitignoreado): el instalador anda sin internet y en Windows debloateados. Se baja si
# falta o si tiene más de 30 días (después WebView2 se actualiza solo en cada PC).
WV="$HERE/src-tauri/embedded/webview2offline.exe"
rm -f "$HERE/src-tauri/embedded/webview2setup.exe"   # el instalador online de antes
if [ ! -f "$WV" ] || [ -n "$(find "$WV" -mtime +30 2>/dev/null)" ]; then
  echo "  bajando WebView2 offline (x64)..."
  curl -fL --retry 3 -o "$WV.part" "https://go.microsoft.com/fwlink/?linkid=2124701"
  mv "$WV.part" "$WV"
fi
# Que sea de verdad el instalador de Microsoft (y no una página de error).
SIZE=$(wc -c < "$WV")
[ "$SIZE" -gt 100000000 ] || { echo "ERROR: $WV pesa $SIZE bytes (¿descarga cortada?)"; rm -f "$WV"; exit 1; }
if command -v powershell.exe >/dev/null 2>&1; then
  SIG=$(powershell.exe -NoProfile -Command "\$s = Get-AuthenticodeSignature -LiteralPath '$(cygpath -w "$WV" 2>/dev/null || echo "$WV")'; if (\$s.Status -eq 'Valid' -and \$s.SignerCertificate.Subject -match 'O=Microsoft Corporation') { 'OK' } else { \$s.Status }" | tr -d '\r')
  [ "$SIG" = "OK" ] || { echo "ERROR: la firma de $WV no es válida de Microsoft ($SIG)"; rm -f "$WV"; exit 1; }
  echo "  WebView2 offline: firma de Microsoft OK ($((SIZE / 1048576)) MB)"
else
  echo "  AVISO: sin powershell.exe no se pudo verificar la firma de WebView2"
fi

echo "[3/3] Buildeando el bootstrapper (release)..."
# Mantener la versión del bootstrapper en sync con la app.
cd "$HERE/src-tauri"
cargo build --release
OUT_DIR="target/release"
cp "$OUT_DIR/go-installer.exe" "$OUT_DIR/GamingOptimizer-Installer.exe"

echo ""
echo "LISTO -> $HERE/src-tauri/$OUT_DIR/GamingOptimizer-Installer.exe (trae WebView2 adentro: ya no hace falta subir WebView2-Runtime-x64-offline.exe)"
echo "(recordá bumpear 'version' en bootstrapper/src-tauri/{Cargo.toml,tauri.conf.json} al subir de versión)"
