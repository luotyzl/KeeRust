// Windows window-message hooks for auto-lock. Subclasses the main window proc
// and emits frontend events:
//   - "os-lock"      on session lock (WTS_SESSION_LOCK) or sleep (PBT_APMSUSPEND)
//                    — the equivalent of Electron powerMonitor lock-screen/suspend.
//   - "app-minimized" on WM_SIZE/SIZE_MINIMIZED — a reliable minimize signal
//                    (WebView2's visibilitychange isn't dependable on minimize).
// The frontend decides whether to actually lock (gated by the relevant setting).
#![cfg(windows)]

use tauri::{Emitter, Manager};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::RemoteDesktop::WTSRegisterSessionNotification;
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};

const WM_WTSSESSION_CHANGE: u32 = 0x02B1;
const WTS_SESSION_LOCK: usize = 0x7;
const WM_POWERBROADCAST: u32 = 0x0218;
const PBT_APMSUSPEND: usize = 0x4;
const WM_SIZE: u32 = 0x0005;
const SIZE_MINIMIZED: usize = 1;
const NOTIFY_FOR_THIS_SESSION: u32 = 0;

// Subscribe the main window to session-change + power-broadcast messages by
// subclassing its window procedure. The AppHandle is boxed and handed to the
// subclass proc as its reference data so it can emit events.
pub fn watch(window: &tauri::WebviewWindow) {
    let hwnd = match window.hwnd() {
        Ok(h) => HWND(h.0 as *mut core::ffi::c_void),
        Err(_) => return,
    };
    let app: tauri::AppHandle = window.app_handle().clone();
    let ref_data = Box::into_raw(Box::new(app)) as usize;
    unsafe {
        let _ = WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION);
        let _ = SetWindowSubclass(hwnd, Some(subclass_proc), 1, ref_data);
    }
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    ref_data: usize,
) -> LRESULT {
    // Map the relevant window messages to a frontend event name.
    let event = match msg {
        WM_WTSSESSION_CHANGE if wparam.0 == WTS_SESSION_LOCK => Some("os-lock"),
        WM_POWERBROADCAST if wparam.0 == PBT_APMSUSPEND => Some("os-lock"),
        WM_SIZE if wparam.0 == SIZE_MINIMIZED => Some("app-minimized"),
        _ => None,
    };
    if let (Some(name), true) = (event, ref_data != 0) {
        let app = &*(ref_data as *const tauri::AppHandle);
        let _ = app.emit(name, ());
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}
