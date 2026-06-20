import { listen } from "@tauri-apps/api/event";
import { getApp, lock } from "@/store";
import { getSettings } from "@/stores/settings";
import { showToast } from "@/stores/toast";

// Auto-lock the vault on inactivity / minimize / OS lock. Ports KeeWeb's
// IdleTracker + appMinimized + osLocked behavior. Each trigger is gated by its
// own setting and only fires while a vault is actually open.

function isUnlocked(): boolean {
  return getApp().vaultData != null;
}

function autoLock(reason: string): void {
  if (!isUnlocked()) return;
  lock();
  showToast(reason);
}

let lastActivity = Date.now();
function markActivity(): void {
  lastActivity = Date.now();
}

// Lock if "auto-lock when minimized" is on. Exported so the close-to-tray path
// (which hides the window itself) can lock directly rather than depending on a
// visibilitychange event that WebView2 doesn't always fire.
export function lockOnMinimizeIfEnabled(): void {
  if (getSettings().autoLockOnMinimize) {
    autoLock("Vault locked on minimize");
  }
}

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "scroll"];

// Returns a cleanup function.
export async function installAutoLock(): Promise<() => void> {
  for (const ev of ACTIVITY_EVENTS) {
    window.addEventListener(ev, markActivity, { passive: true, capture: true });
  }

  // Inactivity: poll every 15s and lock once idle exceeds the threshold.
  const idleTimer = window.setInterval(() => {
    const mins = getSettings().autoLockIdleMinutes;
    if (!mins || !isUnlocked()) return;
    if (Date.now() - lastActivity >= mins * 60_000) {
      autoLock("Vault locked after inactivity");
    }
  }, 15_000);

  // Native minimize signal from Rust (WM_SIZE/SIZE_MINIMIZED) — reliable, since
  // WebView2 doesn't always fire visibilitychange when minimized to the taskbar.
  const unlistenMinimized = await listen("app-minimized", lockOnMinimizeIfEnabled);

  // visibilitychange is a fallback for hide-to-tray where the document hides.
  const onVisibility = () => {
    if (document.hidden) lockOnMinimizeIfEnabled();
  };
  document.addEventListener("visibilitychange", onVisibility);

  // OS session lock or sleep — emitted from the Rust side.
  const unlistenOsLock = await listen("os-lock", () => {
    if (getSettings().autoLockOnSystemLock) {
      autoLock("Vault locked");
    }
  });

  return () => {
    for (const ev of ACTIVITY_EVENTS) {
      window.removeEventListener(ev, markActivity, { capture: true });
    }
    window.clearInterval(idleTimer);
    unlistenMinimized();
    document.removeEventListener("visibilitychange", onVisibility);
    unlistenOsLock();
  };
}
