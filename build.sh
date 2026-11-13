#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "========================================================"
echo "  Compilando ScreenHub Client Nativo (Linux Release)"
echo "========================================================"

cd "$SCRIPT_DIR/src-tauri"

cargo build --release

BIN_SOURCE="$SCRIPT_DIR/src-tauri/target/release/screenhub-client"
BIN_DEST="$SCRIPT_DIR/screenhub-client"

if [ -f "$BIN_SOURCE" ]; then
    echo "Copiando binario a la raíz del proyecto..."
    cp --remove-destination "$BIN_SOURCE" "$BIN_DEST"
    chmod +x "$BIN_DEST"
    echo "========================================================"
    echo "  Compilación exitosa."
    echo "  Ejecutable disponible en: $BIN_DEST"
    echo "========================================================"
else
    echo "Error: No se encontró el binario compilado en $BIN_SOURCE"
    exit 1
fi
