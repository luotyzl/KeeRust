use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::time::Duration;

fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WebDavConfig {
    pub url: String,
    pub username: String,
    pub password: String,
    /// Accept invalid/self-signed TLS certificates ("trust unsafe certificate").
    /// Defaulted so configs saved before this option still load.
    #[serde(default)]
    pub accept_invalid_certs: bool,
    /// When true, detect remote changes by always downloading and comparing the
    /// file, instead of trusting the server's `Last-Modified` header (which some
    /// WebDAV servers report unreliably). Defaults to true to keep the safe,
    /// always-reload behavior; turn it off to reduce requests on a server whose
    /// `Last-Modified` you trust.
    #[serde(default = "default_true")]
    pub always_reload: bool,
}

/// Pick the shared client. There are two: a normal one and one that accepts
/// invalid/self-signed certificates (when the source opts in). Each is built once.
fn client(accept_invalid_certs: bool) -> &'static reqwest::Client {
    static SECURE: OnceLock<reqwest::Client> = OnceLock::new();
    static INSECURE: OnceLock<reqwest::Client> = OnceLock::new();
    let cell = if accept_invalid_certs { &INSECURE } else { &SECURE };
    cell.get_or_init(|| build_client(accept_invalid_certs))
}

fn build_client(accept_invalid_certs: bool) -> reqwest::Client {
    reqwest::Client::builder()
        .http1_only()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60))
        .pool_max_idle_per_host(0)
        .user_agent("KeeRust")
        .danger_accept_invalid_certs(accept_invalid_certs)
        .build()
        .expect("failed to build HTTP client")
}

/// The server's `Last-Modified` value for a response, as an owned string (our
/// content revision marker).
fn last_modified_header(response: &reqwest::Response) -> Option<String> {
    response
        .headers()
        .get(reqwest::header::LAST_MODIFIED)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

/// Downloads the KDBX bytes from the WebDAV server together with the server's
/// `Last-Modified` revision (one retry on a transport error).
pub async fn fetch_with_rev(config: &WebDavConfig) -> Result<(Vec<u8>, Option<String>), String> {
    if !config.url.starts_with("https://") {
        return Err("WebDAV URL must start with https://".to_string());
    }
    let mut last_err = String::new();
    for attempt in 0..2 {
        let result = client(config.accept_invalid_certs)
            .get(&config.url)
            .basic_auth(&config.username, Some(&config.password))
            .header("Cache-Control", "no-cache")
            .send()
            .await;
        match result {
            Ok(response) => {
                if !response.status().is_success() {
                    return Err(format!("Server returned {}", response.status()));
                }
                let rev = last_modified_header(&response);
                return response
                    .bytes()
                    .await
                    .map(|b| (b.to_vec(), rev))
                    .map_err(|e| e.to_string());
            }
            Err(e) => {
                last_err = format!("Connection failed: {e}");
                if attempt == 0 {
                    tokio::time::sleep(Duration::from_millis(400)).await;
                }
            }
        }
    }
    Err(last_err)
}

/// Downloads just the KDBX bytes (revision discarded).
pub async fn fetch_db_bytes(config: &WebDavConfig) -> Result<Vec<u8>, String> {
    fetch_with_rev(config).await.map(|(bytes, _)| bytes)
}

/// HEAD the file to read just its `Last-Modified` revision (no body transferred).
/// Returns `None` if the server doesn't send the header.
pub async fn last_modified(config: &WebDavConfig) -> Result<Option<String>, String> {
    if !config.url.starts_with("https://") {
        return Err("WebDAV URL must start with https://".to_string());
    }
    let mut last_err = String::new();
    for attempt in 0..2 {
        let result = client(config.accept_invalid_certs)
            .head(&config.url)
            .basic_auth(&config.username, Some(&config.password))
            .header("Cache-Control", "no-cache")
            .send()
            .await;
        match result {
            Ok(response) => {
                if !response.status().is_success() {
                    return Err(format!("Server returned {}", response.status()));
                }
                return Ok(last_modified_header(&response));
            }
            Err(e) => {
                last_err = format!("Connection failed: {e}");
                if attempt == 0 {
                    tokio::time::sleep(Duration::from_millis(400)).await;
                }
            }
        }
    }
    Err(last_err)
}

/// Uploads raw KDBX bytes back to the WebDAV server via PUT, returning the new
/// `Last-Modified` revision the server reports (one retry on a transport error).
pub async fn put_db_bytes(config: &WebDavConfig, bytes: Vec<u8>) -> Result<Option<String>, String> {
    if !config.url.starts_with("https://") {
        return Err("WebDAV URL must start with https://".to_string());
    }
    let mut last_err = String::new();
    for attempt in 0..2 {
        let result = client(config.accept_invalid_certs)
            .put(&config.url)
            .basic_auth(&config.username, Some(&config.password))
            .header("Content-Type", "application/octet-stream")
            .body(bytes.clone())
            .send()
            .await;
        match result {
            Ok(response) => {
                if !response.status().is_success() {
                    return Err(format!("Server returned {}", response.status()));
                }
                return Ok(last_modified_header(&response));
            }
            Err(e) => {
                last_err = format!("Connection failed: {e}");
                if attempt == 0 {
                    tokio::time::sleep(Duration::from_millis(400)).await;
                }
            }
        }
    }
    Err(last_err)
}
