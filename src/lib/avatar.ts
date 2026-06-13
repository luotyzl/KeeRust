const AVATAR_COLORS = [
  "#4a90e2", "#7ed321", "#e8741a", "#9b59b6",
  "#e74c3c", "#1abc9c", "#f39c12", "#e91e8c",
];

export function avatarColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function avatarLetter(title: string): string {
  return (title || "?")[0].toUpperCase();
}
