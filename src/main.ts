import { createApp } from "vue";
import App from "./App.vue";
import "./composables/useTheme"; // apply saved theme before first paint
import "./index.css"; // Tailwind + shadcn-vue theme tokens
import "vue-sonner/style.css"; // toast styles
import "./styles.css"; // legacy layout styles (wrapped in @layer base)

createApp(App).mount("#app");
