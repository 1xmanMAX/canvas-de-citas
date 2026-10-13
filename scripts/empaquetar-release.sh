#!/usr/bin/env bash
# Arma los archivos de una versión oficial en dist-release/<version>/:
#   CanvasDeCitas-Instalar-Windows-<v>.exe (instalador de un solo archivo, Inno Setup), CanvasDeCitas-Android-<v>.apk
#   (firmado con la llave oficial: android/android/firma.properties), CanvasDeCitas-web-<v>.zip
#   y SHA256SUMS.txt. Luego se publican con scripts/publicar-release.ps1 (en Windows) o gh.
# Necesita: Node, Rust (en Linux: target x86_64-pc-windows-gnu y mingw-w64), Inno Setup 6 (iscc; en
# Windows: scoop install inno-setup), JDK 21 y Android SDK.
# Uso: scripts/empaquetar-release.sh v1.0.0
set -euo pipefail
V=${1:?Uso: scripts/empaquetar-release.sh v1.0.0}
RAIZ=$(cd "$(dirname "$0")/.." && pwd)
OUT="$RAIZ/dist-release/$V"
rm -rf "$OUT" && mkdir -p "$OUT/CanvasDeCitas-Windows"

# La app web primero: el exe lleva app/dist dentro (escritorio/build.rs).
(cd "$RAIZ/app" && npm run build)

# Windows: la app (Canvas de Citas.exe: ventana WebView2 con la app incluida + sincronización por Wi-Fi) + instalador
# (PowerShell 5 necesita BOM y CRLF). En Windows se compila con MSVC; en Linux, con mingw.
if [ "${OS:-}" = "Windows_NT" ]; then
  (cd "$RAIZ/escritorio" && cargo build --release)
  EXE="$RAIZ/escritorio/target/release/canvas-de-citas.exe"
else
  (cd "$RAIZ/escritorio" && CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc cargo build --release --target x86_64-pc-windows-gnu)
  EXE="$RAIZ/escritorio/target/x86_64-pc-windows-gnu/release/canvas-de-citas.exe"
fi
W="$OUT/CanvasDeCitas-Windows"
cp "$EXE" "$W/Canvas de Citas.exe"
cp "$RAIZ/app/public/icon.ico" "$W/"
for f in "$RAIZ"/instalador-windows/*; do
  n=$(basename "$f")
  case "$n" in
    *.ps1|*.txt) { printf '\xef\xbb\xbf'; sed 's/$/\r/' "$f"; } > "$W/$n" ;;
    *.cmd) sed 's/$/\r/' "$f" > "$W/$n" ;;
  esac
done
# Un solo .exe que instala con doble clic (instalador-windows/canvas-de-citas.iss).
if command -v cygpath >/dev/null; then ruta() { cygpath -w "$1"; }; else ruta() { echo "$1"; }; fi
MSYS2_ARG_CONV_EXCL="*" iscc /Q "/DVersion=${V#v}" "/DOrigen=$(ruta "$W")" "/DSalida=$(ruta "$OUT")" "$(ruta "$RAIZ/instalador-windows/canvas-de-citas.iss")"
rm -rf "$W"

# Web y Android (el APK se firma solo si existe android/android/firma.properties).
(cd "$RAIZ/android" && npm run apk:oficial)
(cd "$RAIZ/app/dist" && touch .nojekyll && zip -qr "$OUT/CanvasDeCitas-web-$V.zip" .)
cp "$RAIZ/android/android/app/build/outputs/apk/release/app-release.apk" "$OUT/CanvasDeCitas-Android-$V.apk"

(cd "$OUT" && sha256sum *.exe *.zip *.apk > SHA256SUMS.txt && cat SHA256SUMS.txt)
echo "Listo en $OUT"
