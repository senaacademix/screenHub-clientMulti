#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================================"
echo "  Iniciando ScreenHub Client Kiosk (Linux)"
echo "========================================================"

# Si no hay GDK_BACKEND definido y hay servidor X11 disponible, forzar x11 para garantizar always-on-top
if [ -z "$GDK_BACKEND" ] && [ -n "$DISPLAY" ]; then
    export GDK_BACKEND="x11"
fi

# Verificar presencia de códecs multimedia en Linux (WebKitGTK requiere GStreamer para videos HTML5 y YouTube)
if command -v gst-inspect-1.0 >/dev/null 2>&1; then
    if ! gst-inspect-1.0 isomp4 >/dev/null 2>&1 || ! gst-inspect-1.0 avdec_h264 >/dev/null 2>&1; then
        echo "⚠️  [ScreenHub] ADVERTENCIA: Faltan decodificadores multimedia de GStreamer en el sistema."
        echo "    Para habilitar la reproducción de YouTube y video HTML5 en el cliente nativo:"
        echo "    - Arch Linux: sudo pacman -S --needed gst-plugins-good gst-libav gst-plugins-bad"
        echo "    - Ubuntu/Debian: sudo apt-get install gstreamer1.0-plugins-good gstreamer1.0-libav gstreamer1.0-plugins-bad"
        echo ""
    fi
fi

# Opción para forzar ejecución vía Chromium (--browser o -b)
if [ "$1" = "--browser" ] || [ "$1" = "-b" ]; then
    echo "Iniciando modo Kiosco mediante navegador Chromium..."
    DB_URL=""
    if command -v sqlite3 >/dev/null 2>&1 && [ -f "$SCRIPT_DIR/screenhub.db" ]; then
        DB_URL=$(sqlite3 "$SCRIPT_DIR/screenhub.db" "SELECT value FROM settings WHERE key='url';" 2>/dev/null)
    fi
    TARGET_URL="${DB_URL:-file://$SCRIPT_DIR/ui/index.html}"
    exec chromium --kiosk --noerrdialogs --disable-infobars --autoplay-policy=no-user-gesture-required "$TARGET_URL"
fi

BIN_ROOT="$SCRIPT_DIR/screenhub-client"
BIN_TARGET="$SCRIPT_DIR/src-tauri/target/release/screenhub-client"

if [ -x "$BIN_ROOT" ]; then
    echo "Iniciando cliente nativo desde raíz..."
    exec "$BIN_ROOT" "$@"
fi

if [ -x "$BIN_TARGET" ]; then
    echo "Iniciando cliente nativo desde target..."
    exec "$BIN_TARGET" "$@"
fi

echo "Binario nativo no encontrado. Probando fallback con navegador Chromium/Chrome..."
UI_INDEX="file://$SCRIPT_DIR/ui/index.html"
FLAGS="--kiosk --noerrdialogs --disable-infobars --no-first-run --autoplay-policy=no-user-gesture-required --disk-cache-size=2147483648"

if command -v chromium >/dev/null 2>&1; then
    exec chromium $FLAGS "$UI_INDEX"
elif command -v google-chrome >/dev/null 2>&1; then
    exec google-chrome $FLAGS "$UI_INDEX"
elif command -v brave >/dev/null 2>&1; then
    exec brave $FLAGS "$UI_INDEX"
else
    echo "Error: No se encontró ni el binario nativo ni un navegador basado en Chromium compatible."
    echo "Por favor compila el cliente ejecutando: ./build.sh"
    exit 1
fi
