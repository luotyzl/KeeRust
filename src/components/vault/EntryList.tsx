import { useMemo } from "react";
import { useApp, setApp } from "@/store";
import { avatarColor } from "@/lib/avatar";
import type { EntryData } from "@/types";
import AvatarInner from "./AvatarInner";
import { cn } from "@/lib/utils";

export default function EntryList() {
  const vaultData = useApp((s) => s.vaultData);
  const selectedGroupUuid = useApp((s) => s.selectedGroupUuid);
  const selectedEntryUuid = useApp((s) => s.selectedEntryUuid);
  const searchQuery = useApp((s) => s.searchQuery);
  const searchFields = useApp((s) => s.searchFields);
  const searchCaseSensitive = useApp((s) => s.searchCaseSensitive);

  const entries = useMemo<EntryData[]>(() => {
    if (!vaultData) return [];
    let list = vaultData.entries;
    const rbUuid = vaultData.recycle_bin_uuid;
    const rootUuid = vaultData.groups[0]?.uuid;

    if (rbUuid && selectedGroupUuid === rbUuid) {
      list = list.filter((e) => e.group_uuid === rbUuid);
    } else if (selectedGroupUuid && selectedGroupUuid !== rootUuid) {
      list = list.filter((e) => e.group_uuid === selectedGroupUuid);
    } else if (rbUuid) {
      list = list.filter((e) => e.group_uuid !== rbUuid);
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
    return list;
  }, [vaultData, selectedGroupUuid, searchQuery, searchFields, searchCaseSensitive]);

  if (entries.length === 0) {
    return (
      <div className="min-h-0 overflow-y-auto border-r">
        <div className="text-muted-foreground p-12 text-center text-sm">
          No entries found
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 overflow-y-auto border-r">
      {entries.map((e) => {
        const subtitle = e.username || e.url || e.group_name;
        const bg = e.custom_icon_base64 ? "transparent" : avatarColor(e.title);
        const active = e.uuid === selectedEntryUuid;
        return (
          <button
            key={e.uuid}
            onClick={() => setApp({ selectedEntryUuid: e.uuid })}
            className={cn(
              "flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors",
              active ? "bg-accent" : "hover:bg-muted/50"
            )}
          >
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-base text-white"
              style={{ background: bg }}
            >
              <AvatarInner iconId={e.icon_id} customIconBase64={e.custom_icon_base64} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{e.title || "(no title)"}</div>
              <div className="text-muted-foreground truncate text-xs">{subtitle}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
