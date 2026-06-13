import { ref, watch } from "vue";

export type Theme = "light" | "dark";

const STORAGE_KEY = "keerust-theme";

function initialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "dark" ? "dark" : "light"; // default light
}

const theme = ref<Theme>(initialTheme());

function apply(t: Theme): void {
  document.documentElement.classList.toggle("dark", t === "dark");
}

// Keep the <html> class and localStorage in sync with the ref.
watch(theme, (t) => {
  apply(t);
  localStorage.setItem(STORAGE_KEY, t);
});

// Apply immediately on module load so there's no flash before mount.
apply(theme.value);

export function useTheme() {
  function toggle(): void {
    theme.value = theme.value === "dark" ? "light" : "dark";
  }
  function setTheme(t: Theme): void {
    theme.value = t;
  }
  return { theme, toggle, setTheme };
}
