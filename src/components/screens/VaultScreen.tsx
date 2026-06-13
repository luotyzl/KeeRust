import { invoke } from "@tauri-apps/api/core";
import { useApp, getApp, setApp } from "@/store";
import { showToast } from "@/stores/toast";
import type { VaultData } from "@/types";
import VaultHeader from "@/components/vault/VaultHeader";
import GroupSidebar from "@/components/vault/GroupSidebar";
import EntryList from "@/components/vault/EntryList";
import EntryDetail from "@/components/vault/EntryDetail";
import { Button } from "@/components/ui/button";

export default function VaultScreen() {
  const bannerVisible = useApp((s) => s.syncBannerVisible);

  // Banner action: reload from the (already-updated) local cache.
  async function reload() {
    setApp({ syncBannerVisible: false });
    if (!getApp().masterPassword) return;
    try {
      const vault = await invoke<VaultData>("open_database", {
        password: getApp().masterPassword,
      });
      setApp({ vaultData: vault, selectedEntryUuid: null });
      showToast("Vault reloaded");
    } catch (err) {
      showToast("Reload failed: " + String(err));
    }
  }

  return (
    <div className="grid h-screen grid-cols-[220px_360px_minmax(0,1fr)] grid-rows-[3rem_minmax(0,1fr)]">
      <VaultHeader />

      {bannerVisible && (
        <div className="bg-primary/10 text-foreground fixed top-12 right-0 left-0 z-50 flex items-center justify-center gap-3 border-b px-4 py-1.5 text-sm">
          Remote database was updated.
          <Button size="xs" variant="outline" onClick={reload}>
            Reload
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setApp({ syncBannerVisible: false })}
          >
            Dismiss
          </Button>
        </div>
      )}

      <GroupSidebar />
      <EntryList />
      <EntryDetail />
    </div>
  );
}
