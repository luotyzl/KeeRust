import { useState, type MouseEvent } from "react";
import type { AttachmentInfo } from "../../types";
import {
  downloadAttachment,
  previewAttachment,
  type AttachmentPreview,
} from "../../lib/attachments";
import { formatSize, attachmentIcon } from "../../lib/format";

function canPreview(a: AttachmentInfo): boolean {
  return a.mime_type.startsWith("text/") || a.mime_type.startsWith("image/");
}

export default function AttachmentList({
  attachments,
}: {
  attachments: AttachmentInfo[];
}) {
  // Lazily-decoded preview per attachment index (undefined = collapsed).
  const [previews, setPreviews] = useState<
    Record<number, AttachmentPreview | undefined>
  >({});

  function save(a: AttachmentInfo) {
    downloadAttachment(a.name, a.mime_type, a.data_base64);
  }

  function togglePreview(i: number, a: AttachmentInfo) {
    setPreviews((prev) => ({
      ...prev,
      [i]: prev[i] ? undefined : previewAttachment(a),
    }));
  }

  function onRowClick(ev: MouseEvent, a: AttachmentInfo) {
    if ((ev.target as HTMLElement).closest("button")) return;
    if (ev.shiftKey) save(a);
  }

  return (
    <>
      <div className="detail-section-header">Attachments</div>
      {attachments.map((a, i) => {
        const preview = previews[i];
        return (
          <div key={i}>
            <div className="detail-attachment" onClick={(e) => onRowClick(e, a)}>
              <span className="attachment-icon">{attachmentIcon(a.mime_type)}</span>
              <span className="attachment-name">{a.name}</span>
              <span className="attachment-size">
                {a.size > 0 ? formatSize(a.size) : ""}
              </span>
              <button className="icon-btn" onClick={() => save(a)}>
                Save
              </button>
              {canPreview(a) && (
                <button className="icon-btn" onClick={() => togglePreview(i, a)}>
                  {preview ? "Hide" : "View"}
                </button>
              )}
            </div>
            {preview && (
              <div className="attachment-preview">
                {preview.kind === "text" && (
                  <pre className="att-text-preview">{preview.text}</pre>
                )}
                {preview.kind === "image" && (
                  <img className="att-image-preview" src={preview.src} alt={a.name} />
                )}
                {preview.kind === "none" && (
                  <div className="att-download-prompt">
                    <span>No preview available for this file type.</span>
                    <button className="icon-btn" onClick={() => save(a)}>
                      Download
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
