import { useState } from "react";
import { Copy, ExternalLink, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/stores/toast";

export default function DetailField({
  label,
  value,
  isPassword,
  isUrl,
}: {
  label: string;
  value: string;
  isPassword?: boolean;
  isUrl?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  if (!value) return null;

  const masked = isPassword && !revealed;

  return (
    <div className="space-y-1.5">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </div>
      <div className="bg-muted/40 flex items-center gap-1 rounded-md border px-3 py-1.5">
        <span
          className={
            "font-mono-code flex-1 truncate text-sm " +
            (masked ? "text-muted-foreground tracking-[0.2em]" : "")
          }
        >
          {masked ? "••••••••••••" : value}
        </span>
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
        <Button
          variant="ghost"
          size="icon-sm"
          title="Copy"
          onClick={() => copyText(value, label)}
        >
          <Copy />
        </Button>
        {isUrl && (
          <Button
            variant="ghost"
            size="icon-sm"
            title="Open"
            onClick={() => window.open(value, "_blank")}
          >
            <ExternalLink />
          </Button>
        )}
      </div>
    </div>
  );
}
