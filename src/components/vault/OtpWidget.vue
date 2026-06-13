<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { parseOtpUri, computeTOTP } from "../../lib/totp";
import { copyText } from "../../composables/useToast";

const props = defineProps<{ otpUri: string }>();

const code = ref("------");
const pct = ref(100);
const remaining = ref(0);
const barClass = ref("");

let timer: ReturnType<typeof setInterval> | undefined;
const params = parseOtpUri(props.otpUri);

async function refresh(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now % params.period;
  const rem = params.period - elapsed;
  remaining.value = rem;
  pct.value = (rem / params.period) * 100;
  barClass.value = rem <= 5 ? "danger" : rem <= 10 ? "warn" : "";

  // Only recompute the code on a new period boundary (or first run).
  if (elapsed === 0 || code.value === "------") {
    const c = await computeTOTP(
      params.secret,
      params.period,
      params.digits,
      params.algorithm
    );
    code.value = c || "------";
  }
}

async function copyCode(): Promise<void> {
  if (code.value && code.value !== "------") await copyText(code.value, "OTP");
}

onMounted(() => {
  if (!params.secret) return;
  refresh();
  timer = setInterval(refresh, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="detail-field">
    <div class="detail-label">One-Time Password</div>
    <div class="otp-widget">
      <span class="otp-code">{{ code }}</span>
      <div class="otp-progress">
        <div class="otp-bar" :class="barClass" :style="{ width: pct + '%' }"></div>
      </div>
      <span class="otp-secs">{{ remaining }}s</span>
      <button class="icon-btn" @click="copyCode">Copy</button>
    </div>
  </div>
</template>
