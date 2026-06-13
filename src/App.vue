<script setup lang="ts">
import { onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { store, applySource, setSyncDot, flashSyncDot } from "./store";
import { showToast } from "./composables/useToast";
import { handleAutoType } from "./composables/useAutotype";
import type { VaultSource } from "./types";

import ConfigScreen from "./components/screens/ConfigScreen.vue";
import UnlockScreen from "./components/screens/UnlockScreen.vue";
import VaultScreen from "./components/screens/VaultScreen.vue";
import SelectScreen from "./components/screens/SelectScreen.vue";
import ConfirmModal from "./components/modals/ConfirmModal.vue";
import XmlModal from "./components/modals/XmlModal.vue";
import { Toaster } from "@/components/ui/sonner";

interface AutoTypePayload {
  title?: string;
  url?: string | null;
}
interface SyncStatusPayload {
  ok: boolean;
  error?: string;
}

onMounted(async () => {
  // Tauri event: auto-type global hotkey was pressed.
  await listen<AutoTypePayload>("auto-type", (ev) =>
    handleAutoType(ev.payload?.title || "", ev.payload?.url ?? null)
  );

  // Tauri event: background WebDAV sync found a newer remote version.
  await listen("db-remote-updated", () => {
    store.syncBannerVisible = true;
  });

  // Tauri event: background PUT completed (ok or error).
  await listen<SyncStatusPayload>("sync-status", (ev) => {
    const { ok, error } = ev.payload;
    flashSyncDot(ok ? "ok" : "error");
    if (!ok) showToast("WebDAV sync failed: " + error);
  });

  // Decide the initial screen from the saved source.
  const source = await invoke<VaultSource | null>("get_vault_source");
  if (source) {
    applySource(source);
    store.screen = "unlock";
  } else {
    store.screen = "config";
  }
  setSyncDot("");
});
</script>

<template>
  <ConfigScreen v-if="store.screen === 'config'" />
  <UnlockScreen v-else-if="store.screen === 'unlock'" />
  <VaultScreen v-else-if="store.screen === 'vault'" />
  <SelectScreen v-else-if="store.screen === 'select'" />

  <ConfirmModal />
  <XmlModal />
  <Toaster position="bottom-center" />
</template>
