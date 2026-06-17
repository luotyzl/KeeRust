// Client-side password generator + strength estimate for the entry form.
// Character ranges and presets mirror KeeWeb's generator.

export const CharRanges = {
  // "I"/"O" omitted from upper, "l"/"o" from lower, "0" from digits to avoid
  // the visually ambiguous characters (those live in the `ambiguous` range).
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lower: "abcdefghijkmnpqrstuvwxyz",
  digits: "123456789",
  special: "!@#$%^&*_+-=,./?;:`\"~'\\",
  brackets: "(){}[]<>",
  high: "¡¢£¤¥¦§©ª«¬®¯°±²³´µ¶¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþ",
  ambiguous: "O0oIl",
} as const;

export type RangeKey = keyof typeof CharRanges;

export const RANGE_KEYS: RangeKey[] = [
  "upper",
  "lower",
  "digits",
  "special",
  "brackets",
  "high",
  "ambiguous",
];

export interface GenOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  special: boolean;
  brackets: boolean;
  high: boolean;
  ambiguous: boolean;
}

export const DEFAULT_GEN: GenOptions = {
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  special: false,
  brackets: false,
  high: false,
  ambiguous: false,
};

export interface Preset extends GenOptions {
  name: string;
  title: string;
}

const base: Omit<GenOptions, "length"> = {
  upper: false,
  lower: false,
  digits: false,
  special: false,
  brackets: false,
  high: false,
  ambiguous: false,
};

export const PRESETS: Preset[] = [
  { name: "Default", title: "Default", ...base, length: 16, upper: true, lower: true, digits: true },
  {
    name: "Strong",
    title: "Strong",
    ...base,
    length: 24,
    upper: true,
    lower: true,
    digits: true,
    special: true,
    brackets: true,
  },
  {
    name: "Long",
    title: "Long",
    ...base,
    length: 32,
    upper: true,
    lower: true,
    digits: true,
  },
  { name: "PIN", title: "PIN", ...base, length: 4, digits: true },
  { name: "Hex", title: "Hex", ...base, length: 32, upper: true, digits: true },
];

// Uniform random integer in [0, n) via rejection sampling (no modulo bias).
function randomInt(n: number): number {
  if (n <= 1) return 0;
  const max = Math.floor(256 / n) * n;
  const buf = new Uint8Array(1);
  let v: number;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= max);
  return v % n;
}

export function generatePassword(opts: GenOptions): string {
  const ranges = RANGE_KEYS.filter((k) => opts[k]).map((k) => CharRanges[k]);
  if (!ranges.length || opts.length <= 0) return "";

  const combined = ranges.join("");
  const chars: string[] = [];
  for (let i = 0; i < opts.length; i++) {
    // Guarantee at least one character from each selected range, then fill the
    // rest from the combined pool.
    const pool = i < ranges.length ? ranges[i] : combined;
    chars.push(pool[randomInt(pool.length)]);
  }

  // Fisher–Yates shuffle so the guaranteed characters aren't always up front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export interface Strength {
  bits: number;
  label: string;
  // 0..1 for a progress bar
  ratio: number;
  // tailwind class for the bar color
  color: string;
}

// Rough entropy estimate: length × log2(effective charset size).
export function estimateStrength(pw: string): Strength {
  if (!pw) return { bits: 0, label: "Empty", ratio: 0, color: "bg-destructive" };

  let charset = 0;
  if (/[a-z]/.test(pw)) charset += 26;
  if (/[A-Z]/.test(pw)) charset += 26;
  if (/[0-9]/.test(pw)) charset += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) charset += 24;

  const bits = Math.round(pw.length * Math.log2(charset || 1) * 10) / 10;

  let label: string;
  let color: string;
  if (bits < 40) {
    label = "Weak";
    color = "bg-destructive";
  } else if (bits < 60) {
    label = "Fair";
    color = "bg-yellow-500";
  } else if (bits < 80) {
    label = "Good";
    color = "bg-lime-500";
  } else if (bits < 120) {
    label = "Strong";
    color = "bg-green-500";
  } else {
    label = "Very Strong";
    color = "bg-green-500";
  }

  const ratio = Math.min(1, bits / 100);
  return { bits, label, ratio, color };
}
