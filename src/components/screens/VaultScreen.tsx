import { invoke } from "@tauri-apps/api/core";
import { useApp, getApp, setApp } from "../../store";
import { showToast } from "../../stores/toast";
import type { VaultData } from "../../types";
import VaultHeader from "../vault/VaultHeader";
import GroupSidebar from "../vault/GroupSidebar";
import EntryList from "../vault/EntryList";
import EntryDetail from "../vault/EntryDetail";

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
    <div id="screen-vault" className="screen active">
      <VaultHeader />

      <div className={"sync-banner" + (bannerVisible ? " visible" : "")}>
        Remote database was updated.
        <button onClick={reload}>Reload</button>
        <button onClick={() => setApp({ syncBannerVisible: false })}>Dismiss</button>
      </div>

      <GroupSidebar />
      <EntryList />
      <EntryDetail />
    </div>
  );
}
