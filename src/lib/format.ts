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
