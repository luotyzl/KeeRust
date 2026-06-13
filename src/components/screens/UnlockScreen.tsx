import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { setApp, sourceLabel } from "../../store";
import { resumePendingAutotype } from "../../stores/autotype";
import type { VaultData } from "../../types";

export default function UnlockScreen() {
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const passRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    passRef.current?.focus();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!password) {
      setError("Password is required.");
      return;
    }
    setUnlocking(true);
    try {
      const vault = await invoke<VaultData>("open_database", { password });
      setApp({
        vaultData: vault,
        masterPassword: password,
        selectedGroupUuid: vault.groups[0]?.uuid ?? null,
        selectedEntryUuid: null,
        searchQuery: "",
        editMode: false,
        screen: "vault",
      });
      setPassword("");
      // If an auto-type hotkey arrived while locked, resume it now.
      await resumePendingAutotype();
    } catch (err) {
      setError(String(err));
      passRef.current?.select();
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div id="screen-unlock" className="screen active">
      <div className="auth-box">
        <div className="logo">
          <h1>KeeRust</h1>
          <p>Enter your master password</p>
        </div>
        <div className="vault-source">{sourceLabel()}</div>
        <form noValidate onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="master-pass">Master Password</label>
            <input
              id="master-pass"
              ref={passRef}
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className={"error" + (error ? " visible" : "")}>{error}</div>
          <button type="submit" className="btn" disabled={unlocking}>
            {unlocking ? "Unlocking…" : "Unlock"}
          </button>
        </form>
        <button className="link-btn" onClick={() => setApp({ screen: "config" })}>
          Change database
        </button>
      </div>
    </div>
  );
}
