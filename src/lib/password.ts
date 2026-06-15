// Small client-side password generator + strength estimate for the entry form.

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?";

export interface GenOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
}

export const DEFAULT_GEN: GenOptions = {
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
};

export function generatePassword(opts: GenOptions): string {
  let pool = "";
  if (opts.lower) pool += LOWER;
  if (opts.upper) pool += UPPER;
  if (opts.digits) pool += DIGITS;
  if (opts.symbols) pool += SYMBOLS;
  if (!pool) pool = LOWER + UPPER + DIGITS;

  const out: string[] = [];
  const rnd = new Uint32Array(opts.length);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < opts.length; i++) {
    out.push(pool[rnd[i] % pool.length]);
  }
  return out.join("");
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
  } else {
    label = "Strong";
    color = "bg-green-500";
  }

  const ratio = Math.min(1, bits / 100);
  return { bits, label, ratio, color };
}
