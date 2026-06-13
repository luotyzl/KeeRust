<script setup lang="ts">
import { toastState } from "../composables/useToast";
</script>

<template>
  <div class="copied-toast" :class="{ show: toastState.visible }">
    {{ toastState.message }}
  </div>
</template>
