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

interface SelectState {
  filter: SelectFilter | null;
  index: number;
}

export const selectStore = createStore<SelectState>({
  filter: null,
  index: 0,
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

export function closeSelectView(): void {
  selectStore.setState({ filter: null, index: 0 });
  setApp({ screen: "vault" });
}

// Close the view, then auto-type the given field value.
export function pickField(text: string): void {
  closeSelectView();
  typeField(text);
}

async function openSelectView(filter: SelectFilter): Promise<void> {
  selectStore.setState({ filter, index: 0 });
  await invoke("focus_main_window"); // bring the app forward from the taskbar
  setApp({ screen: "select" });
}

async function runAutotypeForWindow(
  title: string,
  url: string | null
): Promise<void> {
  const filter = makeFilter(buildWindowInfo(title, url));
  let matches = filterGetEntries(getApp().vaultData, filter);

  // Exactly one match → type it straight away (KeeWeb directAutotype).
  if (matches.length === 1) {
    await typeCreds(matches[0]);
    return;
  }
  // No match → relax url→title so the select view opens with candidates.
  if (matches.length === 0) {
    if (filter.useUrl) {
      filter.useUrl = false;
      if (filter.title) filter.useTitle = true;
    }
    matches = filterGetEntries(getApp().vaultData, filter);
    if (matches.length === 0 && filter.useTitle) filter.useTitle = false;
  }
  await openSelectView(filter);
}

// Entry point from the Tauri "auto-type" global-hotkey event.
export async function handleAutoType(
  title: string,
  url: string | null
): Promise<void> {
  const app = getApp();
  if (!app.vaultData || !app.masterPassword) {
    // Locked — bring the app forward, unlock, then resume for this window.
    setApp({ pendingAutotype: { title, url } });
    await invoke("focus_main_window");
    setApp({ screen: "unlock" });
    return;
  }
  await runAutotypeForWindow(title, url);
}

// Resume a hotkey that arrived while the vault was locked (called after unlock).
export async function resumePendingAutotype(): Promise<void> {
  const pending = getApp().pendingAutotype;
  if (!pending) return;
  setApp({ pendingAutotype: null });
  await runAutotypeForWindow(pending.title, pending.url);
}
