// Shapes mirror the serde-serialized structs returned by the Rust backend
// (src-tauri/src/vault.rs, source.rs). Field names are snake_case to match.

export interface CustomField {
  name: string;
  value: string;
  protected: boolean;
}

export interface AttachmentInfo {
  name: string;
  size: number;
  mime_type: string;
  data_base64: string;
}

export interface HistoryEntry {
  modified: string;
  title: string;
  username: string;
}

export interface EntryData {
  uuid: string;
  title: string;
  username: string;
  url: string;
  notes: string;
  password: string;
  group_name: string;
  group_uuid: string;
  custom_fields: CustomField[];
  otp_uri: string | null;
  attachments: AttachmentInfo[];
  history: HistoryEntry[];
  icon_id: number; // built-in icon index 0-68, or -1 if custom
  custom_icon_base64: string | null;
  autotype_enabled: boolean;
  autotype_sequence: string;
  autotype_obfuscation: boolean;
}

export interface GroupData {
  uuid: string;
  name: string;
  entry_count: number;
}

export interface VaultData {
  groups: GroupData[];
  entries: EntryData[];
  recycle_bin_uuid: string | null;
}

export interface SaveResult {
  vault: VaultData;
  saved_uuid: string;
}

// Outbound payload for save_entry (mirrors EntryUpdate).
export interface EntryUpdate {
  uuid: string;
  group_uuid: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  otp_uri: string;
  custom_fields: CustomField[];
  icon_id: number;
  custom_icon_base64: string | null;
  autotype_enabled: boolean;
  autotype_sequence: string;
  autotype_obfuscation: boolean;
}

// get_vault_source returns a tagged union (serde tag = "type").
export type VaultSource =
  | { type: "webdav"; url: string; username: string; password: string }
  | { type: "local"; path: string };

export interface WebDavConfig {
  url: string;
  username: string;
  password: string;
}

export type SyncDotState = "" | "syncing" | "ok" | "error";

// Which fields the advanced search looks in (KeeWeb-style).
export interface SearchFields {
  title: boolean;
  username: boolean;
  password: boolean;
  url: boolean;
  notes: boolean;
  custom: boolean;
}

export type ScreenName = "config" | "unlock" | "vault" | "select";

// ── Auto-type ──────────────────────────────────────────────────────────────
export interface WindowInfo {
  title: string;
  url: string | null;
}

export interface SelectFilter {
  title: string;
  url: string;
  useTitle: boolean;
  useUrl: boolean;
  subdomains: boolean;
  text: string;
}

export type AutoTypeAction =
  | { type: "text"; value: string }
  | { type: "key"; key: string; mods: string[] }
  | { type: "delay"; ms: number };
