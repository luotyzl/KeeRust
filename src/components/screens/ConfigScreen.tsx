import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { setApp, applySource } from "../../store";
import type { VaultSource, WebDavConfig } from "../../types";

export default function ConfigScreen() {
  const [error, setError] = useState("");
  const [pickingLocal, setPickingLocal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const localBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    localBtnRef.current?.focus();
  }, []);

  function goUnlock(source: VaultSource) {
    applySource(source);
    setApp({ screen: "unlock" });
  }

  async function pickLocal() {
    setError("");
    setPickingLocal(true);
    try {
      const source = await invoke<VaultSource | null>("open_local_file");
      if (source) goUnlock(source);
    } catch (err) {
      setError(String(err));
    } finally {
      setPickingLocal(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const config: WebDavConfig = {
      url: url.trim(),
      username: username.trim(),
      password,
    };
    if (!config.url || !config.username || !config.password) {
      setError("All fields are required.");
      return;
    }
    if (!config.url.startsWith("https://")) {
      setError("URL must start with https://");
      return;
    }
    setSaving(true);
    try {
      await invoke("save_webdav_config", { config });
      goUnlock({ type: "webdav", ...config });
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="screen-config" className="screen active">
      <div className="auth-box">
        <div className="logo">
          <h1>KeeRust</h1>
          <p>KeePass for desktop</p>
        </div>
        <h2>Open Database</h2>
        <button
          ref={localBtnRef}
          type="button"
          className="btn btn-secondary"
          disabled={pickingLocal}
          onClick={pickLocal}
        >
          📂 Open Local File…
        </button>
        <div className="or-divider">or via WebDAV</div>
        <form noValidate onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="dav-url">WebDAV URL</label>
            <input
              id="dav-url"
              type="url"
              placeholder="https://cloud.example.com/vault.kdbx"
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="dav-user">Username</label>
            <input
              id="dav-user"
              type="text"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="dav-pass">Password</label>
            <input
              id="dav-pass"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className={"error" + (error ? " visible" : "")}>{error}</div>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Saving…" : "Save & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
