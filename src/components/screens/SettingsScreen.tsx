import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  Check,
  Database,
  Images,
  Keyboard,
  KeyRound,
  Lock,
  MoreHorizontal,
  Moon,
  Palette,
  Pencil,
  SlidersHorizontal,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { setApp, useApp, getApp, sourceLabel, lock, dbName, markSyncPending } from "@/store";
import { showToast } from "@/stores/toast";
import { openExternal } from "@/lib/openExternal";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { useSettings, setSetting } from "@/stores/settings";
import type { CustomIconData, KdfKind, VaultData } from "@/types";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// Stable empty default so the store selector never returns a fresh array (which
// would loop useSyncExternalStore — see src/lib/store.ts).
const EMPTY_ICONS: CustomIconData[] = [];

// Last path segment of a key-file path, for display.
function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

// A single keyboard key, styled like a physical keycap.
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-muted text-foreground inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-xs">
      {children}
    </kbd>
  );
}

// A shortcut shown as "A + B + C".
function Shortcut({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, i) => (
        <span key={k} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
          <Kbd>{k}</Kbd>
        </span>
      ))}
    </span>
  );
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
  const customIcons = useApp((s) => s.vaultData?.custom_icons) ?? EMPTY_ICONS;
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
  const [switchOpen, setSwitchOpen] = useState(false);
  const [iconsOpen, setIconsOpen] = useState(false);
  const [iconBusy, setIconBusy] = useState(false);
  const [selectedIcons, setSelectedIcons] = useState<Set<string>>(new Set());
  const [kdfOpen, setKdfOpen] = useState(false);
  const [kdfKind, setKdfKind] = useState<KdfKind>("argon2d");
  const [kdfIterations, setKdfIterations] = useState("2");
  const [kdfMemory, setKdfMemory] = useState("65536");
  const [kdfParallelism, setKdfParallelism] = useState("2");
  const [kdfError, setKdfError] = useState("");
  const [kdfBusy, setKdfBusy] = useState(false);

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

  function openKdf() {
    const kdf = getApp().vaultData?.kdf;
    if (kdf) {
      setKdfKind(kdf.kind);
      setKdfIterations(String(kdf.iterations));
      // Argon2 stores memory in KiB; AES has none — show a sensible default.
      setKdfMemory(String(kdf.memory || 65536));
      setKdfParallelism(String(kdf.parallelism || 2));
    }
    setKdfError("");
    setKdfOpen(true);
  }

  async function submitKdf() {
    if (kdfBusy) return;
    const iterations = Number(kdfIterations);
    const memory = Number(kdfMemory);
    const parallelism = Number(kdfParallelism);
    if (!Number.isInteger(iterations) || iterations < 1) {
      return setKdfError(
        kdfKind === "aes"
          ? "Rounds must be a whole number of at least 1."
          : "Iterations must be a whole number of at least 1.",
      );
    }
    if (kdfKind !== "aes") {
      if (!Number.isInteger(parallelism) || parallelism < 1) {
        return setKdfError("Parallelism must be a whole number of at least 1.");
      }
      if (!Number.isInteger(memory) || memory < 8 * parallelism) {
        return setKdfError("Memory is too low for the chosen parallelism.");
      }
    }
    setKdfError("");
    setKdfBusy(true);
    try {
      const vault = await invoke<VaultData>("set_kdf_settings", {
        password: getApp().masterPassword,
        kind: kdfKind,
        iterations,
        memory: kdfKind === "aes" ? 0 : memory,
        parallelism: kdfKind === "aes" ? 0 : parallelism,
      });
      setApp({ vaultData: vault });
      markSyncPending();
      setKdfOpen(false);
      showToast("Key derivation settings updated");
    } catch (err) {
      setKdfError(String(err));
    } finally {
      setKdfBusy(false);
    }
  }

  function openIcons() {
    setSelectedIcons(new Set());
    setIconsOpen(true);
  }

  function toggleIcon(uuid: string) {
    setSelectedIcons((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }

  async function deleteSelectedIcons() {
    if (iconBusy || selectedIcons.size === 0) return;
    setIconBusy(true);
    try {
      const vault = await invoke<VaultData>("delete_custom_icons", {
        password: getApp().masterPassword,
        uuids: Array.from(selectedIcons),
      });
      setApp({ vaultData: vault });
      markSyncPending();
      setSelectedIcons(new Set());
      showToast("Icons deleted");
    } catch (err) {
      showToast("Failed: " + String(err));
    } finally {
      setIconBusy(false);
    }
  }

  // Lock the open vault and return to the start screen to pick another database.
  function confirmSwitchDatabase() {
    setSwitchOpen(false);
    lock();
    setApp({ screen: "config" });
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
              <Keyboard className="size-4" /> Auto Type
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">
              While another app is focused, press one of these global shortcuts to
              auto-type the matching entry's credentials into it:
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Shortcut keys={["Alt", "Shift", "T"]} />
              <span className="text-muted-foreground">or</span>
              <Shortcut keys={["Ctrl", "T"]} />
            </div>
            <p className="text-muted-foreground text-sm">
              Or copy the matching entry's one-time code (OTP) to the clipboard:
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Shortcut keys={["Alt", "Shift", "O"]} />
            </div>
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
            {hasVault ? (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">Location</span>
                <div className="flex min-w-0 items-center gap-1">
                  <span className="truncate text-right" title={sourceLabel()}>
                    {sourceLabel() || "—"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Lock and open a different database"
                    onClick={() => setSwitchOpen(true)}
                  >
                    <X />
                  </Button>
                </div>
              </div>
            ) : (
              <Row label="Location" value={sourceLabel() || "—"} />
            )}
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
            {hasVault && (
              <>
                <Separator />
                <div className="flex items-center justify-end gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MoreHorizontal /> Actions
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={openChangePassword}>
                        <Lock /> Change master password
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={openKdf}>
                        <SlidersHorizontal /> Key derivation
                      </DropdownMenuItem>
                      {!keyFile && (
                        <DropdownMenuItem disabled={genBusy} onClick={generateKeyFile}>
                          <KeyRound /> {genBusy ? "Generating…" : "Generate key file"}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={openIcons}>
                        <Images /> Manage icons
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    title="Lock vault"
                    aria-label="Lock vault"
                    onClick={lock}
                  >
                    <Lock />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">App</span>
              <a
                href="https://github.com/luotyzl/KeeRust"
                onClick={(e) => {
                  e.preventDefault();
                  openExternal("https://github.com/luotyzl/KeeRust");
                }}
                className="text-primary cursor-pointer truncate text-right hover:underline"
                title="https://github.com/luotyzl/KeeRust"
              >
                KeeRust
              </a>
            </div>
            <Row label="Version" value={__APP_VERSION__} />
          </CardContent>
        </Card>
      </div>
      </ScrollArea>

      {/* Manage saved custom icons */}
      <Dialog open={iconsOpen} onOpenChange={(o) => !iconBusy && setIconsOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Icons</DialogTitle>
            <DialogDescription>
              Custom icons saved in this database. Select the ones you want to
              remove, then delete — entries or groups using a deleted icon revert
              to a default icon (they're never left unreadable).
            </DialogDescription>
          </DialogHeader>
          {customIcons.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No custom icons saved.
            </p>
          ) : (
            <ScrollArea viewportClassName="max-h-72">
              <div className="grid grid-cols-6 gap-2 p-0.5">
                {customIcons.map((ci) => {
                  const selected = selectedIcons.has(ci.uuid);
                  return (
                    <button
                      key={ci.uuid}
                      type="button"
                      disabled={iconBusy}
                      title="Select icon"
                      aria-pressed={selected}
                      onClick={() => toggleIcon(ci.uuid)}
                      className={cn(
                        "bg-muted/40 relative flex aspect-square items-center justify-center rounded-md border transition disabled:opacity-60",
                        selected
                          ? "border-primary ring-primary ring-2"
                          : "hover:border-ring",
                      )}
                    >
                      <img
                        className="size-7 rounded-sm object-contain"
                        src={`data:image/png;base64,${ci.base64}`}
                        alt=""
                      />
                      {selected && (
                        <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full">
                          <Check className="size-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          <DialogFooter className="sm:justify-between">
            <span className="text-muted-foreground self-center text-xs">
              {selectedIcons.size > 0 ? `${selectedIcons.size} selected` : ""}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={iconBusy}
                onClick={() => setIconsOpen(false)}
              >
                Close
              </Button>
              <Button
                variant="destructive"
                disabled={iconBusy || selectedIcons.size === 0}
                onClick={deleteSelectedIcons}
              >
                <Trash2 /> {iconBusy ? "Deleting…" : `Delete${selectedIcons.size ? ` (${selectedIcons.size})` : ""}`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock & switch to a different database */}
      <Dialog open={switchOpen} onOpenChange={setSwitchOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Open a Different Database</DialogTitle>
            <DialogDescription>
              This locks the current database and returns to the start screen, where
              you can open or set up another one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwitchOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmSwitchDatabase}>
              Lock &amp; Switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Key derivation (KDF) settings */}
      <Dialog open={kdfOpen} onOpenChange={(o) => !kdfBusy && setKdfOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Key Derivation</DialogTitle>
            <DialogDescription>
              These settings control how slow it is to derive the master key —
              higher values resist password guessing but make unlocking and saving
              slower. The database is re-encrypted when you apply them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="kdf-kind">Function</Label>
              <Select value={kdfKind} onValueChange={(v) => setKdfKind(v as KdfKind)}>
                <SelectTrigger id="kdf-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="argon2d">Argon2d (recommended)</SelectItem>
                  <SelectItem value="argon2id">Argon2id</SelectItem>
                  <SelectItem value="aes">AES-KDF (legacy)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kdf-iterations">
                {kdfKind === "aes" ? "Rounds" : "Iterations"}
              </Label>
              <Input
                id="kdf-iterations"
                type="number"
                min={1}
                value={kdfIterations}
                onChange={(e) => setKdfIterations(e.target.value)}
              />
            </div>
            {kdfKind !== "aes" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="kdf-memory">Memory (KB)</Label>
                  <Input
                    id="kdf-memory"
                    type="number"
                    min={8}
                    value={kdfMemory}
                    onChange={(e) => setKdfMemory(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kdf-parallelism">Parallelism</Label>
                  <Input
                    id="kdf-parallelism"
                    type="number"
                    min={1}
                    value={kdfParallelism}
                    onChange={(e) => setKdfParallelism(e.target.value)}
                  />
                </div>
              </>
            )}
            {kdfError && <p className="text-destructive text-sm">{kdfError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={kdfBusy} onClick={() => setKdfOpen(false)}>
              Cancel
            </Button>
            <Button disabled={kdfBusy} onClick={submitKdf}>
              {kdfBusy ? "Applying…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
