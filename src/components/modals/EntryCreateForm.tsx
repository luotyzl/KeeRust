import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CalendarPlus,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { getApp, setApp, useApp, setView, markSyncPending, newEntryGroupUuid } from "@/store";
import { showToast, copyText } from "@/stores/toast";
import { closeCreateModal } from "@/stores/modals";
import { avatarColor } from "@/lib/avatar";
import { iconComponent } from "@/lib/icons";
import { DEFAULT_AT_SEQUENCE } from "@/lib/autotype";
import {
  DEFAULT_GEN,
  generatePassword,
  estimateStrength,
  type GenOptions,
} from "@/lib/password";
import type { CustomField, EntryData, EntryUpdate, GroupData, SaveResult } from "@/types";
import IconPicker from "@/components/vault/IconPicker";
import KeystrokeHelper from "@/components/vault/KeystrokeHelper";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-muted-foreground text-xs font-semibold">{children}</div>;
}

function GroupOptionIcon({ g }: { g: GroupData }) {
  if (g.custom_icon_base64) {
    return (
      <img
        className="size-4 shrink-0 rounded-sm object-contain"
        src={`data:image/png;base64,${g.custom_icon_base64}`}
        alt=""
      />
    );
  }
  const Icon = iconComponent(g.icon_id < 0 ? 48 : g.icon_id);
  return <Icon className="size-4 shrink-0 opacity-70" />;
}

export default function EntryCreateForm({ entry }: { entry?: EntryData | null }) {
  const isEdit = !!entry;
  const vaultData = useApp((s) => s.vaultData);
  const customIcons = useApp((s) => s.vaultData?.custom_icons ?? []);

  const groups = useMemo<GroupData[]>(
    () => (vaultData?.groups ?? []).filter((g) => g.uuid !== vaultData?.recycle_bin_uuid),
    [vaultData]
  );

  // "Email" is shown in its own row and "Favorite" as the star — pull them out
  // of the editable custom-fields / tags lists when pre-filling for edit.
  const initialEmail =
    entry?.custom_fields.find((f) => f.name.toLowerCase() === "email")?.value ?? "";

  const [title, setTitle] = useState(entry?.title ?? "");
  const [username, setUsername] = useState(entry?.username ?? "");
  const [password, setPassword] = useState(entry?.password ?? "");
  const [url, setUrl] = useState(entry?.url ?? "");
  const [email, setEmail] = useState(initialEmail);
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [groupUuid, setGroupUuid] = useState(entry?.group_uuid ?? newEntryGroupUuid());
  const [favorite, setFavorite] = useState(entry?.tags.includes("Favorite") ?? false);
  const [tags, setTags] = useState(
    (entry?.tags ?? []).filter((t) => t !== "Favorite").join(", ")
  );

  const [showPassword, setShowPassword] = useState(false);
  const [genOpts, setGenOpts] = useState<GenOptions>(DEFAULT_GEN);

  const [showOtp, setShowOtp] = useState(!!entry?.otp_uri);
  const [otpUri, setOtpUri] = useState(entry?.otp_uri ?? "");

  const [expires, setExpires] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");

  const [customFields, setCustomFields] = useState<CustomField[]>(
    (entry?.custom_fields ?? [])
      .filter((f) => f.name.toLowerCase() !== "email")
      .map((f) => ({ ...f }))
  );
  // Indices of protected custom fields whose value is currently revealed.
  const [revealedFields, setRevealedFields] = useState<Set<number>>(new Set());

  // Icon
  const [selectedIconId, setSelectedIconId] = useState(
    typeof entry?.icon_id === "number" ? entry.icon_id : 0
  );
  const [selectedCustomUuid, setSelectedCustomUuid] = useState<string | null>(
    entry?.custom_icon_uuid ?? null
  );
  const [pendingCustomIcon, setPendingCustomIcon] = useState<string | null>(null);
  const existingCustomIcon = entry?.custom_icon_base64 ?? null;
  const [iconDialogOpen, setIconDialogOpen] = useState(false);

  // Auto-type
  const [atEnabled, setAtEnabled] = useState(entry?.autotype_enabled !== false);
  const [atSeq, setAtSeq] = useState(entry?.autotype_sequence ?? "");
  const [atObf, setAtObf] = useState(entry?.autotype_obfuscation ?? false);
  const [showHelper, setShowHelper] = useState(false);
  const [atOpen, setAtOpen] = useState(false);

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
    (selectedCustomUuid
      ? customByUuid(selectedCustomUuid) ?? existingCustomIcon
      : selectedIconId < 0
        ? existingCustomIcon
        : null);
  const avatarBg = previewCustomIcon ? "transparent" : avatarColor(title || "New");

  const strength = estimateStrength(password);

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

  function regenerate(opts = genOpts) {
    setPassword(generatePassword(opts));
    setShowPassword(true);
  }
  function setGen(patch: Partial<GenOptions>) {
    const next = { ...genOpts, ...patch };
    setGenOpts(next);
    regenerate(next);
  }

  function setCf(i: number, patch: Partial<CustomField>) {
    setCustomFields((prev) => prev.map((cf, idx) => (idx === i ? { ...cf, ...patch } : cf)));
  }

  function toggleReveal(i: number) {
    setRevealedFields((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function insertToken(token: string) {
    const input = seqRef.current;
    const start = input?.selectionStart ?? atSeq.length;
    const end = input?.selectionEnd ?? atSeq.length;
    setAtSeq(atSeq.slice(0, start) + token + atSeq.slice(end));
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

    const fields = customFields
      .filter((cf) => cf.name.trim())
      .map((cf) => ({ name: cf.name.trim(), value: cf.value, protected: cf.protected }));
    if (email.trim()) {
      fields.push({ name: "Email", value: email.trim(), protected: false });
    }

    const tagList = tags
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (favorite && !tagList.includes("Favorite")) tagList.push("Favorite");

    const payload: EntryUpdate = {
      uuid: entry?.uuid ?? "",
      group_uuid: groupUuid,
      title: t,
      username,
      password,
      url,
      notes,
      otp_uri: showOtp ? otpUri.trim() : "",
      custom_fields: fields,
      icon_id: selectedIconId,
      custom_icon_base64: pendingCustomIcon,
      custom_icon_uuid: pendingCustomIcon ? null : selectedCustomUuid,
      autotype_enabled: atEnabled,
      autotype_sequence: atSeq.trim(),
      autotype_obfuscation: atObf,
      tags: tagList,
    };
    // Only touch the expiry when the user set one — otherwise an existing
    // entry's expiry is left unchanged (backend treats these as Option).
    if (expires) {
      payload.expires = true;
      payload.expiry = expiryDate;
    }

    setSaving(true);
    try {
      const result = await invoke<SaveResult>("save_entry", {
        password: getApp().masterPassword,
        entry: payload,
      });
      setApp({ vaultData: result.vault, selectedEntryUuid: result.saved_uuid });
      if (groupUuid) setView({ kind: "group", uuid: groupUuid });
      setApp({ selectedEntryUuid: result.saved_uuid });
      markSyncPending();
      showToast(isEdit ? "Entry saved" : "Entry added");
      closeCreateModal();
    } catch (err) {
      showToast("Save failed: " + String(err));
      setSaving(false);
    }
  }

  return (
    <>
      <ScrollArea type="auto" className="min-h-0">
        <div className="grid grid-cols-2 gap-6 p-5">
        {/* LEFT COLUMN */}
        <div className="space-y-4">
          {/* Session: details (title → tags) */}
          <div className="space-y-4 rounded-xl bg-muted/50 p-4">
          {/* Icon + Title + Favorite */}
          <div className="flex items-center gap-2">
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
                  const Icon = iconComponent(selectedIconId < 0 ? 0 : selectedIconId);
                  return <Icon className="size-[55%]" />;
                })()
              )}
            </button>
            <Input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              autoComplete="off"
              className="h-9 flex-1 text-base font-semibold"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={favorite ? "Unfavorite" : "Favorite"}
              onClick={() => setFavorite((v) => !v)}
            >
              <Star className={favorite ? "fill-yellow-400 text-yellow-400" : ""} />
            </Button>
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <FieldLabel>Username</FieldLabel>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <FieldLabel>Password</FieldLabel>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Copy password"
                  onClick={() => copyText(password, "Password")}
                >
                  <Copy />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon-sm" title="Generator options">
                      <SlidersHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>Length</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={String(genOpts.length)}
                      onValueChange={(v) => setGen({ length: Number(v) })}
                    >
                      {[12, 16, 20, 24, 32].map((n) => (
                        <DropdownMenuRadioItem key={n} value={String(n)}>
                          {n} characters
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={genOpts.upper}
                      onCheckedChange={(c) => setGen({ upper: c === true })}
                      onSelect={(e) => e.preventDefault()}
                    >
                      Uppercase
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={genOpts.lower}
                      onCheckedChange={(c) => setGen({ lower: c === true })}
                      onSelect={(e) => e.preventDefault()}
                    >
                      Lowercase
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={genOpts.digits}
                      onCheckedChange={(c) => setGen({ digits: c === true })}
                      onSelect={(e) => e.preventDefault()}
                    >
                      Digits
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={genOpts.symbols}
                      onCheckedChange={(c) => setGen({ symbols: c === true })}
                      onSelect={(e) => e.preventDefault()}
                    >
                      Symbols
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Generate password"
                  onClick={() => regenerate()}
                >
                  <RefreshCw />
                </Button>
              </div>
            </div>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                className="pr-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-0.5 -translate-y-1/2"
                title={showPassword ? "Hide" : "Show"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            {password && (
              <div className="space-y-1">
                <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
                  <div
                    className={"h-full rounded-full transition-all " + strength.color}
                    style={{ width: `${Math.max(5, strength.ratio * 100)}%` }}
                  />
                </div>
                <div className="text-muted-foreground text-right text-xs">
                  {strength.label} ({password.length} chars / {strength.bits} bits)
                </div>
              </div>
            )}
          </div>

          {/* URL */}
          <div className="space-y-1.5">
            <FieldLabel>URL</FieldLabel>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="URL"
              autoComplete="off"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <FieldLabel>Email</FieldLabel>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="off"
            />
          </div>

          {/* 2FA + Expires */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>2FA Code</FieldLabel>
              {showOtp ? (
                <Input
                  value={otpUri}
                  onChange={(e) => setOtpUri(e.target.value)}
                  placeholder="otpauth://… or base32 secret"
                  autoComplete="off"
                />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-primary -ml-2"
                  onClick={() => setShowOtp(true)}
                >
                  <Plus /> Add 2FA Code
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Expires</FieldLabel>
              {expires ? (
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-primary -ml-2"
                  onClick={() => setExpires(true)}
                >
                  <CalendarPlus /> Set an Expiry Date
                </Button>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <FieldLabel>Tags</FieldLabel>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="comma or space separated"
              autoComplete="off"
            />
          </div>
          </div>

          {/* Session: Auto-Type (replaces SSH Key) — collapsible */}
          <div className="space-y-2 rounded-xl bg-muted/50 p-4">
            <button
              type="button"
              onClick={() => setAtOpen((v) => !v)}
              className="flex w-full items-center justify-between"
            >
              <FieldLabel>Auto-Type</FieldLabel>
              <ChevronDown
                className={
                  "text-muted-foreground size-4 transition-transform " +
                  (atOpen ? "rotate-180" : "")
                }
              />
            </button>
            {atOpen && (
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={atEnabled} onCheckedChange={(v) => setAtEnabled(v === true)} />
                  Enable auto-type for this entry
                </label>
                <div className="relative">
                  <Input
                    ref={seqRef}
                    value={atSeq}
                    onChange={(e) => setAtSeq(e.target.value)}
                    placeholder={DEFAULT_AT_SEQUENCE}
                    autoComplete="off"
                    disabled={!atEnabled}
                    onFocus={() => setShowHelper(true)}
                    onBlur={() => setTimeout(() => setShowHelper(false), 150)}
                  />
                  {showHelper && atEnabled && <KeystrokeHelper onInsert={insertToken} />}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={atObf} onCheckedChange={(v) => setAtObf(v === true)} />
                  Mix real keystrokes with random
                </label>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          {/* Session: Group + Notes */}
          <div className="space-y-4 rounded-xl bg-muted/50 p-4">
          {/* Group */}
          <div className="space-y-1.5">
            <FieldLabel>Group</FieldLabel>
            <Select value={groupUuid} onValueChange={setGroupUuid}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.uuid} value={g.uuid}>
                    <span className="flex items-center gap-2">
                      <GroupOptionIcon g={g} />
                      {g.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <FieldLabel>Notes</FieldLabel>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-44"
            />
          </div>
          </div>

          {/* Session: Custom Fields */}
          <div className="space-y-2 rounded-xl bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <FieldLabel>Custom Fields</FieldLabel>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Add field"
                onClick={() =>
                  setCustomFields((prev) => [...prev, { name: "", value: "", protected: false }])
                }
              >
                <Plus />
              </Button>
            </div>
            {customFields.length === 0 ? (
              <p className="text-muted-foreground rounded-md border border-dashed p-3 text-center text-xs">
                No custom fields
              </p>
            ) : (
              <div className="space-y-2">
                {customFields.map((cf, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      className="basis-[35%]"
                      value={cf.name}
                      onChange={(e) => setCf(i, { name: e.target.value })}
                      placeholder="Name"
                      autoComplete="off"
                    />
                    <div className="relative flex-1">
                      <Input
                        type={cf.protected && !revealedFields.has(i) ? "password" : "text"}
                        className={cf.protected ? "pr-8" : ""}
                        value={cf.value}
                        onChange={(e) => setCf(i, { value: e.target.value })}
                        placeholder="Value"
                        autoComplete="off"
                      />
                      {cf.protected && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="absolute top-1/2 right-0.5 -translate-y-1/2"
                          title={revealedFields.has(i) ? "Hide" : "Show"}
                          onClick={() => toggleReveal(i)}
                        >
                          {revealedFields.has(i) ? <EyeOff /> : <Eye />}
                        </Button>
                      )}
                    </div>
                    <label className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                      <Checkbox
                        checked={cf.protected}
                        onCheckedChange={(v) => setCf(i, { protected: v === true })}
                      />
                      Protected
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setCustomFields((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Session: Attachments */}
          <div className="space-y-2 rounded-xl bg-muted/50 p-4">
            <FieldLabel>Attachments</FieldLabel>
            <p className="text-muted-foreground rounded-md border border-dashed p-3 text-center text-xs">
              Attachments can be added after the entry is created.
            </p>
          </div>
        </div>
        </div>
      </ScrollArea>

      <DialogFooter className="m-0 border-t p-3">
        <Button variant="outline" disabled={saving} onClick={closeCreateModal}>
          Cancel
        </Button>
        <Button disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>

      {/* Icon selector dialog */}
      <Dialog open={iconDialogOpen} onOpenChange={setIconDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Icon</DialogTitle>
          </DialogHeader>
          <IconPicker
            selectedIconId={selectedIconId}
            selectedCustomUuid={selectedCustomUuid}
            customIcons={customIcons}
            url={url}
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
