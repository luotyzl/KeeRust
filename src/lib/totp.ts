export interface OtpParams {
  secret: string;
  period: number;
  digits: number;
  algorithm: string;
}

function base32Decode(str: string): ArrayBuffer {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  str = str.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const c of str) {
    const idx = chars.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output).buffer;
}

export function parseOtpUri(uri: string): OtpParams {
  try {
    const url = new URL(uri);
    const params = new URLSearchParams(url.search);
    return {
      secret: params.get("secret") || "",
      period: parseInt(params.get("period") || "30", 10),
      digits: parseInt(params.get("digits") || "6", 10),
      algorithm: (params.get("algorithm") || "SHA1").toUpperCase(),
    };
  } catch {
    // bare secret fallback
    return { secret: uri, period: 30, digits: 6, algorithm: "SHA1" };
  }
}

export async function computeTOTP(
  secret: string,
  period: number,
  digits: number,
  algorithm = "SHA1"
): Promise<string | null> {
  const keyData = base32Decode(secret);
  if (!keyData || keyData.byteLength === 0) return null;

  const counter = Math.floor(Date.now() / 1000 / period);
  const buf = new ArrayBuffer(8);
  new DataView(buf).setUint32(4, counter >>> 0, false);

  const hashMap: Record<string, string> = {
    SHA1: "SHA-1",
    SHA256: "SHA-256",
    SHA512: "SHA-512",
  };
  const hash = hashMap[algorithm] || "SHA-1";
  const algo = { name: "HMAC", hash };
  const key = await crypto.subtle.importKey("raw", keyData, algo, false, [
    "sign",
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));

  const offset = sig[sig.length - 1] & 0xf;
  const code =
    (((sig[offset] & 0x7f) << 24) |
      ((sig[offset + 1] & 0xff) << 16) |
      ((sig[offset + 2] & 0xff) << 8) |
      (sig[offset + 3] & 0xff)) %
    Math.pow(10, digits);

  return String(code).padStart(digits, "0");
}
