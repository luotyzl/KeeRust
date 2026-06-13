<script setup lang="ts">
import { xmlModal, closeXmlModal } from "../../composables/useModals";
import { copyText } from "../../composables/useToast";
</script>

<template>
  <div v-if="xmlModal.visible" class="modal-overlay" @click.self="closeXmlModal">
    <div class="modal-box modal-xml">
      <div class="modal-title">Entry XML</div>
      <pre>{{ xmlModal.content }}</pre>
      <div class="modal-actions">
        <button class="btn-modal-cancel" @click="copyText(xmlModal.content, 'XML')">
          Copy
        </button>
        <button class="btn-modal-cancel" @click="closeXmlModal">Close</button>
      </div>
    </div>
  </div>
</template>
