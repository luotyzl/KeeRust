<script setup lang="ts">
import { ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { store, sourceLabel } from "@/store";
import { resumePendingAutotype } from "@/composables/useAutotype";
import type { VaultData } from "@/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ThemeToggle from "@/components/ThemeToggle.vue";

const error = ref("");
const password = ref("");
const unlocking = ref(false);
const passInput = ref<InstanceType<typeof Input> | null>(null);

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
  } finally {
    unlocking.value = false;
  }
}

function changeDb(): void {
  store.screen = "config";
}

onMounted(() => {
  // Focus the password field (Input is a component, so reach its root el).
  const el = (passInput.value as unknown as { $el?: HTMLInputElement })?.$el;
  el?.focus?.();
});
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center p-6">
    <div class="absolute top-4 right-4">
      <ThemeToggle />
    </div>

    <Card class="w-full max-w-md">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl tracking-tight">KeeRust</CardTitle>
        <CardDescription>Enter your master password</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <p
          v-if="sourceLabel()"
          class="text-muted-foreground text-center text-xs break-all"
        >
          {{ sourceLabel() }}
        </p>
        <form class="space-y-4" novalidate @submit.prevent="submit">
          <div class="space-y-1.5">
            <Label for="master-pass">Master Password</Label>
            <Input
              id="master-pass"
              ref="passInput"
              v-model="password"
              type="password"
              autocomplete="off"
            />
          </div>
          <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
          <Button type="submit" class="w-full" :disabled="unlocking">
            {{ unlocking ? "Unlocking…" : "Unlock" }}
          </Button>
        </form>
      </CardContent>
      <CardFooter class="justify-center">
        <Button variant="link" class="text-muted-foreground" @click="changeDb">
          Change database
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>
