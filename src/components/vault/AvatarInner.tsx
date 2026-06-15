import { iconEmoji } from "@/lib/icons";

// Inner content for an avatar tile: a custom PNG if present, else the entry's
// built-in icon emoji. The parent sets the tile size / background / text size.
export default function AvatarInner({
  iconId,
  customIconBase64,
}: {
  iconId: number;
  customIconBase64?: string | null;
}) {
  if (customIconBase64) {
    return (
      <img
        className="size-full rounded-[inherit] object-contain"
        src={`data:image/png;base64,${customIconBase64}`}
        alt=""
      />
    );
  }
  return <span className="leading-none">{iconEmoji(iconId < 0 ? 0 : iconId)}</span>;
}
