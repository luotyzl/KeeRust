<script setup lang="ts">
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { store, markSyncPending } from "../../store";
import { showToast } from "../../composables/useToast";
import { deleteModal, closeDeleteModal } from "../../composables/useModals";
import type { VaultData } from "../../types";

const inProgress = ref(false);

const name = computed(() => deleteModal.entry?.title || "(no title)");
const confirmLabel = computed(() =>
  deleteModal.permanent ? "Delete Forever" : "Move to Recycle Bin"
);
const title = computed(() =>
  deleteModal.permanent ? "Delete Forever" : "Move to Recycle Bin"
);

function onOverlayClick(): void {
  if (!inProgress.value) closeDeleteModal();
}

async function confirm(): Promise<void> {
  const entry = deleteModal.entry;
  if (!entry || inProgress.value) return;
  const permanent = deleteModal.permanent;
  inProgress.value = true;
  try {
    store.vaultData = await invoke<VaultData>(
      permanent ? "delete_entry_permanent" : "delete_entry",
      { password: store.masterPassword, uuid: entry.uuid }
    );
    store.selectedEntryUuid = null;
    closeDeleteModal();
    markSyncPending();
    showToast(permanent ? "Deleted permanently" : "Moved to Recycle Bin");
  } catch (err) {
    showToast("Failed: " + String(err));
  } finally {
    inProgress.value = false;
  }
}
</script>

<template>
  <div
    v-if="deleteModal.visible"
    class="modal-overlay"
    @click.self="onOverlayClick"
  >
    <div class="modal-box">
      <div class="modal-title">{{ title }}</div>
      <div class="modal-body">
        <template v-if="deleteModal.permanent">
          Permanently delete <strong>{{ name }}</strong>? This
          <strong>cannot be undone</strong> — the entry will be gone forever.
        </template>
        <template v-else>
          Move <strong>{{ name }}</strong> to the Recycle Bin?
        </template>
      </div>
      <div class="modal-actions">
        <button class="btn-modal-cancel" :disabled="inProgress" @click="closeDeleteModal">
          Cancel
        </button>
        <button class="btn-modal-confirm" :disabled="inProgress" @click="confirm">
          {{ inProgress ? (deleteModal.permanent ? "Deleting…" : "Moving…") : confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
