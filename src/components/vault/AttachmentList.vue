<script setup lang="ts">
import { reactive } from "vue";
import type { AttachmentInfo } from "../../types";
import {
  downloadAttachment,
  previewAttachment,
  type AttachmentPreview,
} from "../../lib/attachments";
import { formatSize, attachmentIcon } from "../../lib/format";

defineProps<{ attachments: AttachmentInfo[] }>();

// Lazily-decoded preview per attachment index (null = collapsed).
const previews = reactive<Record<number, AttachmentPreview | null>>({});

function canPreview(a: AttachmentInfo): boolean {
  return a.mime_type.startsWith("text/") || a.mime_type.startsWith("image/");
}

function togglePreview(i: number, a: AttachmentInfo): void {
  previews[i] = previews[i] ? null : previewAttachment(a);
}

function save(a: AttachmentInfo): void {
  downloadAttachment(a.name, a.mime_type, a.data_base64);
}

function onRowClick(ev: MouseEvent, a: AttachmentInfo): void {
  if ((ev.target as HTMLElement).closest("button")) return;
  if (ev.shiftKey) save(a);
}

// Typed accessors for the template (avoids inline `as` casts there).
function previewText(i: number): string {
  const p = previews[i];
  return p && p.kind === "text" ? p.text : "";
}
function previewSrc(i: number): string {
  const p = previews[i];
  return p && p.kind === "image" ? p.src : "";
}
</script>

<template>
  <div class="detail-section-header">Attachments</div>
  <template v-for="(a, i) in attachments" :key="i">
    <div class="detail-attachment" @click="onRowClick($event, a)">
      <span class="attachment-icon">{{ attachmentIcon(a.mime_type) }}</span>
      <span class="attachment-name">{{ a.name }}</span>
      <span class="attachment-size">{{ a.size > 0 ? formatSize(a.size) : "" }}</span>
      <button class="icon-btn" @click="save(a)">Save</button>
      <button v-if="canPreview(a)" class="icon-btn" @click="togglePreview(i, a)">
        {{ previews[i] ? "Hide" : "View" }}
      </button>
    </div>
    <div v-if="previews[i]" class="attachment-preview">
      <pre v-if="previews[i]!.kind === 'text'" class="att-text-preview">{{ previewText(i) }}</pre>
      <img
        v-else-if="previews[i]!.kind === 'image'"
        class="att-image-preview"
        :src="previewSrc(i)"
        :alt="a.name"
      />
      <div v-else class="att-download-prompt">
        <span>No preview available for this file type.</span>
        <button class="icon-btn" @click="save(a)">Download</button>
      </div>
    </div>
  </template>
</template>
