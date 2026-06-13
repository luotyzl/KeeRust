<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { store, lock } from "@/store";
import { deleteModal } from "@/composables/useModals";
import type { SearchFields } from "@/types";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle.vue";

const optsOpen = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);

const fieldList: Array<{ key: keyof SearchFields; label: string }> = [
  { key: "title", label: "Title" },
  { key: "username", label: "Username" },
  { key: "password", label: "Password" },
  { key: "url", label: "URL" },
  { key: "notes", label: "Notes" },
  { key: "custom", label: "Custom Fields" },
];

function onSearchInput(): void {
  store.selectedEntryUuid = null;
}

function newEntry(): void {
  if (!store.vaultData) return;
  store.selectedEntryUuid = null;
  store.editMode = true;
}

function focusSearch(): void {
  searchInput.value?.focus();
}
defineExpose({ focusSearch });

// ── Type-to-search (KeeWeb-style): a printable keypress jumps into the search ──
function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

function onGlobalKeydown(e: KeyboardEvent): void {
  if (store.screen !== "vault") return;
  if (store.editMode) return;
  if (deleteModal.visible) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (isEditableTarget(document.activeElement)) return;
  if (e.key.length !== 1 || e.key === " ") return;

  store.searchQuery = e.key;
  store.selectedEntryUuid = null;
  const input = searchInput.value;
  if (input) {
    input.focus();
    try {
      input.setSelectionRange(1, 1);
    } catch {
      /* ignore */
    }
  }
  e.preventDefault();
}

function onDocClick(): void {
  optsOpen.value = false;
}

onMounted(() => {
  document.addEventListener("keydown", onGlobalKeydown);
  document.addEventListener("click", onDocClick);
});
onUnmounted(() => {
  document.removeEventListener("keydown", onGlobalKeydown);
  document.removeEventListener("click", onDocClick);
});
</script>

<template>
  <header class="vault-header">
    <span class="vault-brand">KeeRust</span>
    <div class="vault-search-wrap" @click.stop>
      <input
        ref="searchInput"
        v-model="store.searchQuery"
        type="search"
        placeholder="Search entries…"
        autocomplete="off"
        @input="onSearchInput"
      />
      <button
        class="search-opts-btn"
        :class="{ active: optsOpen }"
        title="Search options"
        aria-label="Search options"
        @click.stop="optsOpen = !optsOpen"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      </button>
      <div v-if="optsOpen" class="search-opts-dropdown" @click.stop>
        <div class="search-opts-title">Search in</div>
        <label v-for="f in fieldList" :key="f.key">
          <input type="checkbox" v-model="store.searchFields[f.key]" @change="onSearchInput" />
          {{ f.label }}
        </label>
        <div class="search-opts-divider"></div>
        <label>
          <input type="checkbox" v-model="store.searchCaseSensitive" @change="onSearchInput" />
          Case sensitive
        </label>
      </div>
    </div>
    <span class="sync-dot" :class="store.syncDot" title="Sync status"></span>
    <ThemeToggle />
    <Button variant="outline" size="sm" @click="newEntry">+ New</Button>
    <Button variant="outline" size="sm" @click="lock">🔒 Lock</Button>
  </header>
</template>
