import { createStore } from "@/lib/store";

// App-wide preferences that persist across runs (saved to localStorage).
// Theme lives in its own ThemeProvider; everything else lives here.
export interface AppSettings {
  // When true, closing the window minimizes it instead of quitting.
  minimizeOnClose: boolean;
  // Auto-lock the vault after this many minutes of inactivity (0 = never).
  autoLockIdleMinutes: number;
  // Auto-lock when the window is minimized / hidden to the tray.
  autoLockOnMinimize: boolean;
  // Auto-lock when the OS session locks or the computer sleeps.
  autoLockOnSystemLock: boolean;
}

const STORAGE_KEY = "keerust-settings";

const DEFAULTS: AppSettings = {
  minimizeOnClose: false,
  autoLockIdleMinutes: 0,
  autoLockOnMinimize: false,
  autoLockOnSystemLock: false,
};

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

const store = createStore<AppSettings>(load());

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.getState()));
  } catch {
    /* ignore quota / serialization errors */
  }
}

export const useSettings = store.use;
export const getSettings = store.getState;

export function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): void {
  store.setState({ [key]: value } as Partial<AppSettings>);
  persist();
}
