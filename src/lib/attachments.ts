import type { AttachmentInfo } from "../types";

export function base64ToBytes(b64: string): Uint8Array {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function downloadAttachment(
  name: string,
  mimeType: string,
  base64Data: string
): void {
  const blob = new Blob([base64ToBytes(base64Data) as unknown as BlobPart], {
    type: mimeType,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type AttachmentPreview =
  | { kind: "text"; text: string }
  | { kind: "image"; src: string }
  | { kind: "none" };

// Decode an attachment into a renderable preview (text / image / unsupported).
export function previewAttachment(att: AttachmentInfo): AttachmentPreview {
  const category = att.mime_type.split("/")[0];
  if (category === "text") {
    const bytes = base64ToBytes(att.data_base64);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return { kind: "text", text };
  }
  if (category === "image") {
    return {
      kind: "image",
      src: `data:${att.mime_type};base64,${att.data_base64}`,
    };
  }
  return { kind: "none" };
}
