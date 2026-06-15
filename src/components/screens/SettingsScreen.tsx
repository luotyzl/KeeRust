import { ArrowLeft, Database, Lock, Moon, Palette, Sun } from "lucide-react";
import { setApp, useApp, sourceLabel, lock } from "@/store";
import { useTheme } from "@/components/theme-provider";
import { useSettings, setSetting } from "@/stores/settings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
            <Row label="Source" value={vaultIsLocal ? "Local file" : "WebDAV"} />
            <Row label="Location" value={sourceLabel() || "—"} />
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setApp({ screen: "config" })}>
                Change database
              </Button>
              {hasVault && (
                <Button variant="outline" size="sm" onClick={lock}>
                  Lock vault
                </Button>
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
            <Row label="Version" value="0.1.0" />
          </CardContent>
        </Card>
      </div>
      </ScrollArea>
    </div>
  );
}
