import type {
  AutoTypeAction,
  EntryData,
  SelectFilter,
  VaultData,
  WindowInfo,
} from "../types";
import { computeTOTP, parseOtpUri } from "./totp";

export const DEFAULT_AT_SEQUENCE = "{USERNAME}{TAB}{PASSWORD}{ENTER}";

// ── Window/URL matching (port of KeeWeb SelectEntryFilter) ───────────────────
const urlPartsRegex = /^(\w+:\/\/)?(?:(?:www|wwws|secure)\.)?([^/]+)\/?(.*)/;
const urlInTitleRegex =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_+.~#?&/=]*)/;

function getStringRank(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  let ix = s1.indexOf(s2);
  if (ix === 0 && s1.length === s2.length) return 10;
  if (ix === 0) return 5;
  if (ix > 0) return 3;
  ix = s2.indexOf(s1);
  if (ix === 0) return 5;
  if (ix > 0) return 3;
  return 0;
}

// KeePass2Android stores additional URLs in custom fields named "KP2A_URL*"
// (KeeWeb's ExtraUrlFieldName). Treat those — plus any field whose name
// mentions "url" — as URLs for window/url matching.
const EXTRA_URL_FIELD = "kp2a_url";

export function isUrlField(name: string): boolean {
  const n = (name || "").toLowerCase();
  return n.startsWith(EXTRA_URL_FIELD) || /url/i.test(n);
}

function entryAllUrls(e: EntryData): string[] {
  const urls = e.url ? [e.url] : [];
  for (const f of e.custom_fields || []) {
    if (isUrlField(f.name) && f.value) urls.push(f.value);
  }
  return urls;
}

// Port of KeeWeb SelectEntryFilter._getEntryRank — honors the filter's toggles.
function rankEntry(e: EntryData, f: SelectFilter): number {
  let titleRank = 0;
  let urlRank = 0;

  if (f.useTitle && f.title && e.title) {
    titleRank = getStringRank(e.title.toLowerCase(), f.title.toLowerCase());
    if (!titleRank) return 0;
  }

  if (f.useUrl && f.url) {
    const searchParts = urlPartsRegex.exec(f.url.toLowerCase());
    if (searchParts) {
      const [, searchScheme, searchDomain, searchPath] = searchParts;
      for (const url of entryAllUrls(e)) {
        const parts = urlPartsRegex.exec(url.toLowerCase());
        if (!parts) continue;
        const [, scheme, domain, path] = parts;
        if (
          domain === searchDomain ||
          (f.subdomains && searchDomain.indexOf("." + domain) > 0)
        ) {
          urlRank += domain === searchDomain ? 20 : 10;
          if (path === searchPath) urlRank += 10;
          else if (path && searchPath) {
            if (path.lastIndexOf(searchPath, 0) === 0) urlRank += 5;
            else if (searchPath.lastIndexOf(path, 0) === 0) urlRank += 3;
          }
          if (scheme === searchScheme) urlRank += 1;
        }
      }
    }
  }

  if (f.useTitle && !titleRank) return 0;
  if (f.useUrl && !urlRank) return 0;
  return titleRank + urlRank;
}

// True if the free-text filter matches any searchable field.
function entryMatchesText(e: EntryData, t: string): boolean {
  if (!t) return true;
  const parts = [e.title, e.username, e.url, e.notes, e.group_name];
  for (const cf of e.custom_fields || []) parts.push(cf.name, cf.value);
  return parts.filter(Boolean).join("\n").toLowerCase().includes(t);
}

// Apply a filter (text → rank by url/title) and return the matching entries.
export function filterGetEntries(
  vault: VaultData | null,
  f: SelectFilter
): EntryData[] {
  if (!vault) return [];
  const rbUuid = vault.recycle_bin_uuid;
  const t = (f.text || "").toLowerCase();
  let list: Array<[EntryData, number]> = vault.entries
    .filter((e) => e.group_uuid !== rbUuid) // never auto-type from the recycle bin
    .filter((e) => e.autotype_enabled !== false) // skip entries with auto-type disabled
    .filter((e) => entryMatchesText(e, t))
    .map((e) => [e, rankEntry(e, f)]);
  if (f.useUrl || f.useTitle) list = list.filter(([, r]) => r > 0);
  return list
    .sort((a, b) => b[1] - a[1] || a[0].title.localeCompare(b[0].title))
    .map(([e]) => e);
}

export function buildWindowInfo(
  title: string,
  url: string | null
): WindowInfo {
  // Prefer the real address-bar URL read natively; fall back to a URL in the title.
  if (!url) {
    const m = urlInTitleRegex.exec(title || "");
    url = m && m.length ? m[0] : null;
  }
  return { title: title || "", url: url || null };
}

// Build the initial filter from the captured window (SelectEntryFilter ctor).
export function makeFilter(windowInfo: WindowInfo): SelectFilter {
  return {
    title: windowInfo.title || "",
    url: windowInfo.url || "",
    useTitle: !!windowInfo.title && !windowInfo.url,
    useUrl: !!windowInfo.url,
    subdomains: true,
    text: "",
  };
}

// Strip scheme / www. for compact display of the matched URL.
export function shortUrl(url: string): string {
  return url
    .replace(/^\w+:\/\//, "")
    .replace(/^(?:www|wwws|secure)\./, "")
    .replace(/\/$/, "");
}

// ── Keystroke sequence grammar (KeeWeb) ──────────────────────────────────────
const AT_KEYS: Record<string, string> = {
  tab: "tab", enter: "enter", space: "space",
  up: "up", down: "down", left: "left", right: "right",
  home: "home", end: "end", pgup: "pageup", pgdn: "pagedown",
  insert: "insert", ins: "insert", delete: "delete", del: "delete",
  backspace: "backspace", bs: "backspace", bksp: "backspace", esc: "escape",
  add: "add", subtract: "subtract", multiply: "multiply", divide: "divide",
  numpad0: "num0", numpad1: "num1", numpad2: "num2", numpad3: "num3", numpad4: "num4",
  numpad5: "num5", numpad6: "num6", numpad7: "num7", numpad8: "num8", numpad9: "num9",
};
for (let i = 1; i <= 16; i++) AT_KEYS["f" + i] = "f" + i;

function entryFieldValue(entry: EntryData, name: string): string {
  switch ((name || "").toLowerCase()) {
    case "title": return entry.title || "";
    case "username": return entry.username || "";
    case "url": return entry.url || "";
    case "password": return entry.password || "";
    case "notes": return entry.notes || "";
    case "group": return entry.group_name || "";
    default: {
      const cf = (entry.custom_fields || []).find(
        (f) => f.name.toLowerCase() === (name || "").toLowerCase()
      );
      return cf ? cf.value : "";
    }
  }
}

// Text with no modifiers → fast text action; with modifiers → one key per char.
function pushTextWithMods(
  actions: AutoTypeAction[],
  text: string,
  mods: string[]
): void {
  if (!text) return;
  if (!mods || mods.length === 0) actions.push({ type: "text", value: text });
  else for (const ch of text) actions.push({ type: "key", key: ch, mods });
}

async function applyAtOp(
  actions: AutoTypeAction[],
  contents: string,
  mods: string[],
  entry: EntryData
): Promise<void> {
  const m = contents.match(/^(.*?)(?:([\s:=])[\s:=]*(.*))?$/);
  const op = (m?.[1] || "").toLowerCase();
  const arg = m?.[3];

  if (["title", "username", "url", "password", "notes", "group"].includes(op)) {
    pushTextWithMods(actions, entryFieldValue(entry, op), mods);
  } else if (op === "s") {
    pushTextWithMods(actions, entryFieldValue(entry, arg || ""), mods);
  } else if (op === "totp") {
    let code = "";
    if (entry.otp_uri) {
      const p = parseOtpUri(entry.otp_uri);
      code = (await computeTOTP(p.secret, p.period, p.digits, p.algorithm)) || "";
    }
    pushTextWithMods(actions, code, mods);
  } else if (op === "delay") {
    const ms = parseInt(arg || "0", 10);
    if (ms > 0) actions.push({ type: "delay", ms });
  } else if (op === "clearfield") {
    actions.push({ type: "key", key: "a", mods: ["ctrl"] });
    actions.push({ type: "key", key: "delete", mods: [] });
  } else if (AT_KEYS[op]) {
    actions.push({ type: "key", key: AT_KEYS[op], mods });
  }
  // Unknown ops are ignored (lenient).
}

// Parse a KeeWeb keystroke sequence into a flat action list, resolving fields.
export async function buildAutoTypeActions(
  sequence: string,
  entry: EntryData
): Promise<AutoTypeAction[]> {
  const actions: AutoTypeAction[] = [];
  const s = sequence || "";
  const n = s.length;
  let i = 0;
  let mods: string[] = [];
  const groupStack: string[][] = [];
  const takeMods = (): string[] => {
    const m = [...groupStack.flat(), ...mods];
    mods = [];
    return m;
  };

  while (i < n) {
    const ch = s[i];
    if (ch === "{") {
      const end = s.indexOf("}", i + 2); // +2 so {}} reads the literal '}'
      if (end < 0) throw "Mismatched '{' in sequence";
      const contents = s.substring(i + 1, end);
      i = end + 1;
      if (contents.length === 1) pushTextWithMods(actions, contents, takeMods());
      else await applyAtOp(actions, contents, takeMods(), entry);
    } else if (ch === "+" || ch === "^" || ch === "%") {
      mods.push(ch === "+" ? "shift" : ch === "^" ? "ctrl" : "alt");
      i++;
    } else if (ch === "(") {
      groupStack.push([...mods]);
      mods = [];
      i++;
    } else if (ch === ")") {
      if (!groupStack.length) throw "Unexpected ')' in sequence";
      groupStack.pop();
      i++;
    } else if (ch === "~") {
      actions.push({ type: "key", key: "enter", mods: takeMods() });
      i++;
    } else if (ch === " ") {
      i++; // KeeWeb ignores spaces
    } else {
      pushTextWithMods(actions, ch, takeMods());
      i++;
    }
  }
  return actions;
}
