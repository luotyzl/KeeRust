mod attachments;
mod autotype;
mod favicon;
mod source;
#[cfg(windows)]
mod syslock;
mod vault;
mod webdav;

use autotype::AutotypeState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

// Allow navigation only within the app's own pages (prod: tauri://localhost /
// https://tauri.localhost; dev: http://localhost:<port>). Everything else is
// blocked — the desktop equivalent of KeeWeb's Electron `will-navigate` guard,
// so a stray link or dropped file can't replace the SPA.
fn is_app_url(url: &tauri::Url) -> bool {
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => matches!(url.host_str(), Some("localhost") | Some("tauri.localhost")),
        _ => false,
    }
}

// Bring the main window back into view (from the tray or minimized).
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// Quit cleanly: destroy webview windows before exiting so WebView2 doesn't log
// a "Failed to unregister class Chrome_WidgetWin_0" teardown warning on Windows.
fn quit_app(app: &tauri::AppHandle) {
    for (_, w) in app.webview_windows() {
        let _ = w.destroy();
    }
    app.exit(0);
}

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
                        show_main_window(app);
                    } else if shortcut == &autotype_h {
                        // Auto-type targets *other* applications. If KeeRust is the
                        // active window, ignore the hotkey so it never types into
                        // our own UI.
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_focused().unwrap_or(false) {
                                return;
                            }
                        }
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
            // Create the main window in code (instead of tauri.conf) so we can
            // lock it down like KeeWeb does at the app level: disable the
            // WebView's built-in zoom hotkeys (Ctrl +/-/0 and Ctrl+wheel) and
            // refuse to navigate away from the app's own pages.
            let main_window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("KeeRust")
                .inner_size(1200.0, 800.0)
                .min_inner_size(800.0, 600.0)
                .zoom_hotkeys_enabled(false)
                // Let the WebView handle HTML5 drag-and-drop (e.g. dropping a
                // file onto the attachments table) instead of Tauri capturing it.
                .disable_drag_drop_handler()
                .on_navigation(is_app_url)
                .build()?;

            // Watch for OS session lock / sleep → emits "os-lock" to the frontend.
            #[cfg(windows)]
            syslock::watch(&main_window);
            #[cfg(not(windows))]
            let _ = &main_window;

            // Ignore failures (e.g. a shortcut already taken system-wide) so the
            // app still launches.
            let _ = app.global_shortcut().register(ctrl_k);
            let _ = app.global_shortcut().register(autotype_sc);

            // System tray: lets "close to tray" restore or quit the app.
            let open_i = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &quit_i])?;

            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("KeeRust")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "quit" => quit_app(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click the tray icon to restore the window.
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
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
            vault::delete_entry_history,
            vault::revert_entry_history,
            vault::add_entry_attachment,
            vault::delete_entry_attachment,
            vault::save_entry,
            vault::save_group,
            vault::get_entry_xml,
            favicon::fetch_favicon,
            autotype::autotype_run,
            autotype::autotype_text,
            autotype::autotype_sequence,
            autotype::focus_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
