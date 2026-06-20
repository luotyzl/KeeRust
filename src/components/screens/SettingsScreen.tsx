import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  Database,
  KeyRound,
  Lock,
  Moon,
  Palette,
  Pencil,
  Sun,
  X,
} from "lucide-react";
import { setApp, useApp, getApp, sourceLabel, lock, dbName, markSyncPending } from "@/store";
import { showToast } from "@/stores/toast";
import { useTheme } from "@/components/theme-provider";
import { useSettings, setSetting } from "@/stores/settings";
import type { VaultData } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// Last path segment of a key-file path, for display.
function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

// Inactivity options (value = minutes; 0 = never).
const IDLE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Don't auto-lock" },
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 300, label: "5 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "24 hours" },
];

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right" title={value}>
        {value}
      </span>
    </div>
  );
}

export default function SettingsScreen() {
  const vaultIsLocal = useApp((s) => s.vaultIsLocal);
  const hasVault = useApp((s) => s.vaultData != null);
  const { theme, setTheme } = useTheme();
  const minimizeOnClose = useSettings((s) => s.minimizeOnClose);
  const autoLockIdleMinutes = useSettings((s) => s.autoLockIdleMinutes);
  const autoLockOnMinimize = useSettings((s) => s.autoLockOnMinimize);
  const autoLockOnSystemLock = useSettings((s) => s.autoLockOnSystemLock);

  // Settings is reachable both from the unlocked vault and the unlock screen;
  // go back to wherever we came from.
  const back = () => setApp({ screen: hasVault ? "vault" : "unlock" });

  // Database management (only meaningful once unlocked).
  const [keyFile, setKeyFile] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);

  useEffect(() => {
    if (hasVault) {
      invoke<string | null>("get_key_file").then((p) => setKeyFile(p ?? null));
    }
  }, [hasVault]);

  function openRename() {
    setRenameValue(dbName());
    setRenameOpen(true);
  }

  async function submitRename() {
    const name = renameValue.trim();
    if (!name || renameBusy) return;
    setRenameBusy(true);
    try {
      const vault = await invoke<VaultData>("rename_database", {
        password: getApp().masterPassword,
        name,
      });
      setApp({ vaultData: vault });
      markSyncPending();
      setRenameOpen(false);
      showToast("Database renamed");
    } catch (err) {
      showToast("Rename failed: " + String(err));
    } finally {
      setRenameBusy(false);
    }
  }

  function openChangePassword() {
    setPwNew("");
    setPwConfirm("");
    setPwError("");
    setPwOpen(true);
  }

  async function submitChangePassword() {
    if (pwBusy) return;
    if (!pwNew) return setPwError("New password is required.");
    if (pwNew !== pwConfirm) return setPwError("Passwords do not match.");
    setPwError("");
    setPwBusy(true);
    try {
      await invoke("change_master_password", {
        password: getApp().masterPassword,
        newPassword: pwNew,
      });
      setApp({ masterPassword: pwNew });
      markSyncPending();
      setPwOpen(false);
      showToast("Master password changed");
    } catch (err) {
      setPwError(String(err));
    } finally {
      setPwBusy(false);
    }
  }

  async function generateKeyFile() {
    if (genBusy) return;
    setGenBusy(true);
    try {
      const path = await invoke<string | null>("generate_key_file", {
        password: getApp().masterPassword,
      });
      if (path) {
        setKeyFile(path);
        markSyncPending();
        showToast("Key file created and added to this database");
      }
    } catch (err) {
      showToast("Failed: " + String(err));
    } finally {
      setGenBusy(false);
    }
  }

  async function removeKeyFile() {
    if (genBusy) return;
    setGenBusy(true);
    try {
      await invoke("remove_key_file", { password: getApp().masterPassword });
      setKeyFile(null);
      markSyncPending();
      showToast("Key file removed");
    } catch (err) {
      showToast("Failed: " + String(err));
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <div className="bg-background flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          title="Back"
          onClick={back}
        >
          <ArrowLeft />
        </Button>
        <span className="text-sm font-semibold">Settings</span>
      </header>

      <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-4" /> Appearance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">Theme</span>
              <div className="flex gap-1">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("light")}
                >
                  <Sun /> Light
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("dark")}
                >
                  <Moon /> Dark
                </Button>
              </div>
            </div>

            <Separator />

            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="space-y-0.5">
                <span className="block text-sm">Minimize the app instead of close</span>
              </span>
              <Switch
                checked={minimizeOnClose}
                onCheckedChange={(v) => setSetting("minimizeOnClose", v)}
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4" /> Auto Lock
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">If the app is inactive</span>
              <Select
                value={String(autoLockIdleMinutes)}
                onValueChange={(v) => setSetting("autoLockIdleMinutes", Number(v))}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IDLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <ToggleRow
              label="When the app is minimized"
              checked={autoLockOnMinimize}
              onChange={(v) => setSetting("autoLockOnMinimize", v)}
            />

            <ToggleRow
              label="When the computer is locked or put to sleep"
              checked={autoLockOnSystemLock}
              onChange={(v) => setSetting("autoLockOnSystemLock", v)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4" /> Database
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasVault && (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">Name</span>
                <div className="flex min-w-0 items-center gap-1">
                  <span className="truncate text-right" title={dbName()}>
                    {dbName()}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Rename database"
                    onClick={openRename}
                  >
                    <Pencil />
                  </Button>
                </div>
              </div>
            )}
            <Row label="Source" value={vaultIsLocal ? "Local file" : "WebDAV"} />
            <Row label="Location" value={sourceLabel() || "—"} />
            {hasVault && (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">Key file</span>
                {keyFile ? (
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-right" title={keyFile}>
                      {baseName(keyFile)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={genBusy}
                      title="Remove key file"
                      onClick={removeKeyFile}
                    >
                      <X />
                    </Button>
                  </div>
                ) : (
                  <span className="text-right">None</span>
                )}
              </div>
            )}
            <Separator />
            <div className="flex flex-wrap gap-2">
              {hasVault && (
                <>
                  <Button variant="outline" size="sm" onClick={openChangePassword}>
                    <Lock /> Change master password
                  </Button>
                  {!keyFile && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={genBusy}
                      onClick={generateKeyFile}
                    >
                      <KeyRound /> {genBusy ? "Generating…" : "Generate key file"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={lock}>
                    Lock vault
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="App" value="KeeRust" />
            <Row label="Version" value={__APP_VERSION__} />
          </CardContent>
        </Card>
      </div>
      </ScrollArea>

      {/* Rename database */}
      <Dialog open={renameOpen} onOpenChange={(o) => !renameBusy && setRenameOpen(o)}>
        <DialogContent
          className="sm:max-w-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitRename();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename Database</DialogTitle>
            <DialogDescription>Choose a new name for this database.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rename-input">Database Name</Label>
            <Input
              id="rename-input"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={renameBusy} onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button disabled={renameBusy || !renameValue.trim()} onClick={submitRename}>
              {renameBusy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change master password */}
      <Dialog open={pwOpen} onOpenChange={(o) => !pwBusy && setPwOpen(o)}>
        <DialogContent
          className="sm:max-w-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitChangePassword();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Change Master Password</DialogTitle>
            <DialogDescription>
              The database will be re-encrypted with the new password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pw-new">New Password</Label>
              <Input
                id="pw-new"
                type="password"
                autoFocus
                autoComplete="new-password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-confirm">Confirm Password</Label>
              <Input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
              />
            </div>
            {pwError && <p className="text-destructive text-sm">{pwError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pwBusy} onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pwBusy} onClick={submitChangePassword}>
              {pwBusy ? "Changing…" : "Change Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
