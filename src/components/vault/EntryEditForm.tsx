import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { setApp, getApp, markSyncPending } from "../../store";
import { showToast } from "../../stores/toast";
import { avatarColor } from "../../lib/avatar";
import { iconEmoji } from "../../lib/icons";
import { DEFAULT_AT_SEQUENCE } from "../../lib/autotype";
import type { CustomField, EntryData, SaveResult } from "../../types";
import IconPicker from "./IconPicker";
import KeystrokeHelper from "./KeystrokeHelper";

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
        group_uuid:
          getApp().selectedGroupUuid || getApp().vaultData?.groups[0]?.uuid || "",
        title: "", username: "", password: "", url: "", notes: "",
        group_name: "",
        otp_uri: null, custom_fields: [], attachments: [], history: [],
        icon_id: 0, custom_icon_base64: null,
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

  // Icon state: built-in index, or -1 to keep an existing custom icon.
  const [selectedIconId, setSelectedIconId] = useState<number>(
    typeof base.icon_id === "number" ? base.icon_id : 0
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

  const previewCustomIcon =
    pendingCustomIcon || (selectedIconId < 0 ? existingCustomIcon : null);
  const avatarBg = previewCustomIcon ? "transparent" : avatarColor(title || "New");

  function pickBuiltin(id: number) {
    setSelectedIconId(id);
    setPendingCustomIcon(null);
    setShowIconGrid(false);
  }

  function onFavicon(b64: string) {
    setPendingCustomIcon(b64);
    setSelectedIconId(-1); // custom icon takes over
    setShowIconGrid(false);
  }

  function setCf(i: number, patch: Partial<CustomField>) {
    setCustomFields((prev) =>
      prev.map((cf, idx) => (idx === i ? { ...cf, ...patch } : cf))
    );
  }
  function addCustomField() {
    setCustomFields((prev) => [...prev, { name: "", value: "", protected: false }]);
  }
  function removeCustomField(i: number) {
    setCustomFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Insert a keystroke token at the cursor in the sequence input.
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
      icon_id: selectedIconId, // -1 keeps an existing custom icon untouched
      custom_icon_base64: pendingCustomIcon, // set only when a favicon was downloaded
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
      setApp({
        vaultData: result.vault,
        selectedEntryUuid: result.saved_uuid,
        editMode: false,
      });
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
    <div className="edit-form">
      <div className="edit-header">
        <button
          type="button"
          className="detail-avatar edit-avatar-btn"
          style={{ background: avatarBg }}
          title="Change icon"
          onClick={() => setShowIconGrid((v) => !v)}
        >
          {previewCustomIcon ? (
            <img
              className="avatar-img"
              src={`data:image/png;base64,${previewCustomIcon}`}
              alt=""
            />
          ) : (
            <span className="avatar-emoji">
              {iconEmoji(selectedIconId < 0 ? 0 : selectedIconId)}
            </span>
          )}
        </button>
        <input
          ref={titleRef}
          className="edit-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Entry title"
          autoComplete="off"
        />
      </div>

      {showIconGrid && (
        <IconPicker
          selectedIconId={selectedIconId}
          url={url}
          onSelectBuiltin={pickBuiltin}
          onFavicon={onFavicon}
        />
      )}

      <div className="edit-section-header">Credentials</div>
      <div className="edit-field-group">
        <label className="edit-label">Username</label>
        <div className="edit-field-row">
          <input
            className="edit-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="edit-field-group">
        <label className="edit-label">Password</label>
        <div className="edit-field-row">
          <input
            className="edit-input"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
          <button
            className="icon-btn"
            type="button"
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <div className="edit-field-group">
        <label className="edit-label">URL</label>
        <div className="edit-field-row">
          <input
            className="edit-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="edit-section-header">Notes</div>
      <textarea
        className="edit-textarea"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes..."
      />

      <div className="edit-section-header">OTP</div>
      <div className="edit-field-row" style={{ marginBottom: "0.25rem" }}>
        <input
          className="edit-input"
          value={otpUri}
          onChange={(e) => setOtpUri(e.target.value)}
          placeholder="otpauth://totp/Account?secret=BASE32SECRET"
          autoComplete="off"
        />
      </div>

      <div className="edit-section-header">
        <span>Custom Fields</span>
        <button className="icon-btn" type="button" onClick={addCustomField}>
          + Add Field
        </button>
      </div>
      <div>
        {customFields.map((cf, i) => (
          <div key={i} className="edit-cf-row">
            <input
              className="edit-input edit-cf-name"
              value={cf.name}
              onChange={(e) => setCf(i, { name: e.target.value })}
              placeholder="Field name"
              autoComplete="off"
            />
            <input
              className="edit-input edit-cf-value"
              value={cf.value}
              onChange={(e) => setCf(i, { value: e.target.value })}
              placeholder="Value"
              autoComplete="off"
            />
            <label className="edit-cf-protected-label">
              <input
                type="checkbox"
                checked={cf.protected}
                onChange={(e) => setCf(i, { protected: e.target.checked })}
              />{" "}
              Protected
            </label>
            <button className="icon-btn" type="button" onClick={() => removeCustomField(i)}>
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="edit-section-header">Auto-Type</div>
      <label className="edit-checkbox-row">
        <input
          type="checkbox"
          checked={atEnabled}
          onChange={(e) => setAtEnabled(e.target.checked)}
        />
        Enable auto-type for this entry
      </label>
      <div className="edit-field-group">
        <label className="edit-label">Keystrokes</label>
        <div className="edit-field-row at-seq-wrap">
          <input
            ref={seqRef}
            className="edit-input"
            value={atSeq}
            onChange={(e) => setAtSeq(e.target.value)}
            placeholder={DEFAULT_AT_SEQUENCE}
            autoComplete="off"
            onFocus={() => setShowHelper(true)}
            onBlur={() => setTimeout(() => setShowHelper(false), 150)}
          />
          {showHelper && <KeystrokeHelper onInsert={insertToken} />}
        </div>
        <div className="edit-at-hint">
          Click the field to insert fields, modifiers and keys. Empty = default sequence.
        </div>
      </div>
      <label className="edit-checkbox-row">
        <input
          type="checkbox"
          checked={atObf}
          onChange={(e) => setAtObf(e.target.checked)}
        />
        Mix real keystrokes with random
      </label>

      <div className="edit-actions">
        <button className="btn-save-entry" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="btn-cancel-entry" type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
