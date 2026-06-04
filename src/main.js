import { invoke } from "@tauri-apps/api/core";

// ── State ─────────────────────────────────────────────────────────────────────
let vaultData = null;        // { groups, entries }
let selectedGroupUuid = null;
let selectedEntryUuid = null;
let searchQuery = "";

// ── Screen helpers ────────────────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function setError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.toggle("visible", !!msg);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

// ── Avatar color ──────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "#4a90e2", "#7ed321", "#e8741a", "#9b59b6",
  "#e74c3c", "#1abc9c", "#f39c12", "#e91e8c",
];
function avatarColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function avatarLetter(title) {
  return (title || "?")[0].toUpperCase();
}

// ── Copy to clipboard ─────────────────────────────────────────────────────────
async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copied`);
  } catch {
    showToast("Copy failed");
  }
}

// ── Render: group sidebar ─────────────────────────────────────────────────────
function renderGroups() {
  const el = document.getElementById("group-list");
  el.innerHTML = "";

  const section = document.createElement("div");
  section.className = "sidebar-section";
  section.textContent = "Groups";
  el.appendChild(section);

  for (const g of vaultData.groups) {
    const item = document.createElement("div");
    item.className = "group-item" + (g.uuid === selectedGroupUuid ? " active" : "");
    item.innerHTML = `
      <span class="group-name">${escHtml(g.name)}</span>
      <span class="group-count">${g.entry_count}</span>
    `;
    item.addEventListener("click", () => {
      selectedGroupUuid = g.uuid;
      selectedEntryUuid = null;
      renderGroups();
      renderEntries();
      renderDetail();
    });
    el.appendChild(item);
  }
}

// ── Render: entry list ────────────────────────────────────────────────────────
function filteredEntries() {
  let list = vaultData.entries;

  // Filter by group (first group = root = all)
  if (selectedGroupUuid && selectedGroupUuid !== vaultData.groups[0]?.uuid) {
    list = list.filter((e) => e.group_uuid === selectedGroupUuid);
  }

  // Filter by search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q)
    );
  }

  return list;
}

function renderEntries() {
  const el = document.getElementById("entry-list");
  const entries = filteredEntries();

  if (entries.length === 0) {
    el.innerHTML = `<div class="entry-empty">No entries found</div>`;
    return;
  }

  el.innerHTML = "";
  for (const e of entries) {
    const color = avatarColor(e.title);
    const letter = avatarLetter(e.title);
    const subtitle = e.username || e.url || e.group_name;

    const item = document.createElement("div");
    item.className = "entry-item" + (e.uuid === selectedEntryUuid ? " active" : "");
    item.dataset.uuid = e.uuid;
    item.innerHTML = `
      <div class="entry-avatar" style="background:${color}">${escHtml(letter)}</div>
      <div class="entry-info">
        <div class="entry-title">${escHtml(e.title || "(no title)")}</div>
        <div class="entry-sub">${escHtml(subtitle)}</div>
      </div>
    `;
    item.addEventListener("click", () => {
      selectedEntryUuid = e.uuid;
      renderEntries();
      renderDetail();
    });
    el.appendChild(item);
  }
}

// ── Render: detail panel ──────────────────────────────────────────────────────
function renderDetail() {
  const el = document.getElementById("entry-detail");

  if (!selectedEntryUuid) {
    el.innerHTML = `
      <div class="detail-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span>Select an entry to view details</span>
      </div>`;
    return;
  }

  const e = vaultData.entries.find((x) => x.uuid === selectedEntryUuid);
  if (!e) return;

  const color = avatarColor(e.title);
  const letter = avatarLetter(e.title);

  el.innerHTML = `
    <div class="detail-title">
      <div class="detail-avatar" style="background:${color}">${escHtml(letter)}</div>
      ${escHtml(e.title || "(no title)")}
    </div>

    ${detailField("Username", e.username, true, false)}
    ${detailField("Password", e.password, true, true)}
    ${detailField("URL", e.url, true, false, true)}
    ${e.notes ? detailNotes(e.notes) : ""}

    <div class="detail-field">
      <div class="detail-label">Group</div>
      <div class="detail-group-tag">📁 ${escHtml(e.group_name)}</div>
    </div>
  `;

  // Attach copy / reveal / open listeners
  el.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => copyText(btn.dataset.copy, btn.dataset.label));
  });

  el.querySelectorAll("[data-reveal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const span = btn.closest(".detail-value").querySelector("span");
      if (span.classList.contains("masked")) {
        span.classList.remove("masked");
        span.textContent = btn.dataset.reveal;
        btn.textContent = "Hide";
      } else {
        span.classList.add("masked");
        span.textContent = "••••••••••••";
        btn.textContent = "Show";
      }
    });
  });

  el.querySelectorAll("[data-open-url]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.dataset.openUrl;
      if (url) window.open(url, "_blank");
    });
  });
}

function detailField(label, value, showCopy, isPassword, isUrl) {
  if (!value) return "";
  const masked = isPassword;
  const display = masked ? "••••••••••••" : escHtml(value);
  const spanClass = masked ? "masked" : "";

  let buttons = "";
  if (isPassword) {
    buttons += `<button class="icon-btn" data-reveal="${escAttr(value)}">Show</button>`;
  }
  if (showCopy && value) {
    buttons += `<button class="icon-btn" data-copy="${escAttr(value)}" data-label="${escAttr(label)}">Copy</button>`;
  }
  if (isUrl && value) {
    buttons += `<button class="icon-btn" data-open-url="${escAttr(value)}">Open</button>`;
  }

  return `
    <div class="detail-field">
      <div class="detail-label">${escHtml(label)}</div>
      <div class="detail-value">
        <span class="${spanClass}">${display}</span>
        ${buttons}
      </div>
    </div>`;
}

function detailNotes(notes) {
  return `
    <div class="detail-field">
      <div class="detail-label">Notes</div>
      <div class="detail-notes">${escHtml(notes)}</div>
    </div>`;
}

// ── Escape helpers ────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escAttr(s) {
  return String(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const config = await invoke("get_webdav_config");
  if (config) {
    document.getElementById("vault-source").textContent = config.url;
    show("screen-unlock");
    document.getElementById("master-pass").focus();
  } else {
    show("screen-config");
    document.getElementById("dav-url").focus();
  }
}

// ── Config form ───────────────────────────────────────────────────────────────
document.getElementById("form-config").addEventListener("submit", async (e) => {
  e.preventDefault();
  setError("config-error", "");

  const config = {
    url: document.getElementById("dav-url").value.trim(),
    username: document.getElementById("dav-user").value.trim(),
    password: document.getElementById("dav-pass").value,
  };

  if (!config.url || !config.username || !config.password) {
    setError("config-error", "All fields are required.");
    return;
  }
  if (!config.url.startsWith("https://")) {
    setError("config-error", "URL must start with https://");
    return;
  }

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await invoke("save_webdav_config", { config });
    document.getElementById("vault-source").textContent = config.url;
    show("screen-unlock");
    document.getElementById("master-pass").focus();
  } catch (err) {
    setError("config-error", String(err));
  } finally {
    btn.disabled = false;
    btn.textContent = "Save & Continue";
  }
});

// ── Unlock form ───────────────────────────────────────────────────────────────
document.getElementById("form-unlock").addEventListener("submit", async (e) => {
  e.preventDefault();
  setError("unlock-error", "");

  const password = document.getElementById("master-pass").value;
  if (!password) { setError("unlock-error", "Password is required."); return; }

  const btn = document.getElementById("btn-unlock");
  btn.disabled = true;
  btn.textContent = "Unlocking…";

  try {
    vaultData = await invoke("open_database", { password });
    document.getElementById("master-pass").value = "";

    // Select root group (all entries) by default
    selectedGroupUuid = vaultData.groups[0]?.uuid ?? null;
    selectedEntryUuid = null;
    searchQuery = "";

    renderGroups();
    renderEntries();
    renderDetail();
    show("screen-vault");
    document.getElementById("search-input").focus();
  } catch (err) {
    setError("unlock-error", String(err));
    document.getElementById("master-pass").select();
  } finally {
    btn.disabled = false;
    btn.textContent = "Unlock";
  }
});

// ── Search ────────────────────────────────────────────────────────────────────
document.getElementById("search-input").addEventListener("input", (e) => {
  searchQuery = e.target.value.trim();
  selectedEntryUuid = null;
  renderEntries();
  renderDetail();
});

// ── Lock ──────────────────────────────────────────────────────────────────────
document.getElementById("btn-lock").addEventListener("click", () => {
  vaultData = null;
  selectedGroupUuid = null;
  selectedEntryUuid = null;
  searchQuery = "";
  document.getElementById("search-input").value = "";
  show("screen-unlock");
  document.getElementById("master-pass").focus();
});

// ── Change config ─────────────────────────────────────────────────────────────
document.getElementById("btn-change-config").addEventListener("click", () => {
  show("screen-config");
  document.getElementById("dav-url").focus();
});

init();
