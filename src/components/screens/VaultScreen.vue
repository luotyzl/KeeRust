<script setup lang="ts">
import { ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { store } from "../../store";
import { showToast } from "../../composables/useToast";
import type { VaultData } from "../../types";
import VaultHeader from "../vault/VaultHeader.vue";
import GroupSidebar from "../vault/GroupSidebar.vue";
import EntryList from "../vault/EntryList.vue";
import EntryDetail from "../vault/EntryDetail.vue";

const header = ref<InstanceType<typeof VaultHeader> | null>(null);

// Banner action: reload from the (already-updated) local cache.
async function reload(): Promise<void> {
  store.syncBannerVisible = false;
  if (!store.masterPassword) return;
  try {
    store.vaultData = await invoke<VaultData>("open_database", {
      password: store.masterPassword,
    });
    store.selectedEntryUuid = null;
    showToast("Vault reloaded");
  } catch (err) {
    showToast("Reload failed: " + String(err));
  }
}

onMounted(() => header.value?.focusSearch());
</script>

<template>
  <div id="screen-vault" class="screen active">
    <VaultHeader ref="header" />

    <div class="sync-banner" :class="{ visible: store.syncBannerVisible }">
      Remote database was updated.
      <button @click="reload">Reload</button>
      <button @click="store.syncBannerVisible = false">Dismiss</button>
    </div>

    <GroupSidebar />
    <EntryList />
    <EntryDetail />
  </div>
</template>
