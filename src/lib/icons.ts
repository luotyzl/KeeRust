import type { EntryData } from "../types";

// KDBX built-in icons (indices 0-68, matching KeeWeb's icon order), mapped to
// emoji so we need no icon font. Index = the KDBX IconID.
export const ICON_EMOJI: string[] = [
  "🔑", "🌐", "⚠️", "🗄️", "📌", "💬", "🧩", "📝", "🔌", "🪪", // 0-9
  "📎", "📷", "📶", "🔗", "🔋", "🏷️", "📜", "🎯", "🖥️", "✉️", // 10-19
  "⚙️", "📋", "📨", "📰", "⚡", "📥", "💾", "💽", "🔘", "🔐", // 20-29
  "⌨️", "🖨️", "📊", "🏁", "🔧", "💻", "📦", "💳", "🪟", "⏰", // 30-39
  "🔍", "⚗️", "🎮", "🗑️", "🗒️", "🚫", "❓", "🧊", "📁", "📂", // 40-49
  "🗃️", "🔓", "🔒", "✅", "✏️", "🖼️", "📖", "📃", "🕵️", "🍴", // 50-59
  "🏠", "⭐", "🐧", "📍", "🍎", "📚", "💲", "✍️", "📱", // 60-68
];

export function iconEmoji(id: number): string {
  return ICON_EMOJI[id] || ICON_EMOJI[0];
}

export function hasCustomIcon(e: Pick<EntryData, "custom_icon_base64">): boolean {
  return !!e.custom_icon_base64;
}
