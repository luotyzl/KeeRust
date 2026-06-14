import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Folder,
  KeyRound,
  List,
  Paperclip,
  RefreshCw,
  Settings,
  Tag,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  useApp,
  getApp,
  setApp,
  setView,
  dbName,
  setSyncDot,
  flashSyncDot,
} from "@/store";
import { showToast } from "@/stores/toast";
import type { ActiveView, EntryData, VaultData } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function sameView(a: ActiveView, b: ActiveView): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "tag" && b.kind === "tag") return a.value === b.value;
  if (a.kind === "group" && b.kind === "group") return a.uuid === b.uuid;
  return true;
}

function MenuItem({
  icon: Icon,
  label,
  count,
  view,
  active,
}: {
  icon: LucideIcon;
  label: string;
  count?: number;
  view: ActiveView;
  active: boolean;
}) {
  return (
    <button
      onClick={() => setView(view)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "hover:bg-sidebar-accent/50"
      )}
    >
      <Icon className="size-4 shrink-0 opacity-70" />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
      )}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="text-muted-foreground px-2 py-1 text-xs font-medium tracking-wide uppercase">
        {title}
      </div>
      <div className="mt-0.5 space-y-0.5">{children}</div>
    </div>
  );
}

export default function VaultSidebar() {
  const vaultData = useApp((s) => s.vaultData);
  const activeView = useApp((s) => s.activeView);
  const vaultIsLocal = useApp((s) => s.vaultIsLocal);
  const [syncing, setSyncing] = useState(false);

  const rbUuid = vaultData?.recycle_bin_uuid ?? null;
  const entries = vaultData?.entries ?? [];
  const live = useMemo(
    () => entries.filter((e) => e.group_uuid !== rbUuid),
    [entries, rbUuid]
  );

  const otpCount = live.filter((e) => e.otp_uri).length;
  const attCount = live.filter((e) => e.attachments.length > 0).length;

  // Unique tags across live entries, with counts.
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of live) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [live]);

  const groups = (vaultData?.groups ?? []).filter((g) => g.uuid !== rbUuid);
  const groupCount = (uuid: string) =>
    entries.filter((e: EntryData) => e.group_uuid === uuid).length;
  const recycleCount = rbUuid
    ? entries.filter((e) => e.group_uuid === rbUuid).length
    : 0;

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

  return (
    <aside className="flex w-64 shrink-0 flex-col p-2">
      <div className="bg-sidebar text-sidebar-foreground flex min-h-0 flex-1 flex-col rounded-lg border shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-2 border-b p-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold" title={dbName()}>
              {dbName()}
            </div>
            <div className="text-muted-foreground text-xs">
              {vaultIsLocal ? "Local vault" : "WebDAV vault"}
            </div>
          </div>
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

        {/* Scrollable menu */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
          <Section title="Quick View">
            <MenuItem
              icon={List}
              label="All Entries"
              count={live.length}
              view={{ kind: "all" }}
              active={sameView(activeView, { kind: "all" })}
            />
            <MenuItem
              icon={KeyRound}
              label="2FA codes"
              count={otpCount}
              view={{ kind: "otp" }}
              active={sameView(activeView, { kind: "otp" })}
            />
            <MenuItem
              icon={Paperclip}
              label="Attachments"
              count={attCount}
              view={{ kind: "attachments" }}
              active={sameView(activeView, { kind: "attachments" })}
            />
          </Section>

          {tags.length > 0 && (
            <Section title="Tags">
              {tags.map(([tag, count]) => (
                <MenuItem
                  key={tag}
                  icon={Tag}
                  label={tag}
                  count={count}
                  view={{ kind: "tag", value: tag }}
                  active={sameView(activeView, { kind: "tag", value: tag })}
                />
              ))}
            </Section>
          )}

          <Section title="Groups">
            {groups.map((g) => (
              <MenuItem
                key={g.uuid}
                icon={Folder}
                label={g.name}
                count={groupCount(g.uuid)}
                view={{ kind: "group", uuid: g.uuid }}
                active={sameView(activeView, { kind: "group", uuid: g.uuid })}
              />
            ))}
            {rbUuid && (
              <MenuItem
                icon={Trash2}
                label="Recycle Bin"
                count={recycleCount}
                view={{ kind: "recycle" }}
                active={sameView(activeView, { kind: "recycle" })}
              />
            )}
          </Section>
        </div>

        {/* Footer: Settings */}
        <div className="p-2">
          <button
            onClick={() => setApp({ screen: "settings" })}
            className="hover:bg-sidebar-accent/50 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
          >
            <Settings className="size-4 shrink-0 opacity-70" />
            <span className="flex-1">Settings</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
