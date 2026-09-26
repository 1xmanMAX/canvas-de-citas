#!/usr/bin/env bash
# Arma los archivos de una versión oficial en dist-release/<version>/:
#   CanvasDeCitas-Windows-<v>.zip (instalador + canvas-sincro.exe), CanvasDeCitas-Android-<v>.apk
#   (firmado con la llave oficial: android/android/firma.properties), CanvasDeCitas-web-<v>.zip
#   y SHA256SUMS.txt. Luego se publican con scripts/publicar-release.ps1 (en Windows) o gh.
# Necesita: Node, Rust con el target x86_64-pc-windows-gnu y mingw-w64, JDK 21 y Android SDK.
# Uso: scripts/empaquetar-release.sh v1.0.0
set -euo pipefail
V=${1:?Uso: scripts/empaquetar-release.sh v1.0.0}
RAIZ=$(cd "$(dirname "$0")/.." && pwd)
OUT="$RAIZ/dist-release/$V"
rm -rf "$OUT" && mkdir -p "$OUT/CanvasDeCitas-Windows"

# Windows: servidor de sincronización + instalador (PowerShell 5 necesita BOM y CRLF).
(cd "$RAIZ/receptor/sincro" && CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc cargo build --release --target x86_64-pc-windows-gnu)
W="$OUT/CanvasDeCitas-Windows"
cp "$RAIZ/receptor/sincro/target/x86_64-pc-windows-gnu/release/canvas-sincro.exe" "$RAIZ/app/public/icon.ico" "$W/"
for f in "$RAIZ"/instalador-windows/*; do
  n=$(basename "$f")
  case "$n" in
    *.ps1|*.txt) { printf '\xef\xbb\xbf'; sed 's/$/\r/' "$f"; } > "$W/$n" ;;
    *.cmd) sed 's/$/\r/' "$f" > "$W/$n" ;;
  esac
done
(cd "$OUT" && zip -qr "CanvasDeCitas-Windows-$V.zip" CanvasDeCitas-Windows && rm -rf CanvasDeCitas-Windows)

# Web y Android (el APK se firma solo si existe android/android/firma.properties).
(cd "$RAIZ/android" && npm run apk:oficial)
(cd "$RAIZ/app/dist" && touch .nojekyll && zip -qr "$OUT/CanvasDeCitas-web-$V.zip" .)
cp "$RAIZ/android/android/app/build/outputs/apk/release/app-release.apk" "$OUT/CanvasDeCitas-Android-$V.apk"

(cd "$OUT" && sha256sum *.zip *.apk > SHA256SUMS.txt && cat SHA256SUMS.txt)
echo "Listo en $OUT"
