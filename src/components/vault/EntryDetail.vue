<script setup lang="ts">
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { store, selectedEntry, markSyncPending } from "../../store";
import { avatarColor } from "../../lib/avatar";
import { showToast } from "../../composables/useToast";
import { openDeleteModal, openXmlModal } from "../../composables/useModals";
import type { EntryData, VaultData } from "../../types";
import AvatarInner from "./AvatarInner.vue";
import DetailField from "./DetailField.vue";
import OtpWidget from "./OtpWidget.vue";
import AttachmentList from "./AttachmentList.vue";
import EntryEditForm from "./EntryEditForm.vue";

const historyOpen = ref(false);
const restoring = ref(false);

const entry = computed<EntryData | null>(() => selectedEntry());

const inRecycleBin = computed(
  () =>
    !!store.vaultData?.recycle_bin_uuid &&
    entry.value?.group_uuid === store.vaultData.recycle_bin_uuid
);

const detailBg = computed(() =>
  entry.value?.custom_icon_base64 ? "transparent" : avatarColor(entry.value?.title ?? "")
);

// Newest-first history for display.
const historyDesc = computed(() => [...(entry.value?.history ?? [])].reverse());

async function restore(): Promise<void> {
  if (!entry.value) return;
  restoring.value = true;
  try {
    store.vaultData = await invoke<VaultData>("restore_entry", {
      password: store.masterPassword,
      uuid: entry.value.uuid,
    });
    store.selectedEntryUuid = null;
    markSyncPending();
    showToast("Entry recovered");
  } catch (err) {
    showToast("Recover failed: " + String(err));
  } finally {
    restoring.value = false;
  }
}

async function viewXml(): Promise<void> {
  if (!entry.value) return;
  openXmlModal("Loading…");
  try {
    const xml = await invoke<string>("get_entry_xml", {
      password: store.masterPassword,
      uuid: entry.value.uuid,
    });
    openXmlModal(xml);
  } catch (err) {
    openXmlModal("Failed to load XML: " + String(err));
  }
}
</script>

<template>
  <div class="vault-detail">
    <!-- Edit / add form -->
    <EntryEditForm
      v-if="store.editMode"
      :entry="entry"
      @saved="store.editMode = false"
      @cancel="store.editMode = false"
    />

    <!-- Empty state -->
    <div v-else-if="!entry" class="detail-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span>Select an entry to view details</span>
    </div>

    <!-- Entry detail -->
    <template v-else>
      <div class="detail-title">
        <div class="detail-avatar" :style="{ background: detailBg }">
          <AvatarInner :icon-id="entry.icon_id" :custom-icon-base64="entry.custom_icon_base64" />
        </div>
        <span style="flex: 1">{{ entry.title || "(no title)" }}</span>
        <div class="detail-title-actions">
          <button class="icon-btn" @click="store.editMode = true">Edit</button>
          <template v-if="inRecycleBin">
            <button class="btn-restore" :disabled="restoring" @click="restore">
              {{ restoring ? "Recovering…" : "Recover" }}
            </button>
            <button class="btn-danger" @click="openDeleteModal(entry, true)">
              Delete Forever
            </button>
          </template>
          <button v-else class="btn-danger" @click="openDeleteModal(entry, false)">
            Delete
          </button>
        </div>
      </div>

      <DetailField label="Username" :value="entry.username" />
      <DetailField label="Password" :value="entry.password" :is-password="true" />
      <DetailField label="URL" :value="entry.url" :is-url="true" />

      <OtpWidget v-if="entry.otp_uri" :otp-uri="entry.otp_uri" />

      <div v-if="entry.notes" class="detail-field">
        <div class="detail-label">Notes</div>
        <div class="detail-notes">{{ entry.notes }}</div>
      </div>

      <template v-if="entry.custom_fields.length">
        <div class="detail-section-header">Custom Fields</div>
        <DetailField
          v-for="(f, i) in entry.custom_fields"
          :key="i"
          :label="f.name"
          :value="f.value"
          :is-password="f.protected"
        />
      </template>

      <AttachmentList v-if="entry.attachments.length" :attachments="entry.attachments" />

      <div class="detail-field">
        <div class="detail-label">Group</div>
        <div class="detail-group-tag">📁 {{ entry.group_name }}</div>
      </div>

      <template v-if="entry.history.length">
        <div class="detail-section-header history-toggle" @click="historyOpen = !historyOpen">
          History ({{ entry.history.length }})
          <span class="history-chevron">{{ historyOpen ? "▼" : "▶" }}</span>
        </div>
        <div v-if="historyOpen" class="history-list">
          <div v-for="(h, i) in historyDesc" :key="i" class="history-item">
            <span class="history-time">{{ h.modified }}</span>
            <span class="history-title">{{ h.title || "(no title)" }}</span>
            <span v-if="h.username" class="history-user">{{ h.username }}</span>
          </div>
        </div>
      </template>

      <div class="detail-meta-row">
        <button class="btn-meta" @click="viewXml">&lt;/&gt; View XML metadata</button>
      </div>
    </template>
  </div>
</template>
