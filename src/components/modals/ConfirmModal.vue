<script setup lang="ts">
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { store, markSyncPending } from "@/store";
import { showToast } from "@/composables/useToast";
import { deleteModal, closeDeleteModal } from "@/composables/useModals";
import type { VaultData } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const inProgress = ref(false);

const name = computed(() => deleteModal.entry?.title || "(no title)");
const title = computed(() =>
  deleteModal.permanent ? "Delete Forever" : "Move to Recycle Bin"
);
const confirmLabel = computed(() => {
  if (inProgress.value) return deleteModal.permanent ? "Deleting…" : "Moving…";
  return deleteModal.permanent ? "Delete Forever" : "Move to Recycle Bin";
});

function onOpenChange(open: boolean): void {
  if (!open && !inProgress.value) closeDeleteModal();
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
  <Dialog :open="deleteModal.visible" @update:open="onOpenChange">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>
          <template v-if="deleteModal.permanent">
            Permanently delete <strong class="text-foreground">{{ name }}</strong>?
            This <strong class="text-foreground">cannot be undone</strong> — the
            entry will be gone forever.
          </template>
          <template v-else>
            Move <strong class="text-foreground">{{ name }}</strong> to the
            Recycle Bin?
          </template>
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" :disabled="inProgress" @click="closeDeleteModal">
          Cancel
        </Button>
        <Button variant="destructive" :disabled="inProgress" @click="confirm">
          {{ confirmLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
