import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download } from "lucide-react";
import { ICON_EMOJI } from "@/lib/icons";
import { showToast } from "@/stores/toast";
import { cn } from "@/lib/utils";

export default function IconPicker({
  selectedIconId,
  url,
  onSelectBuiltin,
  onFavicon,
}: {
  selectedIconId: number;
  url: string;
  onSelectBuiltin: (id: number) => void;
  onFavicon: (base64: string) => void;
}) {
  const [fetching, setFetching] = useState(false);

  async function getFavicon() {
    const u = url.trim();
    if (!u) {
      showToast("Enter a URL first");
      return;
    }
    setFetching(true);
    try {
      const b64 = await invoke<string>("fetch_favicon", { url: u });
      onFavicon(b64);
      showToast("Favicon downloaded");
    } catch (err) {
      showToast("Favicon failed: " + String(err));
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="bg-muted/40 mt-2 space-y-2 rounded-md border p-2">
      <button
        type="button"
        disabled={fetching}
        onClick={getFavicon}
        className="text-primary hover:bg-accent flex w-full items-center justify-center gap-2 rounded-md border border-dashed py-2 text-xs disabled:opacity-60"
      >
        <Download className="size-3.5" />
        {fetching ? "Fetching favicon…" : "Download favicon from URL"}
      </button>
      <div className="grid max-h-48 grid-cols-10 gap-1 overflow-y-auto">
        {ICON_EMOJI.map((emoji, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelectBuiltin(i)}
            className={cn(
              "hover:bg-accent flex aspect-square items-center justify-center rounded-md border border-transparent text-base",
              i === selectedIconId && "border-ring bg-accent"
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
