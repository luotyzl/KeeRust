<script setup lang="ts">
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { store, applySource } from "../../store";
import type { VaultSource, WebDavConfig } from "../../types";

const error = ref("");
const pickingLocal = ref(false);
const saving = ref(false);

const url = ref("");
const username = ref("");
const password = ref("");

function goUnlock(source: VaultSource): void {
  applySource(source);
  store.screen = "unlock";
}

async function pickLocal(): Promise<void> {
  error.value = "";
  pickingLocal.value = true;
  try {
    const source = await invoke<VaultSource | null>("open_local_file");
    if (source) goUnlock(source);
  } catch (err) {
    error.value = String(err);
  } finally {
    pickingLocal.value = false;
  }
}

async function submit(): Promise<void> {
  error.value = "";
  const config: WebDavConfig = {
    url: url.value.trim(),
    username: username.value.trim(),
    password: password.value,
  };
  if (!config.url || !config.username || !config.password) {
    error.value = "All fields are required.";
    return;
  }
  if (!config.url.startsWith("https://")) {
    error.value = "URL must start with https://";
    return;
  }
  saving.value = true;
  try {
    await invoke("save_webdav_config", { config });
    goUnlock({ type: "webdav", ...config });
  } catch (err) {
    error.value = String(err);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div id="screen-config" class="screen active">
    <div class="auth-box">
      <div class="logo">
        <h1>KeeRust</h1>
        <p>KeePass for desktop</p>
      </div>
      <h2>Open Database</h2>
      <button type="button" class="btn btn-secondary" :disabled="pickingLocal" @click="pickLocal">
        📂 Open Local File…
      </button>
      <div class="or-divider">or via WebDAV</div>
      <form novalidate @submit.prevent="submit">
        <div class="form-group">
          <label for="dav-url">WebDAV URL</label>
          <input
            id="dav-url"
            v-model="url"
            type="url"
            placeholder="https://cloud.example.com/vault.kdbx"
            autocomplete="off"
          />
        </div>
        <div class="form-group">
          <label for="dav-user">Username</label>
          <input id="dav-user" v-model="username" type="text" autocomplete="off" />
        </div>
        <div class="form-group">
          <label for="dav-pass">Password</label>
          <input id="dav-pass" v-model="password" type="password" autocomplete="off" />
        </div>
        <div class="error" :class="{ visible: error }">{{ error }}</div>
        <button type="submit" class="btn" :disabled="saving">
          {{ saving ? "Saving…" : "Save & Continue" }}
        </button>
      </form>
    </div>
  </div>
</template>
