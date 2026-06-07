use base64::prelude::*;
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use tauri::{Emitter, Manager};

use crate::attachments::mime_type;
use crate::webdav::{config_path, fetch_db_bytes, put_db_bytes};

// ── Outbound data structures ──────────────────────────────────────────────────

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
    pub mime_type: String,
    pub data_base64: String,
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

#[derive(Serialize)]
pub struct SaveResult {
    pub vault: VaultData,
    pub saved_uuid: String,
}

// ── Inbound data structures (from JS) ─────────────────────────────────────────

#[derive(Deserialize)]
pub struct CustomFieldUpdate {
    pub name: String,
    pub value: String,
    pub protected: bool,
}

#[derive(Deserialize)]
pub struct EntryUpdate {
    pub uuid: String,       // empty = new entry
    pub group_uuid: String, // group to add to (new) or current group (unused for edit)
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: String,
    pub notes: String,
    pub otp_uri: String, // empty = no OTP
    pub custom_fields: Vec<CustomFieldUpdate>,
}

// ── Cache path ────────────────────────────────────────────────────────────────

fn cache_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to resolve app data dir")
        .join("db_cache.kdbx")
}

// ── Field helpers ─────────────────────────────────────────────────────────────

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

fn attachment_bytes(att: &keepass::db::Attachment) -> Vec<u8> {
    match &att.data {
        keepass::db::Value::Unprotected(data) => data.clone(),
        keepass::db::Value::Protected(data) => data.expose_secret().clone(),
    }
}

/// Overwrite an entry's fields with values from an EntryUpdate.
/// Clears all non-standard fields first, then sets everything fresh.
fn apply_fields(entry: &mut keepass::db::Entry, update: &EntryUpdate) {
    // Remove all custom / OTP fields; keep only the 5 standard fields
    entry
        .fields
        .retain(|k, _| STANDARD_FIELDS.contains(&k.as_str()));

    entry.set_unprotected("Title", &update.title);
    entry.set_unprotected("UserName", &update.username);
    entry.set_protected("Password", &update.password);
    entry.set_unprotected("URL", &update.url);
    entry.set_unprotected("Notes", &update.notes);

    if !update.otp_uri.is_empty() {
        entry.set_unprotected("otp", &update.otp_uri);
    }

    for cf in &update.custom_fields {
        if cf.protected {
            entry.set_protected(&cf.name, &cf.value);
        } else {
            entry.set_unprotected(&cf.name, &cf.value);
        }
    }
}

// ── Entry builder ─────────────────────────────────────────────────────────────

fn entry_to_data(
    entry: &keepass::db::Entry,
    entry_uuid: &str,
    group_name: &str,
    group_uuid: &str,
    attachments: Vec<AttachmentInfo>,
) -> EntryData {
    let mut custom_fields: Vec<CustomField> = entry
        .fields
        .iter()
        .filter(|(k, _)| !STANDARD_FIELDS.contains(&k.as_str()))
        .filter(|(k, _)| {
            let k = k.as_str();
            k != "otp" && !k.starts_with("TOTP") && !k.starts_with("HmacOtp")
        })
        .map(|(k, v)| CustomField {
            name: k.clone(),
            value: field_str(v),
            protected: matches!(v, keepass::db::Value::Protected(_)),
        })
        .collect();
    custom_fields.sort_by(|a, b| a.name.cmp(&b.name));

    let otp_uri = entry.get_raw_otp_value().map(|s| s.to_string());

    let history: Vec<HistoryEntry> = entry
        .history
        .as_ref()
        .map(|h| {
            h.get_entries()
                .iter()
                .map(|e| HistoryEntry {
                    modified: e
                        .times
                        .last_modification
                        .map(|t: chrono::NaiveDateTime| t.format("%Y-%m-%d %H:%M").to_string())
                        .unwrap_or_default(),
                    title: get_field(e, "Title"),
                    username: get_field(e, "UserName"),
                })
                .collect()
        })
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

// ── Tree traversal ────────────────────────────────────────────────────────────

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
            let attachments: Vec<AttachmentInfo> = e
                .attachments_named()
                .map(|(name, att)| {
                    let bytes = attachment_bytes(&att);
                    AttachmentInfo {
                        mime_type: mime_type(name).to_string(),
                        size: bytes.len(),
                        data_base64: BASE64_STANDARD.encode(&bytes),
                        name: name.to_string(),
                    }
                })
                .collect();
            entries.push(entry_to_data(
                &e,
                &entry_id.to_string(),
                group_name,
                group_uuid,
                attachments,
            ));
        }
    }

    for group_id in group.group_ids() {
        if let Some(g) = db.group(group_id) {
            let uuid = group_id.to_string();
            let name = g.name.clone();
            let before = entries.len();
            groups.push(GroupData {
                uuid: uuid.clone(),
                name: name.clone(),
                entry_count: 0,
            });
            let idx = groups.len() - 1;
            collect_nodes(&g, db, &name, &uuid, entries, groups);
            groups[idx].entry_count = entries.len() - before;
        }
    }
}

fn build_vault_data(db: keepass::Database) -> VaultData {
    let root = db.root();
    let root_uuid = root.id().to_string();
    let root_name = root.name.clone();

    let mut entries: Vec<EntryData> = Vec::new();
    let mut groups: Vec<GroupData> = Vec::new();

    collect_nodes(&*root, &db, &root_name, &root_uuid, &mut entries, &mut groups);

    groups.insert(
        0,
        GroupData {
            uuid: root_uuid,
            name: root_name,
            entry_count: entries.len(),
        },
    );

    VaultData { groups, entries }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn open_database(
    app: tauri::AppHandle,
    password: String,
) -> Result<VaultData, String> {
    let config_str = std::fs::read_to_string(config_path(&app))
        .map_err(|_| "WebDAV not configured".to_string())?;
    let config: crate::webdav::WebDavConfig =
        serde_json::from_str(&config_str).map_err(|e| e.to_string())?;

    let cache = cache_path(&app);
    let mut used_cache = false;

    // Cache-first: serve from disk immediately, sync in background
    let bytes = if cache.exists() {
        match std::fs::read(&cache) {
            Ok(b) => {
                used_cache = true;
                b
            }
            Err(_) => {
                // Cache unreadable — fall back to WebDAV
                let b = fetch_db_bytes(&config).await?;
                if let Some(p) = cache.parent() {
                    let _ = std::fs::create_dir_all(p);
                }
                let _ = std::fs::write(&cache, &b);
                b
            }
        }
    } else {
        // First open: fetch from WebDAV and store locally
        let b = fetch_db_bytes(&config).await?;
        if let Some(p) = cache.parent() {
            let _ = std::fs::create_dir_all(p);
        }
        let _ = std::fs::write(&cache, &b);
        b
    };

    let mut cursor = Cursor::new(bytes);
    let db = keepass::Database::open(
        &mut cursor,
        keepass::DatabaseKey::new().with_password(&password),
    )
    .map_err(|e| format!("Failed to open database: {e}"))?;

    // Background: check if remote has a newer version than what we just served
    if used_cache {
        let app2 = app.clone();
        let config2 = config.clone();
        let cache2 = cache.clone();
        tauri::async_runtime::spawn(async move {
            if let Ok(remote_bytes) = fetch_db_bytes(&config2).await {
                let cached = std::fs::read(&cache2).unwrap_or_default();
                if remote_bytes != cached {
                    let _ = std::fs::write(&cache2, &remote_bytes);
                    app2.emit("db-remote-updated", ()).ok();
                }
            }
        });
    }

    Ok(build_vault_data(db))
}

#[tauri::command]
pub async fn save_entry(
    app: tauri::AppHandle,
    password: String,
    entry: EntryUpdate,
) -> Result<SaveResult, String> {
    let config_str = std::fs::read_to_string(config_path(&app))
        .map_err(|_| "WebDAV not configured".to_string())?;
    let config: crate::webdav::WebDavConfig =
        serde_json::from_str(&config_str).map_err(|e| e.to_string())?;

    let cache = cache_path(&app);

    // Load from local cache (no network round-trip on save)
    let bytes = if cache.exists() {
        std::fs::read(&cache).map_err(|e| format!("Cache read failed: {e}"))?
    } else {
        // No cache yet — fetch from WebDAV
        let b = fetch_db_bytes(&config).await?;
        if let Some(p) = cache.parent() {
            let _ = std::fs::create_dir_all(p);
        }
        b
    };

    let mut cursor = Cursor::new(bytes);
    let mut db = keepass::Database::open(
        &mut cursor,
        keepass::DatabaseKey::new().with_password(&password),
    )
    .map_err(|e| format!("Failed to open database: {e}"))?;

    let saved_uuid = if entry.uuid.is_empty() {
        // New entry: add to the specified group
        let group_uuid = uuid::Uuid::parse_str(&entry.group_uuid)
            .map_err(|e| format!("Invalid group UUID: {e}"))?;
        let group_id = keepass::db::GroupId::from_uuid(group_uuid);
        let mut group = db
            .group_mut(group_id)
            .ok_or_else(|| "Group not found".to_string())?;
        let mut e = group.add_entry();
        let id_str = e.id().to_string();
        apply_fields(&mut *e, &entry);
        id_str
    } else {
        // Existing entry: find and update
        let entry_uuid = uuid::Uuid::parse_str(&entry.uuid)
            .map_err(|e| format!("Invalid entry UUID: {e}"))?;
        let entry_id = keepass::db::EntryId::from_uuid(entry_uuid);
        {
            let mut e = db
                .entry_mut(entry_id)
                .ok_or_else(|| "Entry not found".to_string())?;
            apply_fields(&mut *e, &entry);
        }
        entry.uuid.clone()
    };

    // Serialize modified database
    let mut saved_bytes: Vec<u8> = Vec::new();
    db.save(
        &mut saved_bytes,
        keepass::DatabaseKey::new().with_password(&password),
    )
    .map_err(|e| format!("Failed to save: {e}"))?;

    // Write to local cache immediately — user gets instant feedback
    let _ = std::fs::write(&cache, &saved_bytes);

    // Re-parse from saved bytes to build the response
    let db2 = {
        let mut c = Cursor::new(saved_bytes.clone());
        keepass::Database::open(
            &mut c,
            keepass::DatabaseKey::new().with_password(&password),
        )
        .map_err(|e| format!("Failed to reload: {e}"))?
    };

    let result = SaveResult {
        vault: build_vault_data(db2),
        saved_uuid,
    };

    // Background: PUT to WebDAV (non-blocking)
    {
        let app2 = app.clone();
        let config2 = config;
        tauri::async_runtime::spawn(async move {
            match put_db_bytes(&config2, saved_bytes).await {
                Ok(_) => {
                    app2.emit("sync-status", serde_json::json!({"ok": true})).ok();
                }
                Err(e) => {
                    app2.emit("sync-status", serde_json::json!({"ok": false, "error": e})).ok();
                }
            }
        });
    }

    Ok(result)
}
