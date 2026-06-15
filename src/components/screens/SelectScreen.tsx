import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { MoreHorizontal } from "lucide-react";
import { useApp } from "@/store";
import type { EntryData } from "@/types";
import { filterGetEntries, shortUrl } from "@/lib/autotype";
import { parseOtpUri, computeTOTP } from "@/lib/totp";
import { copyText, showToast } from "@/stores/toast";
import {
  selectStore,
  useSelect,
  typeCreds,
  pickField,
  closeSelectView,
} from "@/stores/autotype";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface MenuState {
  visible: boolean;
  x: number;
  y: number;
  items: { label: string; run: () => void }[];
}

export default function SelectScreen() {
  const vaultData = useApp((s) => s.vaultData);
  const filter = useSelect((s) => s.filter);
  const index = useSelect((s) => s.index);

  const entries = useMemo<EntryData[]>(
    () => (filter ? filterGetEntries(vaultData, filter) : []),
    [vaultData, filter]
  );

  const [menu, setMenu] = useState<MenuState>({ visible: false, x: 0, y: 0, items: [] });
  const listRef = useRef<HTMLDivElement | null>(null);

  const entriesRef = useRef(entries);
  const indexRef = useRef(index);
  const menuVisibleRef = useRef(menu.visible);
  entriesRef.current = entries;
  indexRef.current = index;
  menuVisibleRef.current = menu.visible;

  function setIndex(i: number) {
    selectStore.setState({ index: i });
  }
  function updateFilter(patch: Partial<NonNullable<typeof filter>>) {
    const cur = selectStore.getState().filter;
    if (!cur) return;
    selectStore.setState({ filter: { ...cur, ...patch }, index: 0 });
  }

  const message = (() => {
    if (!filter) return "";
    const target = filter.title || shortUrl(filter.url || "");
    return target ? `Select a password for ${target}` : "Select an entry to auto-type";
  })();

  const chips = (() => {
    if (!filter) return [] as { id: string; label: string; text: string; active: boolean }[];
    const out: { id: string; label: string; text: string; active: boolean }[] = [];
    if (filter.url) {
      out.push({ id: "url", label: "Website", text: shortUrl(filter.url), active: filter.useUrl });
      out.push({
        id: "subdomains",
        label: "Subdomains",
        text: "",
        active: filter.useUrl && filter.subdomains,
      });
    }
    if (filter.title)
      out.push({ id: "title", label: "Title", text: filter.title, active: filter.useTitle });
    if (filter.text) out.push({ id: "text", label: "Contains", text: filter.text, active: true });
    return out;
  })();

  function onChipClick(id: string) {
    if (!filter) return;
    if (id === "url") updateFilter({ useUrl: !filter.useUrl });
    else if (id === "subdomains") {
      const active = !(filter.useUrl && filter.subdomains);
      updateFilter({ subdomains: active, useUrl: active ? true : filter.useUrl });
    } else if (id === "title") updateFilter({ useTitle: !filter.useTitle });
    else if (id === "text") updateFilter({ text: "" });
  }

  function closeMenu() {
    setMenu((m) => ({ ...m, visible: false, items: [] }));
  }

  function buildMenuItems(e: EntryData) {
    const items: { label: string; run: () => void }[] = [];
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

  function openMenu(ev: MouseEvent, e: EntryData, i: number) {
    ev.stopPropagation();
    setIndex(i);
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ visible: true, x: Math.max(8, r.right - 160), y: r.bottom + 4, items: buildMenuItems(e) });
  }

  function runMenuItem(item: { run: () => void }) {
    closeMenu();
    item.run();
  }

  function copyPassword() {
    const e = entriesRef.current[indexRef.current];
    closeMenu();
    if (e) copyText(e.password || "", "Password");
  }

  function openMenuForSelected() {
    const rows = listRef.current?.querySelectorAll("[data-row]");
    const row = rows?.[indexRef.current] as HTMLElement | undefined;
    const btn = row?.querySelector("[data-actions-btn]") as HTMLElement | undefined;
    const e = entriesRef.current[indexRef.current];
    if (btn && e) {
      const r = btn.getBoundingClientRect();
      setMenu({ visible: true, x: Math.max(8, r.right - 160), y: r.bottom + 4, items: buildMenuItems(e) });
    }
  }

  function rowClick(ev: MouseEvent, e: EntryData) {
    if ((ev.target as HTMLElement).closest("[data-actions-btn]")) return;
    closeSelectView();
    typeCreds(e);
  }

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (menuVisibleRef.current) {
        if (e.key === "Escape") {
          closeMenu();
          e.preventDefault();
        }
        return;
      }
      const list = entriesRef.current;
      const idx = indexRef.current;
      if (e.key === "ArrowDown") {
        setIndex(Math.min(idx + 1, list.length - 1));
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        setIndex(Math.max(idx - 1, 0));
        e.preventDefault();
      } else if (e.key === "Enter") {
        const en = list[idx];
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
        const cur = selectStore.getState().filter;
        if (cur?.text) updateFilter({ text: cur.text.slice(0, -1) });
        e.preventDefault();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const cur = selectStore.getState().filter;
        if (cur) updateFilter({ text: cur.text + e.key });
        e.preventDefault();
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const rows = listRef.current?.querySelectorAll("[data-row]");
    (rows?.[index] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  useEffect(() => {
    if (!menu.visible) return;
    const onDocClick = () => closeMenu();
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menu.visible]);

  return (
    <div className="flex h-screen flex-col p-6">
      <div className="flex items-start justify-between gap-6">
        <h2 className="text-2xl font-bold">Auto-Type: Select</h2>
        <div className="text-muted-foreground space-y-0.5 text-right text-xs">
          <div>
            <span className="text-foreground font-medium">Enter</span>: Type the auto-type sequence
          </div>
          <div>
            <span className="text-foreground font-medium">Ctrl + Enter</span>: Only type the password
          </div>
          <div>
            <span className="text-foreground font-medium">Alt + Enter</span>: Only type the username
          </div>
          <div>
            <span className="text-foreground font-medium">Shift + Enter</span>: Other fields
          </div>
        </div>
      </div>

      <div className="text-muted-foreground my-3 text-sm">{message}</div>

      <div className="mb-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.id}
            onClick={() => onChipClick(chip.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
              chip.active
                ? "border-primary bg-primary/15 text-foreground"
                : "text-muted-foreground hover:border-ring"
            )}
          >
            <span>{chip.active ? "☑" : "☐"}</span>
            <span>
              {chip.label}
              {chip.text ? ": " + chip.text : ""}
            </span>
          </button>
        ))}
      </div>

      <ScrollArea
        className="min-h-0 flex-1 rounded-lg border"
        viewportClassName="[&>div]:!block [&_[data-slot=table-container]]:overflow-visible"
      >
        <div ref={listRef}>
        {entries.length === 0 ? (
          <div className="text-muted-foreground p-10 text-center">No matching entries</div>
        ) : (
          <Table className="table-fixed">
            <TableHeader className="bg-card sticky top-0">
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Website</TableHead>
                <TableHead className="w-20 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e, i) => (
                <TableRow
                  key={e.uuid}
                  data-row
                  data-state={i === index ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={(ev) => rowClick(ev, e)}
                  onMouseMove={() => index !== i && setIndex(i)}
                >
                  <TableCell className="truncate" title={e.title || ""}>
                    {e.title || "(no title)"}
                  </TableCell>
                  <TableCell className="text-muted-foreground truncate" title={e.username || ""}>
                    {e.username || ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground truncate" title={e.url || ""}>
                    {e.url || ""}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      data-actions-btn
                      variant="ghost"
                      size="icon-sm"
                      title="More…"
                      onClick={(ev) => openMenu(ev, e, i)}
                    >
                      <MoreHorizontal />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        </div>
      </ScrollArea>

      <div className="mt-3 flex justify-end">
        <Button variant="outline" onClick={closeSelectView}>
          Cancel (Esc)
        </Button>
      </div>

      {menu.visible && (
        <div
          className="bg-popover text-popover-foreground fixed z-50 min-w-40 rounded-md border p-1 shadow-md"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.items.map((item, i) => (
            <button
              key={i}
              className="hover:bg-accent hover:text-accent-foreground flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm"
              onClick={() => runMenuItem(item)}
            >
              {item.label}
            </button>
          ))}
          <div className="bg-border my-1 h-px" />
          <button
            className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
            onClick={copyPassword}
          >
            🔑 Copy password
          </button>
        </div>
      )}
    </div>
  );
}
