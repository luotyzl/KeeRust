<script setup lang="ts">
import { ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { store, sourceLabel } from "../../store";
import { resumePendingAutotype } from "../../composables/useAutotype";
import type { VaultData } from "../../types";

const error = ref("");
const password = ref("");
const unlocking = ref(false);
const passInput = ref<HTMLInputElement | null>(null);

async function submit(): Promise<void> {
  error.value = "";
  if (!password.value) {
    error.value = "Password is required.";
    return;
  }
  unlocking.value = true;
  try {
    const vault = await invoke<VaultData>("open_database", {
      password: password.value,
    });
    store.vaultData = vault;
    store.masterPassword = password.value;
    store.selectedGroupUuid = vault.groups[0]?.uuid ?? null;
    store.selectedEntryUuid = null;
    store.searchQuery = "";
    store.editMode = false;
    store.screen = "vault";
    password.value = "";

    // If an auto-type hotkey arrived while locked, resume it now.
    await resumePendingAutotype();
  } catch (err) {
    error.value = String(err);
    passInput.value?.select();
  } finally {
    unlocking.value = false;
  }
}

function changeDb(): void {
  store.screen = "config";
}

onMounted(() => passInput.value?.focus());
</script>

<template>
  <div id="screen-unlock" class="screen active">
    <div class="auth-box">
      <div class="logo">
        <h1>KeeRust</h1>
        <p>Enter your master password</p>
      </div>
      <div class="vault-source">{{ sourceLabel() }}</div>
      <form novalidate @submit.prevent="submit">
        <div class="form-group">
          <label for="master-pass">Master Password</label>
          <input
            id="master-pass"
            ref="passInput"
            v-model="password"
            type="password"
            autocomplete="off"
          />
        </div>
        <div class="error" :class="{ visible: error }">{{ error }}</div>
        <button type="submit" class="btn" :disabled="unlocking">
          {{ unlocking ? "Unlocking…" : "Unlock" }}
        </button>
      </form>
      <button class="link-btn" @click="changeDb">Change database</button>
    </div>
  </div>
</template>
