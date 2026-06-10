use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

use crate::webdav::{fetch_db_bytes, put_db_bytes, WebDavConfig};

/// Where the active database lives. Persisted to `vault_source.json`.
#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum VaultSource {
    /// A remote KDBX served over WebDAV (cached locally).
    WebDav(WebDavConfig),
    /// A KDBX file on the local filesystem, read/written in place.
    Local { path: String },
}

impl VaultSource {
    pub fn is_local(&self) -> bool {
        matches!(self, VaultSource::Local { .. })
    }

    /// Read the current database bytes from the origin (WebDAV GET or local file).
    pub async fn fetch(&self) -> Result<Vec<u8>, String> {
        match self {
            VaultSource::WebDav(c) => fetch_db_bytes(c).await,
            VaultSource::Local { path } => {
                std::fs::read(path).map_err(|e| format!("Failed to read file: {e}"))
            }
        }
    }

    /// Write database bytes back to the origin (WebDAV PUT or local file).
    pub async fn put(&self, bytes: Vec<u8>) -> Result<(), String> {
        match self {
            VaultSource::WebDav(c) => put_db_bytes(c, bytes).await,
            VaultSource::Local { path } => {
                std::fs::write(path, bytes).map_err(|e| format!("Failed to write file: {e}"))
            }
        }
    }
}

fn source_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .expect("failed to resolve app config dir")
        .join("vault_source.json")
}

/// Legacy WebDAV-only config, kept for one-time migration of existing installs.
fn legacy_webdav_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .expect("failed to resolve app config dir")
        .join("webdav_config.json")
}

/// Load the configured source, migrating a legacy `webdav_config.json` if present.
pub fn load_source(app: &tauri::AppHandle) -> Result<VaultSource, String> {
    if let Ok(data) = std::fs::read_to_string(source_path(app)) {
        return serde_json::from_str(&data).map_err(|e| e.to_string());
    }
    // Migrate older installs that only stored WebDAV credentials.
    if let Ok(data) = std::fs::read_to_string(legacy_webdav_path(app)) {
        if let Ok(cfg) = serde_json::from_str::<WebDavConfig>(&data) {
            let source = VaultSource::WebDav(cfg);
            let _ = save_source(app, &source);
            return Ok(source);
        }
    }
    Err("No database configured".to_string())
}

fn save_source(app: &tauri::AppHandle, source: &VaultSource) -> Result<(), String> {
    let path = source_path(app);
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(source).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_vault_source(app: tauri::AppHandle) -> Option<VaultSource> {
    load_source(&app).ok()
}

#[tauri::command]
pub fn save_webdav_config(app: tauri::AppHandle, config: WebDavConfig) -> Result<(), String> {
    save_source(&app, &VaultSource::WebDav(config))
}

/// Show a native file picker for a .kdbx file. On selection, persist it as the
/// active source and return it; returns `None` if the user cancels.
#[tauri::command]
pub async fn open_local_file(app: tauri::AppHandle) -> Result<Option<VaultSource>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("KeePass database", &["kdbx"])
        .blocking_pick_file();

    let Some(file) = picked else {
        return Ok(None); // user cancelled
    };

    let path = file
        .into_path()
        .map_err(|e| format!("Invalid file path: {e}"))?;
    let source = VaultSource::Local {
        path: path.to_string_lossy().to_string(),
    };
    save_source(&app, &source)?;
    Ok(Some(source))
}
