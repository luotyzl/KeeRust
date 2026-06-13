import { toast } from "sonner";

// Thin wrapper over sonner so the rest of the app keeps a stable API.
export function showToast(msg: string): void {
  toast(msg);
}

// Copy text to the clipboard and toast the result.
export async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copied`);
  } catch {
    showToast("Copy failed");
  }
}
