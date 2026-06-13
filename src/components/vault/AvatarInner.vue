<script setup lang="ts">
import { iconEmoji } from "../../lib/icons";

// Inner content for an avatar circle: a custom PNG if present, else the
// entry's built-in icon emoji. Wrap it with .entry-avatar / .detail-avatar.
defineProps<{
  iconId: number;
  customIconBase64?: string | null;
}>();
</script>

<template>
  <img
    v-if="customIconBase64"
    class="avatar-img"
    :src="`data:image/png;base64,${customIconBase64}`"
    alt=""
  />
  <span v-else class="avatar-emoji">{{ iconEmoji(iconId < 0 ? 0 : iconId) }}</span>
</template>
