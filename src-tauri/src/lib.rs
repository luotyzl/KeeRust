mod attachments;
mod autotype;
mod favicon;
mod source;
mod vault;
mod webdav;

use autotype::AutotypeState;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Ctrl+K = bring app forward; Alt+Shift+T = auto-type (KeeWeb's default).
    let ctrl_k = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyK);
    let autotype_sc = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyT);
    let (ctrl_k_h, autotype_h) = (ctrl_k.clone(), autotype_sc.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &ctrl_k_h {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    } else if shortcut == &autotype_h {
                        // Capture the target window NOW, before we touch focus.
                        let (hwnd, title, url) = autotype::capture_foreground();
                        let state = app.state::<AutotypeState>();
                        *state.target_hwnd.lock().unwrap() =
                            if hwnd != 0 { Some(hwnd) } else { None };
                        let _ = app.emit("auto-type", autotype::AutoTypeTrigger { title, url });
                    }
                })
                .build(),
        )
        .manage(AutotypeState::default())
        .setup(move |app| {
            // Ignore failures (e.g. a shortcut already taken system-wide) so the
            // app still launches.
            let _ = app.global_shortcut().register(ctrl_k);
            let _ = app.global_shortcut().register(autotype_sc);
            Ok(())
        })
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
            vault::get_entry_xml,
            favicon::fetch_favicon,
            autotype::autotype_run,
            autotype::autotype_text,
            autotype::focus_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
