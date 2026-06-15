import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import { installKeyGuard } from "./lib/keyguard";
import "./index.css";

// Disable the WebView's built-in shortcuts (F5 reload, Ctrl+F find, zoom, …).
installKeyGuard();

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);
