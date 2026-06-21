import { Copy } from "lucide-react";
import { copyText } from "@/stores/toast";
import { Button } from "@/components/ui/button";

export interface UrlRow {
  label: string;
  value: string;
}

// A scheme-less value (e.g. "go.xero.com") would be treated as a relative path,
// so normalize to an absolute https URL for navigation.
function urlHref(value: string): string {
  const v = value.trim();
  return /^[a-z][\w+.-]*:\/\//i.test(v) ? v : "https://" + v;
}

export default function EntryUrls({ urls }: { urls: UrlRow[] }) {
  return (
    <div className="space-y-3">
      {urls.map((u, i) => (
        <div key={i} className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="text-muted-foreground text-xs break-words">{u.label}</div>
            <a
              href={urlHref(u.value)}
              target="_blank"
              rel="noreferrer"
              className="text-primary block text-sm break-words hover:underline"
            >
              {u.value}
            </a>
          </div>
          <div className="-mt-1 flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Copy"
              onClick={() => copyText(u.value, u.label)}
            >
              <Copy />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
