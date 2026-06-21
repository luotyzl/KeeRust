import { useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  List,
  Lock,
  Paperclip,
  Pencil,
  RefreshCw,
  Settings,
  Tag,
  Trash2,
  ClockFading,
  type LucideIcon,
} from "lucide-react";
import { iconComponent } from "@/lib/icons";
import {
  useApp,
  getApp,
  setApp,
  setView,
  dbName,
  lock,
  setSyncDot,
  flashSyncDot,
} from "@/store";
import { showToast } from "@/stores/toast";
import { openDeleteGroupModal, openEditGroupModal } from "@/stores/modals";
import type { ActiveView, EntryData, VaultData } from "@/types";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

const DOT_CLASS: Record<string, string> = {
  syncing: "bg-primary animate-pulse",
  ok: "bg-success",
  error: "bg-destructive",
  "": "bg-transparent",
};

function sameView(a: ActiveView, b: ActiveView): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "tag" && b.kind === "tag") return a.value === b.value;
  if (a.kind === "group" && b.kind === "group") return a.uuid === b.uuid;
  return true;
}

// Render a lucide icon in the menu's icon slot.
const lucide = (Icon: LucideIcon) => <Icon className="size-4 shrink-0 opacity-70" />;

// A KDBX group's own icon: custom PNG, else the built-in emoji.
function GroupIcon({ iconId, custom }: { iconId: number; custom: string | null }) {
  if (custom) {
    return (
      <img
        className="size-4 shrink-0 rounded-sm object-contain"
        src={`data:image/png;base64,${custom}`}
        alt=""
      />
    );
  }
  const Icon = iconComponent(iconId < 0 ? 48 : iconId);
  return <Icon className="size-4 shrink-0 opacity-70" />;
}

function MenuItem({
  icon,
  label,
  count,
  view,
  active,
}: {
  icon: ReactNode;
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
      {icon}
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
  const syncDot = useApp((s) => s.syncDot);
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
        <div className="flex items-center gap-1 border-b p-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold" title={dbName()}>
              {dbName()}
            </div>
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              {syncDot && (
                <span className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[syncDot])} />
              )}
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
          <Button variant="ghost" size="icon-sm" title="Lock vault" onClick={lock}>
            <Lock />
          </Button>
        </div>

        {/* Scrollable menu */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-2 py-1">
          <Section title="Quick View">
            <MenuItem
              icon={lucide(List)}
              label="All Entries"
              count={live.length}
              view={{ kind: "all" }}
              active={sameView(activeView, { kind: "all" })}
            />
            <MenuItem
              icon={lucide(ClockFading)}
              label="2FA codes"
              count={otpCount}
              view={{ kind: "otp" }}
              active={sameView(activeView, { kind: "otp" })}
            />
            <MenuItem
              icon={lucide(Paperclip)}
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
                  icon={lucide(Tag)}
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
              <ContextMenu key={g.uuid}>
                <ContextMenuTrigger asChild>
                  <div>
                    <MenuItem
                      icon={<GroupIcon iconId={g.icon_id} custom={g.custom_icon_base64} />}
                      label={g.name}
                      count={groupCount(g.uuid)}
                      view={{ kind: "group", uuid: g.uuid }}
                      active={sameView(activeView, { kind: "group", uuid: g.uuid })}
                    />
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => openEditGroupModal(g)}>
                    <Pencil /> Edit
                  </ContextMenuItem>
                  <ContextMenuItem variant="destructive" onSelect={() => openDeleteGroupModal(g)}>
                    <Trash2 /> Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            {rbUuid && (
              <MenuItem
                icon={lucide(Trash2)}
                label="Recycle Bin"
                count={recycleCount}
                view={{ kind: "recycle" }}
                active={sameView(activeView, { kind: "recycle" })}
              />
            )}
          </Section>
          </div>
        </ScrollArea>

        {/* Footer: Settings + theme */}
        <div className="flex items-center gap-1 p-2">
          <button
            onClick={() => setApp({ screen: "settings" })}
            className="hover:bg-sidebar-accent/50 flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
          >
            <Settings className="size-4 shrink-0 opacity-70" />
            <span className="flex-1">Settings</span>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
