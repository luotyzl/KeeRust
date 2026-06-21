import { invoke } from "@tauri-apps/api/core";

// Open an external http(s) link in the system default browser. A normal
// target="_blank" anchor doesn't reach the browser from inside the webview, so
// route external links through the backend.
export function openExternal(url: string): void {
  void invoke("open_external", { url }).catch(() => {});
}
