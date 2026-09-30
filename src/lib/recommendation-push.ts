import type {
  Article,
  Feed,
  PushConfig,
  ReadState,
  RecommendationDismissal,
  RecommendationPushSeen,
} from "../types";
import { rankArticleRecommendations } from "./article-recommendations";
import { getArticleTimestamp } from "./article-utils";
import { normalizeFilter, matchesKeywordFilter } from "./keyword-filter";
import { computeEffectiveReadBeforeCutoff } from "./read-state-prune";
import { isInSilentHours, isValidIanaTimezone } from "./push-silent-hours";

const DAY = 86400000;
export const RECOMMENDATION_DISMISSAL_TTL = 30 * DAY;
export const MAX_RECOMMENDATION_DISMISSALS = 200;

export function isRecommendationTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(value);
}

export function normalizeRecommendationDismissals(
  values: unknown,
  now: number,
): RecommendationDismissal[] {
  if (!Array.isArray(values)) return [];
  const byId = new Map<string, RecommendationDismissal>();
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    if (
      typeof item.articleId !== "string" ||
      !/^[\x20-\x7e]{1,256}$/.test(item.articleId) ||
      typeof item.dismissedAt !== "number" ||
      !Number.isFinite(item.dismissedAt)
    )
      continue;
    if (item.dismissedAt > now || now - item.dismissedAt >= RECOMMENDATION_DISMISSAL_TTL) continue;
    const previous = byId.get(item.articleId);
    if (!previous || item.dismissedAt > previous.dismissedAt)
      byId.set(item.articleId, { articleId: item.articleId, dismissedAt: item.dismissedAt });
  }
  return [...byId.values()]
    .sort((a, b) => b.dismissedAt - a.dismissedAt || a.articleId.localeCompare(b.articleId))
    .slice(0, MAX_RECOMMENDATION_DISMISSALS);
}

/** Cron is UTC; scheduling and the once-per-day key use the user's IANA timezone.
 * A missed/quiet/DST-skipped slot may catch up later that local day, never a past day.
 */
export function recommendationDay(config: PushConfig, now: number): string | null {
  if (
    !config.recommendationEnabled ||
    !isRecommendationTime(config.recommendationTime) ||
    !config.timezone ||
    !isValidIanaTimezone(config.timezone) ||
    !Number.isFinite(now)
  )
    return null;
  if (isInSilentHours(config, new Date(now))) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  const [hour, minute] = config.recommendationTime.split(":").map(Number);
  return minutes >= hour * 60 + minute ? `${get("year")}-${get("month")}-${get("day")}` : null;
}

/** Background recommendations deliberately exclude NSFW and non-article feeds.
 * Evidence uses existing synced saves/likes; local browsing history is never uploaded.
 */
export function selectPushRecommendations(
  articles: Article[],
  feeds: Feed[],
  readState: ReadState,
  config: PushConfig,
  seen: RecommendationPushSeen[],
  now: number,
  plannedIds?: ReadonlySet<string>,
) {
  const allowedFeeds = feeds.filter(
    (feed) =>
      !feed.nsfw &&
      (!feed.view || feed.view === "articles") &&
      !config.disabledFeeds?.[feed.id] &&
      !(feed.mutedUntil && Date.parse(feed.mutedUntil) > now),
  );
  const feedMap = new Map(allowedFeeds.map((feed) => [feed.id, feed]));
  const filters = new Map(
    allowedFeeds
      .filter((feed) => feed.filter)
      .map((feed) => [feed.id, normalizeFilter(feed.filter!)]),
  );
  const globalFilter = readState.globalFilter ? normalizeFilter(readState.globalFilter) : null;
  const evidence = articles.filter((article) => {
    if (!feedMap.has(article.feedHash)) return false;
    if (
      readState.snoozedUntil?.[article.id] &&
      Date.parse(readState.snoozedUntil[article.id]) > now
    )
      return false;
    const filter = filters.get(article.feedHash);
    return (
      (!filter || matchesKeywordFilter(article, filter)) &&
      (!globalFilter || matchesKeywordFilter(article, globalFilter))
    );
  });
  const seenIds = new Set(seen.map((entry) => entry.articleId));
  const seenLinks = new Set(seen.map((entry) => entry.link).filter(Boolean));
  const candidates = evidence.filter((article) => {
    const age = now - Date.parse(getArticleTimestamp(article));
    return (
      (!plannedIds || plannedIds.has(article.id)) &&
      Number.isFinite(age) &&
      age >= 0 &&
      age <= 7 * DAY &&
      !seenIds.has(article.id) &&
      (!article.link || !seenLinks.has(article.link))
    );
  });
  return rankArticleRecommendations({
    candidates,
    articles: evidence,
    feeds: allowedFeeds,
    now,
    limit: 3,
    readIds: new Set(readState.readIds),
    readBeforeTimestamp: computeEffectiveReadBeforeCutoff(
      readState.readBeforeTimestamp ?? null,
      readState.ttlDays ?? null,
      now,
    ),
    bookmarkIds: new Set(readState.bookmarkIds),
    readingListIds: new Set(readState.readingListIds),
    likeIds: new Set(readState.likeIds),
    historyIds: new Set(),
    dismissedIds: new Set(
      normalizeRecommendationDismissals(config.recommendationDismissals, now).map(
        (item) => item.articleId,
      ),
    ),
  });
}
