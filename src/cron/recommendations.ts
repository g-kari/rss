import type { Article, Feed, PushConfig, RecommendationPushState } from "../types";
import {
  buildFeedUserMapCached,
  readLatestArticles,
  readUserSubscriptions,
} from "../lib/shared-feed";
import { readFeedGroups } from "../lib/feed-groups";
import { readNormalizedReadState } from "../lib/read-state-merge";
import { pMapSettled } from "../lib/concurrency";
import { r2Get, sha256Hex, userKey, userPushKey } from "../lib/r2";
import { recommendationDay, selectPushRecommendations } from "../lib/recommendation-push";
import { sendPush } from "../lib/web-push";
import { removeExpiredPushSubscriptions } from "../lib/push-config";
import { getArticleTimestamp } from "../lib/article-utils";

const DAY = 86400000;
const MAX_POOL = 3000;
const MAX_POOL_BYTES = 8 * 1024 * 1024;
const EMPTY_STATE: RecommendationPushState = {
  day: "",
  plannedAt: 0,
  articleIds: [],
  endpoints: {},
  seen: [],
};
const outboxKey = (userId: string) => userKey(userId, "recommendation-push.json");

/** The callback can decline a write. Conditional writes serialize both slot and endpoint claims. */
async function updateOutbox(
  bucket: R2Bucket,
  userId: string,
  change: (state: RecommendationPushState) => RecommendationPushState | null,
): Promise<RecommendationPushState | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const object = await bucket.get(outboxKey(userId));
    const state = object ? await object.json<RecommendationPushState>() : EMPTY_STATE;
    const next = change(state);
    if (!next) return null;
    const saved = await bucket.put(outboxKey(userId), JSON.stringify(next), {
      onlyIf: object ? { etagMatches: object.etag } : { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json" },
    });
    if (saved) return next;
  }
  throw new Error("Recommendation outbox is busy");
}

async function readNotificationFeeds(
  bucket: R2Bucket,
  userId: string,
  config: PushConfig,
  now: number,
): Promise<Feed[]> {
  const [subscriptions, groups] = await Promise.all([
    readUserSubscriptions(bucket, userId),
    readFeedGroups(bucket, userId),
  ]);
  const mutedGroups = new Set(groups.filter((group) => group.muted).map((group) => group.id));
  return subscriptions
    .filter(
      (sub) =>
        !sub.nsfw &&
        (!sub.view || sub.view === "articles") &&
        !config.disabledFeeds?.[sub.feedHash] &&
        !(sub.groupId && mutedGroups.has(sub.groupId)) &&
        !(sub.mutedUntil && Date.parse(sub.mutedUntil) > now),
    )
    .map((sub) => ({
      id: sub.feedHash,
      url: sub.url,
      title: sub.customTitle ?? sub.url,
      priority: sub.priority,
      category: sub.category,
      filter: sub.filter,
      mutedUntil: sub.mutedUntil,
      siteUrl: "",
      lastFetchedAt: null,
      fetchError: null,
    }));
}

/** Feed pages are consumed one at a time, with a bounded metadata-only ranking pool. */
async function loadUserPool(bucket: R2Bucket, userId: string, config: PushConfig, now: number) {
  const [feeds, readState] = await Promise.all([
    readNotificationFeeds(bucket, userId, config, now),
    readNormalizedReadState(bucket, userId),
  ]);
  const signalIds = new Set([
    ...readState.bookmarkIds,
    ...readState.readingListIds,
    ...readState.likeIds,
  ]);
  let articles: Article[] = [];
  for (const feed of feeds) {
    const page = await readLatestArticles(bucket, feed.id);
    // Retain summary for keyword filtering; never load full text, OGP or AI in this path.
    articles.push(
      ...page.map(
        ({ id, feedHash, guid, title, link, summary, publishedAt, createdAt, categories }) => ({
          id,
          feedHash,
          guid,
          // Legacy stored titles can violate Article's static string contract.
          title: typeof title === "string" ? title : "",
          link,
          summary,
          publishedAt,
          createdAt,
          categories,
        }),
      ),
    );
    if (articles.length) {
      articles.sort(
        (a, b) =>
          Number(signalIds.has(b.id)) - Number(signalIds.has(a.id)) ||
          Date.parse(getArticleTimestamp(b)) - Date.parse(getArticleTimestamp(a)),
      );
      let bytes = 0;
      articles = articles.slice(0, MAX_POOL).filter((article) => {
        const size =
          2 *
            (article.summary.length +
              article.title.length +
              article.link.length +
              article.guid.length +
              article.id.length +
              (article.categories?.join("").length ?? 0)) +
          256;
        if (bytes + size > MAX_POOL_BYTES) return false;
        bytes += size;
        return true;
      });
    }
  }
  return { articles, feeds, readState };
}

export async function sendUserRecommendations(
  bucket: R2Bucket,
  userId: string,
  now: number,
  currentTime: () => number = () => now,
): Promise<void> {
  let config = await r2Get<PushConfig>(bucket, userPushKey(userId), { subscriptions: [] });
  const day = recommendationDay(config, now);
  if (!day || !config.subscriptions.length) return;
  let state = await r2Get<RecommendationPushState>(bucket, outboxKey(userId), EMPTY_STATE);
  if (state.day > day) return; // Timezone changes / delayed old invocations must not roll the outbox back.
  if (state.day === day && !Object.values(state.endpoints).includes("retry")) return;
  const pool = await loadUserPool(bucket, userId, config, now);
  // Re-read consent, quiet hours and feedback after candidate I/O, before any side effect.
  config = await r2Get<PushConfig>(bucket, userPushKey(userId), { subscriptions: [] });
  if (recommendationDay(config, now) !== day || !config.subscriptions.length) return;
  const currentReads = await readNormalizedReadState(bucket, userId);
  const selected = selectPushRecommendations(
    pool.articles,
    pool.feeds,
    currentReads,
    config,
    state.day === day ? [] : state.seen,
    now,
    state.day === day ? new Set(state.articleIds) : undefined,
  );
  if (state.day !== day) {
    const ids = selected.map((item) => item.article.id);
    const next = await updateOutbox(bucket, userId, (previous) => {
      if (previous.day >= day) return null;
      return {
        day,
        plannedAt: now,
        articleIds: ids,
        endpoints: {},
        // Reserve articles before sending. Unknown delivery must not reappear on a later day.
        seen: [
          ...selected.map(({ article }) => ({
            articleId: article.id,
            link: article.link,
            at: now,
          })),
          ...previous.seen.filter((item) => now - item.at < 30 * DAY),
        ].slice(0, 200),
      };
    });
    if (!next) return;
    state = next;
  }
  const wanted = new Set(state.articleIds);
  if (!wanted.size) return;
  for (const subscription of config.subscriptions) {
    const sendTime = currentTime();
    const latestConfig = await r2Get<PushConfig>(bucket, userPushKey(userId), {
      subscriptions: [],
    });
    if (recommendationDay(latestConfig, sendTime) !== day) return;
    const currentSubscription = latestConfig.subscriptions.find(
      (sub) => sub.endpoint === subscription.endpoint,
    );
    if (!currentSubscription) continue;
    // Recheck all privacy/read/feedback settings immediately before each device, not
    // only before the batch: the first provider may have been slow or the user active.
    const [currentFeeds, latestReads] = await Promise.all([
      readNotificationFeeds(bucket, userId, latestConfig, sendTime),
      readNormalizedReadState(bucket, userId),
    ]);
    const articles = selectPushRecommendations(
      pool.articles,
      currentFeeds,
      latestReads,
      latestConfig,
      [],
      sendTime,
      wanted,
    );
    if (!articles.length) continue;
    const payload = {
      title: "今日のおすすめ",
      body: articles.map((item) => item.article.title.slice(0, 100)).join(" / "),
      url: "/?recommendations=1",
      tag: `rss-recommendations-${day}`,
      renotify: false,
    };
    const endpointId = await sha256Hex(subscription.endpoint);
    const claimed = await updateOutbox(bucket, userId, (previous) => {
      if (
        previous.day !== day ||
        (previous.retryAfter?.[endpointId] ?? 0) > sendTime ||
        (previous.endpoints[endpointId] && previous.endpoints[endpointId] !== "retry")
      )
        return null;
      return { ...previous, endpoints: { ...previous.endpoints, [endpointId]: "attempted" } };
    });
    if (!claimed) continue;
    // Persistence precedes transmission. A timeout/crash stays attempted and is never retried.
    const result = await sendPush(currentSubscription, payload);
    const status = result.ok
      ? "sent"
      : result.gone
        ? "gone"
        : result.retryable
          ? "retry"
          : "attempted";
    await updateOutbox(bucket, userId, (previous) =>
      previous.day === day
        ? {
            ...previous,
            endpoints: { ...previous.endpoints, [endpointId]: status },
            retryAfter: {
              ...previous.retryAfter,
              [endpointId]:
                status === "retry" ? sendTime + Math.max(30 * 60000, result.retryAfterMs ?? 0) : 0,
            },
          }
        : null,
    );
    if (result.gone) await removeExpiredPushSubscriptions(bucket, userId, [subscription.endpoint]);
  }
}

export async function runRecommendationPush(
  env: Pick<CloudflareEnv, "RSS_DATA" | "RATE_LIMIT">,
  now: number,
): Promise<void> {
  // Missing VAPID is not a delivery attempt and must not consume a daily slot.
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  const { feedUserMap } = await buildFeedUserMapCached(env.RSS_DATA, env.RATE_LIMIT);
  const userIds = [...new Set([...feedUserMap.values()].flat())];
  const results = await pMapSettled(
    userIds,
    (userId) => sendUserRecommendations(env.RSS_DATA, userId, now, Date.now),
    2,
  );
  for (const result of results)
    if (result.status === "rejected")
      console.error(
        "[recommendation-push] user processing failed",
        result.reason instanceof Error ? result.reason.message : "unknown failure",
      );
}
