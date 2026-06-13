import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Trash2 } from "lucide-react";
import {
  useApp,
  getApp,
  setApp,
  selectGroup,
  dbName,
  setSyncDot,
  flashSyncDot,
} from "@/store";
import { showToast } from "@/stores/toast";
import type { VaultData } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function GroupSidebar() {
  const vaultData = useApp((s) => s.vaultData);
  const selectedGroupUuid = useApp((s) => s.selectedGroupUuid);
  const vaultIsLocal = useApp((s) => s.vaultIsLocal);
  const [syncing, setSyncing] = useState(false);

  const rbUuid = vaultData?.recycle_bin_uuid ?? null;
  const groups = vaultData?.groups.filter((g) => g.uuid !== rbUuid) ?? [];
  const recycleBinGroup = rbUuid
    ? vaultData?.groups.find((g) => g.uuid === rbUuid) ?? null
    : null;

  async function syncNow() {
    if (!getApp().masterPassword) return;
    setSyncing(true);
    setSyncDot("syncing");
    try {
      const vault = await invoke<VaultData>("force_sync", {
        password: getApp().masterPassword,
      });
      setApp({ vaultData: vault, selectedEntryUuid: null, syncBannerVisible: false });
      flashSyncDot("ok");
      showToast(vaultIsLocal ? "Reloaded from file" : "Synced from cloud");
    } catch (err) {
      flashSyncDot("error");
      showToast("Sync failed: " + String(err));
    } finally {
      setSyncing(false);
    }
  }

  const rowBase =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors text-left";

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex min-h-0 flex-col border-r">
      <nav className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="text-muted-foreground px-2.5 pt-1 pb-2 text-xs font-semibold tracking-wider uppercase">
          Groups
        </div>
        {groups.map((g) => {
          const active = g.uuid === selectedGroupUuid;
          return (
            <button
              key={g.uuid}
              onClick={() => selectGroup(g.uuid)}
              className={cn(
                rowBase,
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/60"
              )}
            >
              <span className="flex-1 truncate">{g.name}</span>
              <Badge variant="secondary" className="tabular-nums">
                {g.entry_count}
              </Badge>
            </button>
          );
        })}
      </nav>

      {rbUuid && (
        <div className="border-t p-2">
          <button
            onClick={() => selectGroup(rbUuid)}
            className={cn(
              rowBase,
              selectedGroupUuid === rbUuid
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "hover:bg-sidebar-accent/60"
            )}
          >
            <Trash2 className="size-4" />
            <span className="flex-1">Recycle Bin</span>
            <Badge variant="secondary" className="tabular-nums">
              {recycleBinGroup?.entry_count ?? 0}
            </Badge>
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 border-t px-3 py-2">
        <span className="text-muted-foreground flex-1 truncate text-xs" title={dbName()}>
          {dbName()}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={syncing}
          title={vaultIsLocal ? "Reload from file" : "Sync from cloud"}
          onClick={syncNow}
        >
          <RefreshCw className={syncing ? "animate-spin" : ""} />
        </Button>
      </div>
    </aside>
  );
}
