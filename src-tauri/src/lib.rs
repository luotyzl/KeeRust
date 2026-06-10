mod attachments;
mod favicon;
mod source;
mod vault;
mod webdav;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            source::get_vault_source,
            source::save_webdav_config,
            source::open_local_file,
            vault::open_database,
            vault::force_sync,
            vault::delete_entry,
            vault::restore_entry,
            vault::delete_entry_permanent,
            vault::save_entry,
            favicon::fetch_favicon,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
