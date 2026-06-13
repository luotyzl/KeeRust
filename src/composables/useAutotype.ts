import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { EntryData, SelectFilter } from "../types";
import { store } from "../store";
import { showToast } from "./useToast";
import {
  DEFAULT_AT_SEQUENCE,
  buildAutoTypeActions,
  buildWindowInfo,
  filterGetEntries,
  makeFilter,
} from "../lib/autotype";

// Reactive state for the auto-type "select entry" screen. Shared so both the
// global hotkey handler (App.vue) and SelectScreen.vue see the same filter.
interface SelectState {
  filter: SelectFilter | null;
  index: number;
}

export const selectState = reactive<SelectState>({
  filter: null,
  index: 0,
});

// Entries matching the current filter (recomputed wherever it's read).
export function currentSelectEntries(): EntryData[] {
  if (!selectState.filter) return [];
  return filterGetEntries(store.vaultData, selectState.filter);
}

// Auto-type the entry's full sequence (its custom one, or the global default).
export async function typeCreds(e: EntryData): Promise<void> {
  const seq = (e.autotype_sequence && e.autotype_sequence.trim()) || DEFAULT_AT_SEQUENCE;
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
  selectState.filter = null;
  selectState.index = 0;
  store.screen = "vault";
}

// Close the view, then auto-type the given field value.
export function pickField(text: string): void {
  closeSelectView();
  typeField(text);
}

async function openSelectView(filter: SelectFilter): Promise<void> {
  selectState.filter = filter;
  selectState.index = 0;
  await invoke("focus_main_window"); // bring the app forward from the taskbar
  store.screen = "select";
}

async function runAutotypeForWindow(
  title: string,
  url: string | null
): Promise<void> {
  const filter = makeFilter(buildWindowInfo(title, url));
  let matches = filterGetEntries(store.vaultData, filter);

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
    matches = filterGetEntries(store.vaultData, filter);
    if (matches.length === 0 && filter.useTitle) filter.useTitle = false;
  }
  await openSelectView(filter);
}

// Entry point from the Tauri "auto-type" global-hotkey event.
export async function handleAutoType(
  title: string,
  url: string | null
): Promise<void> {
  if (!store.vaultData || !store.masterPassword) {
    // Locked — bring the app forward, unlock, then resume for this same window.
    store.pendingAutotype = { title, url };
    await invoke("focus_main_window");
    store.screen = "unlock";
    return;
  }
  await runAutotypeForWindow(title, url);
}

// Resume a hotkey that arrived while the vault was locked (called after unlock).
export async function resumePendingAutotype(): Promise<void> {
  if (!store.pendingAutotype) return;
  const { title, url } = store.pendingAutotype;
  store.pendingAutotype = null;
  await runAutotypeForWindow(title, url);
}
