<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { DialogTitle, type DialogTitleProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  DialogTitleProps & { class?: HTMLAttributes["class"] }
>();

const delegated = computed(() => {
  const { class: _ignored, ...rest } = props;
  return rest;
});
</script>

<template>
  <DialogTitle
    data-slot="dialog-title"
    v-bind="delegated"
    :class="cn('text-lg leading-none font-semibold', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
