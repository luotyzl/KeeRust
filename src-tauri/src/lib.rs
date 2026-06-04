use serde::{Deserialize, Serialize};
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
        Some(keepass::db::Value::Protected(s)) => {
            String::from_utf8_lossy(s.unsecure()).to_string()
        }
        _ => String::new(),
    }
}

fn collect_nodes(
    group: &keepass::db::Group,
    group_name: &str,
    group_uuid: &str,
    entries: &mut Vec<EntryData>,
    groups: &mut Vec<GroupData>,
) {
    let mut local_count = 0usize;

    for node in &group.children {
        match node {
            keepass::db::Node::Group(g) => {
                let uuid = g.uuid.to_string();
                let name = g.name.clone();
                let before = entries.len();
                // push placeholder, fill count after recursion
                groups.push(GroupData { uuid: uuid.clone(), name: name.clone(), entry_count: 0 });
                let idx = groups.len() - 1;
                collect_nodes(g, &name, &uuid, entries, groups);
                groups[idx].entry_count = entries.len() - before;
            }
            keepass::db::Node::Entry(e) => {
                local_count += 1;
                entries.push(EntryData {
                    uuid: e.uuid.to_string(),
                    title: get_field(e, "Title"),
                    username: get_field(e, "UserName"),
                    url: get_field(e, "URL"),
                    notes: get_field(e, "Notes"),
                    password: get_field(e, "Password"),
                    group_name: group_name.to_string(),
                    group_uuid: group_uuid.to_string(),
                });
            }
        }
    }

    // Update the root-group entry count (first element after it was pushed by the caller).
    // The caller updates its own slot; for the very first call we handle it in open_database.
    let _ = local_count;
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

    let root_uuid = db.root.uuid.to_string();
    let root_name = db.root.name.clone();

    let mut entries: Vec<EntryData> = Vec::new();
    let mut groups: Vec<GroupData> = Vec::new();

    collect_nodes(&db.root, &root_name, &root_uuid, &mut entries, &mut groups);

    // Prepend the root "All Entries" group with the total count
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
