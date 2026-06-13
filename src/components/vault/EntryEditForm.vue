<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { store, markSyncPending } from "../../store";
import { showToast } from "../../composables/useToast";
import { avatarColor } from "../../lib/avatar";
import { iconEmoji } from "../../lib/icons";
import { DEFAULT_AT_SEQUENCE } from "../../lib/autotype";
import type { CustomField, EntryData, SaveResult } from "../../types";
import IconPicker from "./IconPicker.vue";
import KeystrokeHelper from "./KeystrokeHelper.vue";

const props = defineProps<{ entry: EntryData | null }>();
const emit = defineEmits<{ (e: "saved"): void; (e: "cancel"): void }>();

const isNew = computed(() => !props.entry);

const base: EntryData = props.entry ?? {
  uuid: "",
  group_uuid: store.selectedGroupUuid || store.vaultData?.groups[0]?.uuid || "",
  title: "", username: "", password: "", url: "", notes: "",
  group_name: "",
  otp_uri: null, custom_fields: [], attachments: [], history: [],
  icon_id: 0, custom_icon_base64: null,
  autotype_enabled: true, autotype_sequence: "", autotype_obfuscation: false,
};

// Editable form model (a copy, so cancel discards changes).
const form = reactive({
  title: base.title,
  username: base.username,
  password: base.password,
  url: base.url,
  notes: base.notes,
  otp_uri: base.otp_uri || "",
  autotype_enabled: base.autotype_enabled !== false,
  autotype_sequence: base.autotype_sequence || "",
  autotype_obfuscation: base.autotype_obfuscation,
});
const customFields = reactive<CustomField[]>(
  base.custom_fields.map((cf) => ({ ...cf }))
);

// Icon state: built-in index, or -1 to keep an existing custom icon.
const selectedIconId = ref<number>(typeof base.icon_id === "number" ? base.icon_id : 0);
const pendingCustomIcon = ref<string | null>(null); // freshly downloaded favicon
const existingCustomIcon = base.custom_icon_base64;

const showIconGrid = ref(false);
const showPassword = ref(false);
const showHelper = ref(false);
const saving = ref(false);

// Delay hiding so a token mousedown registers before blur tears the popup down.
function onSeqBlur(): void {
  setTimeout(() => (showHelper.value = false), 150);
}

const titleInput = ref<HTMLInputElement | null>(null);
const seqInput = ref<HTMLInputElement | null>(null);

const previewCustomIcon = computed<string | null>(
  () => pendingCustomIcon.value || (selectedIconId.value < 0 ? existingCustomIcon : null)
);
const avatarBg = computed(() =>
  previewCustomIcon.value ? "transparent" : avatarColor(form.title || "New")
);

function pickBuiltin(id: number): void {
  selectedIconId.value = id;
  pendingCustomIcon.value = null;
  showIconGrid.value = false;
}

function onFavicon(b64: string): void {
  pendingCustomIcon.value = b64;
  selectedIconId.value = -1; // custom icon takes over
  showIconGrid.value = false;
}

function addCustomField(): void {
  customFields.push({ name: "", value: "", protected: false });
}
function removeCustomField(i: number): void {
  customFields.splice(i, 1);
}

// Insert a keystroke token at the cursor in the sequence input.
function insertToken(token: string): void {
  const input = seqInput.value;
  if (!input) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  form.autotype_sequence =
    form.autotype_sequence.slice(0, start) + token + form.autotype_sequence.slice(end);
  nextTick(() => {
    const pos = start + token.length;
    input.focus();
    input.setSelectionRange(pos, pos);
  });
}

async function save(): Promise<void> {
  const title = form.title.trim();
  if (!title) {
    showToast("Title is required");
    return;
  }
  const cleanFields = customFields
    .filter((cf) => cf.name.trim())
    .map((cf) => ({ name: cf.name.trim(), value: cf.value, protected: cf.protected }));

  const update = {
    uuid: isNew.value ? "" : base.uuid,
    group_uuid: base.group_uuid,
    title,
    username: form.username,
    password: form.password,
    url: form.url,
    notes: form.notes,
    otp_uri: form.otp_uri.trim(),
    custom_fields: cleanFields,
    icon_id: selectedIconId.value, // -1 keeps an existing custom icon untouched
    custom_icon_base64: pendingCustomIcon.value, // set only when a favicon was downloaded
    autotype_enabled: form.autotype_enabled,
    autotype_sequence: form.autotype_sequence.trim(),
    autotype_obfuscation: form.autotype_obfuscation,
  };

  saving.value = true;
  try {
    const result = await invoke<SaveResult>("save_entry", {
      password: store.masterPassword,
      entry: update,
    });
    store.vaultData = result.vault;
    store.selectedEntryUuid = result.saved_uuid;
    store.editMode = false;
    showToast(isNew.value ? "Entry added" : "Entry saved");
    markSyncPending();
    emit("saved");
  } catch (err) {
    showToast("Save failed: " + String(err));
    saving.value = false;
  }
}

function cancel(): void {
  store.editMode = false;
  emit("cancel");
}

onMounted(() => titleInput.value?.focus());
</script>

<template>
  <div class="edit-form">
    <div class="edit-header">
      <button
        type="button"
        class="detail-avatar edit-avatar-btn"
        :style="{ background: avatarBg }"
        title="Change icon"
        @click="showIconGrid = !showIconGrid"
      >
        <img
          v-if="previewCustomIcon"
          class="avatar-img"
          :src="`data:image/png;base64,${previewCustomIcon}`"
          alt=""
        />
        <span v-else class="avatar-emoji">{{
          iconEmoji(selectedIconId < 0 ? 0 : selectedIconId)
        }}</span>
      </button>
      <input
        ref="titleInput"
        v-model="form.title"
        class="edit-title-input"
        placeholder="Entry title"
        autocomplete="off"
      />
    </div>

    <IconPicker
      v-if="showIconGrid"
      :selected-icon-id="selectedIconId"
      :url="form.url"
      @select-builtin="pickBuiltin"
      @favicon="onFavicon"
    />

    <div class="edit-section-header">Credentials</div>
    <div class="edit-field-group">
      <label class="edit-label">Username</label>
      <div class="edit-field-row">
        <input v-model="form.username" class="edit-input" placeholder="Username" autocomplete="off" />
      </div>
    </div>
    <div class="edit-field-group">
      <label class="edit-label">Password</label>
      <div class="edit-field-row">
        <input
          v-model="form.password"
          class="edit-input"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="off"
        />
        <button class="icon-btn" type="button" @click="showPassword = !showPassword">
          {{ showPassword ? "Hide" : "Show" }}
        </button>
      </div>
    </div>
    <div class="edit-field-group">
      <label class="edit-label">URL</label>
      <div class="edit-field-row">
        <input v-model="form.url" class="edit-input" placeholder="https://" autocomplete="off" />
      </div>
    </div>

    <div class="edit-section-header">Notes</div>
    <textarea v-model="form.notes" class="edit-textarea" placeholder="Notes..."></textarea>

    <div class="edit-section-header">OTP</div>
    <div class="edit-field-row" style="margin-bottom: 0.25rem">
      <input
        v-model="form.otp_uri"
        class="edit-input"
        placeholder="otpauth://totp/Account?secret=BASE32SECRET"
        autocomplete="off"
      />
    </div>

    <div class="edit-section-header">
      <span>Custom Fields</span>
      <button class="icon-btn" type="button" @click="addCustomField">+ Add Field</button>
    </div>
    <div>
      <div v-for="(cf, i) in customFields" :key="i" class="edit-cf-row">
        <input v-model="cf.name" class="edit-input edit-cf-name" placeholder="Field name" autocomplete="off" />
        <input v-model="cf.value" class="edit-input edit-cf-value" placeholder="Value" autocomplete="off" />
        <label class="edit-cf-protected-label">
          <input type="checkbox" v-model="cf.protected" /> Protected
        </label>
        <button class="icon-btn" type="button" @click="removeCustomField(i)">×</button>
      </div>
    </div>

    <div class="edit-section-header">Auto-Type</div>
    <label class="edit-checkbox-row">
      <input type="checkbox" v-model="form.autotype_enabled" />
      Enable auto-type for this entry
    </label>
    <div class="edit-field-group">
      <label class="edit-label">Keystrokes</label>
      <div class="edit-field-row at-seq-wrap">
        <input
          ref="seqInput"
          v-model="form.autotype_sequence"
          class="edit-input"
          :placeholder="DEFAULT_AT_SEQUENCE"
          autocomplete="off"
          @focus="showHelper = true"
          @blur="onSeqBlur"
        />
        <KeystrokeHelper v-if="showHelper" @insert="insertToken" />
      </div>
      <div class="edit-at-hint">
        Click the field to insert fields, modifiers and keys. Empty = default sequence.
      </div>
    </div>
    <label class="edit-checkbox-row">
      <input type="checkbox" v-model="form.autotype_obfuscation" />
      Mix real keystrokes with random
    </label>

    <div class="edit-actions">
      <button class="btn-save-entry" :disabled="saving" @click="save">
        {{ saving ? "Saving…" : "Save" }}
      </button>
      <button class="btn-cancel-entry" type="button" @click="cancel">Cancel</button>
    </div>
  </div>
</template>
