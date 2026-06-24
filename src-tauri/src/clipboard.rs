//! System-clipboard write that works regardless of which app holds focus.
//!
//! The WebView's `navigator.clipboard.writeText` rejects when our window isn't
//! focused — which is exactly the case when a global hotkey (e.g. Alt+Shift+O to
//! copy a one-time code) fires while another application is in the foreground.
//! Writing from the OS side via `arboard` sidesteps that restriction.

/// Copy `text` to the system clipboard.
#[tauri::command]
pub fn set_clipboard(text: String) -> Result<(), String> {
    arboard::Clipboard::new()
        .and_then(|mut cb| cb.set_text(text))
        .map_err(|e| e.to_string())
}
