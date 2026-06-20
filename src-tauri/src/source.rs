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

pub fn save_source(app: &tauri::AppHandle, source: &VaultSource) -> Result<(), String> {
    let path = source_path(app);
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(source).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

// ── Key file ────────────────────────────────────────────────────────────────
// The path to the key file (if any) that forms part of the database's master
// key. Persisted separately from the source so it applies to both local and
// WebDAV vaults. The backend reads it whenever it builds a `DatabaseKey`.

fn keyfile_path_file(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .expect("failed to resolve app config dir")
        .join("vault_keyfile.json")
}

/// The currently-associated key file path, or `None` if the vault uses a
/// password only.
pub fn load_keyfile_path(app: &tauri::AppHandle) -> Option<String> {
    let data = std::fs::read_to_string(keyfile_path_file(app)).ok()?;
    let path: String = serde_json::from_str(&data).ok()?;
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

/// Persist (or clear, with `None`) the key file path.
pub fn save_keyfile_path(app: &tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    let file = keyfile_path_file(app);
    match path {
        Some(p) if !p.is_empty() => {
            std::fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
            let data = serde_json::to_string(&p).map_err(|e| e.to_string())?;
            std::fs::write(file, data).map_err(|e| e.to_string())
        }
        _ => {
            let _ = std::fs::remove_file(file);
            Ok(())
        }
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_vault_source(app: tauri::AppHandle) -> Option<VaultSource> {
    load_source(&app).ok()
}

#[tauri::command]
pub fn save_webdav_config(app: tauri::AppHandle, config: WebDavConfig) -> Result<(), String> {
    // A different database resets the key-file association; the unlock screen
    // lets the user attach one if the new database needs it.
    save_keyfile_path(&app, None)?;
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
    // A different database resets the key-file association.
    save_keyfile_path(&app, None)?;
    save_source(&app, &source)?;
    Ok(Some(source))
}

/// Show a native picker for a key file. On selection, persist its path as part
/// of the master key and return it; returns `None` if the user cancels.
#[tauri::command]
pub async fn pick_key_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Key file", &["keyx", "key"])
        .add_filter("All files", &["*"])
        .blocking_pick_file();

    let Some(file) = picked else {
        return Ok(None); // user cancelled
    };

    let path = file
        .into_path()
        .map_err(|e| format!("Invalid file path: {e}"))?
        .to_string_lossy()
        .to_string();
    save_keyfile_path(&app, Some(path.clone()))?;
    Ok(Some(path))
}

/// The currently-associated key file path (for showing on the unlock screen).
#[tauri::command]
pub fn get_key_file(app: tauri::AppHandle) -> Option<String> {
    load_keyfile_path(&app)
}

/// Clear the associated key file (revert to password-only unlock).
#[tauri::command]
pub fn clear_key_file(app: tauri::AppHandle) -> Result<(), String> {
    save_keyfile_path(&app, None)
}
