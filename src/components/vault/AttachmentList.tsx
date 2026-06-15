import { useState, type MouseEvent } from "react";
import { Download, Eye, EyeOff } from "lucide-react";
import type { AttachmentInfo } from "@/types";
import {
  downloadAttachment,
  previewAttachment,
  type AttachmentPreview,
} from "@/lib/attachments";
import { formatSize, attachmentIcon } from "@/lib/format";
import { Button } from "@/components/ui/button";

function canPreview(a: AttachmentInfo): boolean {
  return a.mime_type.startsWith("text/") || a.mime_type.startsWith("image/");
}

export default function AttachmentList({
  attachments,
}: {
  attachments: AttachmentInfo[];
}) {
  const [previews, setPreviews] = useState<
    Record<number, AttachmentPreview | undefined>
  >({});

  function save(a: AttachmentInfo) {
    downloadAttachment(a.name, a.mime_type, a.data_base64);
  }

  function togglePreview(i: number, a: AttachmentInfo) {
    setPreviews((prev) => ({ ...prev, [i]: prev[i] ? undefined : previewAttachment(a) }));
  }

  function onRowClick(ev: MouseEvent, a: AttachmentInfo) {
    if ((ev.target as HTMLElement).closest("button")) return;
    if (ev.shiftKey) save(a);
  }

  return (
    <div className="space-y-1.5">
      {attachments.map((a, i) => {
        const preview = previews[i];
        return (
          <div key={i}>
            <div
              className="bg-muted/40 hover:border-ring/40 flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              onClick={(e) => onRowClick(e, a)}
            >
              <span className="shrink-0">{attachmentIcon(a.mime_type)}</span>
              <span className="flex-1 truncate">{a.name}</span>
              <span className="text-muted-foreground text-xs whitespace-nowrap">
                {a.size > 0 ? formatSize(a.size) : ""}
              </span>
              <Button variant="ghost" size="icon-sm" title="Save" onClick={() => save(a)}>
                <Download />
              </Button>
              {canPreview(a) && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={preview ? "Hide" : "View"}
                  onClick={() => togglePreview(i, a)}
                >
                  {preview ? <EyeOff /> : <Eye />}
                </Button>
              )}
            </div>
            {preview && (
              <div className="mt-1 overflow-hidden rounded-md border">
                {preview.kind === "text" && (
                  <pre className="font-mono-code max-h-72 overflow-auto bg-black/40 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                    {preview.text}
                  </pre>
                )}
                {preview.kind === "image" && (
                  <img
                    className="block max-h-96 max-w-full object-contain"
                    src={preview.src}
                    alt={a.name}
                  />
                )}
                {preview.kind === "none" && (
                  <div className="text-muted-foreground flex items-center justify-between px-3 py-2 text-sm">
                    <span>No preview available for this file type.</span>
                    <Button variant="ghost" size="xs" onClick={() => save(a)}>
                      Download
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
