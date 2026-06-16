import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { setApp, getApp, markSyncPending } from "@/store";
import { showToast } from "@/stores/toast";
import { useModals, closeDeleteModal } from "@/stores/modals";
import type { VaultData } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function ConfirmModal() {
  const visible = useModals((s) => s.deleteVisible);
  const entry = useModals((s) => s.deleteEntry);
  const permanent = useModals((s) => s.deletePermanent);
  const [inProgress, setInProgress] = useState(false);

  const name = entry?.title || "(no title)";
  const title = permanent ? "Delete Forever" : "Move to Recycle Bin";
  const confirmLabel = inProgress
    ? permanent
      ? "Deleting…"
      : "Moving…"
    : permanent
      ? "Delete Forever"
      : "Move to Recycle Bin";

  function onOpenChange(open: boolean) {
    if (!open && !inProgress) closeDeleteModal();
  }

  async function confirm() {
    if (!entry || inProgress) return;
    setInProgress(true);
    try {
      const vault = await invoke<VaultData>(
        permanent ? "delete_entry_permanent" : "delete_entry",
        { password: getApp().masterPassword, uuid: entry.uuid }
      );
      setApp({ vaultData: vault, selectedEntryUuid: null });
      closeDeleteModal();
      markSyncPending();
      showToast(permanent ? "Deleted permanently" : "Moved to Recycle Bin");
    } catch (err) {
      showToast("Failed: " + String(err));
    } finally {
      setInProgress(false);
    }
  }

  return (
    <Dialog open={visible} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {permanent ? (
              <>
                Permanently delete{" "}
                <strong className="text-foreground">{name}</strong>? This{" "}
                <strong className="text-foreground">cannot be undone</strong> —
                the entry will be gone forever.
              </>
            ) : (
              <>
                Move <strong className="text-foreground">{name}</strong> to the
                Recycle Bin?
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={inProgress} onClick={closeDeleteModal}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={inProgress} onClick={confirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
