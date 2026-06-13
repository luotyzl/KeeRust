<script setup lang="ts">
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { store, applySource } from "@/store";
import type { VaultSource, WebDavConfig } from "@/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ThemeToggle from "@/components/ThemeToggle.vue";

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
  <div class="relative flex min-h-screen items-center justify-center p-6">
    <div class="absolute top-4 right-4">
      <ThemeToggle />
    </div>

    <Card class="w-full max-w-md">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl tracking-tight">KeeRust</CardTitle>
        <CardDescription>KeePass for desktop</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <Button
          variant="secondary"
          class="w-full"
          :disabled="pickingLocal"
          @click="pickLocal"
        >
          📂 Open Local File…
        </Button>

        <div
          class="text-muted-foreground flex items-center gap-3 text-xs tracking-wider uppercase"
        >
          <span class="bg-border h-px flex-1"></span>
          or via WebDAV
          <span class="bg-border h-px flex-1"></span>
        </div>

        <form class="space-y-4" novalidate @submit.prevent="submit">
          <div class="space-y-1.5">
            <Label for="dav-url">WebDAV URL</Label>
            <Input
              id="dav-url"
              v-model="url"
              type="url"
              placeholder="https://cloud.example.com/vault.kdbx"
              autocomplete="off"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="dav-user">Username</Label>
            <Input id="dav-user" v-model="username" type="text" autocomplete="off" />
          </div>
          <div class="space-y-1.5">
            <Label for="dav-pass">Password</Label>
            <Input
              id="dav-pass"
              v-model="password"
              type="password"
              autocomplete="off"
            />
          </div>
          <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
          <Button type="submit" class="w-full" :disabled="saving">
            {{ saving ? "Saving…" : "Save & Continue" }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
