import { invoke } from "@tauri-apps/api/core";
import { createStore } from "./lib/store";
import type {
  ActiveView,
  EntryData,
  ScreenName,
  SearchFields,
  SyncDotState,
  VaultData,
  VaultSource,
  WindowInfo,
} from "./types";

interface AppState {
  screen: ScreenName;
  vaultData: VaultData | null;
  activeView: ActiveView;
  selectedEntryUuid: string | null;
  searchQuery: string;
  searchFields: SearchFields;
  searchCaseSensitive: boolean;
  masterPassword: string;
  editMode: boolean;
  vaultIsLocal: boolean; // open DB is a local file (no WebDAV sync)
  source: VaultSource | null;
  syncDot: SyncDotState;
  syncBannerVisible: boolean;
  // An auto-type hotkey that arrived while locked, resumed after unlock.
  pendingAutotype: WindowInfo | null;
}

export const appStore = createStore<AppState>({
  screen: "config",
  vaultData: null,
  activeView: { kind: "all" },
  selectedEntryUuid: null,
  searchQuery: "",
  searchFields: {
    title: true,
    username: true,
    password: false,
    url: true,
    notes: true,
    custom: true,
  },
  searchCaseSensitive: false,
  masterPassword: "",
  editMode: false,
  vaultIsLocal: false,
  source: null,
  syncDot: "",
  syncBannerVisible: false,
  pendingAutotype: null,
});

// Convenience hook + direct accessors.
export const useApp = appStore.use;
export const getApp = appStore.getState;
export const setApp = appStore.setState;

// ── Sync indicator ──────────────────────────────────────────────────────────
let syncDotTimer: ReturnType<typeof setTimeout> | undefined;

export function setSyncDot(state: SyncDotState): void {
  setApp({ syncDot: state });
}

export function flashSyncDot(state: SyncDotState, ms = 4000): void {
  setSyncDot(state);
  clearTimeout(syncDotTimer);
  syncDotTimer = setTimeout(() => setSyncDot(""), ms);
}

// After a local mutation the write is already on disk, so there's no background
// sync to wait on — flash the dot green. For WebDAV, show the pending state.
export function markSyncPending(): void {
  if (getApp().vaultIsLocal) {
    flashSyncDot("ok", 2000);
  } else {
    setSyncDot("syncing");
  }
}

// ── Source ──────────────────────────────────────────────────────────────────
export function applySource(source: VaultSource | null): void {
  if (!source) return;
  setApp({ source, vaultIsLocal: source.type === "local" });
}

export function sourceLabel(): string {
  const s = getApp().source;
  if (!s) return "";
  return s.type === "local" ? s.path : s.url;
}

// ── Selection ───────────────────────────────────────────────────────────────
export function setView(view: ActiveView): void {
  setApp({ activeView: view, selectedEntryUuid: null });
}

// Group a newly-created entry lands in: the active group, else the root group.
export function newEntryGroupUuid(): string {
  const s = getApp();
  if (s.activeView.kind === "group") return s.activeView.uuid;
  return s.vaultData?.groups[0]?.uuid ?? "";
}

export function dbName(): string {
  return getApp().vaultData?.groups[0]?.name || "—";
}

export function findSelectedEntry(): EntryData | null {
  const s = getApp();
  if (!s.vaultData || !s.selectedEntryUuid) return null;
  return s.vaultData.entries.find((e) => e.uuid === s.selectedEntryUuid) ?? null;
}

// Wipe everything on lock.
export function lock(): void {
  // Drop the backend's in-memory decrypted vault so no plaintext lingers.
  invoke("lock_vault").catch(() => {});
  setApp({
    vaultData: null,
    masterPassword: "",
    editMode: false,
    activeView: { kind: "all" },
    selectedEntryUuid: null,
    searchQuery: "",
    syncBannerVisible: false,
    syncDot: "",
    screen: "unlock",
  });
}
