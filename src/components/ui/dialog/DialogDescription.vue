<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { DialogDescription, type DialogDescriptionProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  DialogDescriptionProps & { class?: HTMLAttributes["class"] }
>();

const delegated = computed(() => {
  const { class: _ignored, ...rest } = props;
  return rest;
});
</script>

<template>
  <DialogDescription
    data-slot="dialog-description"
    v-bind="delegated"
    :class="cn('text-muted-foreground text-sm', props.class)"
  >
    <slot />
  </DialogDescription>
</template>
