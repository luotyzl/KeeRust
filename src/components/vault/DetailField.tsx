import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/stores/toast";
import { estimateStrength } from "@/lib/password";

export default function DetailField({
  label,
  value,
  isPassword,
  isUrl,
  noStrength,
}: {
  label: string;
  value: string;
  isPassword?: boolean;
  isUrl?: boolean;
  // Skip the strength meter (e.g. for protected custom fields).
  noStrength?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  if (!value) return null;

  const masked = isPassword && !revealed;
  const strength = isPassword && !noStrength ? estimateStrength(value) : null;

  return (
    // Double-click anywhere in the field (including empty space) copies the
    // value — same as clicking the copy button.
    <div
      className="space-y-1"
      onDoubleClick={() => copyText(value, label)}
      title="Double-click to copy"
    >
      <div className="text-muted-foreground text-xs break-words">{label}</div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {isUrl ? (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-primary block text-sm break-words hover:underline"
            >
              {value}
            </a>
          ) : (
            <div
              className={
                "font-mono-code text-sm break-words " +
                (masked ? "text-muted-foreground tracking-[0.2em]" : "")
              }
            >
              {masked ? "••••••••••••" : value}
            </div>
          )}
        </div>
        <div className="-mt-1.5 flex shrink-0 items-center">
          {isPassword && (
            <Button
              variant="ghost"
              size="icon-sm"
              title={revealed ? "Hide" : "Show"}
              onClick={() => setRevealed((r) => !r)}
            >
              {revealed ? <EyeOff /> : <Eye />}
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" title="Copy" onClick={() => copyText(value, label)}>
            <Copy />
          </Button>
        </div>
      </div>

      {strength && (
        <div className="space-y-0.5">
          <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
            <div
              className={"h-full rounded-full transition-all " + strength.color}
              style={{ width: `${Math.max(5, strength.ratio * 100)}%` }}
            />
          </div>
          <div className="text-muted-foreground text-right text-xs">
            {strength.label} ({value.length} chars / {strength.bits} bits)
          </div>
        </div>
      )}
    </div>
  );
}
