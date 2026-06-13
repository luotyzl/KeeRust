<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from "vue";
import type { EntryData } from "../../types";
import { shortUrl } from "../../lib/autotype";
import { parseOtpUri, computeTOTP } from "../../lib/totp";
import { copyText, showToast } from "../../composables/useToast";
import {
  selectState,
  currentSelectEntries,
  typeCreds,
  pickField,
  closeSelectView,
} from "../../composables/useAutotype";

const entries = computed<EntryData[]>(() => currentSelectEntries());

const message = computed(() => {
  const f = selectState.filter;
  if (!f) return "";
  const target = f.title || shortUrl(f.url || "");
  return target ? `Select a password for ${target}` : "Select an entry to auto-type";
});

interface Chip {
  id: string;
  label: string;
  text: string;
  active: boolean;
}

const chips = computed<Chip[]>(() => {
  const f = selectState.filter;
  if (!f) return [];
  const out: Chip[] = [];
  if (f.url) {
    out.push({ id: "url", label: "Website", text: shortUrl(f.url), active: f.useUrl });
    out.push({ id: "subdomains", label: "Subdomains", text: "", active: f.useUrl && f.subdomains });
  }
  if (f.title) out.push({ id: "title", label: "Title", text: f.title, active: f.useTitle });
  if (f.text) out.push({ id: "text", label: "Contains", text: f.text, active: true });
  return out;
});

function onChipClick(id: string): void {
  const f = selectState.filter;
  if (!f) return;
  if (id === "url") f.useUrl = !f.useUrl;
  else if (id === "subdomains") {
    const active = !(f.useUrl && f.subdomains);
    f.subdomains = active;
    if (active) f.useUrl = true;
  } else if (id === "title") f.useTitle = !f.useTitle;
  else if (id === "text") f.text = "";
  clampIndex();
}

function clampIndex(): void {
  if (selectState.index >= entries.value.length) selectState.index = 0;
}

const listEl = ref<HTMLElement | null>(null);
function scrollSelectedIntoView(): void {
  nextTick(() => {
    const rows = listEl.value?.querySelectorAll(".select-item");
    rows?.[selectState.index]?.scrollIntoView({ block: "nearest" });
  });
}

// ── Per-row actions menu ──────────────────────────────────────────────────────
interface MenuItem {
  label: string;
  run: () => void;
}
const menu = reactive<{ visible: boolean; x: number; y: number; items: MenuItem[] }>({
  visible: false,
  x: 0,
  y: 0,
  items: [],
});

function closeMenu(): void {
  menu.visible = false;
  menu.items = [];
}

function buildMenuItems(e: EntryData): MenuItem[] {
  const items: MenuItem[] = [];
  if (e.password) items.push({ label: "Type password", run: () => pickField(e.password) });
  if (e.username) items.push({ label: "Type username", run: () => pickField(e.username) });
  if (e.otp_uri) {
    items.push({
      label: "Type one-time code",
      run: async () => {
        const { secret, period, digits, algorithm } = parseOtpUri(e.otp_uri!);
        const code = await computeTOTP(secret, period, digits, algorithm);
        if (code) pickField(code);
        else showToast("Could not generate one-time code");
      },
    });
  }
  for (const cf of e.custom_fields || []) {
    items.push({ label: `Type: ${cf.name}`, run: () => pickField(cf.value) });
  }
  return items;
}

function openMenu(ev: MouseEvent, e: EntryData, i: number): void {
  ev.stopPropagation();
  selectState.index = i;
  const btn = ev.currentTarget as HTMLElement;
  const r = btn.getBoundingClientRect();
  menu.items = buildMenuItems(e);
  menu.x = Math.max(8, r.right - 150);
  menu.y = r.bottom + 4;
  menu.visible = true;
}

function runMenuItem(item: MenuItem): void {
  closeMenu();
  item.run();
}

function copyPassword(): void {
  const e = entries.value[selectState.index];
  closeMenu();
  if (e) copyText(e.password || "", "Password");
}

function openMenuForSelected(): void {
  const rows = listEl.value?.querySelectorAll(".select-item");
  const row = rows?.[selectState.index];
  const btn = row?.querySelector<HTMLElement>(".select-actions-btn");
  const e = entries.value[selectState.index];
  if (btn && e) {
    const ev = { stopPropagation() {}, currentTarget: btn } as unknown as MouseEvent;
    openMenu(ev, e, selectState.index);
  }
}

function rowClick(ev: MouseEvent, e: EntryData): void {
  if ((ev.target as HTMLElement).closest(".select-actions-btn")) return;
  closeSelectView();
  typeCreds(e);
}

function rowHover(i: number): void {
  if (selectState.index !== i) selectState.index = i;
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent): void {
  if (menu.visible) {
    if (e.key === "Escape") {
      closeMenu();
      e.preventDefault();
    }
    return;
  }
  const list = entries.value;
  if (e.key === "ArrowDown") {
    selectState.index = Math.min(selectState.index + 1, list.length - 1);
    scrollSelectedIntoView();
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    selectState.index = Math.max(selectState.index - 1, 0);
    scrollSelectedIntoView();
    e.preventDefault();
  } else if (e.key === "Enter") {
    const en = list[selectState.index];
    if (en) {
      if (e.shiftKey) openMenuForSelected();
      else if (e.ctrlKey || e.metaKey) pickField(en.password);
      else if (e.altKey) pickField(en.username);
      else {
        closeSelectView();
        typeCreds(en);
      }
    }
    e.preventDefault();
  } else if (e.key === "Escape") {
    closeSelectView();
    e.preventDefault();
  } else if (e.key === "Backspace") {
    if (selectState.filter?.text) {
      selectState.filter.text = selectState.filter.text.slice(0, -1);
      clampIndex();
    }
    e.preventDefault();
  } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (selectState.filter) {
      selectState.filter.text += e.key;
      clampIndex();
    }
    e.preventDefault();
  }
}

// Any click that reaches the document (menu stops its own clicks) closes it.
function onDocClick(): void {
  if (menu.visible) closeMenu();
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("click", onDocClick);
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  document.removeEventListener("click", onDocClick);
});
</script>

<template>
  <div id="screen-select" class="screen active">
    <div class="select-screen">
      <div class="select-header">
        <h2 class="select-title">Auto-Type: Select</h2>
        <div class="select-shortcuts">
          <div><span class="sc-key">Enter</span>: Type the auto-type sequence</div>
          <div><span class="sc-key">Ctrl + Enter</span>: Only type the password</div>
          <div><span class="sc-key">Alt + Enter</span>: Only type the username</div>
          <div><span class="sc-key">Shift + Enter</span>: Other fields</div>
        </div>
      </div>

      <div class="select-message">{{ message }}</div>

      <div class="select-filters">
        <div
          v-for="chip in chips"
          :key="chip.id"
          class="select-filter"
          :class="{ active: chip.active }"
          @click="onChipClick(chip.id)"
        >
          <span class="sf-check">{{ chip.active ? "☑" : "☐" }}</span>
          <span class="sf-text">{{ chip.label }}{{ chip.text ? ": " + chip.text : "" }}</span>
        </div>
      </div>

      <div ref="listEl" class="select-list">
        <div v-if="entries.length === 0" class="select-empty">No matching entries</div>
        <table v-else class="select-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Username</th>
              <th>Website</th>
              <th class="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(e, i) in entries"
              :key="e.uuid"
              class="select-item"
              :class="{ selected: i === selectState.index }"
              @click="rowClick($event, e)"
              @mousemove="rowHover(i)"
            >
              <td :title="e.title || ''">{{ e.title || "(no title)" }}</td>
              <td class="col-user" :title="e.username || ''">{{ e.username || "" }}</td>
              <td class="col-url" :title="e.url || ''">{{ e.url || "" }}</td>
              <td class="actions-cell">
                <button class="select-actions-btn" title="More…" @click="openMenu($event, e, i)">
                  ⋯
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="select-foot">
        <button class="btn-modal-cancel" @click="closeSelectView">Cancel (Esc)</button>
      </div>
    </div>

    <!-- Per-row actions menu -->
    <div
      v-if="menu.visible"
      class="select-actions-menu"
      :style="{ top: menu.y + 'px', left: menu.x + 'px' }"
      @click.stop
    >
      <button
        v-for="(item, i) in menu.items"
        :key="i"
        class="select-actions-item"
        @click="runMenuItem(item)"
      >
        {{ item.label }}
      </button>
      <div class="select-actions-divider"></div>
      <button class="select-actions-item" @click="copyPassword">🔑 Copy password</button>
    </div>
  </div>
</template>
