import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { setApp, getApp, markSyncPending } from "../../store";
import { showToast } from "../../stores/toast";
import { useModals, closeDeleteModal } from "../../stores/modals";
import type { VaultData } from "../../types";

export default function ConfirmModal() {
  const visible = useModals((s) => s.deleteVisible);
  const entry = useModals((s) => s.deleteEntry);
  const permanent = useModals((s) => s.deletePermanent);
  const [inProgress, setInProgress] = useState(false);

  if (!visible) return null;

  const name = entry?.title || "(no title)";
  const title = permanent ? "Delete Forever" : "Move to Recycle Bin";
  const confirmLabel = inProgress
    ? permanent
      ? "Deleting…"
      : "Moving…"
    : permanent
      ? "Delete Forever"
      : "Move to Recycle Bin";

  function onOverlayClick() {
    if (!inProgress) closeDeleteModal();
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
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onOverlayClick()}>
      <div className="modal-box">
        <div className="modal-title">{title}</div>
        <div className="modal-body">
          {permanent ? (
            <>
              Permanently delete <strong>{name}</strong>? This{" "}
              <strong>cannot be undone</strong> — the entry will be gone forever.
            </>
          ) : (
            <>
              Move <strong>{name}</strong> to the Recycle Bin?
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-modal-cancel" disabled={inProgress} onClick={closeDeleteModal}>
            Cancel
          </button>
          <button className="btn-modal-confirm" disabled={inProgress} onClick={confirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
