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
 *   node scripts/migrate-to-shared-feeds.mjs --dry-run   # ドライラン
 *   node scripts/migrate-to-shared-feeds.mjs             # 本番実行
 *
 * 前提条件:
 *   npx wrangler whoami でログイン済みであること
 */

import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';

// ── 引数パース ──────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'user':    { type: 'string' },
  },
});

const DRY_RUN  = args['dry-run'];
const TARGET_USER = args['user'];

// ── 定数 ──────────────────────────────────────────────────────────

const BUCKET     = 'rss-reader-data';
const ACCOUNT_ID = 'b54ccb4a294a6ecbb74aecc1a8e0b502';
const PAGE_SIZE  = 100;
const API_BASE   = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}`;

// ── 認証トークン取得 ───────────────────────────────────────────────

async function getOAuthToken() {
  const configPath = `${process.env.HOME}/.config/.wrangler/config/default.toml`;
  const content = await readFile(configPath, 'utf-8');
  const match = content.match(/oauth_token = "([^"]+)"/);
  if (!match) throw new Error('wrangler の oauth_token が見つかりません。npx wrangler whoami を確認してください');
  return match[1];
}

let TOKEN;

function authHeader() {
  return { 'Authorization': `Bearer ${TOKEN}` };
}

// ── R2 ヘルパー (Cloudflare REST API) ─────────────────────────────

/** プレフィックスのサブディレクトリ一覧を返す */
async function r2ListPrefixes(prefix) {
  const url = `${API_BASE}/objects?prefix=${encodeURIComponent(prefix)}&delimiter=%2F`;
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) throw new Error(`LIST ${prefix} failed: ${res.status}`);
  const json = await res.json();
  return json.result_info?.delimited ?? [];
}

/** オブジェクトを JSON として取得（存在しない場合は null） */
async function r2Get(key) {
  const url = `${API_BASE}/objects/${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: authHeader() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${key} failed: ${res.status}`);
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** オブジェクトを JSON として書き込む */
async function r2Put(key, data) {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] PUT ${key}`);
    return;
  }
  const url = `${API_BASE}/objects/${encodeURIComponent(key)}`;
  const body = JSON.stringify(data);
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) throw new Error(`PUT ${key} failed: ${res.status} ${await res.text()}`);
}

// ── ユーティリティ ────────────────────────────────────────────────

async function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

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

function isUUID(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// ── メイン処理 ────────────────────────────────────────────────────

async function main() {
  TOKEN = await getOAuthToken();
  console.log(`=== 共有フィードストレージ マイグレーション${DRY_RUN ? ' [DRY-RUN]' : ''} ===\n`);

  // 1. 全ユーザー列挙
  console.log('ユーザー一覧を取得中...');
  const prefixes = await r2ListPrefixes('users/');
  const allUserIds = prefixes.map((p) => p.replace('users/', '').replace('/', ''));
  const userIds = TARGET_USER ? [TARGET_USER] : allUserIds;
  console.log(`  ${allUserIds.length} ユーザー検出: ${allUserIds.join(', ')}`);
  if (TARGET_USER) console.log(`  → ${TARGET_USER} のみ処理`);

  // 2. フィード情報を収集
  console.log('\nフィード情報を収集中...');
  const feedUrlToHash = new Map();
  const feedHashToOldFeed = new Map();
  const feedHashToArticles = new Map();
  const userFeedsMap = new Map();

  for (const userId of userIds) {
    const feeds = await r2Get(`users/${userId}/feeds.json`) ?? [];
    userFeedsMap.set(userId, feeds);

    if (feeds.length === 0) { console.log(`  ${userId}: フィードなし`); continue; }

    for (const feed of feeds) {
      if (!feed.url) continue;
      const feedHash = await computeFeedHash(feed.url);
      if (!feedUrlToHash.has(feed.url)) {
        feedUrlToHash.set(feed.url, feedHash);
        feedHashToOldFeed.set(feedHash, feed);
        feedHashToArticles.set(feedHash, []);
      }
    }

    const articles = await r2Get(`users/${userId}/articles.json`) ?? [];
    for (const article of articles) {
      const feedId = article.feedId ?? article.feedHash;
      const feed = feeds.find((f) => f.id === feedId);
      if (!feed?.url) continue;
      const feedHash = feedUrlToHash.get(feed.url);
      if (!feedHash) continue;
      feedHashToArticles.get(feedHash).push({ article, feedUrl: feed.url });
    }
    console.log(`  ${userId}: ${feeds.length} フィード, ${articles.length} 記事`);
  }

  // 3. 共有フィードデータを書き込み
  console.log('\n共有フィードデータを書き込み中...');
  const feedHashToIdMapping = new Map();

  for (const [feedHash, rawEntries] of feedHashToArticles.entries()) {
    const oldFeed = feedHashToOldFeed.get(feedHash);
    const feedUrl = oldFeed.url;

    const idMapping = new Map();
    const convertedArticles = await Promise.all(
      rawEntries.map(async ({ article }) => {
        const guid = article.guid ?? article.link ?? article.id;
        const newId = await computeArticleId(feedUrl, guid);
        if (isUUID(article.id)) idMapping.set(article.id, newId);
        return {
          id: newId, feedHash, guid,
          title: article.title ?? '', link: article.link ?? '', summary: article.summary ?? '',
          ogImage: article.ogImage, author: article.author,
          publishedAt: article.publishedAt ?? null,
          createdAt: article.createdAt ?? new Date().toISOString(),
        };
      }),
    );

    feedHashToIdMapping.set(feedHash, idMapping);

    const dedupMap = new Map();
    for (const a of convertedArticles) if (!dedupMap.has(a.id)) dedupMap.set(a.id, a);
    const sorted = sortByDate([...dedupMap.values()]);

    const latestArticles = sorted.slice(0, PAGE_SIZE);
    const overflowAll    = sorted.slice(PAGE_SIZE);
    const pageCount      = Math.ceil(overflowAll.length / PAGE_SIZE);

    const meta = {
      feedHash, url: feedUrl,
      title: oldFeed.title ?? '', siteUrl: oldFeed.siteUrl ?? '',
      lastFetchedAt: oldFeed.lastFetchedAt ?? null, fetchError: oldFeed.fetchError ?? null,
      consecutiveErrors: oldFeed.consecutiveErrors, lastErrorAt: oldFeed.lastErrorAt,
      rateLimitedUntil: oldFeed.rateLimitedUntil, lastModified: oldFeed.lastModified, etag: oldFeed.etag,
      articleCount: sorted.length, pageCount,
    };

    await r2Put(`feeds/${feedHash}/meta.json`, meta);
    await r2Put(`feeds/${feedHash}/articles/latest.json`, latestArticles);
    for (let i = 0; i < pageCount; i++) {
      await r2Put(`feeds/${feedHash}/articles/p${i + 2}.json`, overflowAll.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE));
    }

    const url60 = feedUrl.length > 60 ? feedUrl.slice(0, 57) + '...' : feedUrl;
    console.log(`  ${feedHash} (${url60}): ${sorted.length} 記事, ${pageCount + 1}p, ${idMapping.size} ID変換`);
  }

  // 4. subscriptions.json を書き込み
  console.log('\nユーザーサブスクリプションを書き込み中...');
  for (const userId of userIds) {
    const feeds = userFeedsMap.get(userId) ?? [];
    if (feeds.length === 0) continue;

    // 最初のフィードのタイトルが shared meta に使われるので、異なればユーザー固有として保持
    const subs = await Promise.all(feeds.filter((f) => f.url).map(async (feed) => {
      const feedHash = await computeFeedHash(feed.url);
      const sharedTitle = feedHashToOldFeed.get(feedHash)?.title ?? '';
      return {
        feedHash, url: feed.url,
        customTitle: feed.title !== sharedTitle ? feed.title : undefined,
        subscribedAt: feed.createdAt ?? new Date().toISOString(),
      };
    }));

    await r2Put(`users/${userId}/subscriptions.json`, subs);
    console.log(`  ${userId}: ${subs.length} 購読`);
  }

  // 5. read-state の ID を変換 + id-migration.json を保存
  console.log('\n既読・ブックマーク ID を変換中...');
  for (const userId of userIds) {
    const feeds = userFeedsMap.get(userId) ?? [];
    if (feeds.length === 0) continue;

    const combinedMapping = new Map();
    for (const feed of feeds) {
      if (!feed.url) continue;
      const feedHash = await computeFeedHash(feed.url);
      const mapping = feedHashToIdMapping.get(feedHash);
      if (mapping) for (const [o, n] of mapping) combinedMapping.set(o, n);
    }

    await r2Put(`users/${userId}/id-migration.json`, Object.fromEntries(combinedMapping));

    const readState = await r2Get(`users/${userId}/read-state.json`) ?? { readIds: [], bookmarkIds: [], readingListIds: [] };
    const convert   = (ids) => (ids ?? []).map((id) => combinedMapping.get(id) ?? id);
    await r2Put(`users/${userId}/read-state.json`, {
      readIds:        convert(readState.readIds),
      bookmarkIds:    convert(readState.bookmarkIds),
      readingListIds: convert(readState.readingListIds),
    });
    console.log(`  ${userId}: ${combinedMapping.size} ID 変換`);
  }

  // 6. 旧ファイルをバックアップ
  if (!DRY_RUN) {
    console.log('\n旧ファイルをバックアップ中...');
    for (const userId of userIds) {
      for (const key of ['feeds', 'articles']) {
        const data = await r2Get(`users/${userId}/${key}.json`);
        if (data) {
          await r2Put(`users/${userId}/${key}.json.bak`, data);
          console.log(`  ${userId}/${key}.json → .bak`);
        }
      }
    }
  }

  console.log(`\n✅ マイグレーション完了${DRY_RUN ? ' (DRY-RUN モードのため書き込みは行われていません)' : ''}`);
}

main().catch((err) => {
  console.error('\n❌ マイグレーション失敗:', err.message);
  process.exit(1);
});
