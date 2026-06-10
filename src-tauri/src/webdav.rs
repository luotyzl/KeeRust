use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct WebDavConfig {
    pub url: String,
    pub username: String,
    pub password: String,
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

/// Uploads raw KDBX bytes back to the WebDAV server via PUT.
pub async fn put_db_bytes(config: &WebDavConfig, bytes: Vec<u8>) -> Result<(), String> {
    if !config.url.starts_with("https://") {
        return Err("WebDAV URL must start with https://".to_string());
    }
    let client = reqwest::Client::new();
    let response = client
        .put(&config.url)
        .basic_auth(&config.username, Some(&config.password))
        .header("Content-Type", "application/octet-stream")
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Server returned {}", response.status()));
    }
    Ok(())
}
