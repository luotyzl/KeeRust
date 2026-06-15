import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronRight, Code2, KeyRound, RotateCcw } from "lucide-react";
import { useApp, getApp, setApp, setView, markSyncPending } from "@/store";
import { avatarColor } from "@/lib/avatar";
import { showToast } from "@/stores/toast";
import { openDeleteModal, openXmlModal } from "@/stores/modals";
import type { EntryData, VaultData } from "@/types";
import AvatarInner from "./AvatarInner";
import DetailField from "./DetailField";
import OtpWidget from "./OtpWidget";
import AttachmentList from "./AttachmentList";
import EntryEditForm from "./EntryEditForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground mt-6 mb-2 border-b pb-1.5 text-xs font-semibold tracking-wider uppercase">
      {children}
    </div>
  );
}

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

  if (editMode) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-6">
          <EntryEditForm entry={entry} onDone={() => setApp({ editMode: false })} />
        </div>
      </ScrollArea>
    );
  }

  if (!entry) {
    return (
      <div className="text-muted-foreground/60 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
        <KeyRound className="size-12 opacity-40" />
        <span className="text-sm">Select an entry to view details</span>
      </div>
    );
  }

  const detailBg = entry.custom_icon_base64 ? "transparent" : avatarColor(entry.title);
  const historyDesc = [...entry.history].reverse();

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-lg text-white"
          style={{ background: detailBg }}
        >
          <AvatarInner iconId={entry.icon_id} customIconBase64={entry.custom_icon_base64} />
        </div>
        <span className="flex-1 truncate text-xl font-bold">{entry.title || "(no title)"}</span>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setApp({ editMode: true })}>
            Edit
          </Button>
          {inRecycleBin ? (
            <>
              <Button variant="outline" size="sm" disabled={restoring} onClick={restore}>
                <RotateCcw /> {restoring ? "Recovering…" : "Recover"}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => openDeleteModal(entry, true)}>
                Delete Forever
              </Button>
            </>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => openDeleteModal(entry, false)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <DetailField label="Username" value={entry.username} />
        <DetailField label="Password" value={entry.password} isPassword />
        <DetailField label="URL" value={entry.url} isUrl />

        {entry.otp_uri && <OtpWidget otpUri={entry.otp_uri} />}

        {entry.notes && (
          <div className="space-y-1.5">
            <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Notes
            </div>
            <div className="font-mono-code bg-muted/40 max-h-40 overflow-y-auto rounded-md border px-3 py-2 text-sm whitespace-pre-wrap">
              {entry.notes}
            </div>
          </div>
        )}
      </div>

      {entry.custom_fields.length > 0 && (
        <>
          <SectionHeader>Custom Fields</SectionHeader>
          <div className="space-y-4">
            {entry.custom_fields.map((f, i) => (
              <DetailField key={i} label={f.name} value={f.value} isPassword={f.protected} />
            ))}
          </div>
        </>
      )}

      {entry.attachments.length > 0 && (
        <>
          <SectionHeader>Attachments</SectionHeader>
          <AttachmentList attachments={entry.attachments} />
        </>
      )}

      <div className="mt-4 space-y-1.5">
        <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Group
        </div>
        <Badge variant="outline" className="gap-1.5 px-2.5 py-1">
          📁 {entry.group_name}
        </Badge>
      </div>

      {entry.tags.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Tags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {entry.tags.map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => setView({ kind: "tag", value: t })}
              >
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {entry.history.length > 0 && (
        <>
          <button
            className="text-muted-foreground hover:text-foreground mt-6 mb-2 flex w-full items-center justify-between border-b pb-1.5 text-xs font-semibold tracking-wider uppercase"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            History ({entry.history.length})
            {historyOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
          {historyOpen && (
            <div>
              {historyDesc.map((h, i) => (
                <div
                  key={i}
                  className="flex items-baseline gap-3 border-b py-1.5 text-xs last:border-0"
                >
                  <span className="text-muted-foreground shrink-0">{h.modified}</span>
                  <span className="flex-1 truncate">{h.title || "(no title)"}</span>
                  {h.username && (
                    <span className="text-muted-foreground shrink-0">{h.username}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-6 flex justify-center">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={viewXml}>
          <Code2 /> View XML metadata
        </Button>
      </div>
      </div>
    </ScrollArea>
  );
}
