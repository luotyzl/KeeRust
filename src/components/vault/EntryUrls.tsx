import { Copy, ExternalLink, Link2, MoreHorizontal } from "lucide-react";
import { copyText } from "@/stores/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

// Open the URL the same way an <a target="_blank"> would, so behavior matches
// the clickable link text.
function openUrl(value: string): void {
  const a = document.createElement("a");
  a.href = urlHref(value);
  a.target = "_blank";
  a.rel = "noreferrer";
  a.click();
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
              className="text-primary"
              title="Open in browser"
              onClick={() => openUrl(u.value)}
            >
              <Link2 />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Copy"
              onClick={() => copyText(u.value, u.label)}
            >
              <Copy />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="rounded-full border" title="More">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openUrl(u.value)}>
                  <ExternalLink /> Open in browser
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => copyText(u.value, u.label)}>
                  <Copy /> Copy URL
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
