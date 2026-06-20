import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronLeft, ChevronRight, Eye, EyeOff, RotateCcw, Trash2 } from "lucide-react";
import { getApp, setApp, markSyncPending } from "@/store";
import { showToast } from "@/stores/toast";
import { formatDateTime } from "@/lib/format";
import type { EntryData, HistoryEntry, VaultData } from "@/types";
import AvatarInner from "./AvatarInner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-baseline gap-3 py-1">
      <span className="text-muted-foreground text-right text-xs">{label}</span>
      <div className="min-w-0 text-sm break-words">{children}</div>
    </div>
  );
}

export default function EntryHistoryDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: EntryData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // History from the backend is newest-first; show it oldest → newest (left → right).
  const timeline: HistoryEntry[] = [...entry.history].reverse();
  const [sel, setSel] = useState(timeline.length - 1);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset to the newest state whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setSel(timeline.length - 1);
      setShowPw(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the selection valid if the history shrinks (e.g. after a delete).
  const clampedSel = Math.min(Math.max(sel, 0), timeline.length - 1);
  const state = timeline[clampedSel];

  async function revert() {
    if (!state || busy) return;
    setBusy(true);
    try {
      const vault = await invoke<VaultData>("revert_entry_history", {
        password: getApp().masterPassword,
        uuid: entry.uuid,
        index: state.index,
      });
      setApp({ vaultData: vault });
      markSyncPending();
      showToast("Reverted to earlier state");
      onOpenChange(false);
    } catch (err) {
      showToast("Revert failed: " + String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!state || busy) return;
    setBusy(true);
    try {
      const vault = await invoke<VaultData>("delete_entry_history", {
        password: getApp().masterPassword,
        uuid: entry.uuid,
        index: state.index,
      });
      setApp({ vaultData: vault });
      markSyncPending();
      showToast("History state deleted");
      // Step back one so we land on a still-existing version.
      setSel((s) => Math.max(0, Math.min(s, timeline.length - 2)));
      if (timeline.length <= 1) onOpenChange(false);
    } catch (err) {
      showToast("Delete failed: " + String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] gap-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Entry History</DialogTitle>
          <DialogDescription>
            Click a point on the timeline to view that saved state.
          </DialogDescription>
        </DialogHeader>

        {/* Timeline */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Older"
            disabled={clampedSel <= 0}
            onClick={() => setSel(clampedSel - 1)}
          >
            <ChevronLeft />
          </Button>
          <div className="relative flex flex-1 items-center">
            <div className="bg-border absolute inset-x-1 h-0.5" />
            <div className="flex w-full items-center justify-between">
              {timeline.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  title={formatDateTime(h.modified)}
                  onClick={() => setSel(i)}
                  className={
                    "relative size-3 rounded-full border-2 transition " +
                    (i === clampedSel
                      ? "border-primary bg-primary scale-125"
                      : "border-muted-foreground/40 bg-background hover:border-primary")
                  }
                />
              ))}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Newer"
            disabled={clampedSel >= timeline.length - 1}
            onClick={() => setSel(clampedSel + 1)}
          >
            <ChevronRight />
          </Button>
        </div>

        {/* Selected state details */}
        {state && (
          <div className="bg-muted/30 rounded-lg border p-4">
            <Row label="Version">
              <span className="text-primary font-medium">{clampedSel + 1}</span>
              <span className="text-muted-foreground"> / {timeline.length}</span>
            </Row>
            <Row label="Saved">{formatDateTime(state.modified)}</Row>
            <Row label="Title">
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground inline-flex size-4 shrink-0 items-center justify-center">
                  <AvatarInner iconId={state.icon_id} customIconBase64={state.custom_icon_base64} />
                </span>
                <span className="min-w-0 break-words">{state.title || "—"}</span>
              </span>
            </Row>
            <Row label="User">{state.username || "—"}</Row>
            <Row label="Password">
              {state.password ? (
                <span className="flex items-center gap-2">
                  <span className="font-mono-code">
                    {showPw ? state.password : "••••••••••••"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={showPw ? "Hide" : "Reveal"}
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? <EyeOff /> : <Eye />}
                  </Button>
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Website">
              {state.url ? (
                <span className="break-all">{state.url}</span>
              ) : (
                "—"
              )}
            </Row>
            {state.otp_uri && <Row label="2FA">Configured</Row>}
            <Row label="Notes">
              {state.notes ? (
                <span className="whitespace-pre-wrap">{state.notes}</span>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Tags">
              {state.tags.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {state.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Expires">
              {state.expires && state.expiry ? formatDateTime(state.expiry) : "Never"}
            </Row>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy || !state} onClick={revert}>
            <RotateCcw /> Revert to state
          </Button>
          <Button variant="destructive" disabled={busy || !state} onClick={remove}>
            <Trash2 /> Delete state
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
