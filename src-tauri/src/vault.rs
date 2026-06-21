use base64::prelude::*;
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::attachments::mime_type;
use crate::source::{
    load_keyfile_path, load_source, save_keyfile_path, save_source, VaultSource,
};

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
    pub index: usize,    // position in the entry's history vec (0 = most recent)
    pub modified: String, // "Saved" time, RFC3339 UTC ("" if unknown)
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: String,
    pub notes: String,
    pub otp_uri: Option<String>,
    pub tags: Vec<String>,
    pub expires: bool,
    pub expiry: String,
    pub icon_id: i64,
    pub custom_icon_base64: Option<String>,
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
    pub created: String,                    // creation time, RFC3339 UTC ("" if unknown)
    pub modified: String,                   // last modification time, RFC3339 UTC ("" if unknown)
    pub expires: bool,                      // whether the entry has an expiry set
    pub expiry: String,                     // expiry time "YYYY-MM-DDTHH:MM:SS" ("" if none)
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

#[derive(Serialize, Clone)]
pub struct KdfSettings {
    pub kind: String,     // "argon2d" | "argon2id" | "aes"
    pub iterations: u64,  // Argon2 iterations, or AES rounds
    pub memory: u64,      // Argon2 memory in KiB (0 for AES)
    pub parallelism: u32, // Argon2 parallelism (0 for AES)
}

#[derive(Serialize)]
pub struct VaultData {
    pub groups: Vec<GroupData>,
    pub entries: Vec<EntryData>,
    pub recycle_bin_uuid: Option<String>,
    pub custom_icons: Vec<CustomIconData>, // all custom icons in the DB (pickable)
    pub kdf: KdfSettings,                   // key-derivation settings (for the Advanced dialog)
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
    // The following are optional so older payloads leave them unchanged.
    #[serde(default)]
    pub tags: Option<Vec<String>>, // None = leave existing tags untouched
    #[serde(default)]
    pub expires: Option<bool>, // None = leave expiry flag untouched
    #[serde(default)]
    pub expiry: Option<String>, // "YYYY-MM-DD" when expires is true
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

/// Sidecar file holding the server's `Last-Modified` revision for the bytes
/// currently in the cache — used to detect remote changes without downloading
/// the whole file (unless the source opts out via `always_reload`).
fn cache_rev_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to resolve app data dir")
        .join("db_cache.rev")
}

fn load_cache_rev(app: &tauri::AppHandle) -> Option<String> {
    let rev = std::fs::read_to_string(cache_rev_path(app)).ok()?;
    let rev = rev.trim().to_string();
    if rev.is_empty() {
        None
    } else {
        Some(rev)
    }
}

/// Record (or, with `None`, forget) the revision matching the cached bytes.
fn save_cache_rev(app: &tauri::AppHandle, rev: Option<&str>) {
    let path = cache_rev_path(app);
    match rev {
        Some(r) if !r.is_empty() => {
            if let Some(p) = path.parent() {
                let _ = std::fs::create_dir_all(p);
            }
            let _ = std::fs::write(path, r);
        }
        _ => {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Delete the local WebDAV cache (and its revision marker). Called whenever the
/// active database changes so a stale cache from the previous database is never
/// served (it belongs to a different file and won't even open under the new key).
pub fn clear_db_cache(app: &tauri::AppHandle) {
    let _ = std::fs::remove_file(cache_path(app));
    let _ = std::fs::remove_file(cache_rev_path(app));
}

// ── Open / persist helpers ──────────────────────────────────────────────────────

/// Build the master key (password + optional key file) for the active vault.
/// The key file path is persisted separately (see `source.rs`) and applied to
/// every open/save, so individual commands only need to pass the password.
fn db_key(app: &tauri::AppHandle, password: &str) -> Result<keepass::DatabaseKey, String> {
    let mut key = keepass::DatabaseKey::new();
    if !password.is_empty() {
        key = key.with_password(password);
    }
    if let Some(path) = load_keyfile_path(app) {
        let mut f = std::fs::File::open(&path)
            .map_err(|e| format!("Failed to open key file: {e}"))?;
        key = key
            .with_keyfile(&mut f)
            .map_err(|e| format!("Failed to read key file: {e}"))?;
    }
    Ok(key)
}

/// Decrypt KDBX bytes with the active vault's master key (password + key file).
fn open_db(
    app: &tauri::AppHandle,
    bytes: &[u8],
    password: &str,
) -> Result<keepass::Database, String> {
    let mut cursor = Cursor::new(bytes);
    keepass::Database::open(&mut cursor, db_key(app, password)?)
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

/// Write the local WebDAV cache (best-effort).
fn write_cache(app: &tauri::AppHandle, bytes: &[u8]) {
    let cache = cache_path(app);
    if let Some(p) = cache.parent() {
        let _ = std::fs::create_dir_all(p);
    }
    let _ = std::fs::write(&cache, bytes);
}

/// Upload to WebDAV in the background, recording the new revision the server
/// reports and announcing the outcome via `sync-status`.
fn spawn_upload(app: &tauri::AppHandle, config: crate::webdav::WebDavConfig, bytes: Vec<u8>) {
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        match crate::webdav::put_db_bytes(&config, bytes).await {
            Ok(rev) => {
                // The cached bytes now match what's on the server at this revision.
                save_cache_rev(&app2, rev.as_deref());
                app2.emit("sync-status", serde_json::json!({"ok": true})).ok();
            }
            Err(e) => {
                app2.emit("sync-status", serde_json::json!({"ok": false, "error": e}))
                    .ok();
            }
        }
    });
}

/// For a WebDAV source, decide whether the server differs from our cached copy
/// and, if so, return the current server bytes (to merge against). When the
/// source trusts `Last-Modified`, a cheap HEAD avoids downloading an unchanged
/// file; otherwise (or when the header is missing/changed) the file is fetched
/// and compared by content. Refreshes the recorded revision when it downloads.
async fn webdav_remote_bytes_if_changed(
    app: &tauri::AppHandle,
    config: &crate::webdav::WebDavConfig,
    base_bytes: &[u8],
) -> Result<Option<Vec<u8>>, String> {
    // Fast path: trust the server's Last-Modified header.
    if !config.always_reload {
        if let Some(cache_rev) = load_cache_rev(app) {
            if crate::webdav::last_modified(config).await?.as_deref() == Some(cache_rev.as_str()) {
                return Ok(None); // server unchanged since we cached
            }
        }
    }

    // Full reload: download and compare by content.
    let (bytes, rev) = crate::webdav::fetch_with_rev(config).await?;
    if bytes == base_bytes {
        save_cache_rev(app, rev.as_deref());
        Ok(None)
    } else {
        Ok(Some(bytes))
    }
}

/// Serialize a mutated database and persist it back to the source — the single
/// write path for every command that changes the vault.
///
/// - **Local file:** write synchronously; an error means the change did not save.
/// - **WebDAV:** reconcile with the server *before* pushing, so a concurrent edit
///   from another device is never overwritten (KeeWeb's sync model). We treat the
///   exact bytes we loaded (`base_bytes`, i.e. the cache we edited) as our known
///   revision. If the current server copy differs, we open it and fold our changes
///   into it with a lossless, UUID-based KDBX merge before saving. The merged
///   result is cached immediately and uploaded (HTTP PUT) in the background.
///
/// `remote_password` opens the *current server* copy (the pre-change key, for the
/// key-management commands); `save_key` encrypts the result. Returns the persisted
/// (possibly merged) database itself, so the caller can build vault data from it
/// without a redundant decrypt — every key-derivation here runs the Argon2 KDF.
async fn reconcile_and_persist(
    app: &tauri::AppHandle,
    source: &VaultSource,
    base_bytes: &[u8],
    mut db: keepass::Database,
    remote_password: &str,
    save_key: keepass::DatabaseKey,
) -> Result<keepass::Database, String> {
    // Local files: straight, synchronous write.
    if source.is_local() {
        let mut out = Vec::new();
        db.save(&mut out, save_key)
            .map_err(|e| format!("Failed to save: {e}"))?;
        source.put(out).await?;
        return Ok(db);
    }

    // WebDAV: reconcile with the current server copy before pushing.
    let config = source
        .webdav_config()
        .expect("non-local source must be WebDAV")
        .clone();
    match webdav_remote_bytes_if_changed(app, &config, base_bytes).await {
        // Server changed since we cached → merge our edits into it (lossless).
        Ok(Some(remote_bytes)) => {
            let remote_db = open_db(app, &remote_bytes, remote_password)
                .map_err(|e| format!("Failed to open the remote database to merge: {e}"))?;
            db.merge(&remote_db)
                .map_err(|e| format!("Failed to merge with the remote database: {e}"))?;
        }
        // Server unchanged → safe to push our version as-is.
        Ok(None) => {}
        // Offline / server error → keep the change in the local cache and let the
        // next successful sync push it; surface the failure via sync-status.
        Err(e) => {
            let mut out = Vec::new();
            db.save(&mut out, save_key)
                .map_err(|e| format!("Failed to save: {e}"))?;
            write_cache(app, &out);
            save_cache_rev(app, None); // cache no longer matches a known server revision
            app.emit("sync-status", serde_json::json!({"ok": false, "error": e}))
                .ok();
            return Ok(db);
        }
    }

    // Serialize the (possibly merged) database, cache it, and upload. The new
    // revision is recorded once the background upload reports it.
    let mut out = Vec::new();
    db.save(&mut out, save_key)
        .map_err(|e| format!("Failed to save: {e}"))?;
    write_cache(app, &out);
    save_cache_rev(app, None);
    spawn_upload(app, config, out);
    Ok(db)
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

    // Tags (only when provided, so older payloads preserve existing tags).
    if let Some(tags) = &update.tags {
        entry.tags = tags
            .iter()
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect();
    }

    // Expiry (only when provided).
    if let Some(expires) = update.expires {
        entry.times.expires = Some(expires);
        if expires {
            entry.times.expiry = update.expiry.as_ref().and_then(|d| parse_expiry(d));
        }
    }
}

// Parse an expiry string from the frontend. Accepts a full datetime
// ("YYYY-MM-DDTHH:MM[:SS]") and falls back to a bare date (midnight).
fn parse_expiry(s: &str) -> Option<chrono::NaiveDateTime> {
    chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")
        .ok()
        .or_else(|| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").ok())
        .or_else(|| {
            chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
                .ok()
                .and_then(|d| d.and_hms_opt(0, 0, 0))
        })
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

    // KDBX stores times in UTC; emit RFC3339 so the frontend can localize them.
    let fmt_time = |t: Option<chrono::NaiveDateTime>| {
        t.map(|t| t.format("%Y-%m-%dT%H:%M:%SZ").to_string())
            .unwrap_or_default()
    };

    let history: Vec<HistoryEntry> = entry
        .history
        .as_ref()
        .map(|h| {
            h.get_entries()
                .iter()
                .enumerate()
                .map(|(index, e)| {
                    // History entries store a built-in icon directly; fall back to
                    // the live entry's resolved icon for custom/unset icons.
                    let (h_icon_id, h_custom) = match e.icon() {
                        Some(keepass::db::Icon::BuiltIn(n)) => (*n as i64, None),
                        _ => (icon_id, custom_icon_base64.clone()),
                    };
                    HistoryEntry {
                        index,
                        modified: fmt_time(e.times.last_modification),
                        title: get_field(e, "Title"),
                        username: get_field(e, "UserName"),
                        password: get_field(e, "Password"),
                        url: get_field(e, "URL"),
                        notes: get_field(e, "Notes"),
                        otp_uri: resolve_otp_uri(e),
                        tags: e.tags.clone(),
                        expires: e.times.expires.unwrap_or(false),
                        expiry: e
                            .times
                            .expiry
                            .map(|t| t.format("%Y-%m-%dT%H:%M:%S").to_string())
                            .unwrap_or_default(),
                        icon_id: h_icon_id,
                        custom_icon_base64: h_custom,
                    }
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
        created: fmt_time(entry.times.creation),
        modified: fmt_time(entry.times.last_modification),
        expires: entry.times.expires.unwrap_or(false),
        expiry: entry
            .times
            .expiry
            .map(|t| t.format("%Y-%m-%dT%H:%M:%S").to_string())
            .unwrap_or_default(),
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

/// Map the database's KDF config to the outbound settings shape.
fn read_kdf_settings(cfg: &keepass::config::KdfConfig) -> KdfSettings {
    use keepass::config::KdfConfig;
    match cfg {
        KdfConfig::Aes { rounds } => KdfSettings {
            kind: "aes".to_string(),
            iterations: *rounds,
            memory: 0,
            parallelism: 0,
        },
        KdfConfig::Argon2 {
            iterations,
            memory,
            parallelism,
            ..
        } => KdfSettings {
            kind: "argon2d".to_string(),
            iterations: *iterations,
            memory: *memory,
            parallelism: *parallelism,
        },
        KdfConfig::Argon2id {
            iterations,
            memory,
            parallelism,
            ..
        } => KdfSettings {
            kind: "argon2id".to_string(),
            iterations: *iterations,
            memory: *memory,
            parallelism: *parallelism,
        },
        // `KdfConfig` is #[non_exhaustive]; report unknown variants as argon2d.
        _ => KdfSettings {
            kind: "argon2d".to_string(),
            iterations: 0,
            memory: 0,
            parallelism: 0,
        },
    }
}

fn build_vault_data(db: keepass::Database) -> VaultData {
    let kdf = read_kdf_settings(&db.config.kdf_config);
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
        kdf,
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
        let db = open_db(&app, &bytes, &password)?;
        return Ok(build_vault_data(db));
    }

    // WebDAV: cache-first — serve from disk immediately, check remote in background.
    let config = source
        .webdav_config()
        .expect("non-local source must be WebDAV")
        .clone();
    let cache = cache_path(&app);
    let mut used_cache = false;

    let bytes = if cache.exists() {
        match std::fs::read(&cache) {
            Ok(b) => {
                used_cache = true;
                b
            }
            Err(_) => {
                // Cache unreadable — fall back to WebDAV.
                let (b, rev) = crate::webdav::fetch_with_rev(&config).await?;
                write_cache(&app, &b);
                save_cache_rev(&app, rev.as_deref());
                b
            }
        }
    } else {
        // First open: fetch from WebDAV and store locally.
        let (b, rev) = crate::webdav::fetch_with_rev(&config).await?;
        write_cache(&app, &b);
        save_cache_rev(&app, rev.as_deref());
        b
    };

    let db = open_db(&app, &bytes, &password)?;

    // Background: check whether the server has a newer version than the cache we
    // just served; if so, refresh the cache and notify the UI. Uses a cheap HEAD
    // when the source trusts Last-Modified, otherwise downloads to compare.
    if used_cache {
        let app2 = app.clone();
        let config2 = config.clone();
        let cache_bytes = bytes.clone();
        tauri::async_runtime::spawn(async move {
            if !config2.always_reload {
                if let (Ok(remote_rev), Some(cache_rev)) =
                    (crate::webdav::last_modified(&config2).await, load_cache_rev(&app2))
                {
                    if remote_rev.as_deref() == Some(cache_rev.as_str()) {
                        return; // unchanged — nothing to download
                    }
                }
            }
            if let Ok((remote_bytes, rev)) = crate::webdav::fetch_with_rev(&config2).await {
                if remote_bytes != cache_bytes {
                    write_cache(&app2, &remote_bytes);
                    save_cache_rev(&app2, rev.as_deref());
                    app2.emit("db-remote-updated", ()).ok();
                } else {
                    save_cache_rev(&app2, rev.as_deref());
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

/// Collect every entry id under `gid`, recursing into subgroups.
fn collect_all_entry_ids(
    db: &keepass::Database,
    gid: keepass::db::GroupId,
    out: &mut Vec<keepass::db::EntryId>,
) {
    let (entries, subgroups): (Vec<_>, Vec<_>) = match db.group(gid) {
        Some(g) => (g.entry_ids().collect(), g.group_ids().collect()),
        None => return,
    };
    out.extend(entries);
    for sg in subgroups {
        collect_all_entry_ids(db, sg, out);
    }
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
    let mut db = open_db(&app, &bytes, &password)?;

    mutate(&mut db)?;

    let save_key = db_key(&app, &password)?;
    let db2 = reconcile_and_persist(&app, &source, &bytes, db, &password, save_key).await?;

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

/// Delete a group: rescue all of its entries (recursively, including those in
/// subgroups) to the Recycle Bin, then remove the group itself.
#[tauri::command]
pub async fn delete_group(
    app: tauri::AppHandle,
    password: String,
    uuid: String,
) -> Result<VaultData, String> {
    mutate_and_persist(app, password, move |db| {
        let gu = uuid::Uuid::parse_str(&uuid).map_err(|e| format!("Invalid group UUID: {e}"))?;
        let gid = keepass::db::GroupId::from_uuid(gu);

        if db.group(gid).is_none() {
            return Err("Group not found".to_string());
        }
        if db.root().id().uuid() == gu {
            return Err("Cannot delete the root group".to_string());
        }
        if db.recycle_bin().map(|rb| rb.id().uuid()) == Some(gu) {
            return Err("Cannot delete the Recycle Bin".to_string());
        }

        // Move every entry under the group into the Recycle Bin so nothing is
        // permanently lost; the group's (now empty) subgroups go with it.
        let recycle_bin_id = get_or_create_recycle_bin(db);
        let mut entry_ids = Vec::new();
        collect_all_entry_ids(db, gid, &mut entry_ids);
        for eid in entry_ids {
            if let Some(mut e) = db.entry_mut(eid) {
                e.move_to(recycle_bin_id)
                    .map_err(|_| "Failed to move entry to Recycle Bin".to_string())?;
            }
        }

        db.group_mut(gid)
            .ok_or_else(|| "Group not found".to_string())?
            .remove(); // consumes GroupMut — removes the group and any subgroups
        Ok(())
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

/// Delete a single history state (by its index in the entry's history vec).
#[tauri::command]
pub async fn delete_entry_history(
    app: tauri::AppHandle,
    password: String,
    uuid: String,
    index: usize,
) -> Result<VaultData, String> {
    mutate_and_persist(app, password, move |db| {
        let entry_id = parse_entry_id(&uuid)?;
        let mut e = db
            .entry_mut(entry_id)
            .ok_or_else(|| "Entry not found".to_string())?;

        let mut kept: Vec<keepass::db::Entry> = e
            .history
            .as_ref()
            .map(|h| h.get_entries().clone())
            .ok_or_else(|| "Entry has no history".to_string())?;
        if index >= kept.len() {
            return Err("History index out of range".to_string());
        }
        kept.remove(index);

        // History has no public remove API; rebuild it. add_entry inserts at the
        // front, so replay the kept states in reverse to preserve their order.
        let mut rebuilt = keepass::db::History::default();
        for h in kept.into_iter().rev() {
            rebuilt.add_entry(h);
        }
        e.history = Some(rebuilt);
        Ok(())
    })
    .await
}

/// Revert an entry to one of its history states (by index). The entry's current
/// state is first pushed onto its history, then its fields are overwritten with
/// the chosen historical version — so reverting itself is undoable.
#[tauri::command]
pub async fn revert_entry_history(
    app: tauri::AppHandle,
    password: String,
    uuid: String,
    index: usize,
) -> Result<VaultData, String> {
    mutate_and_persist(app, password, move |db| {
        let entry_id = parse_entry_id(&uuid)?;
        let mut e = db
            .entry_mut(entry_id)
            .ok_or_else(|| "Entry not found".to_string())?;

        // Grab the historical version to restore.
        let snap = {
            let entries = e
                .history
                .as_ref()
                .map(|h| h.get_entries())
                .ok_or_else(|| "Entry has no history".to_string())?;
            entries
                .get(index)
                .cloned()
                .ok_or_else(|| "History index out of range".to_string())?
        };

        // Push the current state onto history so the revert can be undone.
        let mut current = (*e).clone();
        current.history = None;
        e.history.get_or_insert_default().add_entry(current);

        // Overwrite the live fields with the historical version. Preserve the
        // creation time and stamp the modification time as now.
        let creation = e.times.creation;
        e.fields = snap.fields.clone();
        e.autotype = snap.autotype.clone();
        e.tags = snap.tags.clone();
        e.custom_data = snap.custom_data.clone();
        e.foreground_color = snap.foreground_color.clone();
        e.background_color = snap.background_color.clone();
        e.override_url = snap.override_url.clone();
        e.quality_check = snap.quality_check;
        e.times.expiry = snap.times.expiry;
        e.times.expires = snap.times.expires;
        e.times.creation = creation;
        e.times.last_modification = Some(keepass::db::Times::now());

        // Icon: built-in restores directly; custom is re-referenced; none clears.
        match snap.icon().cloned() {
            Some(keepass::db::Icon::BuiltIn(n)) => e.set_icon_builtin(n),
            Some(keepass::db::Icon::Custom(id)) => {
                let _ = e.set_icon_custom(id);
            }
            None => e.set_icon_none(),
        }
        Ok(())
    })
    .await
}

/// Attach a file to an entry. `data_base64` is the raw file contents; `name`
/// is the filename used as the attachment key (replacing any existing one).
#[tauri::command]
pub async fn add_entry_attachment(
    app: tauri::AppHandle,
    password: String,
    uuid: String,
    name: String,
    data_base64: String,
) -> Result<VaultData, String> {
    mutate_and_persist(app, password, move |db| {
        let bytes = BASE64_STANDARD
            .decode(&data_base64)
            .map_err(|e| format!("Invalid file data: {e}"))?;
        let entry_id = parse_entry_id(&uuid)?;
        let mut e = db
            .entry_mut(entry_id)
            .ok_or_else(|| "Entry not found".to_string())?;
        e.add_attachment(name, keepass::db::Value::Unprotected(bytes));
        e.times.last_modification = Some(keepass::db::Times::now());
        Ok(())
    })
    .await
}

/// Remove an attachment from an entry by its filename.
#[tauri::command]
pub async fn delete_entry_attachment(
    app: tauri::AppHandle,
    password: String,
    uuid: String,
    name: String,
) -> Result<VaultData, String> {
    mutate_and_persist(app, password, move |db| {
        let entry_id = parse_entry_id(&uuid)?;
        let mut e = db
            .entry_mut(entry_id)
            .ok_or_else(|| "Entry not found".to_string())?;
        e.remove_attachment_by_name(&name);
        e.times.last_modification = Some(keepass::db::Times::now());
        Ok(())
    })
    .await
}

/// Delete one or more custom icons from the database. Any entries or groups still
/// using a deleted icon revert to a default icon — `CustomIconMut::remove` clears
/// every reference (current *and* historical) before removing the icon, so no
/// entry is ever left pointing at a missing icon.
#[tauri::command]
pub async fn delete_custom_icons(
    app: tauri::AppHandle,
    password: String,
    uuids: Vec<String>,
) -> Result<VaultData, String> {
    mutate_and_persist(app, password, move |db| {
        // Resolve all target icon ids up front (removal mutates the icon map).
        let ids: Vec<keepass::db::CustomIconId> = db
            .iter_all_custom_icons()
            .filter(|ci| uuids.iter().any(|u| *u == ci.id().uuid().to_string()))
            .map(|ci| ci.id())
            .collect();
        for id in ids {
            if let Some(icon) = db.custom_icon_mut(id) {
                icon.remove();
            }
        }
        Ok(())
    })
    .await
}

/// Manual "Sync" button: reconcile the local copy with the origin in both
/// directions so nothing is lost on either side.
///
/// - **Local file:** re-read from disk to pick up external edits.
/// - **WebDAV:** if the server copy differs from our cache, merge them (lossless,
///   UUID-based) and push the union back, so edits made here *and* on another
///   device are preserved. Otherwise just refresh the view.
#[tauri::command]
pub async fn force_sync(
    app: tauri::AppHandle,
    password: String,
) -> Result<VaultData, String> {
    let source = load_source(&app)?;

    // Local files have no cache to reconcile — read straight from disk.
    if source.is_local() {
        let bytes = source.fetch().await?;
        let db = open_db(&app, &bytes, &password)?;
        return Ok(build_vault_data(db));
    }

    // WebDAV: our local cache (with any unpushed edits) vs. the current server
    // copy. A manual Sync always downloads (it's an explicit, forced refresh).
    let config = source
        .webdav_config()
        .expect("non-local source must be WebDAV")
        .clone();
    let cache_bytes = read_working_bytes(&app, &source).await?;
    let (remote_bytes, remote_rev) = crate::webdav::fetch_with_rev(&config).await?;

    let mut local_db = open_db(&app, &cache_bytes, &password)?;

    if remote_bytes == cache_bytes {
        // Already in sync — record the revision and refresh the view.
        save_cache_rev(&app, remote_rev.as_deref());
        return Ok(build_vault_data(local_db));
    }

    // Both sides may have changed: fold the server copy into our local one.
    let remote_db = open_db(&app, &remote_bytes, &password)?;
    local_db
        .merge(&remote_db)
        .map_err(|e| format!("Failed to merge with the remote database: {e}"))?;

    // Cache + upload the merged union, then return the reconciled view (built from
    // the in-memory database, so we don't decrypt it again).
    let mut merged_bytes = Vec::new();
    local_db
        .save(&mut merged_bytes, db_key(&app, &password)?)
        .map_err(|e| format!("Failed to save: {e}"))?;
    write_cache(&app, &merged_bytes);
    save_cache_rev(&app, None);
    spawn_upload(&app, config, merged_bytes);

    Ok(build_vault_data(local_db))
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
    let xml_bytes = keepass::Database::get_xml(&mut cursor, db_key(&app, &password)?)
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
    let mut db = open_db(&app, &bytes, &password)?;

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

    // Persist: local writes synchronously; WebDAV reconciles with the server
    // (merging concurrent edits) then caches + PUTs in the background. The
    // persisted (possibly merged) database is returned so we can build the
    // response without re-decrypting.
    let save_key = db_key(&app, &password)?;
    let db2 = reconcile_and_persist(&app, &source, &bytes, db, &password, save_key).await?;

    let result = SaveResult {
        vault: build_vault_data(db2),
        saved_uuid,
    };

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
    let mut db = open_db(&app, &bytes, &password)?;

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

    let save_key = db_key(&app, &password)?;
    let db2 = reconcile_and_persist(&app, &source, &bytes, db, &password, save_key).await?;

    let result = SaveResult {
        vault: build_vault_data(db2),
        saved_uuid,
    };

    Ok(result)
}

// ── Database creation / key management ────────────────────────────────────────

/// Create a brand-new KDBX4 database. Prompts for a save location, writes an
/// empty database named `name` encrypted with `password`, makes it the active
/// (local) source, and returns its vault data. `Ok(None)` if the user cancels.
#[tauri::command]
pub async fn create_database(
    app: tauri::AppHandle,
    name: String,
    password: String,
) -> Result<Option<VaultData>, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Database name is required".to_string());
    }
    if password.is_empty() {
        return Err("Password is required".to_string());
    }

    let picked = app
        .dialog()
        .file()
        .add_filter("KeePass database", &["kdbx"])
        .set_file_name(format!("{name}.kdbx"))
        .blocking_save_file();
    let Some(file) = picked else {
        return Ok(None); // user cancelled
    };
    let path = file
        .into_path()
        .map_err(|e| format!("Invalid file path: {e}"))?;

    // A fresh database defaults to KDBX4 (the only version we can save).
    let mut db = keepass::Database::new();
    // The crate's default KDF is very heavy (Argon2 ~1 GiB / 50 iterations),
    // which makes every open/save slow. Tune it down to KeePass's standard
    // Argon2d settings (64 MiB / 2 iterations / 2 lanes); the user can change
    // this later via Settings → Key Derivation.
    if let keepass::config::KdfConfig::Argon2 {
        iterations,
        memory,
        parallelism,
        ..
    } = &mut db.config.kdf_config
    {
        *iterations = 2;
        *memory = 65536;
        *parallelism = 2;
    }
    {
        let mut root = db.root_mut();
        root.name = name.clone();
    }
    db.meta.database_name = Some(name);
    db.meta.generator = Some("KeeRust".to_string());

    // New database: password only, no key file yet.
    let mut bytes: Vec<u8> = Vec::new();
    db.save(
        &mut bytes,
        keepass::DatabaseKey::new().with_password(&password),
    )
    .map_err(|e| format!("Failed to create database: {e}"))?;
    std::fs::write(&path, &bytes).map_err(|e| format!("Failed to write file: {e}"))?;

    // Switch the active source to the new file and clear any prior key file +
    // the previous database's cache.
    let source = VaultSource::Local {
        path: path.to_string_lossy().to_string(),
    };
    save_source(&app, &source)?;
    save_keyfile_path(&app, None)?;
    clear_db_cache(&app);

    let db2 = open_db(&app, &bytes, &password)?;
    Ok(Some(build_vault_data(db2)))
}

/// Rename the database (sets the root group name and the meta database name).
#[tauri::command]
pub async fn rename_database(
    app: tauri::AppHandle,
    password: String,
    name: String,
) -> Result<VaultData, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Database name is required".to_string());
    }
    mutate_and_persist(app, password, move |db| {
        {
            let mut root = db.root_mut();
            root.name = name.clone();
        }
        db.meta.database_name = Some(name);
        Ok(())
    })
    .await
}

/// Change the master password. Verifies the current key, then re-encrypts the
/// database with `new_password` (keeping any associated key file in the key).
#[tauri::command]
pub async fn change_master_password(
    app: tauri::AppHandle,
    password: String,
    new_password: String,
) -> Result<(), String> {
    if new_password.is_empty() {
        return Err("New password cannot be empty".to_string());
    }
    let source = load_source(&app)?;
    let bytes = read_working_bytes(&app, &source).await?;

    let mut db = open_db(&app, &bytes, &password)?; // verifies the current key
    db.meta.master_key_changed = Some(keepass::db::Times::now());

    // Reconcile against the server (still under the old key) before re-encrypting
    // with the new one, so concurrent edits aren't lost.
    let save_key = db_key(&app, &new_password)?;
    reconcile_and_persist(&app, &source, &bytes, db, &password, save_key).await?;
    Ok(())
}

/// Change the key-derivation function settings and re-encrypt the database with
/// them. `kind` is "argon2d" | "argon2id" | "aes"; `iterations` doubles as the
/// AES round count; `memory` (KiB) and `parallelism` apply to Argon2 only.
#[tauri::command]
pub async fn set_kdf_settings(
    app: tauri::AppHandle,
    password: String,
    kind: String,
    iterations: u64,
    memory: u64,
    parallelism: u32,
) -> Result<VaultData, String> {
    use keepass::config::{DatabaseConfig, KdfConfig};

    let kind = kind.to_lowercase();
    match kind.as_str() {
        "aes" => {
            if iterations < 1 {
                return Err("AES rounds must be at least 1.".to_string());
            }
        }
        "argon2d" | "argon2id" => {
            if iterations < 1 {
                return Err("Iterations must be at least 1.".to_string());
            }
            if parallelism < 1 {
                return Err("Parallelism must be at least 1.".to_string());
            }
            // Argon2 requires at least 8 KiB of memory per lane.
            if memory < 8 * parallelism as u64 {
                return Err("Memory is too low for the chosen parallelism.".to_string());
            }
        }
        _ => return Err("Unknown key derivation function.".to_string()),
    }

    mutate_and_persist(app, password, move |db| {
        let new_cfg = if kind == "aes" {
            KdfConfig::Aes { rounds: iterations }
        } else {
            // Reuse the current Argon2 version, or fall back to the crate default
            // (so a switch from AES still gets a valid version).
            let version = match &db.config.kdf_config {
                KdfConfig::Argon2 { version, .. } | KdfConfig::Argon2id { version, .. } => *version,
                _ => match DatabaseConfig::default().kdf_config {
                    KdfConfig::Argon2 { version, .. } => version,
                    _ => unreachable!("the crate default KDF is Argon2"),
                },
            };
            if kind == "argon2id" {
                KdfConfig::Argon2id {
                    iterations,
                    memory,
                    parallelism,
                    version,
                }
            } else {
                KdfConfig::Argon2 {
                    iterations,
                    memory,
                    parallelism,
                    version,
                }
            }
        };
        db.config.kdf_config = new_cfg;
        Ok(())
    })
    .await
}

/// Generate a new 32-byte binary key file, save it to a chosen location, and add
/// it to the database's master key (re-encrypting with password + key file).
/// Returns the key file path, or `Ok(None)` if the user cancels.
#[tauri::command]
pub async fn generate_key_file(
    app: tauri::AppHandle,
    password: String,
) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Key file", &["key"])
        .set_file_name("keerust.key")
        .blocking_save_file();
    let Some(file) = picked else {
        return Ok(None); // user cancelled
    };
    let path = file
        .into_path()
        .map_err(|e| format!("Invalid file path: {e}"))?;

    // 32 cryptographically-random bytes (UUID v4 = 16 random bytes each). A
    // 32-byte binary key file is used verbatim by KeePass 2.x and KeePassXC.
    let mut key_bytes = Vec::with_capacity(32);
    key_bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    key_bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    std::fs::write(&path, &key_bytes).map_err(|e| format!("Failed to write key file: {e}"))?;

    // Re-encrypt the database so the key file is now required to open it.
    let source = load_source(&app)?;
    let bytes = read_working_bytes(&app, &source).await?;
    let mut db = open_db(&app, &bytes, &password)?; // current key
    db.meta.master_key_changed = Some(keepass::db::Times::now());

    let new_key = {
        let mut f = std::fs::File::open(&path)
            .map_err(|e| format!("Failed to open key file: {e}"))?;
        keepass::DatabaseKey::new()
            .with_password(&password)
            .with_keyfile(&mut f)
            .map_err(|e| format!("Failed to read key file: {e}"))?
    };
    // The server copy is still password-only (the key file isn't stored until
    // after this); reconcile under the password before re-encrypting with the
    // new password + key file.
    reconcile_and_persist(&app, &source, &bytes, db, &password, new_key).await?;

    // Persist the key file path so future opens include it.
    let path_str = path.to_string_lossy().to_string();
    save_keyfile_path(&app, Some(path_str.clone()))?;
    Ok(Some(path_str))
}

/// Remove the key file from the database's master key: re-encrypt with the
/// password only, then clear the stored key file path. The on-disk key file is
/// left in place (the user can delete it themselves).
#[tauri::command]
pub async fn remove_key_file(
    app: tauri::AppHandle,
    password: String,
) -> Result<(), String> {
    if password.is_empty() {
        return Err("A password is required to remove the key file".to_string());
    }
    let source = load_source(&app)?;
    let bytes = read_working_bytes(&app, &source).await?;

    let mut db = open_db(&app, &bytes, &password)?; // current key (password + key file)
    db.meta.master_key_changed = Some(keepass::db::Times::now());

    // Reconcile against the server (still password + key file) before re-encrypting
    // with the password only. `remote_password` is the current password; the stored
    // key-file path is cleared *after* the write, so the merge still opens the
    // remote with the key file. The save key is explicitly password-only — NOT
    // `db_key`, which would re-add the key file we're dropping.
    let save_key = keepass::DatabaseKey::new().with_password(&password);
    reconcile_and_persist(&app, &source, &bytes, db, &password, save_key).await?;

    save_keyfile_path(&app, None)?;
    Ok(())
}
