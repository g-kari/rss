/** Archive raster data URLs without permitting data: URLs in the shared sanitizer. */
import { parseHTML } from "linkedom/worker";
import { userKey } from "./r2";
import { pMap } from "./concurrency";
import { MAX_CLIP_HTML_BYTES } from "./clip";

export interface ClipImage {
  id: string;
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
}
export class InvalidClipImageError extends Error {}
const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
export const clipImageKey = (userId: string, id: string) => userKey(userId, `clip-images/${id}`);
export const isClipImageType = (value: string) => TYPES.has(value);

function hasSignature(bytes: Uint8Array, type: string): boolean {
  const starts = (expected: number[]) => expected.every((byte, i) => bytes[i] === byte);
  if (type === "image/png") return starts([137, 80, 78, 71, 13, 10, 26, 10]);
  if (type === "image/jpeg") return starts([255, 216, 255]);
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (type === "image/gif") return ["GIF87a", "GIF89a"].includes(ascii(0, 6));
  return type === "image/webp" && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
}

export async function prepareClipImages(
  html: string,
): Promise<{ html: string; images: ClipImage[] }> {
  const { document } = parseHTML(html);
  const images = new Map<string, ClipImage>();
  const urls = new Map<string, string>();
  let total = 0;
  for (const image of Array.from(document.querySelectorAll("img"))) {
    const src = image.getAttribute("src") ?? "";
    if (!/^data:/i.test(src)) continue;
    let id = urls.get(src);
    if (!id) {
      const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=\s]+)$/i.exec(src);
      if (!match)
        throw new InvalidClipImageError(
          "埋め込み画像はPNG・JPEG・GIF・WebPに対応しています。SVG等の画像を除いて保存してください。",
        );
      let decoded: string;
      try {
        decoded = atob(match[2].replace(/\s/g, ""));
      } catch {
        throw new InvalidClipImageError("埋め込み画像のデータが不正です");
      }
      const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
      const contentType = match[1].toLowerCase();
      if (!hasSignature(bytes, contentType))
        throw new InvalidClipImageError("埋め込み画像の形式と実データが一致しません");
      total += bytes.byteLength;
      if (images.size >= 128 || total > MAX_CLIP_HTML_BYTES)
        throw new InvalidClipImageError("埋め込み画像は128種類・合計5MiBまで保存できます");
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      id = Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
      images.set(id, { id, bytes, contentType });
      urls.set(src, id);
    }
    image.setAttribute("src", `https://singlefile.invalid/${id}`);
    image.removeAttribute("srcset");
    // A picture's source can override the saved img in browsers.
    if (image.parentElement?.tagName.toLowerCase() === "picture") {
      for (const source of Array.from(image.parentElement.querySelectorAll("source")))
        source.remove();
    }
  }
  return { html: document.toString(), images: [...images.values()] };
}

/** Called after extraction/sanitization. Restore only references to inspected raster bytes. */
export function restoreClipImageUrls(content: string, images: ClipImage[]): string {
  let result = content;
  for (const image of images) {
    const placeholder = `https://singlefile.invalid/${image.id}`;
    const path = `/api/clip/images/${image.id}`;
    result = result.replaceAll(`/api/image-proxy?url=${encodeURIComponent(placeholder)}`, path);
    result = result.replaceAll(placeholder, path);
  }
  return result;
}

export async function saveClipImages(
  bucket: R2Bucket,
  userId: string,
  images: ClipImage[],
): Promise<void> {
  await pMap(
    images,
    async (image) => {
      await bucket.put(clipImageKey(userId, image.id), image.bytes, {
        httpMetadata: { contentType: image.contentType },
      });
    },
    4,
  );
}
