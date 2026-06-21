import type { EntryData } from "@/types";

// An entry is "expired" only when it has an expiry set and that time is in the
// past. `entry.expiry` is a local wall-clock datetime string (see the backend's
// UTC↔local conversion), so `new Date(...)` parses it in the local timezone.
export function isExpired(entry: EntryData): boolean {
  if (!entry.expires || !entry.expiry) return false;
  const d = new Date(entry.expiry);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}
