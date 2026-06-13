<script setup lang="ts">
import { computed } from "vue";
import { store } from "../../store";
import { avatarColor } from "../../lib/avatar";
import type { EntryData } from "../../types";
import AvatarInner from "./AvatarInner.vue";

// KeeWeb-style filtering: group / recycle-bin scoping + advanced field search.
const entries = computed<EntryData[]>(() => {
  const vault = store.vaultData;
  if (!vault) return [];
  let list = vault.entries;
  const rbUuid = vault.recycle_bin_uuid;
  const rootUuid = vault.groups[0]?.uuid;
  const sel = store.selectedGroupUuid;

  if (rbUuid && sel === rbUuid) {
    list = list.filter((e) => e.group_uuid === rbUuid);
  } else if (sel && sel !== rootUuid) {
    list = list.filter((e) => e.group_uuid === sel);
  } else if (rbUuid) {
    list = list.filter((e) => e.group_uuid !== rbUuid);
  }

  const q = store.searchQuery;
  if (q) {
    const cs = store.searchCaseSensitive;
    const needle = cs ? q : q.toLowerCase();
    const f = store.searchFields;
    const hit = (val: string | null): boolean => {
      if (!val) return false;
      return (cs ? val : val.toLowerCase()).includes(needle);
    };
    list = list.filter((e) => {
      if (f.title && hit(e.title)) return true;
      if (f.username && hit(e.username)) return true;
      if (f.password && hit(e.password)) return true;
      if (f.url && hit(e.url)) return true;
      if (f.notes && hit(e.notes)) return true;
      if (f.custom && e.custom_fields.some((cf) => hit(cf.name) || hit(cf.value)))
        return true;
      return false;
    });
  }
  return list;
});

function subtitle(e: EntryData): string {
  return e.username || e.url || e.group_name;
}

function bg(e: EntryData): string {
  return e.custom_icon_base64 ? "transparent" : avatarColor(e.title);
}

function select(e: EntryData): void {
  store.selectedEntryUuid = e.uuid;
}
</script>

<template>
  <div class="vault-entries">
    <div v-if="entries.length === 0" class="entry-empty">No entries found</div>
    <div
      v-for="e in entries"
      :key="e.uuid"
      class="entry-item"
      :class="{ active: e.uuid === store.selectedEntryUuid }"
      @click="select(e)"
    >
      <div class="entry-avatar" :style="{ background: bg(e) }">
        <AvatarInner :icon-id="e.icon_id" :custom-icon-base64="e.custom_icon_base64" />
      </div>
      <div class="entry-info">
        <div class="entry-title">{{ e.title || "(no title)" }}</div>
        <div class="entry-sub">{{ subtitle(e) }}</div>
      </div>
    </div>
  </div>
</template>
