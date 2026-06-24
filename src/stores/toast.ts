import { toast } from "sonner";

// Thin wrapper over sonner so the rest of the app keeps a stable API.
export function showToast(msg: string): void {
  toast(msg);
}

// A warning that stays until the user dismisses it (e.g. startup problems the
// user should see even if they weren't looking at the screen).
export function showWarning(msg: string): void {
  toast.warning(msg, { duration: Infinity, closeButton: true });
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
