import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Pencil, Plus, X } from "lucide-react";
import { setApp, getApp, useApp, markSyncPending, newEntryGroupUuid } from "@/store";
import { showToast } from "@/stores/toast";
import { avatarColor } from "@/lib/avatar";
import { iconComponent } from "@/lib/icons";
import { DEFAULT_AT_SEQUENCE } from "@/lib/autotype";
import type { CustomField, EntryData, SaveResult } from "@/types";
import IconPicker from "./IconPicker";
import KeystrokeHelper from "./KeystrokeHelper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground mt-5 mb-2 flex items-center justify-between border-b pb-1.5 text-xs font-semibold tracking-wider uppercase">
      {children}
    </div>
  );
}

export default function EntryEditForm({
  entry,
  onDone,
}: {
  entry: EntryData | null;
  onDone: () => void;
}) {
  const isNew = !entry;

  const base: EntryData = useMemo(
    () =>
      entry ?? {
        uuid: "",
        group_uuid: newEntryGroupUuid(),
        title: "", username: "", password: "", url: "", notes: "",
        group_name: "",
        otp_uri: null, custom_fields: [], attachments: [], history: [], tags: [],
        icon_id: 0, custom_icon_base64: null, custom_icon_uuid: null,
        autotype_enabled: true, autotype_sequence: "", autotype_obfuscation: false,
      },
    [entry]
  );

  const [title, setTitle] = useState(base.title);
  const [username, setUsername] = useState(base.username);
  const [password, setPassword] = useState(base.password);
  const [url, setUrl] = useState(base.url);
  const [notes, setNotes] = useState(base.notes);
  const [otpUri, setOtpUri] = useState(base.otp_uri || "");
  const [atEnabled, setAtEnabled] = useState(base.autotype_enabled !== false);
  const [atSeq, setAtSeq] = useState(base.autotype_sequence || "");
  const [atObf, setAtObf] = useState(base.autotype_obfuscation);
  const [customFields, setCustomFields] = useState<CustomField[]>(
    base.custom_fields.map((cf) => ({ ...cf }))
  );

  const customIcons = useApp((s) => s.vaultData?.custom_icons ?? []);

  const [selectedIconId, setSelectedIconId] = useState<number>(
    typeof base.icon_id === "number" ? base.icon_id : 0
  );
  // UUID of a chosen *existing* custom icon (reused by reference). null = none.
  const [selectedCustomUuid, setSelectedCustomUuid] = useState<string | null>(
    base.custom_icon_uuid ?? null
  );
  const [pendingCustomIcon, setPendingCustomIcon] = useState<string | null>(null);
  const existingCustomIcon = base.custom_icon_base64;

  const [showIconGrid, setShowIconGrid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showHelper, setShowHelper] = useState(false);
  const [saving, setSaving] = useState(false);

  const titleRef = useRef<HTMLInputElement | null>(null);
  const seqRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const customByUuid = (uuid: string | null) =>
    uuid ? customIcons.find((c) => c.uuid === uuid)?.base64 ?? null : null;

  const previewCustomIcon =
    pendingCustomIcon ??
    (selectedCustomUuid ? customByUuid(selectedCustomUuid) ?? existingCustomIcon : null);
  const avatarBg = previewCustomIcon ? "transparent" : avatarColor(title || "New");

  function pickBuiltin(id: number) {
    setSelectedIconId(id);
    setSelectedCustomUuid(null);
    setPendingCustomIcon(null);
    setShowIconGrid(false);
  }
  function pickCustom(uuid: string) {
    setSelectedCustomUuid(uuid);
    setSelectedIconId(-1);
    setPendingCustomIcon(null);
    setShowIconGrid(false);
  }
  function onFavicon(b64: string) {
    setPendingCustomIcon(b64);
    setSelectedCustomUuid(null);
    setSelectedIconId(-1);
    setShowIconGrid(false);
  }

  function setCf(i: number, patch: Partial<CustomField>) {
    setCustomFields((prev) => prev.map((cf, idx) => (idx === i ? { ...cf, ...patch } : cf)));
  }
  function addCustomField() {
    setCustomFields((prev) => [...prev, { name: "", value: "", protected: false }]);
  }
  function removeCustomField(i: number) {
    setCustomFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  function insertToken(token: string) {
    const input = seqRef.current;
    const start = input?.selectionStart ?? atSeq.length;
    const end = input?.selectionEnd ?? atSeq.length;
    const next = atSeq.slice(0, start) + token + atSeq.slice(end);
    setAtSeq(next);
    requestAnimationFrame(() => {
      if (input) {
        const pos = start + token.length;
        input.focus();
        input.setSelectionRange(pos, pos);
      }
    });
  }

  async function save() {
    const t = title.trim();
    if (!t) {
      showToast("Title is required");
      return;
    }
    const cleanFields = customFields
      .filter((cf) => cf.name.trim())
      .map((cf) => ({ name: cf.name.trim(), value: cf.value, protected: cf.protected }));

    const update = {
      uuid: isNew ? "" : base.uuid,
      group_uuid: base.group_uuid,
      title: t,
      username,
      password,
      url,
      notes,
      otp_uri: otpUri.trim(),
      custom_fields: cleanFields,
      icon_id: selectedIconId,
      custom_icon_base64: pendingCustomIcon,
      custom_icon_uuid: pendingCustomIcon ? null : selectedCustomUuid,
      autotype_enabled: atEnabled,
      autotype_sequence: atSeq.trim(),
      autotype_obfuscation: atObf,
    };

    setSaving(true);
    try {
      const result = await invoke<SaveResult>("save_entry", {
        password: getApp().masterPassword,
        entry: update,
      });
      setApp({ vaultData: result.vault, selectedEntryUuid: result.saved_uuid, editMode: false });
      showToast(isNew ? "Entry added" : "Entry saved");
      markSyncPending();
      onDone();
    } catch (err) {
      showToast("Save failed: " + String(err));
      setSaving(false);
    }
  }

  function cancel() {
    setApp({ editMode: false });
    onDone();
  }

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          title="Change icon"
          onClick={() => setShowIconGrid((v) => !v)}
          className="relative flex size-10 shrink-0 items-center justify-center rounded-lg text-lg text-white transition hover:brightness-110"
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
              const Icon = iconComponent(selectedIconId < 0 ? 0 : selectedIconId);
              return <Icon className="size-[55%]" />;
            })()
          )}
          <span className="bg-primary text-primary-foreground border-background absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border-2">
            <Pencil className="size-2" />
          </span>
        </button>
        <Input
          ref={titleRef}
          className="h-auto border-0 border-b border-input px-0 text-lg font-bold shadow-none focus-visible:border-ring focus-visible:ring-0 rounded-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Entry title"
          autoComplete="off"
        />
      </div>

      {showIconGrid && (
        <IconPicker
          selectedIconId={selectedIconId}
          selectedCustomUuid={selectedCustomUuid}
          customIcons={customIcons}
          url={url}
          onSelectBuiltin={pickBuiltin}
          onSelectCustom={pickCustom}
          onFavicon={onFavicon}
        />
      )}

      <SectionHeader>Credentials</SectionHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Username</Label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Password</Label>
          <div className="flex items-center gap-2">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? "Hide" : "Show"}
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>URL</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            autoComplete="off"
          />
        </div>
      </div>

      <SectionHeader>Notes</SectionHeader>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes..."
        className="min-h-20"
      />

      <SectionHeader>OTP</SectionHeader>
      <Input
        value={otpUri}
        onChange={(e) => setOtpUri(e.target.value)}
        placeholder="otpauth://totp/Account?secret=BASE32SECRET"
        autoComplete="off"
      />

      <SectionHeader>
        <span>Custom Fields</span>
        <Button type="button" variant="ghost" size="xs" onClick={addCustomField}>
          <Plus /> Add Field
        </Button>
      </SectionHeader>
      <div className="space-y-2">
        {customFields.map((cf, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              className="basis-[35%]"
              value={cf.name}
              onChange={(e) => setCf(i, { name: e.target.value })}
              placeholder="Field name"
              autoComplete="off"
            />
            <Input
              className="flex-1"
              value={cf.value}
              onChange={(e) => setCf(i, { value: e.target.value })}
              placeholder="Value"
              autoComplete="off"
            />
            <label className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
              <Checkbox
                checked={cf.protected}
                onCheckedChange={(v) => setCf(i, { protected: v === true })}
              />
              Protected
            </label>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeCustomField(i)}>
              <X />
            </Button>
          </div>
        ))}
      </div>

      <SectionHeader>Auto-Type</SectionHeader>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={atEnabled} onCheckedChange={(v) => setAtEnabled(v === true)} />
        Enable auto-type for this entry
      </label>
      <div className="mt-3 space-y-1.5">
        <Label>Keystrokes</Label>
        <div className="relative">
          <Input
            ref={seqRef}
            value={atSeq}
            onChange={(e) => setAtSeq(e.target.value)}
            placeholder={DEFAULT_AT_SEQUENCE}
            autoComplete="off"
            onFocus={() => setShowHelper(true)}
            onBlur={() => setTimeout(() => setShowHelper(false), 150)}
          />
          {showHelper && <KeystrokeHelper onInsert={insertToken} />}
        </div>
        <p className="text-muted-foreground text-xs">
          Click the field to insert fields, modifiers and keys. Empty = default sequence.
        </p>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <Checkbox checked={atObf} onCheckedChange={(v) => setAtObf(v === true)} />
        Mix real keystrokes with random
      </label>

      <div className="mt-6 flex gap-2 border-t pt-4">
        <Button disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
