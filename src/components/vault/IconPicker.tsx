import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ICON_EMOJI } from "../../lib/icons";
import { showToast } from "../../stores/toast";

export default function IconPicker({
  selectedIconId,
  url,
  onSelectBuiltin,
  onFavicon,
}: {
  selectedIconId: number; // highlighted built-in cell; <0 when a custom icon is active
  url: string; // current entry URL, used as the favicon source
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
    <div className="edit-icon-grid">
      <div className="icon-grid-tools">
        <button
          type="button"
          className="btn-favicon"
          disabled={fetching}
          onClick={getFavicon}
        >
          {fetching ? "Fetching favicon…" : "⬇ Download favicon from URL"}
        </button>
      </div>
      <div className="icon-grid-cells">
        {ICON_EMOJI.map((emoji, i) => (
          <button
            key={i}
            type="button"
            className={"icon-pick" + (i === selectedIconId ? " selected" : "")}
            onClick={() => onSelectBuiltin(i)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
