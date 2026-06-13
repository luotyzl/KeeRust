import { iconEmoji } from "../../lib/icons";

// Inner content for an avatar circle: a custom PNG if present, else the
// entry's built-in icon emoji. Wrap it with .entry-avatar / .detail-avatar.
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
        className="avatar-img"
        src={`data:image/png;base64,${customIconBase64}`}
        alt=""
      />
    );
  }
  return <span className="avatar-emoji">{iconEmoji(iconId < 0 ? 0 : iconId)}</span>;
}
