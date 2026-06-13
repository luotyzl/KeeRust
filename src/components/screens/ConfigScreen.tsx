import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { setApp, applySource } from "@/store";
import type { VaultSource, WebDavConfig } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FolderOpen } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

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
    const config: WebDavConfig = { url: url.trim(), username: username.trim(), password };
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
    <div className="relative flex h-screen items-center justify-center p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl tracking-tight">KeeRust</CardTitle>
          <CardDescription>KeePass for desktop</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            ref={localBtnRef}
            type="button"
            variant="secondary"
            className="w-full"
            disabled={pickingLocal}
            onClick={pickLocal}
          >
            <FolderOpen /> Open Local File…
          </Button>

          <div className="text-muted-foreground flex items-center gap-3 text-xs tracking-wider uppercase">
            <Separator className="flex-1" />
            or via WebDAV
            <Separator className="flex-1" />
          </div>

          <form className="space-y-4" noValidate onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="dav-url">WebDAV URL</Label>
              <Input
                id="dav-url"
                type="url"
                placeholder="https://cloud.example.com/vault.kdbx"
                autoComplete="off"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dav-user">Username</Label>
              <Input
                id="dav-user"
                type="text"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dav-pass">Password</Label>
              <Input
                id="dav-pass"
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Save & Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
