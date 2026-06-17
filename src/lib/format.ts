// Format an RFC3339/ISO timestamp for the metadata panel. Today/Yesterday are
// shown relative; older dates as DD/MM/YYYY. Always includes the local time.
export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (sameDay(d, now)) return `Today, ${time}`;
  if (sameDay(d, yesterday)) return `Yesterday, ${time}`;

  const date = d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${date}, ${time}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function attachmentIcon(mimeType: string): string {
  const cat = mimeType.split("/")[0];
  const sub = mimeType.split("/")[1] || "";
  if (cat === "image") return "🖼";
  if (cat === "text") return "📄";
  if (sub === "pdf") return "📕";
  return "📎";
}
