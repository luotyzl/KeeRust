<script setup lang="ts">
import { ref } from "vue";
import { copyText } from "../../composables/useToast";

const props = defineProps<{
  label: string;
  value: string;
  isPassword?: boolean;
  isUrl?: boolean;
}>();

const revealed = ref(false);

function openUrl(): void {
  if (props.value) window.open(props.value, "_blank");
}
</script>

<template>
  <div v-if="value" class="detail-field">
    <div class="detail-label">{{ label }}</div>
    <div class="detail-value">
      <span :class="{ masked: isPassword && !revealed }">{{
        isPassword && !revealed ? "••••••••••••" : value
      }}</span>
      <button v-if="isPassword" class="icon-btn" @click="revealed = !revealed">
        {{ revealed ? "Hide" : "Show" }}
      </button>
      <button class="icon-btn" @click="copyText(value, label)">Copy</button>
      <button v-if="isUrl" class="icon-btn" @click="openUrl">Open</button>
    </div>
  </div>
</template>
