<script setup lang="ts">
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { ICON_EMOJI } from "../../lib/icons";
import { showToast } from "../../composables/useToast";

const props = defineProps<{
  selectedIconId: number; // highlighted built-in cell; <0 when a custom icon is active
  url: string; // current entry URL, used as the favicon source
}>();

const emit = defineEmits<{
  (e: "select-builtin", id: number): void;
  (e: "favicon", base64: string): void;
}>();

const fetching = ref(false);

async function getFavicon(): Promise<void> {
  const url = props.url.trim();
  if (!url) {
    showToast("Enter a URL first");
    return;
  }
  fetching.value = true;
  try {
    const b64 = await invoke<string>("fetch_favicon", { url });
    emit("favicon", b64);
    showToast("Favicon downloaded");
  } catch (err) {
    showToast("Favicon failed: " + String(err));
  } finally {
    fetching.value = false;
  }
}
</script>

<template>
  <div class="edit-icon-grid">
    <div class="icon-grid-tools">
      <button
        type="button"
        class="btn-favicon"
        :disabled="fetching"
        @click="getFavicon"
      >
        {{ fetching ? "Fetching favicon…" : "⬇ Download favicon from URL" }}
      </button>
    </div>
    <div class="icon-grid-cells">
      <button
        v-for="(emoji, i) in ICON_EMOJI"
        :key="i"
        type="button"
        class="icon-pick"
        :class="{ selected: i === selectedIconId }"
        @click="emit('select-builtin', i)"
      >
        {{ emoji }}
      </button>
    </div>
  </div>
</template>
