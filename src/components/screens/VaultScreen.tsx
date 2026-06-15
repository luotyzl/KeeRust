import { invoke } from "@tauri-apps/api/core";
import { getApp, setApp, useApp } from "@/store";
import { showToast } from "@/stores/toast";
import type { VaultData } from "@/types";
import VaultSidebar from "@/components/vault/VaultSidebar";
import VaultHeader from "@/components/vault/VaultHeader";
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
    <div className="bg-background flex h-screen">
      <VaultSidebar />

      {/* Inset: floating panels */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-2 pr-2">
        {bannerVisible && (
          <div className="bg-primary/10 flex items-center justify-center gap-3 rounded-lg border px-4 py-1.5 text-sm">
            Remote database was updated.
            <Button size="xs" variant="outline" onClick={reload}>
              Reload
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setApp({ syncBannerVisible: false })}>
              Dismiss
            </Button>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
          {/* Entry list panel: toolbar + list */}
          <div className="bg-card flex min-h-0 flex-col overflow-hidden rounded-lg border shadow-sm">
            <VaultHeader />
            <EntryList />
          </div>

          {/* Detail panel */}
          <div className="bg-card flex min-h-0 flex-col overflow-hidden rounded-lg border shadow-sm">
            <EntryDetail />
          </div>
        </div>
      </div>
    </div>
  );
}
