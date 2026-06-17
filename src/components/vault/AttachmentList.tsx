import { useState } from "react";
import { Download, Eye } from "lucide-react";
import type { AttachmentInfo } from "@/types";
import {
  downloadAttachment,
  previewAttachment,
  type AttachmentPreview,
} from "@/lib/attachments";
import { formatSize, attachmentIcon } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function canPreview(a: AttachmentInfo): boolean {
  return a.mime_type.startsWith("text/") || a.mime_type.startsWith("image/");
}

export default function AttachmentList({
  attachments,
}: {
  attachments: AttachmentInfo[];
}) {
  const [active, setActive] = useState<AttachmentInfo | null>(null);
  const preview: AttachmentPreview | null = active ? previewAttachment(active) : null;

  return (
    <>
      <div className="space-y-1.5">
        {attachments.map((a, i) => (
          <div
            key={i}
            className="hover:bg-muted/40 flex items-center gap-3 rounded-md px-1 py-1.5 text-sm"
          >
            <span className="shrink-0 text-lg">{attachmentIcon(a.mime_type)}</span>
            <div className="min-w-0 flex-1">
              <div className="break-words">{a.name}</div>
              {a.size > 0 && (
                <div className="text-muted-foreground text-xs">{formatSize(a.size)}</div>
              )}
            </div>
            {canPreview(a) && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Preview"
                onClick={() => setActive(a)}
              >
                <Eye />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              title="Download"
              onClick={() => downloadAttachment(a.name, a.mime_type, a.data_base64)}
            >
              <Download />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-h-[90vh] w-[90vw] gap-3 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{active?.name}</DialogTitle>
          </DialogHeader>
          {preview?.kind === "text" && (
            <pre className="font-mono-code bg-muted/40 max-h-[70vh] overflow-auto rounded-md border p-3 text-xs leading-relaxed whitespace-pre-wrap">
              {preview.text}
            </pre>
          )}
          {preview?.kind === "image" && (
            <div className="flex max-h-[70vh] justify-center overflow-auto">
              <img
                className="max-w-full object-contain"
                src={preview.src}
                alt={active?.name}
              />
            </div>
          )}
          {preview?.kind === "none" && (
            <div className="text-muted-foreground flex items-center justify-between gap-4 px-1 py-6 text-sm">
              <span>No preview available for this file type.</span>
              {active && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadAttachment(active.name, active.mime_type, active.data_base64)
                  }
                >
                  <Download /> Download
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
