import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// ── State ─────────────────────────────────────────────────────────────────────
let vaultData = null;
let selectedGroupUuid = null;
let selectedEntryUuid = null;
let searchQuery = "";
let otpTimers = [];
let masterPassword = "";
let editMode = false;

// Which fields the search looks in (KeeWeb-style advanced search)
let searchFields = {
  title: true,
  username: true,
  password: false,
  url: true,
  notes: true,
  custom: true,
};
let searchCaseSensitive = false;

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

// ── Sync indicator ────────────────────────────────────────────────────────────
let syncDotTimer;
function setSyncDot(state) {
  const dot = document.getElementById("sync-dot");
  if (!dot) return;
  dot.className = "sync-dot" + (state ? " " + state : "");
  const labels = { syncing: "Syncing…", ok: "Synced", error: "Sync failed" };
  dot.title = labels[state] || "";
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

// ── TOTP implementation ───────────────────────────────────────────────────────
function base32Decode(str) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  str = str.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0, value = 0;
  const output = [];
  for (const c of str) {
    const idx = chars.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output).buffer;
}

function parseOtpUri(uri) {
  try {
    const url = new URL(uri);
    const params = new URLSearchParams(url.search);
    return {
      secret: params.get("secret") || "",
      period: parseInt(params.get("period") || "30", 10),
      digits: parseInt(params.get("digits") || "6", 10),
      algorithm: (params.get("algorithm") || "SHA1").toUpperCase(),
    };
  } catch {
    // bare secret fallback
    return { secret: uri, period: 30, digits: 6, algorithm: "SHA1" };
  }
}

async function computeTOTP(secret, period, digits) {
  const keyData = base32Decode(secret);
  if (!keyData || keyData.byteLength === 0) return null;

  const counter = Math.floor(Date.now() / 1000 / period);
  const buf = new ArrayBuffer(8);
  new DataView(buf).setUint32(4, counter >>> 0, false);

  const algo = { name: "HMAC", hash: "SHA-1" };
  const key = await crypto.subtle.importKey("raw", keyData, algo, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));

  const offset = sig[sig.length - 1] & 0xf;
  const code = (
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff)
  ) % Math.pow(10, digits);

  return String(code).padStart(digits, "0");
}

function stopOtpTimers() {
  otpTimers.forEach(clearInterval);
  otpTimers = [];
}

function startOtpWidget(container, otpUri) {
  const { secret, period, digits } = parseOtpUri(otpUri);
  if (!secret) return;

  const codeEl = container.querySelector(".otp-code");
  const barEl = container.querySelector(".otp-bar");
  const secsEl = container.querySelector(".otp-secs");

  async function refresh() {
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now % period;
    const remaining = period - elapsed;
    const pct = (remaining / period) * 100;

    barEl.style.width = pct + "%";
    barEl.className = "otp-bar" + (remaining <= 5 ? " danger" : remaining <= 10 ? " warn" : "");
    secsEl.textContent = remaining + "s";

    // Only recompute code on new period
    if (elapsed === 0 || codeEl.textContent === "------") {
      const code = await computeTOTP(secret, period, digits);
      codeEl.textContent = code || "------";
    }
  }

  refresh();
  const id = setInterval(refresh, 1000);
  otpTimers.push(id);
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
    if (g.uuid === vaultData.recycle_bin_uuid) continue; // shown in footer instead
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

  renderRecycleBin();
}

// ── Render: recycle bin footer item ───────────────────────────────────────────
function renderRecycleBin() {
  const wrap = document.getElementById("sidebar-recycle");
  const rbUuid = vaultData?.recycle_bin_uuid;
  if (!rbUuid) { wrap.style.display = "none"; return; }

  const rbGroup = vaultData.groups.find((g) => g.uuid === rbUuid);
  wrap.style.display = "block";
  document.getElementById("recycle-count").textContent = rbGroup ? rbGroup.entry_count : 0;
  document.getElementById("recycle-bin-item")
    .classList.toggle("active", selectedGroupUuid === rbUuid);
}

// ── Render: entry list ────────────────────────────────────────────────────────
function filteredEntries() {
  let list = vaultData.entries;
  const rbUuid = vaultData.recycle_bin_uuid;
  const rootUuid = vaultData.groups[0]?.uuid;

  if (rbUuid && selectedGroupUuid === rbUuid) {
    // Recycle Bin view: only recycled entries
    list = list.filter((e) => e.group_uuid === rbUuid);
  } else if (selectedGroupUuid && selectedGroupUuid !== rootUuid) {
    list = list.filter((e) => e.group_uuid === selectedGroupUuid);
  } else if (rbUuid) {
    // "All Entries" view: hide anything in the Recycle Bin
    list = list.filter((e) => e.group_uuid !== rbUuid);
  }

  if (searchQuery) {
    const cs = searchCaseSensitive;
    const needle = cs ? searchQuery : searchQuery.toLowerCase();
    const hit = (val) => {
      if (!val) return false;
      return (cs ? val : val.toLowerCase()).includes(needle);
    };
    list = list.filter((e) => {
      if (searchFields.title && hit(e.title)) return true;
      if (searchFields.username && hit(e.username)) return true;
      if (searchFields.password && hit(e.password)) return true;
      if (searchFields.url && hit(e.url)) return true;
      if (searchFields.notes && hit(e.notes)) return true;
      if (searchFields.custom &&
          e.custom_fields.some((cf) => hit(cf.name) || hit(cf.value))) return true;
      return false;
    });
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
  stopOtpTimers();
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

  let html = `
    <div class="detail-title">
      <div class="detail-avatar" style="background:${color}">${escHtml(letter)}</div>
      <span style="flex:1">${escHtml(e.title || "(no title)")}</span>
      <button class="icon-btn detail-edit-btn" id="btn-edit-entry">Edit</button>
    </div>
    ${detailField("Username", e.username, true, false)}
    ${detailField("Password", e.password, true, true)}
    ${detailField("URL", e.url, true, false, true)}
  `;

  // OTP section
  if (e.otp_uri) {
    html += `
      <div class="detail-field">
        <div class="detail-label">One-Time Password</div>
        <div class="otp-widget" data-uri="${escAttr(e.otp_uri)}">
          <span class="otp-code">------</span>
          <div class="otp-progress">
            <div class="otp-bar"></div>
          </div>
          <span class="otp-secs">--s</span>
          <button class="icon-btn otp-copy-btn">Copy</button>
        </div>
      </div>`;
  }

  // Notes
  if (e.notes) {
    html += `
      <div class="detail-field">
        <div class="detail-label">Notes</div>
        <div class="detail-notes">${escHtml(e.notes)}</div>
      </div>`;
  }

  // Custom fields
  if (e.custom_fields.length > 0) {
    html += `<div class="detail-section-header">Custom Fields</div>`;
    for (const f of e.custom_fields) {
      html += detailField(f.name, f.value, true, f.protected);
    }
  }

  // Attachments
  if (e.attachments.length > 0) {
    html += `<div class="detail-section-header">Attachments</div>`;
    for (let i = 0; i < e.attachments.length; i++) {
      const a = e.attachments[i];
      const kb = a.size > 0 ? formatSize(a.size) : "";
      const canPreview = a.mime_type.startsWith("text/") || a.mime_type.startsWith("image/");
      html += `
        <div class="detail-attachment" data-att-idx="${i}">
          <span class="attachment-icon">${attachmentIcon(a.mime_type)}</span>
          <span class="attachment-name">${escHtml(a.name)}</span>
          <span class="attachment-size">${kb}</span>
          <button class="icon-btn att-dl-btn" data-att-idx="${i}">Save</button>
          ${canPreview ? `<button class="icon-btn att-preview-btn" data-att-idx="${i}">View</button>` : ""}
        </div>
        <div class="attachment-preview" id="att-preview-${i}" style="display:none"></div>`;
    }
  }

  // Group tag
  html += `
    <div class="detail-field">
      <div class="detail-label">Group</div>
      <div class="detail-group-tag">📁 ${escHtml(e.group_name)}</div>
    </div>`;

  // Delete / restore actions
  const inRecycleBin = vaultData.recycle_bin_uuid && e.group_uuid === vaultData.recycle_bin_uuid;
  if (inRecycleBin) {
    html += `<div class="detail-actions-row">
      <button class="btn-restore" id="btn-restore-entry">Recover</button>
      <button class="btn-danger" id="btn-delete-entry">Delete Forever</button>
    </div>`;
  } else {
    html += `<div class="detail-actions-row">
      <button class="btn-danger" id="btn-delete-entry">Delete</button>
    </div>`;
  }

  // History
  if (e.history.length > 0) {
    html += `
      <div class="detail-section-header history-toggle" data-open="false">
        History (${e.history.length})
        <span class="history-chevron">▶</span>
      </div>
      <div class="history-list" style="display:none">`;
    for (const h of [...e.history].reverse()) {
      html += `
        <div class="history-item">
          <span class="history-time">${escHtml(h.modified)}</span>
          <span class="history-title">${escHtml(h.title || "(no title)")}</span>
          ${h.username ? `<span class="history-user">${escHtml(h.username)}</span>` : ""}
        </div>`;
    }
    html += `</div>`;
  }

  el.innerHTML = html;

  // Wire up events
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

  // OTP widget
  const otpWidget = el.querySelector(".otp-widget");
  if (otpWidget) {
    const uri = otpWidget.dataset.uri;
    startOtpWidget(otpWidget, uri);
    otpWidget.querySelector(".otp-copy-btn").addEventListener("click", async () => {
      const code = otpWidget.querySelector(".otp-code").textContent;
      if (code && code !== "------") await copyText(code, "OTP");
    });
  }

  // Attachment save buttons
  el.querySelectorAll(".att-dl-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.attIdx);
      const a = e.attachments[idx];
      downloadAttachment(a.name, a.mime_type, a.data_base64);
    });
  });

  // Attachment preview buttons (and Shift+click on the row triggers download)
  el.querySelectorAll(".att-preview-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.attIdx);
      const a = e.attachments[idx];
      const previewEl = document.getElementById(`att-preview-${idx}`);
      if (previewEl.style.display !== "none") {
        previewEl.style.display = "none";
        previewEl.innerHTML = "";
        btn.textContent = "View";
      } else {
        showAttachmentPreview(previewEl, a);
        previewEl.style.display = "block";
        btn.textContent = "Hide";
      }
    });
  });

  el.querySelectorAll(".detail-attachment").forEach((row) => {
    row.addEventListener("click", (ev) => {
      if (ev.target.closest("button")) return; // let buttons handle themselves
      if (ev.shiftKey) {
        const idx = parseInt(row.dataset.attIdx);
        const a = e.attachments[idx];
        downloadAttachment(a.name, a.mime_type, a.data_base64);
      }
    });
  });

  // History toggle
  const histToggle = el.querySelector(".history-toggle");
  if (histToggle) {
    histToggle.addEventListener("click", () => {
      const open = histToggle.dataset.open === "true";
      histToggle.dataset.open = !open;
      histToggle.querySelector(".history-chevron").textContent = open ? "▶" : "▼";
      histToggle.nextElementSibling.style.display = open ? "none" : "block";
    });
  }

  // Edit button
  el.querySelector("#btn-edit-entry")?.addEventListener("click", () => renderEditForm(e));

  // Delete / restore buttons
  el.querySelector("#btn-delete-entry")?.addEventListener("click", () => showDeleteModal(e, inRecycleBin));
  el.querySelector("#btn-restore-entry")?.addEventListener("click", () => restoreEntry(e));
}

// ── Edit form ─────────────────────────────────────────────────────────────────
function renderEditForm(entry) {
  stopOtpTimers();
  editMode = true;
  const el = document.getElementById("entry-detail");
  const isNew = !entry;

  const e = entry || {
    uuid: "",
    group_uuid: selectedGroupUuid || vaultData?.groups[0]?.uuid || "",
    title: "", username: "", password: "", url: "", notes: "",
    otp_uri: null, custom_fields: [],
  };

  const color = avatarColor(e.title || "New");
  const letter = avatarLetter(e.title || "+");

  let cfHtml = "";
  for (const cf of e.custom_fields) {
    cfHtml += cfRowHtml(cf.name, cf.value, cf.protected);
  }

  el.innerHTML = `
    <div class="edit-form">
      <div class="edit-header">
        <div class="detail-avatar" id="edit-avatar" style="background:${color}">${escHtml(letter)}</div>
        <input class="edit-title-input" id="edit-title" value="${escAttr(e.title)}" placeholder="Entry title" autocomplete="off" />
      </div>

      <div class="edit-section-header">Credentials</div>
      <div class="edit-field-group">
        <label class="edit-label">Username</label>
        <div class="edit-field-row">
          <input class="edit-input" id="edit-username" value="${escAttr(e.username)}" placeholder="Username" autocomplete="off" />
        </div>
      </div>
      <div class="edit-field-group">
        <label class="edit-label">Password</label>
        <div class="edit-field-row">
          <input class="edit-input" id="edit-password" type="password" value="${escAttr(e.password)}" autocomplete="off" />
          <button class="icon-btn" id="edit-pass-toggle">Show</button>
        </div>
      </div>
      <div class="edit-field-group">
        <label class="edit-label">URL</label>
        <div class="edit-field-row">
          <input class="edit-input" id="edit-url" value="${escAttr(e.url)}" placeholder="https://" autocomplete="off" />
        </div>
      </div>

      <div class="edit-section-header">Notes</div>
      <textarea class="edit-textarea" id="edit-notes" placeholder="Notes...">${escHtml(e.notes)}</textarea>

      <div class="edit-section-header">OTP</div>
      <div class="edit-field-row" style="margin-bottom:0.25rem">
        <input class="edit-input" id="edit-otp" value="${escAttr(e.otp_uri || "")}"
               placeholder="otpauth://totp/Account?secret=BASE32SECRET" autocomplete="off" />
      </div>

      <div class="edit-section-header">
        <span>Custom Fields</span>
        <button class="icon-btn" id="edit-add-cf">+ Add Field</button>
      </div>
      <div id="edit-cf-container">${cfHtml}</div>

      <div class="edit-actions">
        <button class="btn-save-entry" id="edit-save">Save</button>
        <button class="btn-cancel-entry" id="edit-cancel">Cancel</button>
      </div>
    </div>
  `;

  // Live-update avatar as title changes
  const titleInput = el.querySelector("#edit-title");
  const avatarEl = el.querySelector("#edit-avatar");
  titleInput.addEventListener("input", () => {
    const t = titleInput.value;
    avatarEl.style.background = avatarColor(t || "New");
    avatarEl.textContent = avatarLetter(t || "+");
  });
  titleInput.focus();

  // Password show/hide
  const passInput = el.querySelector("#edit-password");
  el.querySelector("#edit-pass-toggle").addEventListener("click", (ev) => {
    if (passInput.type === "password") { passInput.type = "text"; ev.target.textContent = "Hide"; }
    else { passInput.type = "password"; ev.target.textContent = "Show"; }
  });

  // Add custom field row
  el.querySelector("#edit-add-cf").addEventListener("click", () => {
    const container = el.querySelector("#edit-cf-container");
    const div = document.createElement("div");
    div.innerHTML = cfRowHtml("", "", false);
    const row = div.firstElementChild;
    container.appendChild(row);
    row.querySelector(".edit-cf-name").focus();
  });

  // Delete custom field (delegated)
  el.querySelector("#edit-cf-container").addEventListener("click", (ev) => {
    if (ev.target.classList.contains("edit-cf-del")) {
      ev.target.closest(".edit-cf-row").remove();
    }
  });

  // Cancel
  el.querySelector("#edit-cancel").addEventListener("click", () => {
    editMode = false;
    renderDetail();
  });

  // Save
  el.querySelector("#edit-save").addEventListener("click", async () => {
    const title = el.querySelector("#edit-title").value.trim();
    if (!title) { showToast("Title is required"); return; }

    const customFields = [];
    el.querySelectorAll(".edit-cf-row").forEach((row) => {
      const name = row.querySelector(".edit-cf-name").value.trim();
      const value = row.querySelector(".edit-cf-value").value;
      const prot = row.querySelector(".edit-cf-protected").checked;
      if (name) customFields.push({ name, value, protected: prot });
    });

    const update = {
      uuid: isNew ? "" : e.uuid,
      group_uuid: e.group_uuid,
      title,
      username: el.querySelector("#edit-username").value,
      password: el.querySelector("#edit-password").value,
      url: el.querySelector("#edit-url").value,
      notes: el.querySelector("#edit-notes").value,
      otp_uri: el.querySelector("#edit-otp").value.trim(),
      custom_fields: customFields,
    };

    const saveBtn = el.querySelector("#edit-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";

    try {
      const result = await invoke("save_entry", { password: masterPassword, entry: update });
      vaultData = result.vault;
      selectedEntryUuid = result.saved_uuid;
      editMode = false;
      renderGroups();
      renderEntries();
      renderDetail();
      showToast(isNew ? "Entry added" : "Entry saved");
      // Cache write done; background PUT is in progress
      setSyncDot("syncing");
    } catch (err) {
      showToast("Save failed: " + String(err));
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  });
}

function cfRowHtml(name, value, isProtected) {
  return `
    <div class="edit-cf-row">
      <input class="edit-input edit-cf-name" value="${escAttr(name)}" placeholder="Field name" autocomplete="off" />
      <input class="edit-input edit-cf-value" value="${escAttr(value)}" placeholder="Value" autocomplete="off" />
      <label class="edit-cf-protected-label">
        <input type="checkbox" class="edit-cf-protected"${isProtected ? " checked" : ""}> Protected
      </label>
      <button class="icon-btn edit-cf-del">×</button>
    </div>`;
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

// ── Attachment helpers ────────────────────────────────────────────────────────
function base64ToBytes(b64) {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function downloadAttachment(name, mimeType, base64Data) {
  const blob = new Blob([base64ToBytes(base64Data)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showAttachmentPreview(container, att) {
  container.innerHTML = "";
  const { mime_type, data_base64, name } = att;
  const category = mime_type.split("/")[0];

  if (category === "text") {
    const bytes = base64ToBytes(data_base64);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const pre = document.createElement("pre");
    pre.className = "att-text-preview";
    pre.textContent = text;
    container.appendChild(pre);

  } else if (category === "image") {
    const img = document.createElement("img");
    img.className = "att-image-preview";
    img.src = `data:${mime_type};base64,${data_base64}`;
    img.alt = name;
    container.appendChild(img);

  } else {
    container.innerHTML = `
      <div class="att-download-prompt">
        <span>No preview available for this file type.</span>
        <button class="icon-btn" id="att-dl-fallback">Download</button>
      </div>`;
    container.querySelector("#att-dl-fallback")
      .addEventListener("click", () => downloadAttachment(name, mime_type, data_base64));
  }
}

function attachmentIcon(mimeType) {
  const cat = mimeType.split("/")[0];
  const sub = mimeType.split("/")[1] || "";
  if (cat === "image") return "🖼";
  if (cat === "text")  return "📄";
  if (sub === "pdf")   return "📕";
  return "📎";
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
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

// ── Delete modal ──────────────────────────────────────────────────────────────
let pendingDeleteEntry = null;
let pendingDeletePermanent = false;

function showDeleteModal(entry, permanent) {
  pendingDeleteEntry = entry;
  pendingDeletePermanent = !!permanent;

  const name = entry.title || "(no title)";
  const title = document.getElementById("modal-title");
  const body = document.getElementById("modal-body");
  const confirm = document.getElementById("modal-confirm");

  if (permanent) {
    title.textContent = "Delete Forever";
    body.innerHTML =
      `Permanently delete <strong>${escHtml(name)}</strong>? ` +
      `This <strong>cannot be undone</strong> — the entry will be gone forever.`;
    confirm.textContent = "Delete Forever";
  } else {
    title.textContent = "Move to Recycle Bin";
    body.innerHTML = `Move <strong>${escHtml(name)}</strong> to the Recycle Bin?`;
    confirm.textContent = "Move to Recycle Bin";
  }

  confirm.disabled = false;
  document.getElementById("delete-modal").classList.remove("hidden");
}

function hideDeleteModal() {
  pendingDeleteEntry = null;
  document.getElementById("delete-modal").classList.add("hidden");
}

document.getElementById("modal-cancel").addEventListener("click", hideDeleteModal);

document.getElementById("delete-modal").addEventListener("click", (ev) => {
  if (ev.target === ev.currentTarget) hideDeleteModal(); // click outside box
});

document.getElementById("modal-confirm").addEventListener("click", async () => {
  if (!pendingDeleteEntry) return;
  const permanent = pendingDeletePermanent;
  const btn = document.getElementById("modal-confirm");
  const restoreLabel = permanent ? "Delete Forever" : "Move to Recycle Bin";
  btn.disabled = true;
  btn.textContent = permanent ? "Deleting…" : "Moving…";

  try {
    vaultData = await invoke(permanent ? "delete_entry_permanent" : "delete_entry", {
      password: masterPassword,
      uuid: pendingDeleteEntry.uuid,
    });
    hideDeleteModal();
    selectedEntryUuid = null;
    renderGroups();
    renderEntries();
    renderDetail();
    setSyncDot("syncing");
    showToast(permanent ? "Deleted permanently" : "Moved to Recycle Bin");
  } catch (err) {
    btn.disabled = false;
    btn.textContent = restoreLabel;
    showToast("Failed: " + String(err));
  }
});

// ── Restore from Recycle Bin ──────────────────────────────────────────────────
async function restoreEntry(entry) {
  try {
    vaultData = await invoke("restore_entry", {
      password: masterPassword,
      uuid: entry.uuid,
    });
    selectedEntryUuid = null;
    renderGroups();
    renderEntries();
    renderDetail();
    setSyncDot("syncing");
    showToast("Entry recovered");
  } catch (err) {
    showToast("Recover failed: " + String(err));
  }
}

// ── DB name footer ────────────────────────────────────────────────────────────
function updateDbName() {
  const name = vaultData?.groups[0]?.name || "—";
  const el = document.getElementById("db-name");
  if (el) { el.textContent = name; el.title = name; }
}

// ── Recycle Bin selection ─────────────────────────────────────────────────────
document.getElementById("recycle-bin-item").addEventListener("click", () => {
  const rbUuid = vaultData?.recycle_bin_uuid;
  if (!rbUuid) return;
  selectedGroupUuid = rbUuid;
  selectedEntryUuid = null;
  renderGroups();
  renderEntries();
  renderDetail();
});

document.getElementById("btn-sync-now").addEventListener("click", async () => {
  if (!masterPassword) return;
  const btn = document.getElementById("btn-sync-now");
  btn.classList.add("spinning");
  btn.disabled = true;
  setSyncDot("syncing");
  try {
    vaultData = await invoke("force_sync", { password: masterPassword });
    selectedEntryUuid = null;
    renderGroups();
    renderEntries();
    renderDetail();
    updateDbName();
    document.getElementById("sync-banner").classList.remove("visible");
    setSyncDot("ok");
    clearTimeout(syncDotTimer);
    syncDotTimer = setTimeout(() => setSyncDot(""), 4000);
    showToast("Synced from cloud");
  } catch (err) {
    setSyncDot("error");
    clearTimeout(syncDotTimer);
    syncDotTimer = setTimeout(() => setSyncDot(""), 4000);
    showToast("Sync failed: " + String(err));
  } finally {
    btn.classList.remove("spinning");
    btn.disabled = false;
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Tauri event: background WebDAV sync found a newer remote version
  await listen("db-remote-updated", () => {
    document.getElementById("sync-banner").classList.add("visible");
  });

  // Tauri event: background PUT completed (ok or error)
  await listen("sync-status", (ev) => {
    const { ok, error } = ev.payload;
    setSyncDot(ok ? "ok" : "error");
    if (!ok) showToast("WebDAV sync failed: " + error);
    clearTimeout(syncDotTimer);
    syncDotTimer = setTimeout(() => setSyncDot(""), 4000);
  });

  // Banner: reload from (already-updated) cache
  document.getElementById("btn-reload-vault").addEventListener("click", async () => {
    document.getElementById("sync-banner").classList.remove("visible");
    if (!masterPassword) return;
    try {
      vaultData = await invoke("open_database", { password: masterPassword });
      selectedEntryUuid = null;
      renderGroups();
      renderEntries();
      renderDetail();
      updateDbName();
      showToast("Vault reloaded");
    } catch (err) {
      showToast("Reload failed: " + String(err));
    }
  });

  document.getElementById("btn-dismiss-banner").addEventListener("click", () => {
    document.getElementById("sync-banner").classList.remove("visible");
  });

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
    masterPassword = password;
    document.getElementById("master-pass").value = "";

    selectedGroupUuid = vaultData.groups[0]?.uuid ?? null;
    selectedEntryUuid = null;
    searchQuery = "";
    editMode = false;

    renderGroups();
    renderEntries();
    renderDetail();
    updateDbName();
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

// ── Search options dropdown (choose which fields to search) ────────────────────
const searchOptsBtn = document.getElementById("search-opts-btn");
const searchOptsDropdown = document.getElementById("search-opts-dropdown");

function setSearchOptsOpen(open) {
  searchOptsDropdown.style.display = open ? "block" : "none";
  searchOptsBtn.classList.toggle("active", open);
}

searchOptsBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  setSearchOptsOpen(searchOptsDropdown.style.display === "none");
});

// Re-run the filter whenever a field checkbox or the case toggle changes
searchOptsDropdown.addEventListener("change", (ev) => {
  const cb = ev.target;
  if (cb.dataset.field) {
    searchFields[cb.dataset.field] = cb.checked;
  } else if (cb.id === "search-cs") {
    searchCaseSensitive = cb.checked;
  }
  selectedEntryUuid = null;
  renderEntries();
  renderDetail();
});

// Keep clicks inside the dropdown from closing it
searchOptsDropdown.addEventListener("click", (ev) => ev.stopPropagation());

// Close the dropdown on any outside click
document.addEventListener("click", () => setSearchOptsOpen(false));

// ── Type-to-search (KeeWeb-style) ─────────────────────────────────────────────
// Pressing any printable key while the vault is open jumps focus into the search
// box and feeds it the character — no need to click the field first.
function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

document.addEventListener("keydown", (e) => {
  // Only when the vault screen is the active one
  if (!document.getElementById("screen-vault").classList.contains("active")) return;
  // Not while the edit form is open
  if (editMode) return;
  // Not while the confirm modal is open
  if (!document.getElementById("delete-modal").classList.contains("hidden")) return;
  // Let command shortcuts (Ctrl/Alt/Meta) through; Shift is allowed for symbols/caps
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  // Don't hijack when the user is already typing in a field
  if (isEditableTarget(document.activeElement)) return;
  // Only printable single characters (letters, digits, punctuation) — excludes
  // Enter/Tab/Escape/arrows/etc. (multi-char e.key) and the space bar.
  if (e.key.length !== 1 || e.key === " ") return;

  const search = document.getElementById("search-input");
  search.value = e.key;
  search.focus();
  try { search.setSelectionRange(1, 1); } catch {}
  search.dispatchEvent(new Event("input")); // reuse the search handler above
  e.preventDefault();
});

// ── Lock ──────────────────────────────────────────────────────────────────────
document.getElementById("btn-lock").addEventListener("click", () => {
  stopOtpTimers();
  vaultData = null;
  masterPassword = "";
  editMode = false;
  selectedGroupUuid = null;
  selectedEntryUuid = null;
  searchQuery = "";
  document.getElementById("search-input").value = "";
  document.getElementById("sync-banner").classList.remove("visible");
  setSyncDot("");
  updateDbName();
  show("screen-unlock");
  document.getElementById("master-pass").focus();
});

// ── Add new entry ─────────────────────────────────────────────────────────────
document.getElementById("btn-add-entry").addEventListener("click", () => {
  if (vaultData) renderEditForm(null);
});

// ── Change config ─────────────────────────────────────────────────────────────
document.getElementById("btn-change-config").addEventListener("click", () => {
  show("screen-config");
  document.getElementById("dav-url").focus();
});

init();
