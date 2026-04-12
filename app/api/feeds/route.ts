import { NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { isValidFeedUrl } from "@/lib/url";
import { discoverFeedUrl } from "@/lib/feed-discovery";
import { inferFeedFromUrl } from "@/lib/llm-feed-generator";
import {
  computeFeedHash,
  getOrCreateFeedMeta,
  writeFeedMeta,
  readFeedMeta,
  readUserSubscriptions,
  writeUserSubscriptions,
  assembleClientFeed,
  MAX_FEEDS_PER_USER,
} from "@/lib/shared-feed";
import type { SelectorConfig } from "@/types";
import { registerAndFetchFeed } from "@/cron/fetch";
import type { UserSubscription } from "@/types";

const LAST_ACCESSED_UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 時間

export async function GET() {
  return withSession(async ({ session, env, ctx }) => {
    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);

    // lastAccessedAt を 1 時間スロットル付きで更新（fire-and-forget）
    const now = new Date().toISOString();
    const needsUpdate = subs.some(
      (s) =>
        !s.lastAccessedAt ||
        Date.now() - new Date(s.lastAccessedAt).getTime() > LAST_ACCESSED_UPDATE_INTERVAL_MS,
    );
    if (needsUpdate && subs.length > 0) {
      const updatedSubs = subs.map((s) => ({ ...s, lastAccessedAt: now }));
      ctx.waitUntil(
        writeUserSubscriptions(env.RSS_DATA, session.userId, updatedSubs).catch(console.error),
      );
    }

    // 購読の二重読みを避けるため getUserFeeds の代わりに直接 meta を並列取得
    if (subs.length === 0) return NextResponse.json([]);
    const metas = await Promise.all(subs.map((s) => readFeedMeta(env.RSS_DATA, s.feedHash)));
    const feeds = subs.flatMap((sub, i) => {
      const meta = metas[i];
      return meta ? [assembleClientFeed(meta, sub)] : [];
    });
    return NextResponse.json(feeds);
  });
}

/** Cookie ヘッダー値として安全な文字列か検証する（HTTP ヘッダーインジェクション防止） */
function isValidCookieHeader(value: string): boolean {
  // [\x20-\x7E] は印字可能 ASCII のみ許容し、制御文字（\r\n 含む）を自動的に除外する
  return value.length <= 4096 && /^[\x20-\x7E]*$/.test(value);
}

export async function POST(request: Request) {
  return withSession(async ({ session, env, ctx }) => {
    const parsed = await parseJsonBody<{ url?: unknown; cookie?: unknown }>(request);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;
    let url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
    if (!isValidFeedUrl(url))
      return NextResponse.json({ error: "Invalid URL: must be http or https" }, { status: 400 });

    const cookie = typeof body?.cookie === "string" ? body.cookie.trim() : undefined;
    if (cookie && !isValidCookieHeader(cookie)) {
      return NextResponse.json({ error: "Invalid cookie value" }, { status: 400 });
    }

    // 3 段階フォールバック: RSS 探索 → LLM CSS セレクタ推論
    const discovered = await discoverFeedUrl(url);
    let inferred: { selectors: SelectorConfig; siteTitle: string; siteUrl: string } | null = null;

    if (discovered) {
      url = discovered;
    } else {
      // RSS が見つからない場合、LLM でページの CSS セレクタを推論
      inferred = await inferFeedFromUrl(url, env.AI, cookie);
      if (!inferred) {
        return NextResponse.json({ error: "RSS フィードが見つかりませんでした" }, { status: 422 });
      }
    }

    const feedHash = await computeFeedHash(url);

    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    if (subs.some((s) => s.feedHash === feedHash)) {
      return NextResponse.json({ error: "Feed already exists" }, { status: 409 });
    }
    if (subs.length >= MAX_FEEDS_PER_USER) {
      return NextResponse.json(
        { error: `Feed limit reached (max ${MAX_FEEDS_PER_USER})` },
        { status: 422 },
      );
    }

    // 共有 meta を取得（他ユーザーがすでに登録している場合は既存を流用、なければ新規作成）
    let meta = await getOrCreateFeedMeta(env.RSS_DATA, feedHash, url);

    // LLM 生成フィードの場合、セレクタとサイト情報をメタに保存
    if (inferred && !meta.cssSelectors) {
      meta.cssSelectors = inferred.selectors;
      if (!meta.title) meta.title = inferred.siteTitle;
      if (!meta.siteUrl) meta.siteUrl = inferred.siteUrl;
      await writeFeedMeta(env.RSS_DATA, meta);
    }

    // Cookie はユーザー個別の購読情報に保存する（共有メタには保存しない）
    const newSub: UserSubscription = {
      feedHash,
      url,
      subscribedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      ...(cookie ? { requestCookie: cookie } : {}),
    };
    subs.push(newSub);
    await writeUserSubscriptions(env.RSS_DATA, session.userId, subs);

    // バックグラウンドで初回記事取得（Cookie はユーザー個別で渡す）
    ctx.waitUntil(registerAndFetchFeed(env, url, cookie).catch(console.error));

    return NextResponse.json(assembleClientFeed(meta, newSub), { status: 201 });
  });
}
