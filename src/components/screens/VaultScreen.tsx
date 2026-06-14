import { useState } from "react";
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
      {sidebarOpen && <VaultSidebar />}

      {/* Inset: header + two-pane body */}
      <div className="flex min-w-0 flex-1 flex-col">
        <VaultHeader onToggleSidebar={() => setSidebarOpen((v) => !v)} />

        {bannerVisible && (
          <div className="bg-primary/10 flex items-center justify-center gap-3 border-b px-4 py-1.5 text-sm">
            Remote database was updated.
            <Button size="xs" variant="outline" onClick={reload}>
              Reload
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setApp({ syncBannerVisible: false })}>
              Dismiss
            </Button>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)]">
          <EntryList />
          <EntryDetail />
        </div>
      </div>
    </div>
  );
}
