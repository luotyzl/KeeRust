import { createStore } from "../lib/store";

interface ToastState {
  message: string;
  visible: boolean;
}

export const toastStore = createStore<ToastState>({
  message: "",
  visible: false,
});

export const useToast = toastStore.use;

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(msg: string): void {
  toastStore.setState({ message: msg, visible: true });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastStore.setState({ visible: false }), 1800);
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
