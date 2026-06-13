import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  useApp,
  getApp,
  setApp,
  selectGroup,
  dbName,
  setSyncDot,
  flashSyncDot,
} from "../../store";
import { showToast } from "../../stores/toast";
import type { VaultData } from "../../types";

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

  return (
    <div className="vault-sidebar">
      <nav className="group-list-scroll">
        <div className="sidebar-section">Groups</div>
        {groups.map((g) => (
          <div
            key={g.uuid}
            className={"group-item" + (g.uuid === selectedGroupUuid ? " active" : "")}
            onClick={() => selectGroup(g.uuid)}
          >
            <span className="group-name">{g.name}</span>
            <span className="group-count">{g.entry_count}</span>
          </div>
        ))}
      </nav>

      {rbUuid && (
        <div className="sidebar-recycle">
          <div
            className={
              "recycle-bin-item" + (selectedGroupUuid === rbUuid ? " active" : "")
            }
            onClick={() => selectGroup(rbUuid)}
          >
            <span className="rb-icon">🗑️</span>
            <span className="rb-name">Recycle Bin</span>
            <span className="group-count">{recycleBinGroup?.entry_count ?? 0}</span>
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <span className="db-name" title={dbName()}>
          {dbName()}
        </span>
        <button
          className={"btn-sync-now" + (syncing ? " spinning" : "")}
          disabled={syncing}
          title={vaultIsLocal ? "Reload from file" : "Sync from cloud"}
          onClick={syncNow}
        >
          ↻
        </button>
      </div>
    </div>
  );
}
