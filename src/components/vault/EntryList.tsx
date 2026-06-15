import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useApp, setApp } from "@/store";
import { avatarColor } from "@/lib/avatar";
import type { EntryData } from "@/types";
import AvatarInner from "./AvatarInner";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

type SortColumn = "title" | "username";
type SortDir = "asc" | "desc";

export default function EntryList() {
  const vaultData = useApp((s) => s.vaultData);
  const activeView = useApp((s) => s.activeView);
  const selectedEntryUuid = useApp((s) => s.selectedEntryUuid);
  const searchQuery = useApp((s) => s.searchQuery);
  const searchFields = useApp((s) => s.searchFields);
  const searchCaseSensitive = useApp((s) => s.searchCaseSensitive);

  // Sort state — default Title ascending. Click a header to sort by it; click
  // the active header again to flip the direction.
  const [sortColumn, setSortColumn] = useState<SortColumn>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir("asc");
    }
  }

  const entries = useMemo<EntryData[]>(() => {
    if (!vaultData) return [];
    const rbUuid = vaultData.recycle_bin_uuid;
    const live = (e: EntryData) => e.group_uuid !== rbUuid;

    let list: EntryData[];
    switch (activeView.kind) {
      case "otp":
        list = vaultData.entries.filter((e) => live(e) && !!e.otp_uri);
        break;
      case "attachments":
        list = vaultData.entries.filter((e) => live(e) && e.attachments.length > 0);
        break;
      case "tag":
        list = vaultData.entries.filter((e) => live(e) && e.tags.includes(activeView.value));
        break;
      case "group":
        list = vaultData.entries.filter((e) => e.group_uuid === activeView.uuid);
        break;
      case "recycle":
        list = rbUuid ? vaultData.entries.filter((e) => e.group_uuid === rbUuid) : [];
        break;
      case "all":
      default:
        list = vaultData.entries.filter(live);
        break;
    }

    if (searchQuery) {
      const cs = searchCaseSensitive;
      const needle = cs ? searchQuery : searchQuery.toLowerCase();
      const hit = (val: string | null): boolean => {
        if (!val) return false;
        return (cs ? val : val.toLowerCase()).includes(needle);
      };
      list = list.filter((e) => {
        if (searchFields.title && hit(e.title)) return true;
        if (searchFields.username && hit(e.username)) return true;
        if (searchFields.password && hit(e.password)) return true;
        if (searchFields.url && hit(e.url)) return true;
        if (searchFields.notes && hit(e.notes)) return true;
        if (searchFields.custom && e.custom_fields.some((cf) => hit(cf.name) || hit(cf.value)))
          return true;
        return false;
      });
    }

    // Sort by the chosen column (case-insensitive, with a title tiebreaker).
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...list].sort((a, b) => {
      const av = (sortColumn === "title" ? a.title : a.username) || "";
      const bv = (sortColumn === "title" ? b.title : b.username) || "";
      const cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
      if (cmp !== 0) return cmp * dir;
      return (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }) * dir;
    });
    return sorted;
  }, [vaultData, activeView, searchQuery, searchFields, searchCaseSensitive, sortColumn, sortDir]);

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        {/* Sticky header — stays pinned while the body scrolls. */}
        <thead className="sticky top-0 z-10">
          <tr>
            <SortHeader
              label="Title"
              column="title"
              sortColumn={sortColumn}
              sortDir={sortDir}
              onClick={toggleSort}
            />
            <SortHeader
              label="Username"
              column="username"
              sortColumn={sortColumn}
              sortDir={sortDir}
              onClick={toggleSort}
              className="w-[38%]"
            />
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={2} className="text-muted-foreground p-8 text-center text-sm">
                No entries found
              </td>
            </tr>
          ) : (
            entries.map((e) => {
              const bg = e.custom_icon_base64 ? "transparent" : avatarColor(e.title);
              const active = e.uuid === selectedEntryUuid;
              return (
                <tr
                  key={e.uuid}
                  onClick={() => setApp({ selectedEntryUuid: e.uuid })}
                  className={cn(
                    "cursor-pointer transition-colors",
                    active ? "bg-muted" : "hover:bg-muted/50"
                  )}
                >
                  <td className="border-b px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className="flex size-5 shrink-0 items-center justify-center rounded text-[0.7rem] text-white"
                        style={{ background: bg }}
                      >
                        <AvatarInner iconId={e.icon_id} customIconBase64={e.custom_icon_base64} />
                      </div>
                      <span className="truncate">{e.title || "(no title)"}</span>
                    </div>
                  </td>
                  <td className="text-muted-foreground truncate border-b px-2 py-1.5 text-xs">
                    {e.username}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function SortHeader({
  label,
  column,
  sortColumn,
  sortDir,
  onClick,
  className,
}: {
  label: string;
  column: SortColumn;
  sortColumn: SortColumn;
  sortDir: SortDir;
  onClick: (c: SortColumn) => void;
  className?: string;
}) {
  const active = column === sortColumn;
  return (
    <th
      className={cn(
        "bg-card text-muted-foreground h-8 border-b p-0 text-left text-xs font-medium",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onClick(column)}
        className="hover:text-foreground flex h-8 w-full items-center gap-1 px-2 transition-colors"
      >
        <span>{label}</span>
        {active &&
          (sortDir === "asc" ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          ))}
      </button>
    </th>
  );
}
