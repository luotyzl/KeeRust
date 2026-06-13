<script setup lang="ts">
import { Moon, Sun } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/composables/useTheme";

const { theme, toggle } = useTheme();
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    :title="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
    aria-label="Toggle theme"
    @click="toggle"
  >
    <Sun v-if="theme === 'dark'" />
    <Moon v-else />
  </Button>
</template>
