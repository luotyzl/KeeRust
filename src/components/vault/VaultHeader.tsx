import { useEffect, useRef, useState } from "react";
import { useApp, getApp, setApp, lock } from "../../store";
import { modalStore } from "../../stores/modals";
import type { SearchFields } from "../../types";

const FIELD_LIST: Array<{ key: keyof SearchFields; label: string }> = [
  { key: "title", label: "Title" },
  { key: "username", label: "Username" },
  { key: "password", label: "Password" },
  { key: "url", label: "URL" },
  { key: "notes", label: "Notes" },
  { key: "custom", label: "Custom Fields" },
];

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

export default function VaultHeader() {
  const searchQuery = useApp((s) => s.searchQuery);
  const searchFields = useApp((s) => s.searchFields);
  const searchCaseSensitive = useApp((s) => s.searchCaseSensitive);
  const syncDot = useApp((s) => s.syncDot);
  const [optsOpen, setOptsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  function newEntry() {
    if (!getApp().vaultData) return;
    setApp({ selectedEntryUuid: null, editMode: true });
  }

  function toggleField(key: keyof SearchFields, checked: boolean) {
    setApp({
      searchFields: { ...getApp().searchFields, [key]: checked },
      selectedEntryUuid: null,
    });
  }

  // Focus the search box when the vault first appears.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close the options dropdown on any outside click.
  useEffect(() => {
    const onDocClick = () => setOptsOpen(false);
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // Type-to-search (KeeWeb-style): a printable keypress jumps into the search box.
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (getApp().screen !== "vault") return;
      if (getApp().editMode) return;
      if (modalStore.getState().deleteVisible) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (isEditableTarget(document.activeElement)) return;
      if (e.key.length !== 1 || e.key === " ") return;

      setApp({ searchQuery: e.key, selectedEntryUuid: null });
      const input = searchRef.current;
      if (input) {
        input.focus();
        try {
          input.setSelectionRange(1, 1);
        } catch {
          /* ignore */
        }
      }
      e.preventDefault();
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, []);

  return (
    <header className="vault-header">
      <span className="vault-brand">KeeRust</span>
      <div className="vault-search-wrap" onClick={(e) => e.stopPropagation()}>
        <input
          ref={searchRef}
          type="search"
          placeholder="Search entries…"
          autoComplete="off"
          value={searchQuery}
          onChange={(e) => setApp({ searchQuery: e.target.value, selectedEntryUuid: null })}
        />
        <button
          className={"search-opts-btn" + (optsOpen ? " active" : "")}
          title="Search options"
          aria-label="Search options"
          onClick={(e) => {
            e.stopPropagation();
            setOptsOpen((v) => !v);
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        </button>
        {optsOpen && (
          <div className="search-opts-dropdown" onClick={(e) => e.stopPropagation()}>
            <div className="search-opts-title">Search in</div>
            {FIELD_LIST.map((f) => (
              <label key={f.key}>
                <input
                  type="checkbox"
                  checked={searchFields[f.key]}
                  onChange={(e) => toggleField(f.key, e.target.checked)}
                />{" "}
                {f.label}
              </label>
            ))}
            <div className="search-opts-divider" />
            <label>
              <input
                type="checkbox"
                checked={searchCaseSensitive}
                onChange={(e) =>
                  setApp({ searchCaseSensitive: e.target.checked, selectedEntryUuid: null })
                }
              />{" "}
              Case sensitive
            </label>
          </div>
        )}
      </div>
      <span className={"sync-dot" + (syncDot ? " " + syncDot : "")} title="Sync status" />
      <button className="btn-lock" onClick={newEntry}>
        + New
      </button>
      <button className="btn-lock" onClick={lock}>
        🔒 Lock
      </button>
    </header>
  );
}
