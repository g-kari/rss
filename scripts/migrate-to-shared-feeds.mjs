/**
 * 旧ストレージ → 共有フィードストレージ マイグレーションスクリプト
 *
 * 旧構造:
 *   users/{userId}/feeds.json      — Feed[] (ユーザーごと)
 *   users/{userId}/articles.json   — Article[] (ユーザーごと、max 500)
 *   users/{userId}/read-state.json — { readIds, bookmarkIds, readingListIds }
 *
 * 新構造:
 *   feeds/{feedHash}/meta.json              — SharedFeedMeta
 *   feeds/{feedHash}/articles/latest.json   — Article[] (最新 PAGE_SIZE 件)
 *   feeds/{feedHash}/articles/p{N}.json     — Article[] (古いページ)
 *   users/{userId}/subscriptions.json       — UserSubscription[]
 *   users/{userId}/read-state.json          — (既読 ID を新 ID に変換)
 *   users/{userId}/id-migration.json        — 旧 UUID → 新 ID マッピング
 *
 * 使い方:
 *   npx wrangler r2 object get rss-reader-data --list-prefix "users/"  # データ確認
 *   node scripts/migrate-to-shared-feeds.mjs --dry-run                 # ドライラン
 *   node scripts/migrate-to-shared-feeds.mjs                           # 実行
 *
 * 注意:
 *   - 旧データは .bak ファイルにリネームして保持される
 *   - wrangler を通さず直接 R2 REST API を使用するため、
 *     環境変数 R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET が必要
 *   - または wrangler.toml の設定を読んで wrangler 経由でアクセスする
 *
 * 実装方針:
 *   このスクリプトは wrangler の設定を直接読まないため、
 *   Cloudflare R2 の S3 互換 API を使用する。
 *   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET を環境変数で指定する。
 */

import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

// ── 引数パース ──────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'user': { type: 'string' },  // 特定ユーザーのみ処理 (デバッグ用)
  },
});

const DRY_RUN = args['dry-run'];
const TARGET_USER = args['user'];

// ── 定数 ──────────────────────────────────────────────────────────

const PAGE_SIZE = 100;
const MAX_PAGES = 500;

// ── R2 ヘルパー (AWS Signature V4 + S3 互換 API) ──────────────────

const R2_ENDPOINT = process.env.R2_ENDPOINT; // 例: https://<account_id>.r2.cloudflarestorage.com
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET ?? 'rss-reader-data';
const R2_REGION = 'auto';

if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('環境変数 R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY を設定してください');
  console.error('');
  console.error('取得方法:');
  console.error('  Cloudflare Dashboard → R2 → Manage R2 API tokens');
  console.error('  R2_ENDPOINT = https://<account_id>.r2.cloudflarestorage.com');
  process.exit(1);
}

async function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

/** AWS Signature V4 署名ヘッダーを生成 */
async function signRequest(method, url, body = '') {
  const urlObj = new URL(url);
  const now = new Date();
  const date = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dateShort = date.slice(0, 8);

  const bodyHash = createHash('sha256').update(body).digest('hex');
  const canonicalHeaders =
    `host:${urlObj.host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${date}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    method,
    urlObj.pathname,
    urlObj.search.slice(1),
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  const scope = `${dateShort}/${R2_REGION}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;

  function hmac(key, data) {
    const { createHmac } = await import('node:crypto');
    return createHmac('sha256', key).update(data).digest();
  }

  const kDate = createHash('sha256').update(Buffer.from(`AWS4${R2_SECRET_ACCESS_KEY}`)).digest();
  // HMAC chain
  const { createHmac } = await import('node:crypto');
  const k1 = createHmac('sha256', `AWS4${R2_SECRET_ACCESS_KEY}`).update(dateShort).digest();
  const k2 = createHmac('sha256', k1).update(R2_REGION).digest();
  const k3 = createHmac('sha256', k2).update('s3').digest();
  const k4 = createHmac('sha256', k3).update('aws4_request').digest();
  const signature = createHmac('sha256', k4).update(stringToSign).digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`;

  return {
    'Authorization': authorization,
    'x-amz-date': date,
    'x-amz-content-sha256': bodyHash,
  };
}

async function r2Request(method, key, body = null) {
  const url = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;
  const bodyStr = body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
  const headers = await signRequest(method, url, bodyStr);
  if (body !== null) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: body !== null ? bodyStr : undefined,
  });
  return res;
}

async function r2Get(key, defaultValue = null) {
  const res = await r2Request('GET', key);
  if (res.status === 404) return defaultValue;
  if (!res.ok) throw new Error(`R2 GET ${key} failed: ${res.status}`);
  return res.json();
}

async function r2Put(key, data) {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] PUT ${key}`);
    return;
  }
  const res = await r2Request('PUT', key, data);
  if (!res.ok) throw new Error(`R2 PUT ${key} failed: ${res.status}`);
}

async function r2List(prefix) {
  const url = `${R2_ENDPOINT}/${R2_BUCKET}?list-type=2&prefix=${encodeURIComponent(prefix)}&delimiter=%2F`;
  const headers = await signRequest('GET', url);
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) throw new Error(`R2 LIST ${prefix} failed: ${res.status}`);
  const text = await res.text();
  // XML パース (簡易)
  const keys = [];
  const prefixes = [];
  for (const m of text.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1]);
  for (const m of text.matchAll(/<Prefix>([^<]+)<\/Prefix>/g)) prefixes.push(m[1]);
  return { keys, prefixes };
}

// ── ユーティリティ ────────────────────────────────────────────────

async function computeFeedHash(feedUrl) {
  return (await sha256Hex(feedUrl)).slice(0, 16);
}

async function computeArticleId(feedUrl, guid) {
  return (await sha256Hex(`${feedUrl}|${guid}`)).slice(0, 16);
}

function sortByDate(articles) {
  return [...articles].sort((a, b) => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });
}

async function isUUID(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// ── メイン処理 ────────────────────────────────────────────────────

async function main() {
  console.log(`=== 共有フィードストレージ マイグレーション ${DRY_RUN ? '[DRY-RUN]' : ''} ===`);
  console.log('');

  // 1. 全ユーザー列挙
  console.log('ユーザー一覧を取得中...');
  const { prefixes } = await r2List('users/');
  const userIds = prefixes.map((p) => p.replace('users/', '').replace('/', ''));
  console.log(`  ${userIds.length} ユーザー検出: ${userIds.join(', ')}`);

  const targetUserIds = TARGET_USER ? [TARGET_USER] : userIds;

  // 2. 全フィード URL 収集 → feedHash マッピング
  console.log('\nフィード情報を収集中...');
  const feedUrlToHash = new Map();      // url → feedHash
  const feedHashToMeta = new Map();     // feedHash → 旧 Feed データ
  const feedHashToArticles = new Map(); // feedHash → Article[] (全ユーザー分マージ)
  const userSubscriptions = new Map();  // userId → UserSubscription[]

  for (const userId of targetUserIds) {
    const feeds = await r2Get(`users/${userId}/feeds.json`, []);
    if (feeds.length === 0) {
      console.log(`  ${userId}: フィードなし (スキップ)`);
      continue;
    }

    const subs = [];
    for (const feed of feeds) {
      const url = feed.url;
      if (!url) continue;

      let feedHash = feedUrlToHash.get(url);
      if (!feedHash) {
        feedHash = await computeFeedHash(url);
        feedUrlToHash.set(url, feedHash);
        feedHashToMeta.set(feedHash, feed);
        feedHashToArticles.set(feedHash, []);
        console.log(`  フィード登録: ${feedHash} (${url})`);
      }

      subs.push({
        feedHash,
        url,
        customTitle: feed.customTitle,
        subscribedAt: feed.createdAt ?? new Date().toISOString(),
      });
    }

    userSubscriptions.set(userId, subs);

    // 記事を収集
    const articles = await r2Get(`users/${userId}/articles.json`, []);
    for (const article of articles) {
      const feedUrl = feeds.find((f) => f.id === (article.feedId ?? article.feedHash))?.url;
      if (!feedUrl) continue;
      const feedHash = feedUrlToHash.get(feedUrl);
      if (!feedHash) continue;
      feedHashToArticles.get(feedHash).push({ article, feedUrl });
    }
    console.log(`  ${userId}: ${feeds.length} フィード, ${articles.length} 記事`);
  }

  // 3. 各フィードについて SharedFeedMeta + ページファイルを作成
  console.log('\n共有フィードデータを書き込み中...');
  const feedHashToIdMapping = new Map(); // feedHash → Map(旧ID → 新ID)

  for (const [feedHash, rawEntries] of feedHashToArticles.entries()) {
    const oldFeed = feedHashToMeta.get(feedHash);
    const feedUrl = oldFeed.url;

    // 旧 ID → 新 ID マッピングを計算しながら記事を変換
    const idMapping = new Map();
    const convertedArticles = await Promise.all(
      rawEntries.map(async ({ article }) => {
        const guid = article.guid ?? article.link ?? article.id;
        const newId = await computeArticleId(feedUrl, guid);
        if (await isUUID(article.id)) {
          idMapping.set(article.id, newId);
        }
        return {
          id: newId,
          feedHash,
          guid: article.guid ?? article.link ?? article.id,
          title: article.title ?? '',
          link: article.link ?? '',
          summary: article.summary ?? '',
          ogImage: article.ogImage,
          author: article.author,
          publishedAt: article.publishedAt ?? null,
          createdAt: article.createdAt ?? new Date().toISOString(),
        };
      }),
    );

    feedHashToIdMapping.set(feedHash, idMapping);

    // 重複排除 (同一 id の記事を 1 つにまとめる)
    const dedupMap = new Map();
    for (const a of convertedArticles) {
      if (!dedupMap.has(a.id)) dedupMap.set(a.id, a);
    }
    const sorted = sortByDate([...dedupMap.values()]);

    // SharedFeedMeta 作成
    const latestArticles = sorted.slice(0, PAGE_SIZE);
    const overflow = sorted.slice(PAGE_SIZE);
    const pageCount = Math.ceil(overflow.length / PAGE_SIZE);

    const meta = {
      feedHash,
      url: feedUrl,
      title: oldFeed.title ?? '',
      siteUrl: oldFeed.siteUrl ?? '',
      lastFetchedAt: oldFeed.lastFetchedAt ?? null,
      fetchError: oldFeed.fetchError ?? null,
      consecutiveErrors: oldFeed.consecutiveErrors,
      lastErrorAt: oldFeed.lastErrorAt,
      rateLimitedUntil: oldFeed.rateLimitedUntil,
      lastModified: oldFeed.lastModified,
      etag: oldFeed.etag,
      articleCount: sorted.length,
      pageCount,
    };

    await r2Put(`feeds/${feedHash}/meta.json`, meta);
    await r2Put(`feeds/${feedHash}/articles/latest.json`, latestArticles);

    // 古いページを書き込み
    for (let i = 0; i < pageCount; i++) {
      const page = i + 2;
      const slice = overflow.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE);
      await r2Put(`feeds/${feedHash}/articles/p${page}.json`, slice);
    }

    console.log(
      `  ${feedHash} (${feedUrl.slice(0, 60)}): ${sorted.length} 記事, ${pageCount + 1} ページ, ${idMapping.size} ID 変換`,
    );
  }

  // 4. 各ユーザーの subscriptions.json を書き込み
  console.log('\nユーザーサブスクリプションを書き込み中...');
  for (const [userId, subs] of userSubscriptions.entries()) {
    await r2Put(`users/${userId}/subscriptions.json`, subs);
    console.log(`  ${userId}: ${subs.length} 購読を書き込み`);
  }

  // 5. 各ユーザーの read-state.json を新 ID に変換
  console.log('\n既読・ブックマーク ID を変換中...');
  for (const userId of targetUserIds) {
    const subs = userSubscriptions.get(userId) ?? [];
    if (subs.length === 0) continue;

    // userId に関係するフィードの全 ID マッピングを合成
    const combinedMapping = new Map();
    for (const sub of subs) {
      const mapping = feedHashToIdMapping.get(sub.feedHash);
      if (mapping) {
        for (const [oldId, newId] of mapping.entries()) {
          combinedMapping.set(oldId, newId);
        }
      }
    }

    // id-migration.json に保存 (クライアント側のローカルストレージ移行用)
    const migrationObj = Object.fromEntries(combinedMapping);
    await r2Put(`users/${userId}/id-migration.json`, migrationObj);

    // read-state.json の ID を変換
    const readState = await r2Get(`users/${userId}/read-state.json`, {
      readIds: [],
      bookmarkIds: [],
      readingListIds: [],
    });

    function convertIds(ids) {
      return ids.map((id) => combinedMapping.get(id) ?? id);
    }

    const newReadState = {
      readIds: convertIds(readState.readIds ?? []),
      bookmarkIds: convertIds(readState.bookmarkIds ?? []),
      readingListIds: convertIds(readState.readingListIds ?? []),
    };

    await r2Put(`users/${userId}/read-state.json`, newReadState);
    console.log(`  ${userId}: ${combinedMapping.size} ID 変換, 既読 ${newReadState.readIds.length} 件`);
  }

  // 6. 旧ファイルをバックアップ (.bak)
  if (!DRY_RUN) {
    console.log('\n旧ファイルをバックアップ中...');
    for (const userId of targetUserIds) {
      const feedsData = await r2Get(`users/${userId}/feeds.json`, null);
      if (feedsData !== null) {
        await r2Put(`users/${userId}/feeds.json.bak`, feedsData);
        console.log(`  users/${userId}/feeds.json → feeds.json.bak`);
      }
      const articlesData = await r2Get(`users/${userId}/articles.json`, null);
      if (articlesData !== null) {
        await r2Put(`users/${userId}/articles.json.bak`, articlesData);
        console.log(`  users/${userId}/articles.json → articles.json.bak`);
      }
    }
  } else {
    console.log('\n[DRY-RUN] 旧ファイルのバックアップはスキップ');
  }

  console.log('\n✅ マイグレーション完了');
  if (DRY_RUN) {
    console.log('   ※ DRY-RUN モードのため実際の書き込みは行われていません');
  }
}

main().catch((err) => {
  console.error('マイグレーション失敗:', err);
  process.exit(1);
});
