import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn class-merge helper: combine conditional classes and dedupe
// conflicting Tailwind utilities.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
