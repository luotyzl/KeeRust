import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download, Eye, FilePlus2, HelpCircle, Trash2 } from "lucide-react";
import { getApp, setApp, markSyncPending } from "@/store";
import { showToast } from "@/stores/toast";
import {
  downloadAttachment,
  previewAttachment,
  type AttachmentPreview,
} from "@/lib/attachments";
import { formatSize } from "@/lib/format";
import type { AttachmentInfo, EntryData, VaultData } from "@/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function canPreview(a: AttachmentInfo): boolean {
  return a.mime_type.startsWith("text/") || a.mime_type.startsWith("image/");
}

// Read a File's contents as a bare base64 string (no data: prefix).
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function AttachmentTable({ entry }: { entry: EntryData }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<AttachmentInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Resolve selection against the live list so a deleted name disables actions.
  const selectedAtt = entry.attachments.find((a) => a.name === selected) ?? null;
  const preview: AttachmentPreview | null = active ? previewAttachment(active) : null;

  async function uploadFiles(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    try {
      let vault: VaultData | null = null;
      for (const file of files) {
        const dataBase64 = await fileToBase64(file);
        vault = await invoke<VaultData>("add_entry_attachment", {
          password: getApp().masterPassword,
          uuid: entry.uuid,
          name: file.name,
          dataBase64,
        });
      }
      if (vault) {
        setApp({ vaultData: vault });
        markSyncPending();
        showToast(files.length > 1 ? `${files.length} files attached` : "File attached");
      }
    } catch (err) {
      showToast("Upload failed: " + String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selectedAtt || busy) return;
    setBusy(true);
    try {
      const vault = await invoke<VaultData>("delete_entry_attachment", {
        password: getApp().masterPassword,
        uuid: entry.uuid,
        name: selectedAtt.name,
      });
      setApp({ vaultData: vault });
      markSyncPending();
      setSelected(null);
      showToast("Attachment deleted");
    } catch (err) {
      showToast("Delete failed: " + String(err));
    } finally {
      setBusy(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file later
    void uploadFiles(files);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    void uploadFiles(files);
  }

  return (
    <>
      {/* Header: title + tooltip on the left, toolbar on the right */}
      <div className="mb-3 flex items-center justify-between border-b pb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-foreground text-sm font-semibold">Attachments</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground inline-flex"
              >
                <HelpCircle className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Drag &amp; drop files onto the list, or use the upload button, to attach
              them to this entry.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:text-destructive"
            title="Delete"
            disabled={!selectedAtt || busy}
            onClick={removeSelected}
          >
            <Trash2 />
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-primary hover:text-primary"
            title="Preview"
            disabled={!selectedAtt || !canPreview(selectedAtt)}
            onClick={() => selectedAtt && setActive(selectedAtt)}
          >
            <Eye />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-primary hover:text-primary"
            title="Download"
            disabled={!selectedAtt}
            onClick={() =>
              selectedAtt &&
              downloadAttachment(selectedAtt.name, selectedAtt.mime_type, selectedAtt.data_base64)
            }
          >
            <Download />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-primary hover:text-primary"
            title="Upload"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <FilePlus2 />
          </Button>
        </div>
      </div>

      {/* Table with drag-and-drop upload */}
      <div
        className={
          "rounded-lg border transition-colors " +
          (dragOver ? "border-primary ring-primary/40 ring-2" : "")
        }
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={onDrop}
      >
        <ScrollArea className="max-h-60" viewportClassName="[&>div]:!block">
          <Table className="table-fixed">
            <TableHeader className="bg-card sticky top-0">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-28 text-right">Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entry.attachments.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={2}
                    className="text-muted-foreground py-8 text-center text-xs"
                  >
                    No attachments — drag &amp; drop a file here or use the upload button.
                  </TableCell>
                </TableRow>
              ) : (
                entry.attachments.map((a) => (
                  <TableRow
                    key={a.name}
                    data-state={a.name === selected ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => setSelected(a.name)}
                    onDoubleClick={() => canPreview(a) && setActive(a)}
                  >
                    <TableCell className="min-w-0">
                      <span className="block truncate" title={a.name}>
                        {a.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right">
                      {a.size > 0 ? formatSize(a.size) : ""}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <input ref={inputRef} type="file" multiple hidden onChange={onInputChange} />

      {/* Preview dialog (images / text) */}
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
              <img className="max-w-full object-contain" src={preview.src} alt={active?.name} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
