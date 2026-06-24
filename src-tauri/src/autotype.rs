//! Global-hotkey auto-type: capture the foreground window, match entries, and
//! inject `username {TAB} password {ENTER}` into the target app — mirroring
//! KeeWeb's default auto-type sequence and select-entry flow.

use serde::{Deserialize, Serialize};
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
    /// When true (the Alt+Shift+O hotkey), the frontend copies the matched
    /// entry's one-time code to the clipboard instead of typing credentials.
    pub otp: bool,
}

/// One primitive auto-type step. The frontend parses a KeeWeb keystroke sequence
/// (resolving entry fields / TOTP) into a list of these; Rust just executes them.
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Action {
    /// Type a literal string (fast unicode path).
    Text { value: String },
    /// Press a key (named, e.g. "enter", or a single character) with modifiers held.
    Key {
        key: String,
        #[serde(default)]
        mods: Vec<String>,
    },
    /// Pause for `ms` milliseconds.
    Delay { ms: u64 },
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

/// Whether the given foreground window handle is KeeRust's own window. When the
/// auto-type hotkey is pressed while our app is the active window there's nothing
/// to type into — auto-type targets *other* applications — so the caller ignores
/// it. Comparing the real Win32 foreground HWND is more reliable than the
/// WebView's `is_focused()`, which can report stale focus.
#[cfg(windows)]
pub fn is_own_window(app: &AppHandle, fg_hwnd: isize) -> bool {
    if fg_hwnd == 0 {
        return false;
    }
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(h) = win.hwnd() {
            return h.0 as isize == fg_hwnd;
        }
    }
    false
}

#[cfg(not(windows))]
pub fn is_own_window(_app: &AppHandle, _fg_hwnd: isize) -> bool {
    false
}

// ── Keystroke injection ─────────────────────────────────────────────────────────

/// What to type once the target window has focus.
enum TypeJob {
    /// `username {TAB} password {ENTER}` — KeeWeb's default sequence.
    Full { username: String, password: String },
    /// A single field's value, with no Tab/Enter (password-only, username-only, …).
    Text(String),
    /// A parsed keystroke sequence (custom per-entry auto-type).
    Sequence(Vec<Action>),
}

/// Map a key name (or single character) to an enigo key.
fn map_key(name: &str) -> Option<enigo::Key> {
    use enigo::Key;
    let k = match name {
        "tab" => Key::Tab,
        "enter" => Key::Return,
        "space" => Key::Space,
        "up" => Key::UpArrow,
        "down" => Key::DownArrow,
        "left" => Key::LeftArrow,
        "right" => Key::RightArrow,
        "home" => Key::Home,
        "end" => Key::End,
        "pageup" => Key::PageUp,
        "pagedown" => Key::PageDown,
        "insert" => Key::Insert,
        "delete" => Key::Delete,
        "backspace" => Key::Backspace,
        "escape" => Key::Escape,
        "add" => Key::Add,
        "subtract" => Key::Subtract,
        "multiply" => Key::Multiply,
        "divide" => Key::Divide,
        "num0" => Key::Numpad0,
        "num1" => Key::Numpad1,
        "num2" => Key::Numpad2,
        "num3" => Key::Numpad3,
        "num4" => Key::Numpad4,
        "num5" => Key::Numpad5,
        "num6" => Key::Numpad6,
        "num7" => Key::Numpad7,
        "num8" => Key::Numpad8,
        "num9" => Key::Numpad9,
        "f1" => Key::F1,
        "f2" => Key::F2,
        "f3" => Key::F3,
        "f4" => Key::F4,
        "f5" => Key::F5,
        "f6" => Key::F6,
        "f7" => Key::F7,
        "f8" => Key::F8,
        "f9" => Key::F9,
        "f10" => Key::F10,
        "f11" => Key::F11,
        "f12" => Key::F12,
        "f13" => Key::F13,
        "f14" => Key::F14,
        "f15" => Key::F15,
        "f16" => Key::F16,
        other => {
            // A single character → press that key.
            let mut chars = other.chars();
            let c = chars.next()?;
            if chars.next().is_some() {
                return None; // unknown multi-char key name
            }
            Key::Unicode(c)
        }
    };
    Some(k)
}

fn mod_key(name: &str) -> Option<enigo::Key> {
    use enigo::Key;
    match name {
        "ctrl" => Some(Key::Control),
        "shift" => Some(Key::Shift),
        "alt" => Some(Key::Alt),
        "win" => Some(Key::Meta),
        _ => None,
    }
}

fn run_actions(actions: &[Action]) -> Result<(), String> {
    use enigo::{
        Direction::{Click, Press, Release},
        Enigo, Keyboard, Settings,
    };

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    for action in actions {
        match action {
            Action::Text { value } => {
                if !value.is_empty() {
                    enigo.text(value).map_err(|e| e.to_string())?;
                }
            }
            Action::Delay { ms } => {
                std::thread::sleep(std::time::Duration::from_millis(*ms));
            }
            Action::Key { key, mods } => {
                let Some(k) = map_key(key) else { continue };
                let modkeys: Vec<_> = mods.iter().filter_map(|m| mod_key(m)).collect();
                for mk in &modkeys {
                    enigo.key(*mk, Press).map_err(|e| e.to_string())?;
                }
                let res = enigo.key(k, Click);
                for mk in modkeys.iter().rev() {
                    let _ = enigo.key(*mk, Release);
                }
                res.map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

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

fn type_string(text: &str) -> Result<(), String> {
    use enigo::{Enigo, Keyboard, Settings};

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    if !text.is_empty() {
        enigo.text(text).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Re-focus the captured target window, then run the typing job. Runs on a
/// blocking thread because enigo and the short settle delay both block.
async fn focus_and_run(hwnd: Option<isize>, job: TypeJob) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(h) = hwnd {
            win::focus(h);
        }
        // Give the OS a moment to hand focus back to the target window.
        std::thread::sleep(std::time::Duration::from_millis(220));
        match job {
            TypeJob::Full { username, password } => type_credentials(&username, &password),
            TypeJob::Text(s) => type_string(&s),
            TypeJob::Sequence(actions) => run_actions(&actions),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Tauri commands ──────────────────────────────────────────────────────────────

/// Auto-type a chosen entry's full sequence (username TAB password ENTER).
#[tauri::command]
pub async fn autotype_run(
    state: tauri::State<'_, AutotypeState>,
    username: String,
    password: String,
) -> Result<(), String> {
    let hwnd = *state.target_hwnd.lock().unwrap();
    focus_and_run(hwnd, TypeJob::Full { username, password }).await
}

/// Type a single field's value into the target (password-only, username-only,
/// a one-time code, or any custom field).
#[tauri::command]
pub async fn autotype_text(
    state: tauri::State<'_, AutotypeState>,
    text: String,
) -> Result<(), String> {
    let hwnd = *state.target_hwnd.lock().unwrap();
    focus_and_run(hwnd, TypeJob::Text(text)).await
}

/// Run a parsed keystroke sequence (the entry's custom auto-type pattern).
#[tauri::command]
pub async fn autotype_sequence(
    state: tauri::State<'_, AutotypeState>,
    actions: Vec<Action>,
) -> Result<(), String> {
    let hwnd = *state.target_hwnd.lock().unwrap();
    focus_and_run(hwnd, TypeJob::Sequence(actions)).await
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
