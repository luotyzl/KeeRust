mod attachments;
mod vault;
mod webdav;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            webdav::get_webdav_config,
            webdav::save_webdav_config,
            vault::open_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
