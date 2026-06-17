import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import {
  DEFAULT_GEN,
  PRESETS,
  RANGE_KEYS,
  generatePassword,
  estimateStrength,
  type GenOptions,
  type RangeKey,
} from "@/lib/password";
import { copyText } from "@/stores/toast";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TOGGLES: { key: RangeKey; label: string; title: string }[] = [
  { key: "upper", label: "A-Z", title: "Uppercase letters" },
  { key: "lower", label: "a-z", title: "Lowercase letters" },
  { key: "digits", label: "0-9", title: "Digits" },
  { key: "special", label: "!@#", title: "Special characters" },
  { key: "brackets", label: "({[", title: "Brackets" },
  { key: "high", label: "äæ±", title: "High ANSI characters" },
  { key: "ambiguous", label: "0Oo", title: "Ambiguous characters" },
];

const CUSTOM_NAME = "Custom";

export default function PasswordGenerator({
  onApply,
  children,
}: {
  onApply: (password: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<GenOptions>(DEFAULT_GEN);
  const [preset, setPreset] = useState<string>(CUSTOM_NAME);
  const [password, setPassword] = useState("");

  // Generate a fresh password whenever the panel opens.
  useEffect(() => {
    if (open) setPassword(generatePassword(opts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function regenerate(next = opts) {
    setPassword(generatePassword(next));
  }

  function applyPreset(name: string) {
    const p = PRESETS.find((x) => x.name === name);
    if (!p) return;
    const { name: _n, title: _t, ...rest } = p;
    setPreset(name);
    setOpts(rest);
    regenerate(rest);
  }

  // Any manual tweak switches the preset to "Custom".
  function setOpt(patch: Partial<GenOptions>) {
    const next = { ...opts, ...patch };
    setOpts(next);
    setPreset(CUSTOM_NAME);
    regenerate(next);
  }

  function toggle(key: RangeKey) {
    setOpt({ [key]: !opts[key] } as Partial<GenOptions>);
  }

  function apply() {
    onApply(password || generatePassword(opts));
    setOpen(false);
  }

  const strength = estimateStrength(password);
  const noneSelected = RANGE_KEYS.every((k) => !opts[k]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        {/* Result */}
        <div className="flex items-center gap-1.5">
          <div className="font-mono-code bg-muted/60 max-h-20 min-h-9 flex-1 overflow-y-auto rounded-md border px-2.5 py-1.5 text-sm break-all">
            {password || <span className="text-muted-foreground">Select at least one set</span>}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Generate new"
            onClick={() => regenerate()}
            disabled={noneSelected}
          >
            <RefreshCw />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Copy"
            onClick={() => copyText(password, "Password")}
            disabled={!password}
          >
            <Copy />
          </Button>
        </div>

        {/* Strength bar */}
        <div className="space-y-1">
          <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
            <div
              className={"h-full rounded-full transition-all " + strength.color}
              style={{ width: `${Math.max(5, strength.ratio * 100)}%` }}
            />
          </div>
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>{strength.label}</span>
            <span>{strength.bits} bits</span>
          </div>
        </div>

        {/* Preset */}
        <Select value={preset === CUSTOM_NAME ? "" : preset} onValueChange={applyPreset}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="Custom" />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.name} value={p.name}>
                {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Length */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-semibold">Length</span>
            <span className="font-mono-code">{opts.length}</span>
          </div>
          <Slider
            min={4}
            max={64}
            step={1}
            value={[opts.length]}
            onValueChange={([v]) => setOpt({ length: v })}
          />
        </div>

        {/* Character sets */}
        <div className="flex flex-wrap gap-1.5">
          {TOGGLES.map((t) => (
            <button
              key={t.key}
              type="button"
              title={t.title}
              onClick={() => toggle(t.key)}
              className={
                "font-mono-code rounded-md border px-2 py-1 text-xs transition " +
                (opts[t.key]
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <Button type="button" className="w-full" onClick={apply} disabled={noneSelected}>
          Use this password
        </Button>
      </PopoverContent>
    </Popover>
  );
}
