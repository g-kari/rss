/** SingleFile's REST Form API contract, with a bounded HTML/legacy JSON reader. */
import { isPrivateHost, isAbsoluteHttpUrl } from "./url";
import { readBodyBytes } from "./fetch";

export const MAX_CLIP_HTML_BYTES = 5 * 1024 * 1024;
const MAX_CLIP_REQUEST_BYTES = MAX_CLIP_HTML_BYTES + 64 * 1024;

type ValidateOk = { ok: true; html: string; url: string };
type ValidateError = { ok: false; error: string };
type ValidateResult = ValidateOk | ValidateError;
type ParseResult = ValidateOk | (ValidateError & { status: number; code: string });

export function validateClipRequest(req: unknown): ValidateResult {
  if (typeof req !== "object" || req === null || Array.isArray(req)) {
    return { ok: false, error: "html と url が必要です" };
  }
  const { html, url } = req as { html?: unknown; url?: unknown };
  if (typeof html !== "string" || html.trim() === "") {
    return { ok: false, error: "html は空でない文字列が必要です" };
  }
  if (
    html.length > MAX_CLIP_HTML_BYTES ||
    new TextEncoder().encode(html).length > MAX_CLIP_HTML_BYTES
  ) {
    return { ok: false, error: "HTML が大きすぎます（上限 5MiB）" };
  }
  if (typeof url !== "string" || url.trim() === "" || url.length > 8192) {
    return { ok: false, error: "url は8192文字以内の空でない文字列が必要です" };
  }
  const trimmed = url.trim();
  if (!isAbsoluteHttpUrl(trimmed)) {
    return { ok: false, error: "url は http:// または https:// で始まる必要があります" };
  }
  try {
    const parsed = new URL(trimmed);
    if (isPrivateHost(parsed.hostname) || parsed.username || parsed.password) {
      return {
        ok: false,
        error: "プライベートネットワークや認証情報付きの URL は許可されていません",
      };
    }
  } catch {
    return { ok: false, error: "url が不正な形式です" };
  }
  return { ok: true, html, url: trimmed };
}

const tooLarge = (): ParseResult => ({
  ok: false,
  status: 413,
  code: "PAYLOAD_TOO_LARGE",
  error: "HTML の上限は5MiBです。SingleFileの保存対象を減らしてください。",
});
const unsupported = (): ParseResult => ({
  ok: false,
  status: 415,
  code: "UNSUPPORTED_CLIP_FORMAT",
  error: "SingleFileのファイル形式を「HTML」にしてください。ZIP・自己解凍ZIPには対応していません。",
});

export async function parseClipRequest(req: Request): Promise<ParseResult> {
  const contentType = req.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mediaType && mediaType !== "multipart/form-data" && mediaType !== "application/json")
    return unsupported();
  const declaredLength = Number(req.headers.get("content-length"));
  if (declaredLength > MAX_CLIP_REQUEST_BYTES) return tooLarge();
  if (!req.body)
    return {
      ok: false,
      status: 400,
      code: "INVALID_CLIP_PAYLOAD",
      error: "html と url が必要です",
    };
  // Do not trust Content-Length; also bound chunked bodies before formData/JSON allocates.
  const bytes = await readBodyBytes(req.body, MAX_CLIP_REQUEST_BYTES);
  if (!bytes) return tooLarge();
  let input: unknown;
  try {
    if (mediaType === "multipart/form-data") {
      const form = await new Response(bytes, {
        headers: { "Content-Type": contentType },
      }).formData();
      if (form.getAll("html").length !== 1 || form.getAll("url").length !== 1) {
        return {
          ok: false,
          status: 400,
          code: "INVALID_CLIP_PAYLOAD",
          error:
            "archive data field name は html、archive URL field name は url に設定してください",
        };
      }
      const file = form.get("html");
      if (file !== null && typeof file !== "string") {
        if (/\.zip(?:\.html)?$/i.test(file.name) || /zip/i.test(file.type)) return unsupported();
        if (file.size > MAX_CLIP_HTML_BYTES) return tooLarge();
      }
      input = { html: typeof file === "string" ? file : await file?.text(), url: form.get("url") };
    } else {
      input = JSON.parse(new TextDecoder().decode(bytes));
    }
  } catch {
    return {
      ok: false,
      status: 400,
      code: mediaType === "multipart/form-data" ? "INVALID_CLIP_PAYLOAD" : "INVALID_JSON",
      error: "HTMLとURLを読み取れませんでした。送信形式とフィールド名を確認してください",
    };
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "html" in input &&
    typeof input.html === "string"
  ) {
    if (
      input.html.startsWith("PK\u0003\u0004") ||
      /<!--\s*SingleFile.*?(?:zip|compressed)/i.test(input.html.slice(0, 2048))
    )
      return unsupported();
    if (new TextEncoder().encode(input.html).length > MAX_CLIP_HTML_BYTES) return tooLarge();
  }
  const result = validateClipRequest(input);
  return result.ok ? result : { ...result, status: 400, code: "INVALID_CLIP_PAYLOAD" };
}
