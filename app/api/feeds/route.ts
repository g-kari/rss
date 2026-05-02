import { NextResponse } from "next/server";
import { withSession, withJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { checkAndUpdateCooldown } from "@/lib/rate-limit";
import { feedAddCooldownKey } from "@/lib/r2";
import { isValidFeedUrl } from "@/lib/url";
import { discoverFeedUrl } from "@/lib/feed-discovery";
import { resolveRSSHubUrl, getRSSHubInstance } from "@/lib/rsshub";
import { inferFeedFromUrl } from "@/lib/llm-feed-generator";
import { parseHTML } from "linkedom";
import {
  computeFeedHash,
  computePrivateFeedHash,
  getOrCreateFeedMeta,
  writeFeedMeta,
  readFeedMeta,
  readUserSubscriptions,
  writeUserSubscriptions,
  assembleClientFeed,
  pMap,
  MAX_FEEDS_PER_USER,
} from "@/lib/shared-feed";
import type { SelectorConfig } from "@/types";
import { registerAndFetchFeed } from "@/cron/fetch";
import type { UserSubscription } from "@/types";

const LAST_ACCESSED_UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 時間

export async function GET(request: Request) {
  return withSession(request, async ({ session, env, ctx }) => {
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
    const metas = await pMap(subs, (s) => readFeedMeta(env.RSS_DATA, s.feedHash));
    const feeds = subs.flatMap((sub, i) => {
      const meta = metas[i];
      return meta ? [assembleClientFeed(meta, sub)] : [];
    });
    return NextResponse.json(feeds);
  });
}

/** Cookie ヘッダー値として安全な文字列か検証する（HTTP ヘッダーインジェクション・Cookie jar poison 防止） */
function isValidCookieHeader(value: string): boolean {
  // 長さ上限を 2000 文字に制限（HTTP ヘッダー全体 8KB 制限に対して余裕を確保）
  if (value.length > 2000) return false;
  // CRLF インジェクション対策: \r \n を明示的に拒否（ヘッダー分割攻撃の防止）
  if (/[\r\n]/.test(value)) return false;
  // [\x20-\x7E] は印字可能 ASCII のみ許容し、制御文字を除外する
  if (!/^[\x20-\x7E]*$/.test(value)) return false;
  // RFC 6265 準拠: name=value ペアの形式検証（複数は "; " で区切る）
  const pairs = value.split(/;\s*/);
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx <= 0) return false; // name が空または "=" がない
    const name = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1);
    // name: RFC 2616 token 文字のみ（空白・制御文字・区切り文字を禁止）
    if (!/^[\w\-!#$%&'*+.^`|~]+$/.test(name)) return false;
    // value: セミコロン・カンマを禁止して Cookie jar poisoning を防止
    if (/[;,]/.test(val)) return false;
  }
  return true;
}

export async function POST(request: Request) {
  return withJsonBody<{
    url?: unknown;
    cookie?: unknown;
    cssSelector?: unknown;
    useRsshub?: unknown;
  }>(request, async ({ body, session, env, ctx }) => {
    const limited = await checkAndUpdateCooldown(
      env.RATE_LIMIT,
      feedAddCooldownKey(session.userId),
      30 * 100,
    );
    if (limited) return limited;

    let url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) return apiError("url is required", 400, { code: "INVALID_URL" });
    if (!isValidFeedUrl(url))
      return apiError("Invalid URL: must be http or https", 400, { code: "INVALID_URL" });

    // RSSHub 対応サイトの URL は RSSHub エンドポイントに変換してから探索に進む。
    // これにより RSS を提供していない Twitter / YouTube / GitHub 等も購読可能になる。
    // UI 側のチェックボックスでオプトアウト可能（body.useRsshub === false で無効化）。
    // 未指定 (undefined) はデフォルト ON 扱い、既存クライアントとの後方互換性を保つ。
    const useRsshub = body?.useRsshub !== false;
    if (useRsshub) {
      // ACCESS_KEY はここでは付与しない。保存 URL に key を含めると R2 / クライアントに
      // 漏洩するため、fetch 層 (cron/fetch.ts) で appendAccessKeyIfRsshub により動的付与する。
      const rsshubMatch = resolveRSSHubUrl(url, getRSSHubInstance());
      if (rsshubMatch && isValidFeedUrl(rsshubMatch.rsshubUrl)) {
        url = rsshubMatch.rsshubUrl;
      }
    }

    const cookie = typeof body?.cookie === "string" ? body.cookie.trim() : undefined;
    if (cookie && !isValidCookieHeader(cookie)) {
      return apiError("Invalid cookie value", 400, { code: "INVALID_COOKIE" });
    }

    const manualCssSelector =
      typeof body?.cssSelector === "string" ? body.cssSelector.trim() : undefined;
    if (manualCssSelector !== undefined) {
      if (manualCssSelector.length === 0 || manualCssSelector.length > 500) {
        return apiError("cssSelector は 1〜500 文字で指定してください", 400, {
          code: "INVALID_SELECTOR",
        });
      }
      // CSS セレクタとして構文が有効か検証する
      try {
        const { document: testDoc } = parseHTML("<html></html>") as { document: Document };
        testDoc.querySelectorAll(manualCssSelector);
      } catch {
        return apiError("無効な CSS セレクタです", 400, { code: "INVALID_SELECTOR" });
      }
    }

    // 3 段階フォールバック: RSS 探索 → 手動 CSS セレクタ → LLM CSS セレクタ推論
    const discovered = await discoverFeedUrl(url);
    let inferred: { selectors: SelectorConfig; siteTitle: string; siteUrl: string } | null = null;

    if (discovered) {
      url = discovered;
    } else if (manualCssSelector) {
      // ユーザー指定の CSS セレクタを使用
      inferred = {
        selectors: {
          articleLink: manualCssSelector,
          model: "manual",
          generatedAt: new Date().toISOString(),
        },
        siteTitle: new URL(url).hostname,
        siteUrl: url,
      };
    } else {
      // RSS が見つからない場合、LLM でページの CSS セレクタを推論
      inferred = await inferFeedFromUrl(url, env.AI, cookie);
      if (!inferred) {
        return apiError("RSS フィードが見つかりませんでした", 422, {
          code: "FEED_NOT_FOUND",
          hint: "このサイトには RSS がなく、自動認識にも失敗しました。CSS セレクタを手動で指定して再試行できます。",
          canRetryWithSelector: true,
        });
      }
    }

    const feedHash = cookie
      ? await computePrivateFeedHash(url, session.userId)
      : await computeFeedHash(url);

    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    if (subs.some((s) => s.feedHash === feedHash)) {
      return apiError("Feed already exists", 409, { code: "FEED_EXISTS" });
    }
    if (subs.length >= MAX_FEEDS_PER_USER) {
      return apiError(`Feed limit reached (max ${MAX_FEEDS_PER_USER})`, 422, {
        code: "FEED_LIMIT_REACHED",
      });
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
    ctx.waitUntil(
      registerAndFetchFeed(env, url, cookie, cookie ? session.userId : undefined).catch(
        console.error,
      ),
    );

    return NextResponse.json(assembleClientFeed(meta, newSub), { status: 201 });
  });
}
