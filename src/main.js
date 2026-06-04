import { invoke } from "@tauri-apps/api/core";

document.getElementById("greet-btn").addEventListener("click", async () => {
  const msg = await invoke("greet", { name: "World" });
  document.getElementById("greet-msg").textContent = msg;
});
