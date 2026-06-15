use base64::prelude::*;
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use tauri::{Emitter, Manager};

use crate::attachments::mime_type;
use crate::source::{load_source, VaultSource};

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
    pub tags: Vec<String>,                  // entry tags (KDBX <Tags>)
    pub icon_id: i64,                       // built-in icon index 0-68, or -1 if custom
    pub custom_icon_base64: Option<String>, // raw PNG data for a custom icon
    pub custom_icon_uuid: Option<String>,   // UUID of the custom icon (for re-selection)
    pub autotype_enabled: bool,             // whether auto-type is enabled for this entry
    pub autotype_sequence: String,          // custom default keystroke sequence ("" = global default)
    pub autotype_obfuscation: bool,         // "mix real keystrokes with random" flag
}

#[derive(Serialize, Clone)]
pub struct GroupData {
    pub uuid: String,
    pub name: String,
    pub entry_count: usize,
    pub icon_id: i64,                       // built-in icon index, or -1 if custom
    pub custom_icon_base64: Option<String>, // raw PNG data for a custom icon
}

#[derive(Serialize, Clone)]
pub struct CustomIconData {
    pub uuid: String,   // custom icon UUID (matches EntryData.custom_icon_uuid)
    pub base64: String, // raw PNG data
}

#[derive(Serialize)]
pub struct VaultData {
    pub groups: Vec<GroupData>,
    pub entries: Vec<EntryData>,
    pub recycle_bin_uuid: Option<String>,
    pub custom_icons: Vec<CustomIconData>, // all custom icons in the DB (pickable)
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
    pub icon_id: i64, // built-in icon 0-68 to set; -1 = leave the existing icon unchanged
    pub custom_icon_base64: Option<String>, // when set, store as a NEW custom icon (e.g. favicon)
    pub custom_icon_uuid: Option<String>, // when set, reference an EXISTING custom icon by UUID
    pub autotype_enabled: bool,
    pub autotype_sequence: String, // "" = inherit the global default sequence
    pub autotype_obfuscation: bool,
}

#[derive(Deserialize)]
pub struct GroupUpdate {
    pub uuid: String,        // empty = new group
    pub parent_uuid: String, // parent for a new group (empty = root)
    pub name: String,
    pub icon_id: i64, // built-in icon 0-68 to set; -1 = leave existing / custom
    pub custom_icon_base64: Option<String>, // when set, store as a NEW custom icon
    pub custom_icon_uuid: Option<String>, // when set, reference an EXISTING custom icon by UUID
}

// ── Cache path ────────────────────────────────────────────────────────────────

fn cache_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to resolve app data dir")
        .join("db_cache.kdbx")
}

// ── Open / persist helpers ──────────────────────────────────────────────────────

/// Decrypt KDBX bytes with the master password.
fn open_db(bytes: &[u8], password: &str) -> Result<keepass::Database, String> {
    let mut cursor = Cursor::new(bytes);
    keepass::Database::open(
        &mut cursor,
        keepass::DatabaseKey::new().with_password(password),
    )
    .map_err(|e| format!("Failed to open database: {e}"))
}

/// Read the database bytes to work from. WebDAV is cache-first (use the local
/// cache when present, otherwise fetch and store it); local files are always
/// read directly so external edits are picked up.
async fn read_working_bytes(
    app: &tauri::AppHandle,
    source: &VaultSource,
) -> Result<Vec<u8>, String> {
    if source.is_local() {
        return source.fetch().await;
    }
    let cache = cache_path(app);
    if cache.exists() {
        std::fs::read(&cache).map_err(|e| format!("Cache read failed: {e}"))
    } else {
        let b = source.fetch().await?;
        if let Some(p) = cache.parent() {
            let _ = std::fs::create_dir_all(p);
        }
        let _ = std::fs::write(&cache, &b);
        Ok(b)
    }
}

/// Persist freshly-saved KDBX bytes back to the source.
/// - Local: write the file synchronously; an error means the change did not save.
/// - WebDAV: write the local cache immediately, then PUT in the background and
///   report the outcome through the `sync-status` event.
async fn persist_bytes(
    app: &tauri::AppHandle,
    source: &VaultSource,
    bytes: Vec<u8>,
) -> Result<(), String> {
    if source.is_local() {
        return source.put(bytes).await;
    }
    let cache = cache_path(app);
    if let Some(p) = cache.parent() {
        let _ = std::fs::create_dir_all(p);
    }
    let _ = std::fs::write(&cache, &bytes);

    let app2 = app.clone();
    let source2 = source.clone();
    tauri::async_runtime::spawn(async move {
        match source2.put(bytes).await {
            Ok(_) => {
                app2.emit("sync-status", serde_json::json!({"ok": true})).ok();
            }
            Err(e) => {
                app2.emit("sync-status", serde_json::json!({"ok": false, "error": e}))
                    .ok();
            }
        }
    });
    Ok(())
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

/// Look up a field by a case-insensitive name (KeeWeb matches `otp` exactly, but
/// being lenient avoids missing `OTP`/`Otp` variants written by other apps).
fn find_field_ci(entry: &keepass::db::Entry, name: &str) -> Option<String> {
    entry
        .fields
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| field_str(v))
}

/// True if `s` is a bare RFC-4648 base32 secret (letters + digits 2-7, no
/// padding) — mirrors KeeWeb's `Otp.isSecret`.
fn is_base32_secret(s: &str) -> bool {
    let s: String = s.chars().filter(|c| !c.is_whitespace()).collect();
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphabetic() || matches!(c, '2'..='7'))
}

fn make_otp_url(secret: &str, period: Option<&str>, digits: Option<&str>) -> String {
    let mut url = format!("otpauth://totp/default?secret={secret}");
    if let Some(p) = period {
        url.push_str("&period=");
        url.push_str(p);
    }
    if let Some(d) = digits {
        url.push_str("&digits=");
        url.push_str(d);
    }
    url
}

/// Resolve an entry's TOTP into a canonical `otpauth://` URL, handling the same
/// storage variants KeeWeb does (see entry-model.js `initOtpGenerator`):
///   1. `otp` field holding an `otpauth://` URL  → used as-is
///   2. `otp` field holding a bare base32 secret → wrapped into a URL
///   3. `otp` field in KeeOTP format `key=…&step=…&size=…`
///   4. TrayTOTP plugin fields `TOTP Seed` (+ `TOTP Settings` = "period;digits")
fn resolve_otp_uri(entry: &keepass::db::Entry) -> Option<String> {
    if let Some(raw) = find_field_ci(entry, "otp") {
        let compact: String = raw.chars().filter(|c| !c.is_whitespace()).collect();

        if raw.trim_start().to_lowercase().starts_with("otpauth:") {
            return Some(raw);
        }
        if is_base32_secret(&compact) {
            return Some(make_otp_url(&compact.to_uppercase(), None, None));
        }
        // KeeOTP plugin format: key=SECRET&step=30&size=6
        if compact.contains("key=") {
            let (mut key, mut step, mut size) = (None, None, None);
            for part in compact.split('&') {
                if let Some((k, v)) = part.split_once('=') {
                    match k {
                        "key" => key = Some(v.to_string()),
                        "step" => step = Some(v.to_string()),
                        "size" => size = Some(v.to_string()),
                        _ => {}
                    }
                }
            }
            if let Some(k) = key {
                return Some(make_otp_url(&k, step.as_deref(), size.as_deref()));
            }
        }
        // Unknown format — hand back the raw value as a last resort.
        return Some(raw);
    }

    // TrayTOTP plugin: "TOTP Seed" + optional "TOTP Settings" ("period;digits").
    if let Some(seed) = find_field_ci(entry, "TOTP Seed") {
        let secret = seed.trim().to_string();
        if !secret.is_empty() {
            let (mut period, mut digits) = (None, None);
            if let Some(settings) = find_field_ci(entry, "TOTP Settings") {
                let parts: Vec<&str> = settings.split(';').collect();
                if let Some(p) = parts.first().map(|s| s.trim()) {
                    if p.parse::<u64>().map(|n| n > 0).unwrap_or(false) {
                        period = Some(p.to_string());
                    }
                }
                if let Some(d) = parts.get(1).map(|s| s.trim()) {
                    if d.parse::<u64>().map(|n| n > 0).unwrap_or(false) {
                        digits = Some(d.to_string());
                    }
                }
            }
            return Some(make_otp_url(&secret, period.as_deref(), digits.as_deref()));
        }
    }

    None
}

fn attachment_bytes(att: &keepass::db::Attachment) -> Vec<u8> {
    match &att.data {
        keepass::db::Value::Unprotected(data) => data.clone(),
        keepass::db::Value::Protected(data) => data.expose_secret().clone(),
    }
}

/// Apply the chosen icon to an entry. Priority: a supplied custom icon (e.g. a
/// downloaded favicon) is stored as new; otherwise an existing custom icon
/// (resolved to `existing_custom`) is referenced; otherwise a built-in index >= 0
/// is set; otherwise the existing icon is left untouched.
fn apply_icon(
    e: &mut keepass::db::EntryMut<'_>,
    update: &EntryUpdate,
    existing_custom: Option<keepass::db::CustomIconId>,
) -> Result<(), String> {
    if let Some(b64) = &update.custom_icon_base64 {
        let bytes = BASE64_STANDARD
            .decode(b64)
            .map_err(|e| format!("Invalid icon data: {e}"))?;
        e.set_icon_custom_new(bytes);
    } else if let Some(id) = existing_custom {
        e.set_icon_custom(id)
            .map_err(|e| format!("Custom icon not found: {e}"))?;
    } else if update.icon_id >= 0 {
        e.set_icon_builtin(update.icon_id as usize);
    }
    Ok(())
}

/// Apply the chosen icon to a group (same priority as `apply_icon` for entries).
fn apply_group_icon(
    g: &mut keepass::db::GroupMut<'_>,
    update: &GroupUpdate,
    existing_custom: Option<keepass::db::CustomIconId>,
) -> Result<(), String> {
    if let Some(b64) = &update.custom_icon_base64 {
        let bytes = BASE64_STANDARD
            .decode(b64)
            .map_err(|e| format!("Invalid icon data: {e}"))?;
        g.set_icon_custom_new(bytes);
    } else if let Some(id) = existing_custom {
        g.set_icon_custom(id)
            .map_err(|e| format!("Custom icon not found: {e}"))?;
    } else if update.icon_id >= 0 {
        g.set_icon_builtin(update.icon_id as usize);
    }
    Ok(())
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

    // Auto-type settings — keep any existing window associations intact.
    let mut at = entry.autotype.take().unwrap_or_default();
    at.enabled = update.autotype_enabled;
    at.default_sequence = if update.autotype_sequence.trim().is_empty() {
        None
    } else {
        Some(update.autotype_sequence.clone())
    };
    at.data_transfer_obfuscation = Some(update.autotype_obfuscation);
    entry.autotype = Some(at);
}

// ── Entry builder ─────────────────────────────────────────────────────────────

fn entry_to_data(
    entry: &keepass::db::Entry,
    entry_uuid: &str,
    group_name: &str,
    group_uuid: &str,
    attachments: Vec<AttachmentInfo>,
    icon_id: i64,
    custom_icon_base64: Option<String>,
    custom_icon_uuid: Option<String>,
) -> EntryData {
    let mut custom_fields: Vec<CustomField> = entry
        .fields
        .iter()
        .filter(|(k, _)| !STANDARD_FIELDS.contains(&k.as_str()))
        .filter(|(k, _)| {
            // Hide the raw TOTP source fields; they surface as the computed code.
            let kl = k.to_lowercase();
            kl != "otp" && !kl.starts_with("totp") && !kl.starts_with("hmacotp")
        })
        .map(|(k, v)| CustomField {
            name: k.clone(),
            value: field_str(v),
            protected: matches!(v, keepass::db::Value::Protected(_)),
        })
        .collect();
    custom_fields.sort_by(|a, b| a.name.cmp(&b.name));

    let otp_uri = resolve_otp_uri(entry);

    // Auto-type settings (absent <AutoType> ⇒ enabled, inherit default sequence).
    let (autotype_enabled, autotype_sequence, autotype_obfuscation) = match &entry.autotype {
        Some(at) => (
            at.enabled,
            at.default_sequence.clone().unwrap_or_default(),
            at.data_transfer_obfuscation.unwrap_or(false),
        ),
        None => (true, String::new(), false),
    };

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
        tags: entry.tags.clone(),
        icon_id,
        custom_icon_base64,
        custom_icon_uuid,
        autotype_enabled,
        autotype_sequence,
        autotype_obfuscation,
    }
}

// Resolve a group's icon: built-in index, or -1 + raw bytes for a custom icon.
// Groups default to the folder icon (48) when none is set.
fn group_icon(g: &keepass::db::GroupRef<'_>) -> (i64, Option<String>) {
    match g.icon() {
        Some(keepass::db::Icon::BuiltIn(n)) => (*n as i64, None),
        Some(keepass::db::Icon::Custom(_)) => {
            let data = g.custom_icon().map(|ci| BASE64_STANDARD.encode(&ci.data));
            (-1, data)
        }
        None => (48, None),
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

            // Resolve the entry's icon: built-in index, or raw bytes + UUID for a custom icon
            let (icon_id, custom_icon_base64, custom_icon_uuid) = match e.icon() {
                Some(keepass::db::Icon::BuiltIn(n)) => (*n as i64, None, None),
                Some(keepass::db::Icon::Custom(id)) => {
                    let data = e
                        .custom_icon()
                        .map(|ci| BASE64_STANDARD.encode(&ci.data));
                    (-1, data, Some(id.uuid().to_string()))
                }
                None => (0, None, None), // default to the key icon
            };

            entries.push(entry_to_data(
                &e,
                &entry_id.to_string(),
                group_name,
                group_uuid,
                attachments,
                icon_id,
                custom_icon_base64,
                custom_icon_uuid,
            ));
        }
    }

    for group_id in group.group_ids() {
        if let Some(g) = db.group(group_id) {
            let uuid = group_id.to_string();
            let name = g.name.clone();
            let (icon_id, custom_icon_base64) = group_icon(&g);
            let before = entries.len();
            groups.push(GroupData {
                uuid: uuid.clone(),
                name: name.clone(),
                entry_count: 0,
                icon_id,
                custom_icon_base64,
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
    let (root_icon_id, root_custom_icon) = group_icon(&root);

    let recycle_bin_uuid = db
        .meta
        .recyclebin_uuid
        .map(|u| keepass::db::GroupId::from_uuid(u).to_string());

    let mut entries: Vec<EntryData> = Vec::new();
    let mut groups: Vec<GroupData> = Vec::new();

    collect_nodes(&*root, &db, &root_name, &root_uuid, &mut entries, &mut groups);

    // All custom icons in the database — pickable for any entry/group.
    let custom_icons: Vec<CustomIconData> = db
        .iter_all_custom_icons()
        .map(|ci| CustomIconData {
            uuid: ci.id().uuid().to_string(),
            base64: BASE64_STANDARD.encode(&ci.data),
        })
        .collect();

    // "All Entries" count excludes anything that lives in the Recycle Bin
    let non_recycled = entries
        .iter()
        .filter(|e| Some(&e.group_uuid) != recycle_bin_uuid.as_ref())
        .count();

    groups.insert(
        0,
        GroupData {
            uuid: root_uuid,
            name: root_name,
            entry_count: non_recycled,
            icon_id: root_icon_id,
            custom_icon_base64: root_custom_icon,
        },
    );

    VaultData {
        groups,
        entries,
        recycle_bin_uuid,
        custom_icons,
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn open_database(
    app: tauri::AppHandle,
    password: String,
) -> Result<VaultData, String> {
    let source = load_source(&app)?;

    // Local files: read directly, no cache and no background sync.
    if source.is_local() {
        let bytes = source.fetch().await?;
        let db = open_db(&bytes, &password)?;
        return Ok(build_vault_data(db));
    }

    // WebDAV: cache-first — serve from disk immediately, check remote in background.
    let cache = cache_path(&app);
    let mut used_cache = false;

    let bytes = if cache.exists() {
        match std::fs::read(&cache) {
            Ok(b) => {
                used_cache = true;
                b
            }
            Err(_) => {
                // Cache unreadable — fall back to WebDAV
                let b = source.fetch().await?;
                if let Some(p) = cache.parent() {
                    let _ = std::fs::create_dir_all(p);
                }
                let _ = std::fs::write(&cache, &b);
                b
            }
        }
    } else {
        // First open: fetch from WebDAV and store locally
        let b = source.fetch().await?;
        if let Some(p) = cache.parent() {
            let _ = std::fs::create_dir_all(p);
        }
        let _ = std::fs::write(&cache, &b);
        b
    };

    let db = open_db(&bytes, &password)?;

    // Background: check if remote has a newer version than what we just served
    if used_cache {
        let app2 = app.clone();
        let source2 = source.clone();
        let cache2 = cache.clone();
        tauri::async_runtime::spawn(async move {
            if let Ok(remote_bytes) = source2.fetch().await {
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

fn parse_entry_id(uuid: &str) -> Result<keepass::db::EntryId, String> {
    let entry_uuid = uuid::Uuid::parse_str(uuid).map_err(|e| format!("Invalid UUID: {e}"))?;
    Ok(keepass::db::EntryId::from_uuid(entry_uuid))
}

/// Get the Recycle Bin group id, creating the group if it doesn't exist yet.
fn get_or_create_recycle_bin(db: &mut keepass::Database) -> keepass::db::GroupId {
    if let Some(rb) = db.recycle_bin() {
        return rb.id();
    }
    let id = {
        let mut root = db.root_mut();
        let mut new_group = root.add_group();
        new_group.name = "Recycle Bin".to_string();
        new_group.id()
    };
    db.meta.recyclebin_uuid = Some(id.uuid());
    db.meta.recyclebin_enabled = Some(true);
    id
}

/// Load the cached (or freshly fetched) database, apply `mutate`, persist to the
/// local cache immediately, push to WebDAV in the background, and return fresh
/// vault data. Shared by the delete / restore / purge commands.
async fn mutate_and_persist<F>(
    app: tauri::AppHandle,
    password: String,
    mutate: F,
) -> Result<VaultData, String>
where
    F: FnOnce(&mut keepass::Database) -> Result<(), String>,
{
    let source = load_source(&app)?;

    let bytes = read_working_bytes(&app, &source).await?;
    let mut db = open_db(&bytes, &password)?;

    mutate(&mut db)?;

    let mut saved_bytes: Vec<u8> = Vec::new();
    db.save(
        &mut saved_bytes,
        keepass::DatabaseKey::new().with_password(&password),
    )
    .map_err(|e| format!("Failed to save: {e}"))?;

    let db2 = open_db(&saved_bytes, &password)?;
    persist_bytes(&app, &source, saved_bytes).await?;

    Ok(build_vault_data(db2))
}

/// Move an entry to the Recycle Bin (creating it if needed).
#[tauri::command]
pub async fn delete_entry(
    app: tauri::AppHandle,
    password: String,
    uuid: String,
) -> Result<VaultData, String> {
    mutate_and_persist(app, password, |db| {
        let recycle_bin_id = get_or_create_recycle_bin(db);
        let entry_id = parse_entry_id(&uuid)?;
        db.entry_mut(entry_id)
            .ok_or_else(|| "Entry not found".to_string())?
            .move_to(recycle_bin_id)
            .map_err(|_| "Failed to move entry to Recycle Bin".to_string())
    })
    .await
}

/// Restore an entry from the Recycle Bin back to the root group.
#[tauri::command]
pub async fn restore_entry(
    app: tauri::AppHandle,
    password: String,
    uuid: String,
) -> Result<VaultData, String> {
    mutate_and_persist(app, password, |db| {
        let root_id = db.root().id();
        let entry_id = parse_entry_id(&uuid)?;
        db.entry_mut(entry_id)
            .ok_or_else(|| "Entry not found".to_string())?
            .move_to(root_id)
            .map_err(|_| "Failed to restore entry".to_string())
    })
    .await
}

/// Permanently delete an entry (used for entries already in the Recycle Bin).
#[tauri::command]
pub async fn delete_entry_permanent(
    app: tauri::AppHandle,
    password: String,
    uuid: String,
) -> Result<VaultData, String> {
    mutate_and_persist(app, password, |db| {
        let entry_id = parse_entry_id(&uuid)?;
        db.entry_mut(entry_id)
            .ok_or_else(|| "Entry not found".to_string())?
            .remove(); // consumes EntryMut — permanent removal
        Ok(())
    })
    .await
}

/// Force-fetch from WebDAV, update cache, and return fresh vault data.
/// Used by the manual "Sync" button — bypasses local cache.
#[tauri::command]
pub async fn force_sync(
    app: tauri::AppHandle,
    password: String,
) -> Result<VaultData, String> {
    let source = load_source(&app)?;

    // Re-read from the origin: a WebDAV GET, or the local file (for external edits).
    let bytes = source.fetch().await?;

    // Refresh the cache for WebDAV; local files have no cache.
    if !source.is_local() {
        let cache = cache_path(&app);
        if let Some(p) = cache.parent() {
            let _ = std::fs::create_dir_all(p);
        }
        let _ = std::fs::write(&cache, &bytes);
    }

    let db = open_db(&bytes, &password)?;
    Ok(build_vault_data(db))
}

// ── Raw entry XML ─────────────────────────────────────────────────────────────

/// Pull the `<Entry>…</Entry>` block whose `<UUID>` matches `uuid_b64` out of the
/// full database XML, including its nested `<History>` entries. The current
/// entry's own UUID appears before its history, so the first match's enclosing
/// `<Entry>` is the outer (current) entry.
fn extract_entry_xml(full_xml: &str, uuid_b64: &str) -> Option<String> {
    let needle = format!("<UUID>{uuid_b64}</UUID>");
    let uuid_pos = full_xml.find(&needle)?;
    let start = full_xml[..uuid_pos].rfind("<Entry>")?;

    // Walk forward, balancing nested <Entry>/</Entry> (History holds child entries).
    let mut idx = start;
    let mut depth: i32 = 0;
    loop {
        let next_open = full_xml[idx..].find("<Entry>").map(|p| idx + p);
        let next_close = full_xml[idx..].find("</Entry>").map(|p| idx + p);
        match (next_open, next_close) {
            (Some(o), Some(c)) if o < c => {
                depth += 1;
                idx = o + "<Entry>".len();
            }
            (_, Some(c)) => {
                depth -= 1;
                idx = c + "</Entry>".len();
                if depth == 0 {
                    return Some(full_xml[start..idx].to_string());
                }
            }
            _ => return None,
        }
    }
}

/// Re-indent a flat XML fragment for readable display. Text content has its `<`
/// and `>` escaped, so tag boundaries are the only literal `<`/`>` in the string.
fn pretty_xml(xml: &str) -> String {
    let mut out = String::new();
    let mut depth: i32 = 0;
    for token in xml.replace("><", ">\u{1}<").split('\u{1}') {
        let t = token.trim_start();
        let close_only = t.starts_with("</");
        let decl = t.starts_with("<?");
        let opens = t.starts_with('<') && !close_only && !decl && !t.ends_with("/>");
        let has_inner_close = t.contains("</");

        if close_only {
            depth = (depth - 1).max(0);
        }
        for _ in 0..depth {
            out.push_str("  ");
        }
        out.push_str(token);
        out.push('\n');
        if opens && !has_inner_close {
            depth += 1;
        }
    }
    out
}

/// Return the raw KeePass inner-XML for a single entry (protected values stay
/// encrypted, exactly as stored). Used by the "Metadata / XML" inspector.
#[tauri::command]
pub async fn get_entry_xml(
    app: tauri::AppHandle,
    password: String,
    uuid: String,
) -> Result<String, String> {
    let source = load_source(&app)?;
    let bytes = read_working_bytes(&app, &source).await?;

    let mut cursor = Cursor::new(&bytes);
    let xml_bytes = keepass::Database::get_xml(
        &mut cursor,
        keepass::DatabaseKey::new().with_password(&password),
    )
    .map_err(|e| format!("Failed to read XML: {e}"))?;
    let xml = String::from_utf8_lossy(&xml_bytes);

    let entry_uuid = uuid::Uuid::parse_str(&uuid).map_err(|e| format!("Invalid UUID: {e}"))?;
    let uuid_b64 = BASE64_STANDARD.encode(entry_uuid.as_bytes());

    let fragment =
        extract_entry_xml(&xml, &uuid_b64).ok_or_else(|| "Entry not found in XML".to_string())?;
    Ok(pretty_xml(&fragment))
}

#[tauri::command]
pub async fn save_entry(
    app: tauri::AppHandle,
    password: String,
    entry: EntryUpdate,
) -> Result<SaveResult, String> {
    let source = load_source(&app)?;

    let bytes = read_working_bytes(&app, &source).await?;
    let mut db = open_db(&bytes, &password)?;

    // Resolve a "reference an existing custom icon" request (by UUID) to its
    // CustomIconId before borrowing the entry mutably. (CustomIconId is Copy.)
    let existing_custom: Option<keepass::db::CustomIconId> = entry
        .custom_icon_uuid
        .as_ref()
        .filter(|_| entry.custom_icon_base64.is_none())
        .and_then(|u| {
            db.iter_all_custom_icons()
                .find(|ci| ci.id().uuid().to_string() == *u)
                .map(|ci| ci.id())
        });

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
        // Icon must be set on the EntryMut (needs DB access for custom-icon storage)
        apply_icon(&mut e, &entry, existing_custom)?;
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
            apply_icon(&mut e, &entry, existing_custom)?;
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

    // Re-parse from saved bytes to build the response
    let db2 = open_db(&saved_bytes, &password)?;

    let result = SaveResult {
        vault: build_vault_data(db2),
        saved_uuid,
    };

    // Persist: local writes synchronously, WebDAV caches + PUTs in the background.
    persist_bytes(&app, &source, saved_bytes).await?;

    Ok(result)
}

#[tauri::command]
pub async fn save_group(
    app: tauri::AppHandle,
    password: String,
    group: GroupUpdate,
) -> Result<SaveResult, String> {
    let source = load_source(&app)?;

    let bytes = read_working_bytes(&app, &source).await?;
    let mut db = open_db(&bytes, &password)?;

    // Resolve a "reuse existing custom icon" request (by UUID) before mut-borrowing.
    let existing_custom: Option<keepass::db::CustomIconId> = group
        .custom_icon_uuid
        .as_ref()
        .filter(|_| group.custom_icon_base64.is_none())
        .and_then(|u| {
            db.iter_all_custom_icons()
                .find(|ci| ci.id().uuid().to_string() == *u)
                .map(|ci| ci.id())
        });

    let name = group.name.trim().to_string();
    if name.is_empty() {
        return Err("Group name is required".to_string());
    }

    let saved_uuid = if group.uuid.is_empty() {
        // New group under the given parent (or root).
        let parent_id = if group.parent_uuid.is_empty() {
            db.root().id()
        } else {
            let pu = uuid::Uuid::parse_str(&group.parent_uuid)
                .map_err(|e| format!("Invalid parent UUID: {e}"))?;
            keepass::db::GroupId::from_uuid(pu)
        };
        let mut parent = db
            .group_mut(parent_id)
            .ok_or_else(|| "Parent group not found".to_string())?;
        let mut g = parent.add_group();
        g.name = name;
        apply_group_icon(&mut g, &group, existing_custom)?;
        g.id().to_string()
    } else {
        let gu = uuid::Uuid::parse_str(&group.uuid)
            .map_err(|e| format!("Invalid group UUID: {e}"))?;
        let gid = keepass::db::GroupId::from_uuid(gu);
        {
            let mut g = db
                .group_mut(gid)
                .ok_or_else(|| "Group not found".to_string())?;
            g.name = name;
            apply_group_icon(&mut g, &group, existing_custom)?;
        }
        group.uuid.clone()
    };

    let mut saved_bytes: Vec<u8> = Vec::new();
    db.save(
        &mut saved_bytes,
        keepass::DatabaseKey::new().with_password(&password),
    )
    .map_err(|e| format!("Failed to save: {e}"))?;

    let db2 = open_db(&saved_bytes, &password)?;
    let result = SaveResult {
        vault: build_vault_data(db2),
        saved_uuid,
    };

    persist_bytes(&app, &source, saved_bytes).await?;

    Ok(result)
}
