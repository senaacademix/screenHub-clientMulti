# 🖥️ ScreenHub Client - Cliente Kiosco & Digital Signage Multiplataforma (Tauri v2 + SQLite)

Aplicación cliente de escritorio de alto rendimiento para **Digital Signage y Modo Kiosco Multiplataforma (Linux & Windows)**, desarrollada en **Tauri v2 (Rust)**, **WebKitGTK (Linux)** y **Microsoft Edge WebView2 (Windows)**. Diseñada para reproducción continua 24/7 de contenido multimedia (video, audio, HTML5), con base de datos **SQLite integrada**, almacenamiento de datos estándar por sistema operativo (XDG / AppData), caché local persistente de 2 GB, indicador flotante de fuente, barra de progreso de almacenamiento y resiliencia total ante pérdidas de red.

---

## 📋 Requisitos del Sistema

### 🐧 Linux (Ubuntu, Debian, Fedora, Arch Linux)
- **Sistema Operativo:** Distribución Linux de 64-bit con soporte para X11 o Wayland.
- **Motor de Renderizado:** WebKitGTK (`webkit2gtk-4.1`).
- **Códecs Multimedia (GStreamer):** Esencial para la reproducción fluida de audio y video HTML5/MP4 en el reproductor.

#### Instalación de Dependencias por Distribución:

- **Arch Linux / Manjaro:**
  ```bash
  sudo pacman -S --needed webkit2gtk-4.1 base-devel openssl gstreamer gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav
  ```

- **Ubuntu / Debian / Linux Mint:**
  ```bash
  sudo apt-get update && sudo apt-get install -y \
    libwebkit2gtk-4.1-dev \
    build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
    gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav
  ```

- **Fedora / RHEL:**
  ```bash
  sudo dnf install -y \
    webkit2gtk4.1-devel openssl-devel \
    gstreamer1-plugins-good gstreamer1-plugins-bad-free gstreamer1-plugins-ugly-free gstreamer1-libav
  ```

### 🪟 Windows
- **Sistema Operativo:** Windows 10 / Windows 11 (64-bit).
- **Motor de Renderizado:** Microsoft Edge (WebView2 Runtime) preinstalado.
- **Para Compilación:** Rust Core (`rustup` / `cargo`), Node.js (v18+) y Visual Studio C++ Build Tools.

---

## 📁 Estructura del Proyecto

```
screenhub-client/
├── screenhub-client              # [EJECUTABLE LINUX] Binario nativo ELF 64-bit compilado
├── screenhub-client.exe          # [EJECUTABLE WINDOWS] Binario nativo PE 64-bit compilado
├── screenhub.db                  # [BASE DE DATOS LOCAL] Configuración SQLite para desarrollo/portable
├── build.sh                      # [LINUX] Script de compilación y empaquetado nativo
├── run-kiosk.sh                  # [LINUX] Lanzador en Modo Kiosco con soporte X11 y fallback
├── build.bat                     # [WINDOWS] Script de compilación limpia y copia automatizada
├── run-kiosk.bat                 # [WINDOWS] Lanzador directo en Modo Kiosco
├── package.json                  # Scripts de automatización y dependencias Tauri CLI v2
├── README.md                     # Manual de arquitectura e instrucciones
├── ui/                           # Interfaz local, ServiceWorker y panel de configuración
│   ├── index.html                # HTML5 reproductor Kiosco, iframe y modales
│   ├── style.css                 # Estilos oscuros glassmorphism y animaciones
│   ├── app.js                    # Captura de atajos, control de red, IPC Tauri y barra de caché
│   └── sw.js                     # Service Worker de caché inteligente para medios offline
└── src-tauri/                    # Backend nativo en Rust (Tauri v2)
    ├── Cargo.toml                # Manifiesto de dependencias Rust (Tauri v2 + rusqlite)
    ├── build.rs                  # Directivas de re-empaquetado de activos frontend
    ├── tauri.conf.json           # Configuración base de la ventana nativa
    ├── capabilities/
    │   └── default.json          # Permisos de IPC y control dinámico de ventana
    └── src/
        ├── lib.rs                # Lógica SQLite, resolución de rutas XDG/AppData y comandos IPC
        └── main.rs               # Punto de entrada principal
```

---

## 🛠️ Instrucciones de Compilación y Ejecución

### 🐧 En Linux

#### 1. Iniciar en Modo Kiosco (Producción)
Ejecuta el script lanzador (configura automáticamente permisos y backend de ventana):
```bash
./run-kiosk.sh
```
> **Nota de Fallback:** Si el binario nativo no ha sido compilado aún, el script intentará iniciar de forma transparente en modo quiosco utilizando Chromium o Google Chrome.

#### 2. Compilar desde Código Fuente
Para compilar el binario nativo optimizado (`release`) y copiarlo a la raíz del proyecto:
```bash
./build.sh
```
O directamente mediante Cargo:
```bash
cd src-tauri
cargo build --release
cp target/release/screenhub-client ../screenhub-client
```

#### 3. Modo Desarrollo en Caliente (Hot-Reload)
Para depurar y editar la interfaz web en tiempo real:
```bash
npm run dev
# o con tauri cli:
npx tauri dev
```

---

### 🪟 En Windows

#### 1. Iniciar en Modo Kiosco (Producción)
Haz doble clic sobre `screenhub-client.exe` o ejecuta desde el CMD / PowerShell:
```cmd
.\run-kiosk.bat
```

#### 2. Compilar desde Código Fuente
Ejecuta el script por lotes:
```cmd
.\build.bat
```
El script compilará con `cargo build --release`, purgará la caché de WebView2 para reflejar cambios en la UI y colocará `screenhub-client.exe` en la raíz.

#### 3. Modo Desarrollo en Caliente
```cmd
npm run dev
```

---

## 🧪 Pruebas Automatizadas y Verificación (Unit Tests)

El cliente incluye una suite de pruebas unitarias integradas en Rust para garantizar la resiliencia de la base de datos, los valores predeterminados y la resolución de rutas en cualquier sistema operativo.

Para ejecutar los tests automatizados:

```bash
# Desde la raíz del proyecto:
cargo test --manifest-path src-tauri/Cargo.toml

# O dentro del directorio src-tauri:
cd src-tauri
cargo test
```

### Pruebas que se ejecutan:
1. **`test_app_config_default`**: Verifica que la configuración inicial contenga valores válidos (URL, modo Kiosco, intervalo de reintento de 5s, pantalla completa habilitada).
2. **`test_sqlite_in_memory_crud`**: Valida la creación de la tabla `settings`, operaciones de inserción, actualización y lectura en SQLite sin tocar el disco.
3. **`test_db_path_resolution`**: Verifica que la resolución de la ruta de la base de datos apunte correctamente a `screenhub.db` respetando las directivas del sistema operativo.

---

## ⚙️ Persistencia de Datos y Base de Datos SQLite

La configuración se almacena en SQLite en la tabla `settings`. La ubicación del archivo `screenhub.db` se resuelve de forma automática y segura según el entorno:

1. **Linux (Producción / Instalación de Sistema):**
   - Ruta estándar XDG: `~/.local/share/screenhub-client/screenhub.db` (evita errores de permisos en montajes `/usr/bin/` o paquetes `AppImage`).
2. **Windows (Producción):**
   - Ruta estándar AppData: `%APPDATA%\screenhub-client\screenhub.db`.
3. **Modo Desarrollo / Portable:**
   - Si existe un archivo `screenhub.db` en la carpeta raíz con permisos de escritura, la aplicación lo utiliza de forma prioritaria.
4. **Anulación por Variable de Entorno:**
   - Puedes definir una ruta personalizada mediante:
     ```bash
     export SCREENHUB_DB_PATH="/ruta/personalizada/screenhub.db"
     ```

### 🔑 Atajo de Teclado de Administración
Presiona en cualquier momento durante la reproducción:
- **`Ctrl` + `Shift` + `M`**

Si se ha configurado un **PIN de Seguridad**, la aplicación solicitará el código antes de desplegar el panel. También se puede abrir haciendo clic directo sobre la insignia flotante de fuente.

---

## 🚀 Despliegue Kiosco 24/7 en Linux (Autostart)

Para configurar el cliente para que arranque automáticamente al encender una pantalla o Raspberry Pi / PC con Linux:

### Opción A: Archivo Autostart XDG Desktop
Crea el archivo `~/.config/autostart/screenhub-kiosk.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=ScreenHub Kiosk
Exec=/home/usuario/screenhub-client/run-kiosk.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
```

### Opción B: Servicio de Usuario Systemd
Crea el archivo `~/.config/systemd/user/screenhub.service`:

```ini
[Unit]
Description=ScreenHub Signage Kiosk Client
After=graphical-session.target

[Service]
Type=simple
Environment=DISPLAY=:0
Environment=GDK_BACKEND=x11
WorkingDirectory=/home/usuario/screenhub-client
ExecStart=/home/usuario/screenhub-client/run-kiosk.sh
Restart=always
RestartSec=5

[Install]
WantedBy=graphical-session.target
```

Habilita e inicia el servicio:
```bash
systemctl --user enable --now screenhub.service
```
