import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { setApp, getApp, setView, markSyncPending, useApp } from "@/store";
import { showToast } from "@/stores/toast";
import { useModals, closeCreateModal } from "@/stores/modals";
import { avatarColor } from "@/lib/avatar";
import { iconComponent } from "@/lib/icons";
import type { SaveResult } from "@/types";
import IconPicker from "@/components/vault/IconPicker";
import EntryCreateForm from "./EntryCreateForm";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const GROUP_DEFAULT_ICON = 48; // folder

function GroupForm() {
  const customIcons = useApp((s) => s.vaultData?.custom_icons ?? []);

  const [name, setName] = useState("");
  const [selectedIconId, setSelectedIconId] = useState(GROUP_DEFAULT_ICON);
  const [selectedCustomUuid, setSelectedCustomUuid] = useState<string | null>(null);
  const [pendingCustomIcon, setPendingCustomIcon] = useState<string | null>(null);
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const nameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const customByUuid = (uuid: string | null) =>
    uuid ? customIcons.find((c) => c.uuid === uuid)?.base64 ?? null : null;
  const previewCustomIcon =
    pendingCustomIcon ?? (selectedCustomUuid ? customByUuid(selectedCustomUuid) : null);
  const avatarBg = previewCustomIcon ? "transparent" : avatarColor(name || "Group");

  function pickBuiltin(id: number) {
    setSelectedIconId(id);
    setSelectedCustomUuid(null);
    setPendingCustomIcon(null);
    setIconDialogOpen(false);
  }
  function pickCustom(uuid: string) {
    setSelectedCustomUuid(uuid);
    setSelectedIconId(-1);
    setPendingCustomIcon(null);
    setIconDialogOpen(false);
  }
  function onFavicon(b64: string) {
    setPendingCustomIcon(b64);
    setSelectedCustomUuid(null);
    setSelectedIconId(-1);
    setIconDialogOpen(false);
  }

  async function save() {
    const n = name.trim();
    if (!n) {
      showToast("Group name is required");
      return;
    }
    setSaving(true);
    try {
      const result = await invoke<SaveResult>("save_group", {
        password: getApp().masterPassword,
        group: {
          uuid: "",
          parent_uuid: "",
          name: n,
          icon_id: selectedIconId,
          custom_icon_base64: pendingCustomIcon,
          custom_icon_uuid: pendingCustomIcon ? null : selectedCustomUuid,
        },
      });
      setApp({ vaultData: result.vault });
      setView({ kind: "group", uuid: result.saved_uuid });
      markSyncPending();
      showToast("Group added");
      closeCreateModal();
    } catch (err) {
      showToast("Save failed: " + String(err));
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          title="Change icon"
          onClick={() => setIconDialogOpen(true)}
          className="relative flex size-10 shrink-0 items-center justify-center rounded-lg text-white transition hover:brightness-110"
          style={{ background: avatarBg }}
        >
          {previewCustomIcon ? (
            <img
              className="size-full rounded-[inherit] object-contain"
              src={`data:image/png;base64,${previewCustomIcon}`}
              alt=""
            />
          ) : (
            (() => {
              const Icon = iconComponent(selectedIconId < 0 ? GROUP_DEFAULT_ICON : selectedIconId);
              return <Icon className="size-[55%]" />;
            })()
          )}
        </button>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="group-name">Group name</Label>
          <Input
            id="group-name"
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New group"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" disabled={saving} onClick={closeCreateModal}>
          Cancel
        </Button>
        <Button disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>

      <Dialog open={iconDialogOpen} onOpenChange={setIconDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Icon</DialogTitle>
          </DialogHeader>
          <IconPicker
            selectedIconId={selectedIconId}
            selectedCustomUuid={selectedCustomUuid}
            customIcons={customIcons}
            url=""
            onSelectBuiltin={pickBuiltin}
            onSelectCustom={pickCustom}
            onFavicon={onFavicon}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIconDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Modal for creating a new entry/group from the "New" menu.
export default function CreateModal() {
  const visible = useModals((s) => s.createVisible);
  const kind = useModals((s) => s.createKind);

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && closeCreateModal()}>
      {kind === "group" ? (
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>New Group</DialogTitle>
          </DialogHeader>
          <GroupForm />
        </DialogContent>
      ) : (
        <DialogContent
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          className="grid max-h-[90vh] w-[95vw] grid-rows-[1fr_auto] gap-0 overflow-hidden p-0 sm:max-w-[95vw]"
        >
          <DialogTitle className="sr-only">New Entry</DialogTitle>
          <EntryCreateForm />
        </DialogContent>
      )}
    </Dialog>
  );
}
