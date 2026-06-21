//! Open links in the user's default browser. A `target="_blank"` anchor inside
//! the webview doesn't reach the system browser, so the frontend routes external
//! links through this command instead.

/// Open an http(s) URL in the system default browser.
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let url = url.trim();
    // Only web URLs — never launch arbitrary files/protocols.
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Only http(s) URLs can be opened.".to_string());
    }

    #[cfg(windows)]
    {
        // rundll32 receives the URL as a single argv (no shell re-parsing), so
        // query strings with `&` open correctly in the default browser.
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
    }

    Ok(())
}
