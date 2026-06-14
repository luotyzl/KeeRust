import { useEffect, useRef } from "react";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { useApp, getApp, setApp } from "@/store";
import { modalStore } from "@/stores/modals";
import type { SearchFields } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

// Toolbar above the entry list: search + field options + New.
export default function VaultHeader() {
  const searchQuery = useApp((s) => s.searchQuery);
  const searchFields = useApp((s) => s.searchFields);
  const searchCaseSensitive = useApp((s) => s.searchCaseSensitive);
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

  useEffect(() => {
    searchRef.current?.focus();
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
    <div className="flex shrink-0 items-center gap-2 border-b p-2">
      <div className="relative flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          ref={searchRef}
          type="search"
          placeholder="Search entries…"
          autoComplete="off"
          className="h-8 pr-9 pl-8"
          value={searchQuery}
          onChange={(e) => setApp({ searchQuery: e.target.value, selectedEntryUuid: null })}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-1/2 right-0.5 size-7 -translate-y-1/2"
              title="Search options"
            >
              <SlidersHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Search in</DropdownMenuLabel>
            {FIELD_LIST.map((f) => (
              <DropdownMenuCheckboxItem
                key={f.key}
                checked={searchFields[f.key]}
                onCheckedChange={(c) => toggleField(f.key, c === true)}
                onSelect={(e) => e.preventDefault()}
              >
                {f.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={searchCaseSensitive}
              onCheckedChange={(c) =>
                setApp({ searchCaseSensitive: c === true, selectedEntryUuid: null })
              }
              onSelect={(e) => e.preventDefault()}
            >
              Case sensitive
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button variant="outline" size="sm" onClick={newEntry}>
        <Plus /> New
      </Button>
    </div>
  );
}
