import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronRight, Code2, KeyRound, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useApp, getApp, setApp, setView, markSyncPending } from "@/store";
import { avatarColor } from "@/lib/avatar";
import { formatDateTime } from "@/lib/format";
import { showToast } from "@/stores/toast";
import { openDeleteModal, openEditEntryModal, openXmlModal } from "@/stores/modals";
import type { EntryData, VaultData } from "@/types";
import AvatarInner from "./AvatarInner";
import DetailField from "./DetailField";
import OtpWidget from "./OtpWidget";
import AttachmentList from "./AttachmentList";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-foreground mt-6 mb-3 border-b pb-1.5 text-sm font-semibold">
      {children}
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={"truncate text-right " + (mono ? "font-mono-code text-xs" : "")}>
        {value}
      </span>
    </div>
  );
}

export default function EntryDetail() {
  const vaultData = useApp((s) => s.vaultData);
  const selectedEntryUuid = useApp((s) => s.selectedEntryUuid);
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
    <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block">
      <div className="p-6">
      <div className="mb-6 flex items-start gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-lg text-white"
          style={{ background: detailBg }}
        >
          <AvatarInner iconId={entry.icon_id} customIconBase64={entry.custom_icon_base64} />
        </div>
        <span className="min-w-0 flex-1 self-center text-xl font-bold break-words">
          {entry.title || "(no title)"}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {inRecycleBin ? (
            <>
              <Button
                variant="outline"
                size="icon"
                title={restoring ? "Recovering…" : "Recover"}
                disabled={restoring}
                onClick={restore}
              >
                <RotateCcw />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                title="Delete Forever"
                onClick={() => openDeleteModal(entry, true)}
              >
                <Trash2 />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="icon"
                title="Edit"
                onClick={() => openEditEntryModal(entry)}
              >
                <Pencil />
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="View XML metadata"
                onClick={viewXml}
              >
                <Code2 />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                title="Delete"
                onClick={() => openDeleteModal(entry, false)}
              >
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <DetailField label="Username" value={entry.username} />
        <DetailField label="Password" value={entry.password} isPassword />

        {entry.otp_uri && <OtpWidget key={entry.uuid} otpUri={entry.otp_uri} />}

        <DetailField label="URL" value={entry.url} isUrl />

        {entry.notes && (
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">Notes</div>
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
              <DetailField key={i} label={f.name} value={f.value} isPassword={f.protected} noStrength />
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

      <SectionHeader>Metadata</SectionHeader>
      <div>
        <MetaRow label="ID" value={entry.uuid} mono />
        <MetaRow label="Created" value={formatDateTime(entry.created)} />
        <MetaRow label="Modified" value={formatDateTime(entry.modified)} />
        <MetaRow label="Group" value={entry.group_name} />
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
      </div>
    </ScrollArea>
  );
}
