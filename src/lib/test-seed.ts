/**
 * e2e テスト用 seed エンドポイント (`/api/test/seed`) のリクエストボディ検証。
 *
 * 副作用と切り離してテスト可能にするため、入力検証だけを担う純粋関数。
 * 実際の R2 書き込みは Route Handler 側で行う。
 *
 * **Important**: このモジュールは dev / e2e 限定。production ビルドでは
 * Route Handler 側のガード (`getDevBypassUserId`) で 404 になるため
 * 実際には呼ばれないが、ロジック自体はサニタイズされた値だけ通す。
 */

import { isValidFeedHash } from "./validation";
import { isPlainObject } from "./type-guards";

export interface SeedFeedInput {
  feedHash: string;
  meta: Record<string, unknown>;
  articles: Record<string, unknown>[];
}

export interface SeedSubscriptionInput {
  feedHash: string;
  url: string;
  customTitle?: string;
}

export interface SeedReadStateInput {
  readIds?: string[];
  bookmarkIds?: string[];
  readingListIds?: string[];
  likeIds?: string[];
}

export interface SeedRequest {
  feeds?: SeedFeedInput[];
  subscriptions?: SeedSubscriptionInput[];
  readState?: SeedReadStateInput;
}

export type ValidationResult = { ok: true; data: SeedRequest } | { ok: false; error: string };

const URL_RE = /^https?:\/\//;
const MAX_FEEDS = 50;
const MAX_ARTICLES_PER_FEED = 1000;
const MAX_SUBSCRIPTIONS = 50;
const MAX_ID_ARRAY_LEN = 10000;

// #1283: plain object 判定は type-guards.ts の canonical helper に集約済。
const isObject = isPlainObject;

function validateFeed(input: unknown, idx: number): SeedFeedInput | string {
  if (!isObject(input)) return `feeds[${idx}] is not an object`;
  const { feedHash, meta, articles } = input;
  if (typeof feedHash !== "string" || !isValidFeedHash(feedHash))
    return `feeds[${idx}].feedHash invalid`;
  if (!isObject(meta)) return `feeds[${idx}].meta is not an object`;
  if (!Array.isArray(articles)) return `feeds[${idx}].articles is not an array`;
  if (articles.length > MAX_ARTICLES_PER_FEED)
    return `feeds[${idx}].articles exceeds ${MAX_ARTICLES_PER_FEED}`;
  for (let i = 0; i < articles.length; i++) {
    if (!isObject(articles[i])) return `feeds[${idx}].articles[${i}] is not an object`;
  }
  return { feedHash, meta, articles: articles as Record<string, unknown>[] };
}

function validateSubscription(input: unknown, idx: number): SeedSubscriptionInput | string {
  if (!isObject(input)) return `subscriptions[${idx}] is not an object`;
  const { feedHash, url, customTitle } = input;
  if (typeof feedHash !== "string" || !isValidFeedHash(feedHash))
    return `subscriptions[${idx}].feedHash invalid`;
  if (typeof url !== "string" || !URL_RE.test(url)) return `subscriptions[${idx}].url invalid`;
  const out: SeedSubscriptionInput = { feedHash, url };
  if (customTitle !== undefined) {
    if (typeof customTitle !== "string") return `subscriptions[${idx}].customTitle invalid`;
    out.customTitle = customTitle;
  }
  return out;
}

function validateIdArray(arr: unknown, name: string): string[] | string {
  if (!Array.isArray(arr)) return `${name} is not an array`;
  if (arr.length > MAX_ID_ARRAY_LEN) return `${name} exceeds ${MAX_ID_ARRAY_LEN}`;
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] !== "string") return `${name}[${i}] is not a string`;
  }
  return arr as string[];
}

function validateReadState(input: unknown): SeedReadStateInput | string {
  if (!isObject(input)) return "readState is not an object";
  const out: SeedReadStateInput = {};
  for (const k of ["readIds", "bookmarkIds", "readingListIds", "likeIds"] as const) {
    if (input[k] === undefined) continue;
    const v = validateIdArray(input[k], `readState.${k}`);
    if (typeof v === "string") return v;
    out[k] = v;
  }
  return out;
}

/**
 * seed リクエストボディを検証してサニタイズ済みの SeedRequest を返す。
 * いずれかのフィールドが不正なら `{ ok: false, error }` を返す。
 */
export function validateSeedRequest(body: unknown): ValidationResult {
  if (!isObject(body)) return { ok: false, error: "body is not an object" };

  const result: SeedRequest = {};

  if (body.feeds !== undefined) {
    if (!Array.isArray(body.feeds)) return { ok: false, error: "feeds is not an array" };
    if (body.feeds.length > MAX_FEEDS) return { ok: false, error: `feeds exceeds ${MAX_FEEDS}` };
    const feeds: SeedFeedInput[] = [];
    for (let i = 0; i < body.feeds.length; i++) {
      const v = validateFeed(body.feeds[i], i);
      if (typeof v === "string") return { ok: false, error: v };
      feeds.push(v);
    }
    result.feeds = feeds;
  }

  if (body.subscriptions !== undefined) {
    if (!Array.isArray(body.subscriptions))
      return { ok: false, error: "subscriptions is not an array" };
    if (body.subscriptions.length > MAX_SUBSCRIPTIONS)
      return { ok: false, error: `subscriptions exceeds ${MAX_SUBSCRIPTIONS}` };
    const subs: SeedSubscriptionInput[] = [];
    for (let i = 0; i < body.subscriptions.length; i++) {
      const v = validateSubscription(body.subscriptions[i], i);
      if (typeof v === "string") return { ok: false, error: v };
      subs.push(v);
    }
    result.subscriptions = subs;
  }

  if (body.readState !== undefined) {
    const v = validateReadState(body.readState);
    if (typeof v === "string") return { ok: false, error: v };
    result.readState = v;
  }

  return { ok: true, data: result };
}
