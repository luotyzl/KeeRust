<script setup lang="ts">
import { Toaster, type ToasterProps } from "vue-sonner";
import { useTheme } from "@/composables/useTheme";

const props = defineProps<ToasterProps>();
const { theme } = useTheme();
</script>

<template>
  <Toaster
    v-bind="props"
    :theme="theme"
    class="toaster group"
    :style="{
      '--normal-bg': 'var(--popover)',
      '--normal-text': 'var(--popover-foreground)',
      '--normal-border': 'var(--border)',
    }"
  />
</template>
