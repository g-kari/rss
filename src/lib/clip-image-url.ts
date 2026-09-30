/** Only server-owned, authenticated clip image paths may bypass the external image proxy. */
export function isClipImageUrl(value: unknown): boolean {
  return typeof value === "string" && /^\/api\/clip\/images\/[a-f0-9]{64}$/.test(value);
}
