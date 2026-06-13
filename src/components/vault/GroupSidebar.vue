<script setup lang="ts">
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import {
  store,
  selectGroup,
  dbName,
  setSyncDot,
  flashSyncDot,
} from "../../store";
import { showToast } from "../../composables/useToast";
import type { VaultData } from "../../types";

const syncing = ref(false);

const rbUuid = computed(() => store.vaultData?.recycle_bin_uuid ?? null);

// Groups shown in the list — everything except the recycle bin (footer item).
const groups = computed(
  () => store.vaultData?.groups.filter((g) => g.uuid !== rbUuid.value) ?? []
);

const recycleBinGroup = computed(() =>
  rbUuid.value
    ? store.vaultData?.groups.find((g) => g.uuid === rbUuid.value) ?? null
    : null
);

function pick(uuid: string): void {
  selectGroup(uuid);
}

async function syncNow(): Promise<void> {
  if (!store.masterPassword) return;
  syncing.value = true;
  setSyncDot("syncing");
  try {
    store.vaultData = await invoke<VaultData>("force_sync", {
      password: store.masterPassword,
    });
    store.selectedEntryUuid = null;
    store.syncBannerVisible = false;
    flashSyncDot("ok");
    showToast(store.vaultIsLocal ? "Reloaded from file" : "Synced from cloud");
  } catch (err) {
    flashSyncDot("error");
    showToast("Sync failed: " + String(err));
  } finally {
    syncing.value = false;
  }
}
</script>

<template>
  <div class="vault-sidebar">
    <nav class="group-list-scroll">
      <div class="sidebar-section">Groups</div>
      <div
        v-for="g in groups"
        :key="g.uuid"
        class="group-item"
        :class="{ active: g.uuid === store.selectedGroupUuid }"
        @click="pick(g.uuid)"
      >
        <span class="group-name">{{ g.name }}</span>
        <span class="group-count">{{ g.entry_count }}</span>
      </div>
    </nav>

    <div v-if="rbUuid" class="sidebar-recycle">
      <div
        class="recycle-bin-item"
        :class="{ active: store.selectedGroupUuid === rbUuid }"
        @click="pick(rbUuid)"
      >
        <span class="rb-icon">🗑️</span>
        <span class="rb-name">Recycle Bin</span>
        <span class="group-count">{{ recycleBinGroup?.entry_count ?? 0 }}</span>
      </div>
    </div>

    <div class="sidebar-footer">
      <span class="db-name" :title="dbName()">{{ dbName() }}</span>
      <button
        class="btn-sync-now"
        :class="{ spinning: syncing }"
        :disabled="syncing"
        :title="store.vaultIsLocal ? 'Reload from file' : 'Sync from cloud'"
        @click="syncNow"
      >
        ↻
      </button>
    </div>
  </div>
</template>
