import { reactive } from "vue";
import type {
  EntryData,
  ScreenName,
  SearchFields,
  SyncDotState,
  VaultData,
  VaultSource,
  WindowInfo,
} from "./types";

// A single reactive store replaces the module-level globals the vanilla app used.
// Imported as a singleton; every component reads/writes the same object.
interface VaultState {
  screen: ScreenName;
  vaultData: VaultData | null;
  selectedGroupUuid: string | null;
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

export const store = reactive<VaultState>({
  screen: "config",
  vaultData: null,
  selectedGroupUuid: null,
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

// ── Sync indicator ──────────────────────────────────────────────────────────
let syncDotTimer: ReturnType<typeof setTimeout> | undefined;

export function setSyncDot(state: SyncDotState): void {
  store.syncDot = state;
}

// Show a transient state, then clear the dot after `ms`.
export function flashSyncDot(state: SyncDotState, ms = 4000): void {
  setSyncDot(state);
  clearTimeout(syncDotTimer);
  syncDotTimer = setTimeout(() => setSyncDot(""), ms);
}

// After a local mutation the write is already on disk, so there's no background
// sync to wait on — flash the dot green. For WebDAV, show the pending state.
export function markSyncPending(): void {
  if (store.vaultIsLocal) {
    flashSyncDot("ok", 2000);
  } else {
    setSyncDot("syncing");
  }
}

// ── Source ──────────────────────────────────────────────────────────────────
export function applySource(source: VaultSource | null): void {
  if (!source) return;
  store.source = source;
  store.vaultIsLocal = source.type === "local";
}

export function sourceLabel(): string {
  const s = store.source;
  if (!s) return "";
  return s.type === "local" ? s.path : s.url;
}

// ── Selection helpers ───────────────────────────────────────────────────────
export function selectGroup(uuid: string): void {
  store.selectedGroupUuid = uuid;
  store.selectedEntryUuid = null;
}

export function dbName(): string {
  return store.vaultData?.groups[0]?.name || "—";
}

export function selectedEntry(): EntryData | null {
  if (!store.vaultData || !store.selectedEntryUuid) return null;
  return (
    store.vaultData.entries.find((e) => e.uuid === store.selectedEntryUuid) ??
    null
  );
}

// Replace the whole vault (after open/sync/mutation) and reset transient state.
export function setVault(data: VaultData, keepSelection = false): void {
  store.vaultData = data;
  if (!keepSelection) store.selectedEntryUuid = null;
}

// Wipe everything on lock.
export function lock(): void {
  store.vaultData = null;
  store.masterPassword = "";
  store.editMode = false;
  store.selectedGroupUuid = null;
  store.selectedEntryUuid = null;
  store.searchQuery = "";
  store.syncBannerVisible = false;
  setSyncDot("");
  store.screen = "unlock";
}
