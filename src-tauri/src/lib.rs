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
pub struct CustomField {
    pub name: String,
    pub value: String,
    pub protected: bool,
}

#[derive(Serialize, Clone)]
pub struct AttachmentInfo {
    pub name: String,
    pub size: usize,
}

#[derive(Serialize, Clone)]
pub struct HistoryEntry {
    pub modified: String,
    pub title: String,
    pub username: String,
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
    pub custom_fields: Vec<CustomField>,
    pub otp_uri: Option<String>,
    pub attachments: Vec<AttachmentInfo>,
    pub history: Vec<HistoryEntry>,
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

const STANDARD_FIELDS: &[&str] = &["Title", "UserName", "Password", "URL", "Notes"];

fn field_str(value: &keepass::db::Value<String>) -> String {
    match value {
        keepass::db::Value::Unprotected(s) => s.clone(),
        keepass::db::Value::Protected(s) => s.expose_secret().clone(),
    }
}

fn get_field(entry: &keepass::db::Entry, key: &str) -> String {
    entry.fields.get(key).map(field_str).unwrap_or_default()
}

fn entry_to_data(
    entry: &keepass::db::Entry,
    entry_uuid: &str,
    group_name: &str,
    group_uuid: &str,
    attachments: Vec<AttachmentInfo>,
) -> EntryData {
    let mut custom_fields: Vec<CustomField> = entry.fields.iter()
        .filter(|(k, _)| !STANDARD_FIELDS.contains(&k.as_str()))
        .filter(|(k, _)| k.as_str() != "otp" && !k.starts_with("TOTP") && !k.starts_with("HmacOtp"))
        .map(|(k, v)| CustomField {
            name: k.clone(),
            value: field_str(v),
            protected: matches!(v, keepass::db::Value::Protected(_)),
        })
        .collect();
    custom_fields.sort_by(|a, b| a.name.cmp(&b.name));

    let otp_uri = entry.get_raw_otp_value().map(|s| s.to_string());

    let history: Vec<HistoryEntry> = entry.history.as_ref()
        .map(|h| h.get_entries().iter().map(|e| {
            let modified = e.times.last_modification
                .map(|t: chrono::NaiveDateTime| t.format("%Y-%m-%d %H:%M").to_string())
                .unwrap_or_default();
            HistoryEntry {
                modified,
                title: get_field(e, "Title"),
                username: get_field(e, "UserName"),
            }
        }).collect())
        .unwrap_or_default();

    EntryData {
        uuid: entry_uuid.to_string(),
        title: get_field(entry, "Title"),
        username: get_field(entry, "UserName"),
        url: get_field(entry, "URL"),
        notes: get_field(entry, "Notes"),
        password: get_field(entry, "Password"),
        group_name: group_name.to_string(),
        group_uuid: group_uuid.to_string(),
        custom_fields,
        otp_uri,
        attachments,
        history,
    }
}

fn attachment_size(att: &keepass::db::Attachment) -> usize {
    match &att.data {
        keepass::db::Value::Unprotected(data) => data.len(),
        keepass::db::Value::Protected(data) => data.expose_secret().len(),
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
            // attachments_named() requires EntryRef (has db context), call before deref
            let attachments: Vec<AttachmentInfo> = e.attachments_named()
                .map(|(name, att)| AttachmentInfo {
                    name: name.to_string(),
                    size: attachment_size(&att),
                })
                .collect();
            entries.push(entry_to_data(&e, &entry_id.to_string(), group_name, group_uuid, attachments));
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
