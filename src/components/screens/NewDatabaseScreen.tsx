import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Database } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { setApp, applySource } from "@/store";
import type { VaultData, VaultSource } from "@/types";
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

export default function NewDatabaseScreen() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Database name is required.");
    if (!password) return setError("Password is required.");
    if (password !== confirm) return setError("Passwords do not match.");

    setCreating(true);
    try {
      // Prompts for a save location; returns null if the user cancels it.
      const vault = await invoke<VaultData | null>("create_database", {
        name: name.trim(),
        password,
      });
      if (!vault) {
        setCreating(false);
        return; // user cancelled the save dialog
      }
      // The backend already persisted the new local source; mirror it in state.
      const source = await invoke<VaultSource | null>("get_vault_source");
      applySource(source);
      setApp({
        vaultData: vault,
        masterPassword: password,
        activeView: { kind: "all" },
        selectedEntryUuid: null,
        searchQuery: "",
        editMode: false,
        screen: "vault",
      });
    } catch (err) {
      setError(String(err));
      setCreating(false);
    }
  }

  return (
    <div className="relative flex h-screen items-center justify-center p-6">
      <div className="absolute top-4 left-4">
        <Button
          variant="ghost"
          size="icon"
          title="Back"
          onClick={() => setApp({ screen: "unlock" })}
        >
          <ArrowLeft />
        </Button>
      </div>
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-2xl tracking-tight">
            <Database className="size-5" /> New Database
          </CardTitle>
          <CardDescription>Create a new KeePass database</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form id="new-db-form" className="space-y-4" noValidate onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="db-name">Database Name</Label>
              <Input
                id="db-name"
                ref={nameRef}
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="db-pass">Master Password</Label>
              <Input
                id="db-pass"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="db-pass2">Confirm Password</Label>
              <Input
                id="db-pass2"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>KeePass 2 (KDBX 4)</span>
                <span className="text-muted-foreground text-xs">Recommended</span>
              </div>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </form>
        </CardContent>
        <CardFooter>
          <Button type="submit" form="new-db-form" className="w-full" disabled={creating}>
            {creating ? "Creating…" : "Choose Location & Create"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
