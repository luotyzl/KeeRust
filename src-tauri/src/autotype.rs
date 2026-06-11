//! Global-hotkey auto-type: capture the foreground window, match entries, and
//! inject `username {TAB} password {ENTER}` into the target app — mirroring
//! KeeWeb's default auto-type sequence and select-entry flow.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Shared state: the window that had focus when the auto-type hotkey fired.
#[derive(Default)]
pub struct AutotypeState {
    pub target_hwnd: Mutex<Option<isize>>,
}

/// Payload emitted to the frontend when the auto-type hotkey is pressed.
#[derive(Clone, Serialize)]
pub struct AutoTypeTrigger {
    pub title: String,
    pub url: Option<String>,
}

// ── Win32 glue (foreground window + focus) ──────────────────────────────────────

#[cfg(windows)]
mod win {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, HWND};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTreeWalker,
        IUIAutomationValuePattern, UIA_EditControlTypeId, UIA_ValuePatternId,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE,
    };

    /// Chromium- and Gecko-based browsers whose address bar we can read via UIA.
    const BROWSERS: &[&str] = &[
        "chrome.exe",
        "msedge.exe",
        "firefox.exe",
        "brave.exe",
        "opera.exe",
        "vivaldi.exe",
        "chromium.exe",
        "arc.exe",
    ];

    /// Return the foreground window handle (as isize) and its title.
    pub fn foreground() -> (isize, String) {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return (0, String::new());
            }
            let len = GetWindowTextLengthW(hwnd);
            let mut buf = vec![0u16; len as usize + 1];
            let read = GetWindowTextW(hwnd, &mut buf);
            let title = String::from_utf16_lossy(&buf[..read as usize]);
            (hwnd.0 as isize, title)
        }
    }

    /// Best-effort: restore + raise + focus the given window so keystrokes land there.
    pub fn focus(hwnd_val: isize) {
        if hwnd_val == 0 {
            return;
        }
        unsafe {
            let hwnd = HWND(hwnd_val as *mut core::ffi::c_void);
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            let _ = SetForegroundWindow(hwnd);
            let _ = BringWindowToTop(hwnd);
        }
    }

    /// Lower-cased executable name (e.g. "chrome.exe") owning the given window.
    fn process_name(hwnd: HWND) -> String {
        unsafe {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return String::new();
            }
            let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
                return String::new();
            };
            let mut buf = [0u16; 260];
            let mut size = buf.len() as u32;
            let mut name = String::new();
            if QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_WIN32,
                PWSTR(buf.as_mut_ptr()),
                &mut size,
            )
            .is_ok()
            {
                let full = String::from_utf16_lossy(&buf[..size as usize]);
                name = full
                    .rsplit(['\\', '/'])
                    .next()
                    .unwrap_or_default()
                    .to_lowercase();
            }
            let _ = CloseHandle(handle);
            name
        }
    }

    fn looks_like_url(s: &str) -> bool {
        let s = s.trim();
        if s.is_empty() || s.contains(char::is_whitespace) {
            return false;
        }
        s.starts_with("http://")
            || s.starts_with("https://")
            || (s.contains('.') && !s.contains('@'))
    }

    /// Depth/breadth-bounded DFS for the first Edit control whose value looks like
    /// a URL — that's the browser's address bar in the chrome (visited before the
    /// web document in control-view order).
    unsafe fn find_edit_url(
        walker: &IUIAutomationTreeWalker,
        element: &IUIAutomationElement,
        depth: u32,
        visited: &mut usize,
    ) -> Option<String> {
        if depth > 14 || *visited > 600 {
            return None;
        }
        *visited += 1;

        if element.CurrentControlType() == Ok(UIA_EditControlTypeId) {
            if let Ok(vp) =
                element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
            {
                if let Ok(bstr) = vp.CurrentValue() {
                    let s = bstr.to_string();
                    if looks_like_url(&s) {
                        return Some(s.trim().to_string());
                    }
                }
            }
        }

        let mut child = walker.GetFirstChildElement(element).ok();
        while let Some(c) = child {
            if let Some(found) = find_edit_url(walker, &c, depth + 1, visited) {
                return Some(found);
            }
            child = walker.GetNextSiblingElement(&c).ok();
        }
        None
    }

    /// Read the address-bar URL from a browser window via UI Automation. Returns
    /// `None` for non-browsers or if the address bar can't be read.
    pub fn browser_url(hwnd_val: isize) -> Option<String> {
        if hwnd_val == 0 {
            return None;
        }
        let hwnd = HWND(hwnd_val as *mut core::ffi::c_void);
        let proc = process_name(hwnd);
        if !BROWSERS.iter().any(|b| proc == *b) {
            return None;
        }
        unsafe {
            // Safe to call repeatedly; ignore the mode result (UIA works under MTA too).
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let automation: IUIAutomation =
                CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
            let root = automation.ElementFromHandle(hwnd).ok()?;
            let walker = automation.ControlViewWalker().ok()?;
            let mut visited = 0usize;
            find_edit_url(&walker, &root, 0, &mut visited)
        }
    }
}

#[cfg(not(windows))]
mod win {
    pub fn foreground() -> (isize, String) {
        (0, String::new())
    }
    pub fn focus(_hwnd_val: isize) {}
    pub fn browser_url(_hwnd_val: isize) -> Option<String> {
        None
    }
}

/// Capture the currently-focused window — call this the instant the hotkey fires,
/// before our own window can steal focus. Returns (hwnd, title, browser URL).
pub fn capture_foreground() -> (isize, String, Option<String>) {
    let (hwnd, title) = win::foreground();
    let url = win::browser_url(hwnd);
    (hwnd, title, url)
}

// ── Keystroke injection ─────────────────────────────────────────────────────────

/// Type `username {TAB} password {ENTER}` into whatever window currently has focus.
fn type_credentials(username: &str, password: &str) -> Result<(), String> {
    use enigo::{Direction::Click, Enigo, Key, Keyboard, Settings};

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    if !username.is_empty() {
        enigo.text(username).map_err(|e| e.to_string())?;
    }
    enigo.key(Key::Tab, Click).map_err(|e| e.to_string())?;
    if !password.is_empty() {
        enigo.text(password).map_err(|e| e.to_string())?;
    }
    enigo.key(Key::Return, Click).map_err(|e| e.to_string())?;
    Ok(())
}

/// Re-focus the captured target window, then type the credentials. Runs on a
/// blocking thread because enigo and the short settle delay both block.
async fn focus_and_type(hwnd: Option<isize>, username: String, password: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(h) = hwnd {
            win::focus(h);
        }
        // Give the OS a moment to hand focus back to the target window.
        std::thread::sleep(std::time::Duration::from_millis(220));
        type_credentials(&username, &password)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Tauri commands ──────────────────────────────────────────────────────────────

/// Auto-type a single, already-chosen entry into the captured target window.
#[tauri::command]
pub async fn autotype_run(
    state: tauri::State<'_, AutotypeState>,
    username: String,
    password: String,
) -> Result<(), String> {
    let hwnd = *state.target_hwnd.lock().unwrap();
    focus_and_type(hwnd, username, password).await
}

/// Show, unminimize, and focus the main window (bring it forward from the taskbar
/// for the select-entry view / unlock-then-continue flow).
#[tauri::command]
pub fn focus_main_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}
