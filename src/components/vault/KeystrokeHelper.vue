<script setup lang="ts">
// Clickable token palette shown under the keystrokes input. Emits the token to
// insert; the parent owns the input and performs the cursor insertion.
const emit = defineEmits<{ (e: "insert", token: string): void }>();

const FIELD_TOKENS = [
  "{TITLE}", "{USERNAME}", "{URL}", "{PASSWORD}", "{NOTES}", "{GROUP}",
  "{TOTP}", "{S:Custom Field Name}",
];
const MOD_TOKENS = [
  { label: "+ (shift)", ins: "+" },
  { label: "% (alt)", ins: "%" },
  { label: "^ (ctrl)", ins: "^" },
];
const KEY_TOKENS = [
  "{TAB}", "{ENTER}", "{SPACE}", "{DELAY=ms}", "{UP}", "{DOWN}", "{LEFT}", "{RIGHT}", "{HOME}", "{END}",
  "{+}", "{%}", "{^}", "{~}", "{(}", "{)}", "{[}", "{]}", "{{}", "{}}",
];

// mousedown + preventDefault so clicking a token doesn't blur the input.
function pick(ev: MouseEvent, token: string): void {
  ev.preventDefault();
  emit("insert", token);
}
</script>

<template>
  <div class="at-helper">
    <div class="at-helper-block">
      <div class="at-helper-head">
        <span>Entry fields:</span>
        <a
          class="at-helper-more"
          href="https://keepass.info/help/base/autotype.html"
          target="_blank"
          rel="noreferrer"
          >more…</a
        >
      </div>
      <div class="at-helper-tokens">
        <a v-for="t in FIELD_TOKENS" :key="t" @mousedown="pick($event, t)">{{ t }}</a>
      </div>
    </div>
    <div class="at-helper-block">
      <div class="at-helper-head"><span>Modifier keys:</span></div>
      <div class="at-helper-tokens">
        <a v-for="m in MOD_TOKENS" :key="m.ins" @mousedown="pick($event, m.ins)">{{
          m.label
        }}</a>
      </div>
    </div>
    <div class="at-helper-block">
      <div class="at-helper-head"><span>Keys:</span></div>
      <div class="at-helper-tokens">
        <a v-for="t in KEY_TOKENS" :key="t" @mousedown="pick($event, t)">{{ t }}</a>
      </div>
    </div>
  </div>
</template>
