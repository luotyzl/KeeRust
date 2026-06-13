import { reactive } from "vue";

interface ToastState {
  message: string;
  visible: boolean;
}

export const toastState = reactive<ToastState>({
  message: "",
  visible: false,
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(msg: string): void {
  toastState.message = msg;
  toastState.visible = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastState.visible = false;
  }, 1800);
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
