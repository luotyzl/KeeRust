import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useApp, setApp, applySource, flashSyncDot, setSyncDot } from "./store";
import { getSettings } from "./stores/settings";
import { installAutoLock, lockOnMinimizeIfEnabled } from "./lib/autolock";
import { showToast, showWarning } from "./stores/toast";
import { handleAutoType } from "./stores/autotype";
import type { VaultSource } from "./types";

import ConfigScreen from "./components/screens/ConfigScreen";
import UnlockScreen from "./components/screens/UnlockScreen";
import NewDatabaseScreen from "./components/screens/NewDatabaseScreen";
import VaultScreen from "./components/screens/VaultScreen";
import SelectScreen from "./components/screens/SelectScreen";
import SettingsScreen from "./components/screens/SettingsScreen";
import ConfirmModal from "./components/modals/ConfirmModal";
import ConfirmGroupDeleteModal from "./components/modals/ConfirmGroupDeleteModal";
import XmlModal from "./components/modals/XmlModal";
import CreateModal from "./components/modals/CreateModal";
import { Toaster } from "./components/ui/sonner";

interface AutoTypePayload {
  title?: string;
  url?: string | null;
  otp?: boolean;
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
          handleAutoType(
            ev.payload?.title || "",
            ev.payload?.url ?? null,
            ev.payload?.otp ?? false
          )
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

      // Surface any non-fatal startup problems (e.g. a global shortcut already
      // claimed by another app) as dismissible warning toasts.
      invoke<string[]>("take_startup_warnings")
        .then((warnings) => warnings.forEach(showWarning))
        .catch(() => {});

      // Auto-lock: inactivity timer + minimize + OS-lock triggers.
      unlisteners.push(await installAutoLock());

      // Intercept the window close: hide to the system tray when enabled
      // (the tray icon's Open/Quit menu brings it back or exits).
      const appWindow = getCurrentWindow();
      unlisteners.push(
        await appWindow.onCloseRequested((event) => {
          if (getSettings().minimizeOnClose) {
            event.preventDefault();
            void appWindow.hide();
            // Hiding to the tray counts as minimizing — lock if enabled.
            lockOnMinimizeIfEnabled();
          }
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
      {screen === "new" && <NewDatabaseScreen />}
      {screen === "vault" && <VaultScreen />}
      {screen === "settings" && <SettingsScreen />}
      {screen === "select" && <SelectScreen />}

      <ConfirmModal />
      <ConfirmGroupDeleteModal />
      <XmlModal />
      <CreateModal />
      <Toaster position="bottom-center" richColors />
    </>
  );
}
