use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone)]
pub struct WebDavConfig {
    pub url: String,
    pub username: String,
    pub password: String,
}

pub fn config_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .expect("failed to resolve app config dir")
        .join("webdav_config.json")
}

#[tauri::command]
pub fn get_webdav_config(app: tauri::AppHandle) -> Option<WebDavConfig> {
    let data = std::fs::read_to_string(config_path(&app)).ok()?;
    serde_json::from_str(&data).ok()
}

#[tauri::command]
pub fn save_webdav_config(app: tauri::AppHandle, config: WebDavConfig) -> Result<(), String> {
    let path = config_path(&app);
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

/// Downloads the raw KDBX bytes from the WebDAV server.
pub async fn fetch_db_bytes(config: &WebDavConfig) -> Result<Vec<u8>, String> {
    if !config.url.starts_with("https://") {
        return Err("WebDAV URL must start with https://".to_string());
    }
    let client = reqwest::Client::new();
    let response = client
        .get(&config.url)
        .basic_auth(&config.username, Some(&config.password))
        .header("Cache-Control", "no-cache")
        .send()
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Server returned {}", response.status()));
    }
    response.bytes().await.map(|b| b.to_vec()).map_err(|e| e.to_string())
}
