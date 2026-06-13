import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useApp, setApp, applySource, flashSyncDot, setSyncDot } from "./store";
import { showToast } from "./stores/toast";
import { handleAutoType } from "./stores/autotype";
import type { VaultSource } from "./types";

import ConfigScreen from "./components/screens/ConfigScreen";
import UnlockScreen from "./components/screens/UnlockScreen";
import VaultScreen from "./components/screens/VaultScreen";
import SelectScreen from "./components/screens/SelectScreen";
import ConfirmModal from "./components/modals/ConfirmModal";
import XmlModal from "./components/modals/XmlModal";
import { Toaster } from "./components/ui/sonner";

interface AutoTypePayload {
  title?: string;
  url?: string | null;
}
interface SyncStatusPayload {
  ok: boolean;
  error?: string;
}

export default function App() {
  const screen = useApp((s) => s.screen);

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    let cancelled = false;

    async function setup() {
      // Tauri event: auto-type global hotkey was pressed.
      unlisteners.push(
        await listen<AutoTypePayload>("auto-type", (ev) =>
          handleAutoType(ev.payload?.title || "", ev.payload?.url ?? null)
        )
      );
      // Tauri event: background WebDAV sync found a newer remote version.
      unlisteners.push(
        await listen("db-remote-updated", () => setApp({ syncBannerVisible: true }))
      );
      // Tauri event: background PUT completed (ok or error).
      unlisteners.push(
        await listen<SyncStatusPayload>("sync-status", (ev) => {
          const { ok, error } = ev.payload;
          flashSyncDot(ok ? "ok" : "error");
          if (!ok) showToast("WebDAV sync failed: " + error);
        })
      );

      // Decide the initial screen from the saved source.
      const source = await invoke<VaultSource | null>("get_vault_source");
      if (cancelled) return;
      if (source) {
        applySource(source);
        setApp({ screen: "unlock" });
      } else {
        setApp({ screen: "config" });
      }
      setSyncDot("");
    }

    setup();
    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, []);

  return (
    <>
      {screen === "config" && <ConfigScreen />}
      {screen === "unlock" && <UnlockScreen />}
      {screen === "vault" && <VaultScreen />}
      {screen === "select" && <SelectScreen />}

      <ConfirmModal />
      <XmlModal />
      <Toaster position="bottom-center" richColors />
    </>
  );
}
