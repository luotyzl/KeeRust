import { useEffect, useRef, useState } from "react";
import { KeyRound, Plus, Settings, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { setApp, sourceLabel } from "@/store";
import { resumePendingAutotype } from "@/stores/autotype";
import type { VaultData } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ThemeToggle from "@/components/ThemeToggle";

// Last path segment of a key-file path, for display.
function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export default function UnlockScreen() {
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [keyFile, setKeyFile] = useState<string | null>(null);
  const passRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    passRef.current?.focus();
    // Restore any key file previously associated with this database.
    invoke<string | null>("get_key_file").then((p) => setKeyFile(p ?? null));
  }, []);

  async function chooseKeyFile() {
    setError("");
    try {
      const path = await invoke<string | null>("pick_key_file");
      if (path) setKeyFile(path);
    } catch (err) {
      setError(String(err));
    }
  }

  async function clearKeyFile() {
    try {
      await invoke("clear_key_file");
      setKeyFile(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!password && !keyFile) {
      setError("A password or key file is required.");
      return;
    }
    setUnlocking(true);
    try {
      const vault = await invoke<VaultData>("open_database", { password });
      setApp({
        vaultData: vault,
        masterPassword: password,
        activeView: { kind: "all" },
        selectedEntryUuid: null,
        searchQuery: "",
        editMode: false,
        screen: "vault",
      });
      setPassword("");
      await resumePendingAutotype();
    } catch (err) {
      setError(String(err));
      passRef.current?.select();
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className="relative flex h-screen items-center justify-center p-6">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          title="Create a new database"
          aria-label="Create a new database"
          onClick={() => setApp({ screen: "new" })}
        >
          <Plus />
        </Button>
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl tracking-tight">KeeRust</CardTitle>
          <CardDescription>Enter your master password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sourceLabel() && (
            <div className="flex items-start justify-center gap-1">
              <p className="text-muted-foreground text-center text-xs break-all">
                {sourceLabel()}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="-mt-1 shrink-0"
                title="Open a different database"
                aria-label="Open a different database"
                onClick={() => setApp({ screen: "config" })}
              >
                <X />
              </Button>
            </div>
          )}
          <form id="unlock-form" className="space-y-4" noValidate onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="master-pass">Master Password</Label>
              <Input
                id="master-pass"
                ref={passRef}
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {keyFile ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <KeyRound className="text-muted-foreground size-4 shrink-0" />
                <span className="flex-1 truncate" title={keyFile}>
                  {baseName(keyFile)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Remove key file"
                  onClick={clearKeyFile}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={chooseKeyFile}
              >
                <KeyRound /> Use a key file…
              </Button>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}
          </form>
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            type="submit"
            form="unlock-form"
            className="flex-1"
            disabled={unlocking}
          >
            {unlocking ? "Unlocking…" : "Unlock"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => setApp({ screen: "settings" })}
          >
            <Settings /> Settings
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
