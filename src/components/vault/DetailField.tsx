import { useState } from "react";
import { copyText } from "../../stores/toast";

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
    <div className="detail-field">
      <div className="detail-label">{label}</div>
      <div className="detail-value">
        <span className={masked ? "masked" : ""}>
          {masked ? "••••••••••••" : value}
        </span>
        {isPassword && (
          <button className="icon-btn" onClick={() => setRevealed((r) => !r)}>
            {revealed ? "Hide" : "Show"}
          </button>
        )}
        <button className="icon-btn" onClick={() => copyText(value, label)}>
          Copy
        </button>
        {isUrl && (
          <button className="icon-btn" onClick={() => window.open(value, "_blank")}>
            Open
          </button>
        )}
      </div>
    </div>
  );
}
