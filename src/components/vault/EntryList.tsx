import { useMemo } from "react";
import { useApp, setApp } from "@/store";
import { avatarColor } from "@/lib/avatar";
import type { EntryData } from "@/types";
import AvatarInner from "./AvatarInner";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function EntryList() {
  const vaultData = useApp((s) => s.vaultData);
  const activeView = useApp((s) => s.activeView);
  const selectedEntryUuid = useApp((s) => s.selectedEntryUuid);
  const searchQuery = useApp((s) => s.searchQuery);
  const searchFields = useApp((s) => s.searchFields);
  const searchCaseSensitive = useApp((s) => s.searchCaseSensitive);

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
    return list;
  }, [vaultData, activeView, searchQuery, searchFields, searchCaseSensitive]);

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        {/* Sticky header — stays pinned while the body scrolls. */}
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="bg-card text-muted-foreground h-8 border-b px-2 text-left text-xs font-medium">
              Title
            </th>
            <th className="bg-card text-muted-foreground h-8 w-[38%] border-b px-2 text-left text-xs font-medium">
              Username
            </th>
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
