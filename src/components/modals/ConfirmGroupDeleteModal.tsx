import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { setApp, getApp, setView, markSyncPending } from "@/store";
import { showToast } from "@/stores/toast";
import { useModals, closeDeleteGroupModal } from "@/stores/modals";
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

export default function ConfirmGroupDeleteModal() {
  const visible = useModals((s) => s.deleteGroupVisible);
  const group = useModals((s) => s.deleteGroup);
  const [inProgress, setInProgress] = useState(false);

  const name = group?.name || "(unnamed group)";

  function onOpenChange(open: boolean) {
    if (!open && !inProgress) closeDeleteGroupModal();
  }

  async function confirm() {
    if (!group || inProgress) return;
    setInProgress(true);
    try {
      const vault = await invoke<VaultData>("delete_group", {
        password: getApp().masterPassword,
        uuid: group.uuid,
      });
      setApp({ vaultData: vault, selectedEntryUuid: null });
      // If we were viewing the deleted group, fall back to All Entries.
      const view = getApp().activeView;
      if (view.kind === "group" && view.uuid === group.uuid) setView({ kind: "all" });
      closeDeleteGroupModal();
      markSyncPending();
      showToast("Group deleted");
    } catch (err) {
      showToast("Failed: " + String(err));
    } finally {
      setInProgress(false);
    }
  }

  return (
    <Dialog open={visible} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Delete Group</DialogTitle>
          <DialogDescription>
            Delete the group <strong className="text-foreground">{name}</strong>? Its
            entries (including those in subgroups) will be moved to the{" "}
            <strong className="text-foreground">Recycle Bin</strong>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={inProgress} onClick={closeDeleteGroupModal}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={inProgress} onClick={confirm}>
            {inProgress ? "Deleting…" : "Delete Group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
