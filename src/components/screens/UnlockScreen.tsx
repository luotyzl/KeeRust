import { useEffect, useRef, useState } from "react";
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
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl tracking-tight">KeeRust</CardTitle>
          <CardDescription>Enter your master password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sourceLabel() && (
            <p className="text-muted-foreground text-center text-xs break-all">
              {sourceLabel()}
            </p>
          )}
          <form className="space-y-4" noValidate onSubmit={submit}>
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
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={unlocking}>
              {unlocking ? "Unlocking…" : "Unlock"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button
            variant="link"
            className="text-muted-foreground"
            onClick={() => setApp({ screen: "config" })}
          >
            Change database
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
