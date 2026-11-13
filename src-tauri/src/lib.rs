use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::Manager;

pub static DB_PATH: OnceLock<PathBuf> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct AppConfig {
    pub url: String,
    pub mode: String, // "kiosk" o "window"
    pub check_interval_seconds: u64,
    pub kiosk: bool,
    pub fullscreen: bool,
    pub window_width: u32,
    pub window_height: u32,
    pub pin_code: String,
    pub show_source_indicator: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            url: "http://localhost:3000/screens/sala-1".into(),
            mode: "kiosk".into(),
            check_interval_seconds: 5,
            kiosk: true,
            fullscreen: true,
            window_width: 1280,
            window_height: 720,
            pin_code: "".into(),
            show_source_indicator: false,
        }
    }
}

/// Resuelve la ruta adecuada de la base de datos SQLite de forma multiplataforma.
/// En producción utiliza los directorios estándar del sistema operativo (XDG en Linux, AppData en Windows).
pub fn get_db_path() -> PathBuf {
    if let Some(path) = DB_PATH.get() {
        return path.clone();
    }

    // 1. Variable de entorno explícita para pruebas o despliegues personalizados
    if let Ok(env_path) = std::env::var("SCREENHUB_DB_PATH") {
        let p = PathBuf::from(env_path);
        if let Some(parent) = p.parent() {
            let _ = fs::create_dir_all(parent);
        }
        return p;
    }

    // 2. Si existe un screenhub.db local con permisos de escritura (desarrollo o portable)
    let local = PathBuf::from("screenhub.db");
    if local.exists() && fs::OpenOptions::new().write(true).open(&local).is_ok() {
        return local;
    }

    // 3. Fallback a directorio estándar de datos del usuario según el sistema operativo
    let base_dir = if cfg!(target_os = "windows") {
        std::env::var("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| std::env::temp_dir())
            .join("screenhub-client")
    } else {
        std::env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                std::env::var("HOME")
                    .map(|h| PathBuf::from(h).join(".local").join("share"))
                    .unwrap_or_else(|_| std::env::temp_dir())
            })
            .join("screenhub-client")
    };

    let _ = fs::create_dir_all(&base_dir);
    base_dir.join("screenhub.db")
}

pub fn get_db_connection() -> Result<Connection, String> {
    let db_path = get_db_path();
    Connection::open(&db_path).map_err(|e| format!("Error abriendo base de datos SQLite en {:?}: {}", db_path, e))
}

pub fn init_sqlite_db() -> Result<(), String> {
    let conn = get_db_connection()?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Error creando tabla de configuración SQLite: {}", e))?;

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
        .unwrap_or(0);

    if count == 0 {
        let mut config = AppConfig::default();

        // Migración de legacy config.json si existe
        let possible_json_paths = vec![
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.join("config.json"))),
            Some(PathBuf::from("config.json")),
        ];

        for path in possible_json_paths.into_iter().flatten() {
            if path.exists() {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(legacy) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(u) = legacy.get("url").and_then(|v| v.as_str()) {
                            config.url = u.to_string();
                        }
                        if let Some(i) = legacy.get("check_interval_seconds").and_then(|v| v.as_u64()) {
                            config.check_interval_seconds = i;
                        }
                        if let Some(k) = legacy.get("kiosk").and_then(|v| v.as_bool()) {
                            config.kiosk = k;
                            config.mode = if k { "kiosk".into() } else { "window".into() };
                        }
                        break;
                    }
                }
            }
        }
        let _ = save_config_to_db(&conn, &config);
    }

    Ok(())
}

pub fn load_config_from_db(conn: &Connection) -> AppConfig {
    let get_val = |key: &str, default_val: &str| -> String {
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| default_val.to_string())
    };

    let url = get_val("url", "http://localhost:3000/screens/sala-1");
    let kiosk_val = get_val("kiosk", "true");
    let is_kiosk = kiosk_val == "true";
    let mode = if is_kiosk { "kiosk".to_string() } else { "window".to_string() };

    let check_interval_seconds = get_val("check_interval_seconds", "5")
        .parse::<u64>()
        .unwrap_or(5);
    let window_width = get_val("window_width", "1280")
        .parse::<u32>()
        .unwrap_or(1280);
    let window_height = get_val("window_height", "720")
        .parse::<u32>()
        .unwrap_or(720);
    let pin_code = get_val("pin_code", "");
    let show_source_indicator_val = get_val("show_source_indicator", "false");
    let show_source_indicator = show_source_indicator_val == "true";

    AppConfig {
        url,
        mode,
        check_interval_seconds,
        kiosk: is_kiosk,
        fullscreen: is_kiosk,
        window_width,
        window_height,
        pin_code,
        show_source_indicator,
    }
}

pub fn save_config_to_db(conn: &Connection, config: &AppConfig) -> Result<(), String> {
    let upsert = |key: &str, value: &str| -> Result<(), rusqlite::Error> {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    };

    let is_kiosk = config.kiosk;

    upsert("url", &config.url).map_err(|e| e.to_string())?;
    upsert("mode", if is_kiosk { "kiosk" } else { "window" }).map_err(|e| e.to_string())?;
    upsert("check_interval_seconds", &config.check_interval_seconds.to_string()).map_err(|e| e.to_string())?;
    upsert("kiosk", if is_kiosk { "true" } else { "false" }).map_err(|e| e.to_string())?;
    upsert("fullscreen", if is_kiosk { "true" } else { "false" }).map_err(|e| e.to_string())?;
    upsert("window_width", &config.window_width.to_string()).map_err(|e| e.to_string())?;
    upsert("window_height", &config.window_height.to_string()).map_err(|e| e.to_string())?;
    upsert("pin_code", &config.pin_code).map_err(|e| e.to_string())?;
    upsert("show_source_indicator", if config.show_source_indicator { "true" } else { "false" }).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn apply_window_settings(window: &tauri::WebviewWindow, config: &AppConfig) {
    if !config.kiosk || config.mode == "window" {
        let _ = window.set_fullscreen(false);
        let _ = window.set_always_on_top(false);
        let _ = window.set_decorations(true);
        let _ = window.set_resizable(true);
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: config.window_width as f64,
            height: config.window_height as f64,
        }));
        let _ = window.unmaximize();
        let _ = window.center();
    } else {
        let _ = window.set_decorations(false);
        let _ = window.set_resizable(false);
        let _ = window.set_fullscreen(true);
        let _ = window.set_always_on_top(true);
    }
}

/// Comando IPC para cargar la configuración desde la base de datos SQLite
#[tauri::command]
fn load_config() -> AppConfig {
    let _ = init_sqlite_db();
    if let Ok(conn) = get_db_connection() {
        load_config_from_db(&conn)
    } else {
        AppConfig::default()
    }
}

/// Comando IPC para guardar la configuración en la base de datos SQLite y actualizar la ventana
#[tauri::command]
fn save_config(window: tauri::WebviewWindow, config: AppConfig) -> Result<AppConfig, String> {
    let _ = init_sqlite_db();
    let conn = get_db_connection()?;
    save_config_to_db(&conn, &config)?;
    apply_window_settings(&window, &config);
    Ok(config)
}

/// Comando IPC para alternar el modo de ventana (Kiosco vs Prueba)
#[tauri::command]
fn set_window_mode(window: tauri::WebviewWindow, mode: String, width: Option<u32>, height: Option<u32>) -> Result<(), String> {
    let _ = init_sqlite_db();
    let conn = get_db_connection()?;
    let mut config = load_config_from_db(&conn);
    config.mode = mode;
    if let Some(w) = width { config.window_width = w; }
    if let Some(h) = height { config.window_height = h; }
    save_config_to_db(&conn, &config)?;
    apply_window_settings(&window, &config);
    Ok(())
}

/// Comando IPC para limpiar datos temporales y caché de navegación de WebView
#[tauri::command]
fn clear_cache(window: tauri::WebviewWindow) -> Result<(), String> {
    let _ = window.clear_all_browsing_data();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. Configuración de motor WebView según el sistema operativo
    #[cfg(target_os = "windows")]
    {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--autoplay-policy=no-user-gesture-required --no-user-gesture-required --disable-features=PreloadMediaEngagementData,AutoplayIgnoreWebAudio --disk-cache-size=2147483648 --media-cache-size=2147483648 --enable-aggressive-domstorage-flushing",
        );
    }

    #[cfg(target_os = "linux")]
    {
        // En Linux, si no se definió un backend específico y hay servidor X11 disponible,
        // usar X11 para garantizar always-on-top y control total de ventana en Modo Kiosco.
        if std::env::var("GDK_BACKEND").is_err() && std::env::var("SCREENHUB_USE_WAYLAND").is_err() {
            if std::env::var("DISPLAY").is_ok() {
                std::env::set_var("GDK_BACKEND", "x11");
            }
        }
    }

    let _ = init_sqlite_db();

    tauri::Builder::default()
        .setup(|app| {
            // Resolver y registrar directorio oficial de datos según Tauri v2
            if DB_PATH.get().is_none() {
                if let Ok(data_dir) = app.path().app_data_dir() {
                    let _ = fs::create_dir_all(&data_dir);
                    let target_db = data_dir.join("screenhub.db");
                    let local_db = PathBuf::from("screenhub.db");
                    // Si ya existía un screenhub.db en desarrollo y no en AppData, migrarlo
                    if !target_db.exists() && local_db.exists() {
                        let _ = fs::copy(&local_db, &target_db);
                    }
                    let _ = DB_PATH.set(target_db);
                }
            }

            let _ = init_sqlite_db();

            if let Some(window) = app.get_webview_window("main") {
                if let Ok(conn) = get_db_connection() {
                    let config = load_config_from_db(&conn);
                    apply_window_settings(&window, &config);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_config, save_config, set_window_mode, clear_cache])
        .run(tauri::generate_context!())
        .expect("Error al ejecutar la aplicación Kiosco de Tauri");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_config_default() {
        let config = AppConfig::default();
        assert_eq!(config.url, "http://localhost:3000/screens/sala-1");
        assert_eq!(config.mode, "kiosk");
        assert!(config.kiosk);
        assert!(config.fullscreen);
        assert_eq!(config.window_width, 1280);
        assert_eq!(config.window_height, 720);
        assert_eq!(config.check_interval_seconds, 5);
        assert_eq!(config.pin_code, "");
        assert!(!config.show_source_indicator);
    }

    #[test]
    fn test_sqlite_in_memory_crud() {
        let conn = Connection::open_in_memory().expect("Debe abrir conexión in-memory");
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        ).expect("Debe crear tabla");

        let initial_config = load_config_from_db(&conn);
        assert_eq!(initial_config.url, "http://localhost:3000/screens/sala-1");
        assert!(initial_config.kiosk);

        let custom_config = AppConfig {
            url: "https://ejemplo.com/pantalla-1".into(),
            mode: "window".into(),
            check_interval_seconds: 10,
            kiosk: false,
            fullscreen: false,
            window_width: 1920,
            window_height: 1080,
            pin_code: "9876".into(),
            show_source_indicator: true,
        };

        save_config_to_db(&conn, &custom_config).expect("Debe guardar config");

        let loaded = load_config_from_db(&conn);
        assert_eq!(loaded, custom_config);
    }

    #[test]
    fn test_db_path_resolution() {
        let path = get_db_path();
        assert!(path.to_string_lossy().ends_with("screenhub.db"));
    }
}
