// JS layer of the hotkey lockdown — the cross-platform companion to the
// app-level guards in src-tauri (zoom hotkeys + navigation are disabled there).
// This blocks the WebView's remaining built-in shortcuts that have no native
// toggle: reload, find, print, save, view-source, open. Text-editing shortcuts
// (copy/cut/paste/select-all/undo/redo) and plain typing are deliberately left
// alone so password fields and search still behave normally. Mirrors how KeeWeb
// pairs its Electron-level lockdown with an in-app key-handler.

const DEV = import.meta.env.DEV;

function block(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopPropagation();
}

function onKeyDown(e: KeyboardEvent): void {
  const ctrl = e.ctrlKey || e.metaKey;
  const code = e.code;

  // Browser function keys.
  switch (e.key) {
    case "F5": // reload
    case "F3": // find next
    case "F7": // caret browsing
    case "F11": // fullscreen
      return block(e);
    case "F12": // devtools — keep available while developing
      if (!DEV) return block(e);
      return;
  }

  if (!ctrl) return;

  // Devtools combos (Ctrl/Cmd+Shift+I/J/C) — keep in dev.
  if (e.shiftKey && (code === "KeyI" || code === "KeyJ" || code === "KeyC")) {
    if (!DEV) return block(e);
    return;
  }

  switch (code) {
    case "KeyR": // reload / hard reload
    case "KeyF": // find
    case "KeyG": // find next
    case "KeyP": // print
    case "KeyS": // save page
    case "KeyU": // view source
    case "KeyO": // open file
    case "KeyJ": // downloads
      return block(e);
  }
  // Note: zoom keys (Ctrl +/-/0, Ctrl+wheel) are disabled natively via the
  // window's zoom_hotkeys_enabled(false) in src-tauri, so they're not handled here.
}

// Suppress the WebView's right-click context menu (Reload / Back / Inspect …).
// Kept available in dev so right-click → Inspect still works.
function onContextMenu(e: MouseEvent): void {
  if (!DEV) e.preventDefault();
}

export function installKeyGuard(): void {
  window.addEventListener("keydown", onKeyDown, { capture: true });
  window.addEventListener("contextmenu", onContextMenu, { capture: true });
}
