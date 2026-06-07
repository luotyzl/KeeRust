mod attachments;
mod favicon;
mod vault;
mod webdav;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            webdav::get_webdav_config,
            webdav::save_webdav_config,
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
