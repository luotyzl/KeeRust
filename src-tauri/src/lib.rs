use serde::{Deserialize, Serialize};
use secrecy::ExposeSecret;
use std::io::Cursor;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone)]
pub struct WebDavConfig {
    pub url: String,
    pub username: String,
    pub password: String,
}

#[derive(Serialize, Clone)]
pub struct EntryData {
    pub uuid: String,
    pub title: String,
    pub username: String,
    pub url: String,
    pub notes: String,
    pub password: String,
    pub group_name: String,
    pub group_uuid: String,
}

#[derive(Serialize, Clone)]
pub struct GroupData {
    pub uuid: String,
    pub name: String,
    pub entry_count: usize,
}

#[derive(Serialize)]
pub struct VaultData {
    pub groups: Vec<GroupData>,
    pub entries: Vec<EntryData>,
}

fn config_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .expect("failed to resolve app config dir")
        .join("webdav_config.json")
}

fn get_field(entry: &keepass::db::Entry, key: &str) -> String {
    match entry.fields.get(key) {
        Some(keepass::db::Value::Unprotected(s)) => s.clone(),
        Some(keepass::db::Value::Protected(s)) => s.expose_secret().clone(),
        _ => String::new(),
    }
}

fn collect_nodes(
    group: &keepass::db::Group,
    db: &keepass::Database,
    group_name: &str,
    group_uuid: &str,
    entries: &mut Vec<EntryData>,
    groups: &mut Vec<GroupData>,
) {
    for entry_id in group.entry_ids() {
        if let Some(e) = db.entry(entry_id) {
            entries.push(EntryData {
                uuid: entry_id.to_string(),
                title: get_field(&e, "Title"),
                username: get_field(&e, "UserName"),
                url: get_field(&e, "URL"),
                notes: get_field(&e, "Notes"),
                password: get_field(&e, "Password"),
                group_name: group_name.to_string(),
                group_uuid: group_uuid.to_string(),
            });
        }
    }

    for group_id in group.group_ids() {
        if let Some(g) = db.group(group_id) {
            let uuid = group_id.to_string();
            let name = g.name.clone();
            let before = entries.len();
            groups.push(GroupData { uuid: uuid.clone(), name: name.clone(), entry_count: 0 });
            let idx = groups.len() - 1;
            collect_nodes(&g, db, &name, &uuid, entries, groups);
            groups[idx].entry_count = entries.len() - before;
        }
    }
}

#[tauri::command]
fn get_webdav_config(app: tauri::AppHandle) -> Option<WebDavConfig> {
    let data = std::fs::read_to_string(config_path(&app)).ok()?;
    serde_json::from_str(&data).ok()
}

#[tauri::command]
fn save_webdav_config(app: tauri::AppHandle, config: WebDavConfig) -> Result<(), String> {
    let path = config_path(&app);
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_database(app: tauri::AppHandle, password: String) -> Result<VaultData, String> {
    let data = std::fs::read_to_string(config_path(&app))
        .map_err(|_| "WebDAV not configured".to_string())?;
    let config: WebDavConfig = serde_json::from_str(&data).map_err(|e| e.to_string())?;

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

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let mut cursor = Cursor::new(bytes.to_vec());

    let key = keepass::DatabaseKey::new().with_password(&password);
    let db = keepass::Database::open(&mut cursor, key)
        .map_err(|e| format!("Failed to open database: {e}"))?;

    let root = db.root();
    let root_uuid = root.id().to_string();
    let root_name = root.name.clone();

    let mut entries: Vec<EntryData> = Vec::new();
    let mut groups: Vec<GroupData> = Vec::new();

    collect_nodes(&*root, &db, &root_name, &root_uuid, &mut entries, &mut groups);

    groups.insert(0, GroupData {
        uuid: root_uuid,
        name: root_name,
        entry_count: entries.len(),
    });

    Ok(VaultData { groups, entries })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_webdav_config,
            save_webdav_config,
            open_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
