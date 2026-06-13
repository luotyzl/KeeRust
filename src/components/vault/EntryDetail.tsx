import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useApp, getApp, setApp, markSyncPending } from "../../store";
import { avatarColor } from "../../lib/avatar";
import { showToast } from "../../stores/toast";
import { openDeleteModal, openXmlModal } from "../../stores/modals";
import type { EntryData, VaultData } from "../../types";
import AvatarInner from "./AvatarInner";
import DetailField from "./DetailField";
import OtpWidget from "./OtpWidget";
import AttachmentList from "./AttachmentList";
import EntryEditForm from "./EntryEditForm";

export default function EntryDetail() {
  const vaultData = useApp((s) => s.vaultData);
  const selectedEntryUuid = useApp((s) => s.selectedEntryUuid);
  const editMode = useApp((s) => s.editMode);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const entry: EntryData | null =
    (vaultData && selectedEntryUuid
      ? vaultData.entries.find((e) => e.uuid === selectedEntryUuid)
      : null) ?? null;

  const inRecycleBin =
    !!vaultData?.recycle_bin_uuid && entry?.group_uuid === vaultData.recycle_bin_uuid;

  async function restore() {
    if (!entry) return;
    setRestoring(true);
    try {
      const vault = await invoke<VaultData>("restore_entry", {
        password: getApp().masterPassword,
        uuid: entry.uuid,
      });
      setApp({ vaultData: vault, selectedEntryUuid: null });
      markSyncPending();
      showToast("Entry recovered");
    } catch (err) {
      showToast("Recover failed: " + String(err));
    } finally {
      setRestoring(false);
    }
  }

  async function viewXml() {
    if (!entry) return;
    openXmlModal("Loading…");
    try {
      const xml = await invoke<string>("get_entry_xml", {
        password: getApp().masterPassword,
        uuid: entry.uuid,
      });
      openXmlModal(xml);
    } catch (err) {
      openXmlModal("Failed to load XML: " + String(err));
    }
  }

  // Edit / add form
  if (editMode) {
    return (
      <div className="vault-detail">
        <EntryEditForm entry={entry} onDone={() => setApp({ editMode: false })} />
      </div>
    );
  }

  // Empty state
  if (!entry) {
    return (
      <div className="vault-detail">
        <div className="detail-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>Select an entry to view details</span>
        </div>
      </div>
    );
  }

  const detailBg = entry.custom_icon_base64 ? "transparent" : avatarColor(entry.title);
  const historyDesc = [...entry.history].reverse();

  return (
    <div className="vault-detail">
      <div className="detail-title">
        <div className="detail-avatar" style={{ background: detailBg }}>
          <AvatarInner iconId={entry.icon_id} customIconBase64={entry.custom_icon_base64} />
        </div>
        <span style={{ flex: 1 }}>{entry.title || "(no title)"}</span>
        <div className="detail-title-actions">
          <button className="icon-btn" onClick={() => setApp({ editMode: true })}>
            Edit
          </button>
          {inRecycleBin ? (
            <>
              <button className="btn-restore" disabled={restoring} onClick={restore}>
                {restoring ? "Recovering…" : "Recover"}
              </button>
              <button className="btn-danger" onClick={() => openDeleteModal(entry, true)}>
                Delete Forever
              </button>
            </>
          ) : (
            <button className="btn-danger" onClick={() => openDeleteModal(entry, false)}>
              Delete
            </button>
          )}
        </div>
      </div>

      <DetailField label="Username" value={entry.username} />
      <DetailField label="Password" value={entry.password} isPassword />
      <DetailField label="URL" value={entry.url} isUrl />

      {entry.otp_uri && <OtpWidget otpUri={entry.otp_uri} />}

      {entry.notes && (
        <div className="detail-field">
          <div className="detail-label">Notes</div>
          <div className="detail-notes">{entry.notes}</div>
        </div>
      )}

      {entry.custom_fields.length > 0 && (
        <>
          <div className="detail-section-header">Custom Fields</div>
          {entry.custom_fields.map((f, i) => (
            <DetailField key={i} label={f.name} value={f.value} isPassword={f.protected} />
          ))}
        </>
      )}

      {entry.attachments.length > 0 && <AttachmentList attachments={entry.attachments} />}

      <div className="detail-field">
        <div className="detail-label">Group</div>
        <div className="detail-group-tag">📁 {entry.group_name}</div>
      </div>

      {entry.history.length > 0 && (
        <>
          <div
            className="detail-section-header history-toggle"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            History ({entry.history.length})
            <span className="history-chevron">{historyOpen ? "▼" : "▶"}</span>
          </div>
          {historyOpen && (
            <div className="history-list">
              {historyDesc.map((h, i) => (
                <div key={i} className="history-item">
                  <span className="history-time">{h.modified}</span>
                  <span className="history-title">{h.title || "(no title)"}</span>
                  {h.username && <span className="history-user">{h.username}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="detail-meta-row">
        <button className="btn-meta" onClick={viewXml}>
          &lt;/&gt; View XML metadata
        </button>
      </div>
    </div>
  );
}
