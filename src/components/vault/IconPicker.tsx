import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download } from "lucide-react";
import { ICON_COMPONENTS } from "@/lib/icons";
import { showToast } from "@/stores/toast";
import { cn } from "@/lib/utils";
import type { CustomIconData } from "@/types";

export default function IconPicker({
  selectedIconId,
  selectedCustomUuid,
  customIcons,
  url,
  onSelectBuiltin,
  onSelectCustom,
  onFavicon,
}: {
  selectedIconId: number;
  selectedCustomUuid: string | null;
  customIcons: CustomIconData[];
  url: string;
  onSelectBuiltin: (id: number) => void;
  onSelectCustom: (uuid: string) => void;
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
      {url.trim() && (
        <button
          type="button"
          disabled={fetching}
          onClick={getFavicon}
          className="text-primary hover:bg-muted flex w-full items-center justify-center gap-2 rounded-md border border-dashed py-2 text-xs disabled:opacity-60"
        >
          <Download className="size-3.5" />
          {fetching ? "Fetching favicon…" : "Download favicon from URL"}
        </button>
      )}
      <div className="grid max-h-48 grid-cols-10 gap-1 overflow-y-auto">
        {ICON_COMPONENTS.map((Icon, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelectBuiltin(i)}
            className={cn(
              "hover:bg-muted flex aspect-square items-center justify-center rounded-md border border-transparent",
              i === selectedIconId && selectedCustomUuid === null && "border-ring bg-muted"
            )}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>

      {customIcons.length > 0 && (
        <>
          <div className="text-muted-foreground px-0.5 text-[0.65rem] font-medium tracking-wide uppercase">
            Custom icons
          </div>
          <div className="grid max-h-32 grid-cols-10 gap-1 overflow-y-auto">
            {customIcons.map((ci) => (
              <button
                key={ci.uuid}
                type="button"
                title="Custom icon"
                onClick={() => onSelectCustom(ci.uuid)}
                className={cn(
                  "hover:bg-muted flex aspect-square items-center justify-center rounded-md border border-transparent p-0.5",
                  ci.uuid === selectedCustomUuid && "border-ring bg-muted"
                )}
              >
                <img
                  className="size-full rounded-sm object-contain"
                  src={`data:image/png;base64,${ci.base64}`}
                  alt=""
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
