<script setup lang="ts">
import { xmlModal, closeXmlModal } from "@/composables/useModals";
import { copyText } from "@/composables/useToast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function onOpenChange(open: boolean): void {
  if (!open) closeXmlModal();
}
</script>

<template>
  <Dialog :open="xmlModal.visible" @update:open="onOpenChange">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Entry XML</DialogTitle>
      </DialogHeader>
      <pre
        class="bg-muted text-muted-foreground max-h-[60vh] overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed whitespace-pre"
        >{{ xmlModal.content }}</pre
      >
      <DialogFooter>
        <Button variant="outline" @click="copyText(xmlModal.content, 'XML')">
          Copy
        </Button>
        <Button variant="outline" @click="closeXmlModal">Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
