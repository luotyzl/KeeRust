import { invoke } from "@tauri-apps/api/core";
import { createStore } from "../lib/store";
import type { EntryData, SelectFilter } from "../types";
import { getApp, setApp } from "../store";
import { showToast } from "./toast";
import {
  DEFAULT_AT_SEQUENCE,
  buildAutoTypeActions,
  buildWindowInfo,
  filterGetEntries,
  makeFilter,
} from "../lib/autotype";
import { computeTOTP, parseOtpUri } from "../lib/totp";

interface SelectState {
  filter: SelectFilter | null;
  index: number;
  // When true (Alt+Shift+O), picking an entry copies its OTP to the clipboard.
  otpCopy: boolean;
}

export const selectStore = createStore<SelectState>({
  filter: null,
  index: 0,
  otpCopy: false,
});

export const useSelect = selectStore.use;

// Entries matching the current filter (recomputed wherever it's read).
export function currentSelectEntries(): EntryData[] {
  const f = selectStore.getState().filter;
  if (!f) return [];
  return filterGetEntries(getApp().vaultData, f);
}

// Auto-type the entry's full sequence (its custom one, or the global default).
export async function typeCreds(e: EntryData): Promise<void> {
  const seq =
    (e.autotype_sequence && e.autotype_sequence.trim()) || DEFAULT_AT_SEQUENCE;
  try {
    const actions = await buildAutoTypeActions(seq, e);
    await invoke("autotype_sequence", { actions });
  } catch (err) {
    showToast("Auto-type failed: " + String(err));
  }
}

// Type a single field's value into the target window.
export function typeField(text: string): Promise<void> {
  return invoke<void>("autotype_text", { text: text || "" }).catch((err) => {
    showToast("Auto-type failed: " + String(err));
  });
}

// Copy the entry's one-time code to the clipboard (Alt+Shift+O hotkey). The
// write goes through Rust because the WebView clipboard is blocked while another
// app holds focus — exactly when the global hotkey fires.
export async function copyOtp(e: EntryData): Promise<void> {
  if (!e.otp_uri) {
    showToast(`"${e.title || "Entry"}" has no one-time code`);
    return;
  }
  try {
    const { secret, period, digits, algorithm } = parseOtpUri(e.otp_uri);
    const code = await computeTOTP(secret, period, digits, algorithm);
    if (!code) {
      showToast("Could not generate one-time code");
      return;
    }
    await invoke("set_clipboard", { text: code });
    showToast("One-time code copied");
  } catch (err) {
    showToast("Copy failed: " + String(err));
  }
}

export function closeSelectView(): void {
  selectStore.setState({ filter: null, index: 0, otpCopy: false });
  setApp({ screen: "vault" });
}

// Close the view, then auto-type the given field value.
export function pickField(text: string): void {
  closeSelectView();
  typeField(text);
}

async function openSelectView(
  filter: SelectFilter,
  otpCopy: boolean
): Promise<void> {
  selectStore.setState({ filter, index: 0, otpCopy });
  await invoke("focus_main_window"); // bring the app forward from the taskbar
  setApp({ screen: "select" });
}

async function runAutotypeForWindow(
  title: string,
  url: string | null,
  otpCopy: boolean
): Promise<void> {
  const filter = makeFilter(buildWindowInfo(title, url));
  let matches = filterGetEntries(getApp().vaultData, filter);

  // No match → relax url→title so the select view opens with candidates.
  if (matches.length === 0) {
    if (filter.useUrl) {
      filter.useUrl = false;
      if (filter.title) filter.useTitle = true;
    }
    matches = filterGetEntries(getApp().vaultData, filter);
    if (matches.length === 0 && filter.useTitle) filter.useTitle = false;
  }

  // OTP-copy mode only ever targets entries that actually have a one-time code.
  if (otpCopy) matches = matches.filter((e) => e.otp_uri);

  // Exactly one match → act on it straight away (KeeWeb directAutotype),
  // including when the relaxed filter narrows down to a single candidate.
  if (matches.length === 1) {
    if (otpCopy) await copyOtp(matches[0]);
    else await typeCreds(matches[0]);
    return;
  }
  await openSelectView(filter, otpCopy);
}

// Entry point from the Tauri "auto-type" global-hotkey event. `otpCopy` is set
// by the Alt+Shift+O hotkey to copy just the matched entry's one-time code.
export async function handleAutoType(
  title: string,
  url: string | null,
  otpCopy = false
): Promise<void> {
  const app = getApp();
  if (!app.vaultData || !app.masterPassword) {
    // Locked — bring the app forward, unlock, then resume for this window.
    setApp({ pendingAutotype: { title, url, otp: otpCopy } });
    await invoke("focus_main_window");
    setApp({ screen: "unlock" });
    return;
  }
  await runAutotypeForWindow(title, url, otpCopy);
}

// Resume a hotkey that arrived while the vault was locked (called after unlock).
export async function resumePendingAutotype(): Promise<void> {
  const pending = getApp().pendingAutotype;
  if (!pending) return;
  setApp({ pendingAutotype: null });
  await runAutotypeForWindow(pending.title, pending.url, pending.otp ?? false);
}
