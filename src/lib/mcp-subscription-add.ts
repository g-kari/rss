import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import type { SharedFeedMeta, UserSubscription } from "../types";
import {
  BodyTooLargeError,
  fetchFollowSafeRedirects,
  readResponseText,
  RSS_USER_AGENT,
} from "./fetch";
import { isFeedWritesPaused } from "./feed-write-maintenance";
import { stripHtml } from "./html";
import { feedAddCooldownKey } from "./r2";
import { DEFAULT_RSSHUB_INSTANCE, getRSSHubInstance } from "./rsshub";
import { serialized } from "./serialize-async";
import { computeFeedHash, MAX_FEEDS_PER_USER } from "./shared-feed";
import { isPlainObject } from "./type-guards";
import { isValidHttpsUrl, MAX_URL_LENGTH } from "./url";
import { isValidUserId, stripControlChars } from "./validation";
import {
  mutateUserSubscriptions,
  UserSubscriptionMutationError,
} from "./user-subscription-mutations";

export const MCP_SUBSCRIPTION_ADD_LIMITS = {
  maxFeedBytes: 1024 * 1024,
  maxFeedItems: 1000,
  maxDepth: 32,
  maxNodes: 20_000,
  maxAliases: 5,
  maxMetaBytes: 256 * 1024,
  fetchTimeoutMs: 10_000,
  cooldownMs: 30_000,
} as const;

export const mcpSubscriptionAddSchema = z
  // The SDK publishes Standard Schema issue messages. Do not echo caller-controlled keys.
  .object(
    { url: z.string().min(1).max(MAX_URL_LENGTH) },
    { error: "Invalid public-feed arguments" },
  )
  .strict();

type FailureStatus =
  | "invalid_url"
  | "unsupported_feed"
  | "maintenance_paused"
  | "limit_reached"
  | "cooldown"
  | "retryable_conflict"
  | "storage_unavailable";
export type McpSubscriptionAddResult =
  | {
      status: "added" | "already_subscribed";
      feedId: string;
      canonicalUrl: string;
      subscriptionCommitted: true;
    }
  | {
      status: "repair_required";
      feedId: string;
      canonicalUrl: string;
      subscriptionCommitted: true;
      retryable: true;
    }
  | { status: FailureStatus; retryable: boolean; retryAfter?: number };

/** Safe internal domain codes only; never carry input URLs or storage exceptions. */
export class McpSubscriptionAddError extends Error {
  constructor(readonly code: FailureStatus) {
    super(code);
    this.name = "McpSubscriptionAddError";
  }
}

export interface PublicFeedMetadata {
  title: string;
  siteUrl: string;
}
export interface CommittedPublicFeed extends PublicFeedMetadata {
  feedHash: string;
  url: string;
}
export interface McpSubscriptionAddDependencies {
  /** Check scope, resource, account, token expiry and the current connection revision. */
  assertAuthorized: () => Promise<void>;
  /** Repair the required user index and invalidate the feed/user caches; no network fetches. */
  afterCommit: (feed: CommittedPublicFeed) => Promise<void>;
  onExisting?: (feedHash: string) => Promise<void>;
}

/**
 * Public-only MVP: no IP literals, fragments, arbitrary queries or credential-looking paths.
 * This deliberately rejects some legitimate URLs. It is not a proof that an arbitrary opaque
 * path contains no secret, nor a DNS-pinning layer; the existing Worker fetch policy still applies.
 */
export function normalizePublicFeedUrl(value: string): string | null {
  if (
    !value ||
    value.length > MAX_URL_LENGTH ||
    stripControlChars(value) !== value ||
    /\s|\\/.test(value) ||
    /%(?![\da-f]{2})/i.test(value)
  )
    return null;
  try {
    const url = new URL(value);
    if (
      !isValidHttpsUrl(value) ||
      url.username ||
      url.password ||
      url.port ||
      value.includes("#") ||
      value.includes("?", value.indexOf("?") + 1)
    )
      return null;
    const host = url.hostname;
    // Cron injects RSSHub keys by configured host. Do not create a subscription that
    // can become credential-assisted or use the known RSSHub scraping service later.
    if (
      [DEFAULT_RSSHUB_INSTANCE, getRSSHubInstance()].some(
        (instance) => new URL(instance).hostname === host,
      )
    )
      return null;
    // URL parsing canonicalizes alternative numeric IP encodings before this check.
    if (
      host.startsWith("[") ||
      /^\d+(?:\.\d+){3}$/.test(host) ||
      host.endsWith(".") ||
      !host.includes(".")
    )
      return null;
    const labels = host.split(".");
    if (labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) return null;
    const tld = labels.at(-1)!;
    if (
      !/^(?:[a-z]{2,63}|xn--[a-z\d-]{2,59})$/i.test(tld) ||
      /^(?:local|internal|localhost|lan|home|intranet|corp|test|invalid|example|onion|arpa|alt)$/i.test(
        tld,
      )
    )
      return null;
    const path = decodeURIComponent(url.pathname);
    if (stripControlChars(path) !== path || /[\s%\\@]/.test(path)) return null;
    const segments = path.split("/");
    if (
      segments.some(
        (segment) =>
          /(?:^|[-_.])(?:access[-_]?token|api[-_]?key|auth|authorization|bearer|cookie|credential|key|password|private|secret|session|signature|token)(?:$|[-_.=])/i.test(
            segment,
          ) || /^[a-z\d_-]{32,}$/i.test(segment),
      )
    )
      return null;
    if (value.includes("?")) {
      // The one supported public query format is a fixed official YouTube channel feed.
      if (
        host !== "www.youtube.com" ||
        url.pathname !== "/feeds/videos.xml" ||
        !/^\?channel_id=UC[a-zA-Z\d_-]{22}$/.test(url.search)
      )
        return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function scalar(value: unknown): string {
  if (typeof value === "string") return value;
  return isPlainObject(value) && typeof value["#text"] === "string" ? value["#text"] : "";
}
function requireText(value: unknown): string {
  const result = scalar(value).trim();
  if (!result) throw new McpSubscriptionAddError("unsupported_feed");
  return result;
}
function records(value: unknown, required = false): Record<string, unknown>[] {
  if (value === undefined && !required) return [];
  const array = Array.isArray(value) ? value : [value];
  if (
    array.length > MCP_SUBSCRIPTION_ADD_LIMITS.maxFeedItems ||
    array.some((entry) => !isPlainObject(entry))
  )
    throw new McpSubscriptionAddError("unsupported_feed");
  return array as Record<string, unknown>[];
}
function safeMetadata(title: string, site: string, canonicalUrl: string): PublicFeedMetadata {
  let siteUrl = `${new URL(canonicalUrl).origin}/`;
  try {
    siteUrl = normalizePublicFeedUrl(new URL(site, canonicalUrl).href) ?? siteUrl;
  } catch {
    /* Use only the already-validated feed origin. */
  }
  return { title: stripControlChars(stripHtml(title)).trim().slice(0, 300), siteUrl };
}
function checkTree(root: unknown): void {
  const pending = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (
      ++nodes > MCP_SUBSCRIPTION_ADD_LIMITS.maxNodes ||
      depth > MCP_SUBSCRIPTION_ADD_LIMITS.maxDepth
    )
      throw new McpSubscriptionAddError("unsupported_feed");
    if (Array.isArray(value))
      for (const child of value) pending.push({ value: child, depth: depth + 1 });
    else if (isPlainObject(value))
      for (const child of Object.values(value)) pending.push({ value: child, depth: depth + 1 });
  }
}
/** Bound JSON nesting before JSON.parse allocates an untrusted deeply nested structure. */
function checkJsonNesting(body: string): void {
  let quoted = false;
  let escaped = false;
  let depth = 0;
  let nodes = 0;
  for (const char of body) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") {
      if (
        ++depth > MCP_SUBSCRIPTION_ADD_LIMITS.maxDepth ||
        ++nodes > MCP_SUBSCRIPTION_ADD_LIMITS.maxNodes
      )
        throw new McpSubscriptionAddError("unsupported_feed");
    } else if (char === "}" || char === "]") depth--;
  }
}

/** Strict bounded structural parsing only. No generic HTML/CSS/RSSHub/AI fallback. */
export function parsePublicFeed(body: string, canonicalUrl: string): PublicFeedMetadata {
  if (new TextEncoder().encode(body).byteLength > MCP_SUBSCRIPTION_ADD_LIMITS.maxFeedBytes)
    throw new McpSubscriptionAddError("unsupported_feed");
  const text = body.replace(/^\uFEFF/, "").trim();
  try {
    if (text.startsWith("{")) {
      checkJsonNesting(text);
      const json: unknown = JSON.parse(text);
      checkTree(json);
      if (
        !isPlainObject(json) ||
        typeof json.version !== "string" ||
        typeof json.title !== "string" ||
        !["https://jsonfeed.org/version/1", "https://jsonfeed.org/version/1.1"].includes(
          json.version,
        ) ||
        !Array.isArray(json.items)
      )
        throw new McpSubscriptionAddError("unsupported_feed");
      const title = requireText(json.title);
      for (const item of records(json.items, true)) {
        if (typeof item.id !== "string") throw new McpSubscriptionAddError("unsupported_feed");
        requireText(item.id);
        if (typeof item.content_text !== "string" && typeof item.content_html !== "string")
          throw new McpSubscriptionAddError("unsupported_feed");
      }
      return safeMetadata(title, scalar(json.home_page_url), canonicalUrl);
    }
    if (
      !text.startsWith("<") ||
      /<!DOCTYPE|<!ENTITY/i.test(text) ||
      (text.match(/</g)?.length ?? 0) > MCP_SUBSCRIPTION_ADD_LIMITS.maxNodes
    )
      throw new McpSubscriptionAddError("unsupported_feed");
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false,
      processEntities: false,
      maxNestedTags: MCP_SUBSCRIPTION_ADD_LIMITS.maxDepth,
      isArray: (name) => ["item", "entry", "link"].includes(name),
    });
    // The parser enforces depth before the separate strict well-formedness check.
    const xml: unknown = parser.parse(text);
    checkTree(xml);
    if (XMLValidator.validate(text) !== true || !isPlainObject(xml))
      throw new McpSubscriptionAddError("unsupported_feed");
    const roots = Object.keys(xml).filter((key) => !key.startsWith("?"));
    if (roots.length !== 1) throw new McpSubscriptionAddError("unsupported_feed");
    if (
      isPlainObject(xml.rss) &&
      xml.rss["@_version"] === "2.0" &&
      isPlainObject(xml.rss.channel)
    ) {
      const channel = xml.rss.channel;
      const title = requireText(channel.title);
      requireText(channel.description);
      const links = Array.isArray(channel.link) ? channel.link : [channel.link];
      const site = requireText(links[0]);
      records(channel.item);
      return safeMetadata(title, site, canonicalUrl);
    }
    if (isPlainObject(xml.feed) && xml.feed["@_xmlns"] === "http://www.w3.org/2005/Atom") {
      const feed = xml.feed;
      const title = requireText(feed.title);
      requireText(feed.id);
      requireText(feed.updated);
      for (const entry of records(feed.entry)) {
        requireText(entry.id);
        requireText(entry.title);
        requireText(entry.updated);
      }
      const links = records(feed.link);
      const alternate = links.find(
        (link) => link["@_rel"] === "alternate" || link["@_rel"] === undefined,
      );
      return safeMetadata(title, scalar(alternate?.["@_href"]), canonicalUrl);
    }
    const rdf = xml["rdf:RDF"];
    if (
      isPlainObject(rdf) &&
      rdf["@_xmlns:rdf"] === "http://www.w3.org/1999/02/22-rdf-syntax-ns#" &&
      rdf["@_xmlns"] === "http://purl.org/rss/1.0/" &&
      isPlainObject(rdf.channel)
    ) {
      const channel = rdf.channel;
      const links = Array.isArray(channel.link) ? channel.link : [channel.link];
      records(rdf.item);
      return safeMetadata(requireText(channel.title), requireText(links[0]), canonicalUrl);
    }
    throw new McpSubscriptionAddError("unsupported_feed");
  } catch (error) {
    if (error instanceof McpSubscriptionAddError) throw error;
    throw new McpSubscriptionAddError("unsupported_feed");
  }
}

function matchingSubscription(
  subscriptions: UserSubscription[],
  url: string,
): UserSubscription | undefined {
  return subscriptions.find((subscription) => {
    if (subscription.requestCookie || normalizePublicFeedUrl(subscription.url) === null)
      return false;
    if (normalizePublicFeedUrl(subscription.url) === url) return true;
    const aliases = subscription.publicFeedAliases;
    if (
      !Array.isArray(aliases) ||
      aliases.length > MCP_SUBSCRIPTION_ADD_LIMITS.maxAliases ||
      aliases.some((alias) => typeof alias !== "string" || normalizePublicFeedUrl(alias) === null)
    )
      return false;
    return aliases.some((alias) => normalizePublicFeedUrl(alias) === url);
  });
}

async function ensurePublicFeedMetadata(
  bucket: R2Bucket,
  feed: CommittedPublicFeed,
): Promise<void> {
  const key = `feeds/${feed.feedHash}/meta.json`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let object: R2ObjectBody | null;
    try {
      object = await bucket.get(key);
    } catch {
      throw new McpSubscriptionAddError("storage_unavailable");
    }
    if (object) {
      if (!object.etag || object.size > MCP_SUBSCRIPTION_ADD_LIMITS.maxMetaBytes) {
        void object.body?.cancel().catch(() => {});
        throw new McpSubscriptionAddError("storage_unavailable");
      }
      let meta: unknown;
      try {
        meta = JSON.parse(
          await readResponseText(
            new Response(object.body),
            MCP_SUBSCRIPTION_ADD_LIMITS.maxMetaBytes,
          ),
        );
      } catch {
        throw new McpSubscriptionAddError("storage_unavailable");
      }
      if (
        !isPlainObject(meta) ||
        meta.feedHash !== feed.feedHash ||
        typeof meta.url !== "string" ||
        normalizePublicFeedUrl(meta.url) !== feed.url ||
        typeof meta.title !== "string" ||
        typeof meta.siteUrl !== "string" ||
        !Number.isInteger(meta.articleCount) ||
        Number(meta.articleCount) < 0 ||
        !Number.isInteger(meta.pageCount) ||
        Number(meta.pageCount) < 0 ||
        !(meta.lastFetchedAt === null || typeof meta.lastFetchedAt === "string") ||
        !(meta.fetchError === null || typeof meta.fetchError === "string")
      )
        throw new McpSubscriptionAddError("storage_unavailable");
      if (meta.cssSelectors !== undefined) throw new McpSubscriptionAddError("unsupported_feed");
      return;
    }
    const meta: SharedFeedMeta = {
      ...feed,
      lastFetchedAt: null,
      fetchError: null,
      articleCount: 0,
      pageCount: 0,
      knownIds: [],
    };
    let committed: R2Object | null;
    try {
      committed = await bucket.put(key, JSON.stringify(meta), {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/json" },
      });
    } catch {
      throw new McpSubscriptionAddError("storage_unavailable");
    }
    if (committed) return;
  }
  throw new McpSubscriptionAddError("retryable_conflict");
}

function failure(error: unknown): McpSubscriptionAddResult | null {
  if (error instanceof McpSubscriptionAddError)
    return {
      status: error.code,
      retryable: ["maintenance_paused", "retryable_conflict", "storage_unavailable"].includes(
        error.code,
      ),
    };
  if (error instanceof UserSubscriptionMutationError)
    return {
      status: error.code === "SUBSCRIPTION_CONFLICT" ? "retryable_conflict" : "storage_unavailable",
      retryable: true,
    };
  return null;
}

/** Share the UI add cooldown's existing key without importing Next route response helpers. */
async function publicFeedCooldown(kv: KVNamespace, userId: string): Promise<number | null> {
  const key = feedAddCooldownKey(userId);
  return serialized(key, async () => {
    const now = Date.now();
    const value = await kv.get(key);
    if (value !== null) {
      if (typeof value !== "string" || !/^\d{1,16}$/.test(value))
        throw new McpSubscriptionAddError("storage_unavailable");
      const timestamp = Number(value);
      if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > now)
        throw new McpSubscriptionAddError("storage_unavailable");
      const elapsed = now - timestamp;
      if (elapsed < MCP_SUBSCRIPTION_ADD_LIMITS.cooldownMs)
        return Math.ceil((MCP_SUBSCRIPTION_ADD_LIMITS.cooldownMs - elapsed) / 1000);
    }
    await kv.put(key, String(now), { expirationTtl: 60 });
    return null;
  });
}

/** Identity comes only from the authenticated resource boundary, never tool arguments. */
export function createMcpSubscriptionAdder(
  env: Pick<CloudflareEnv, "RSS_DATA" | "RATE_LIMIT" | "RSS_FEED_WRITES_PAUSED">,
  verifiedUserId: string,
  dependencies: McpSubscriptionAddDependencies,
) {
  if (!isValidUserId(verifiedUserId) || verifiedUserId === "." || verifiedUserId === "..")
    throw new McpSubscriptionAddError("storage_unavailable");
  const assertCanCommit = async () => {
    if (isFeedWritesPaused(env.RSS_FEED_WRITES_PAUSED))
      throw new McpSubscriptionAddError("maintenance_paused");
    await dependencies.assertAuthorized();
    if (isFeedWritesPaused(env.RSS_FEED_WRITES_PAUSED))
      throw new McpSubscriptionAddError("maintenance_paused");
  };
  const reportExisting = async (
    subscription: UserSubscription,
  ): Promise<McpSubscriptionAddResult> => {
    await assertCanCommit();
    const identity = {
      feedId: subscription.feedHash,
      canonicalUrl: normalizePublicFeedUrl(subscription.url)!,
      subscriptionCommitted: true as const,
    };
    try {
      await dependencies.onExisting?.(subscription.feedHash);
    } catch {
      return { status: "repair_required", ...identity, retryable: true };
    }
    return { status: "already_subscribed", ...identity };
  };
  return {
    async addSubscription(input: unknown): Promise<McpSubscriptionAddResult> {
      const parsed = mcpSubscriptionAddSchema.safeParse(input);
      const url = parsed.success ? normalizePublicFeedUrl(parsed.data.url) : null;
      if (!url) return { status: "invalid_url", retryable: false };
      if (isFeedWritesPaused(env.RSS_FEED_WRITES_PAUSED))
        return { status: "maintenance_paused", retryable: true };
      await dependencies.assertAuthorized();
      try {
        const existing = await mutateUserSubscriptions(env.RSS_DATA, verifiedUserId, (current) => ({
          subscriptions: current,
          result: matchingSubscription(current, url),
          changed: false,
        }));
        if (existing) return await reportExisting(existing);
      } catch (error) {
        const result = failure(error);
        if (result) return result;
        throw error;
      }
      try {
        const retryAfter = await publicFeedCooldown(env.RATE_LIMIT, verifiedUserId);
        if (retryAfter !== null)
          return {
            status: "cooldown",
            retryable: true,
            retryAfter,
          };
      } catch {
        return { status: "storage_unavailable", retryable: true };
      }
      try {
        await assertCanCommit();
      } catch (error) {
        const result = failure(error);
        if (result) return result;
        throw error;
      }

      const visited = new Set<string>();
      let finalUrl: string | null = null;
      let metadata: PublicFeedMetadata;
      try {
        const response = await fetchFollowSafeRedirects(
          url,
          {
            method: "GET",
            credentials: "omit",
            headers: {
              "User-Agent": RSS_USER_AGENT,
              Accept:
                "application/rss+xml, application/atom+xml, application/feed+json, application/xml, text/xml, application/json",
            },
          },
          MCP_SUBSCRIPTION_ADD_LIMITS.fetchTimeoutMs,
          {
            validateUrl: (candidate) => {
              const normalized = normalizePublicFeedUrl(candidate);
              if (!normalized) throw new McpSubscriptionAddError("invalid_url");
              visited.add(normalized);
              return true;
            },
            onResponseUrl: (candidate) => {
              finalUrl = normalizePublicFeedUrl(candidate);
            },
          },
        );
        if (!response.ok || !finalUrl) {
          void response.body?.cancel().catch(() => {});
          throw new McpSubscriptionAddError("unsupported_feed");
        }
        metadata = parsePublicFeed(
          await readResponseText(
            response,
            MCP_SUBSCRIPTION_ADD_LIMITS.maxFeedBytes,
            MCP_SUBSCRIPTION_ADD_LIMITS.fetchTimeoutMs,
          ),
          finalUrl,
        );
      } catch (error) {
        const result = failure(error);
        if (result) return result;
        return { status: "unsupported_feed", retryable: !(error instanceof BodyTooLargeError) };
      }
      const canonicalUrl: string = finalUrl!;
      const feed: CommittedPublicFeed = {
        ...metadata,
        url: canonicalUrl,
        feedHash: await computeFeedHash(canonicalUrl),
      };
      try {
        await assertCanCommit();
        // Redirect identity may already belong to this owner. Do not create unused metadata
        // for an existing subscription or a capacity-rejected addition.
        const resolved = await mutateUserSubscriptions<
          UserSubscription | "limit_reached" | undefined
        >(env.RSS_DATA, verifiedUserId, (current) => ({
          subscriptions: current,
          result:
            matchingSubscription(current, canonicalUrl) ??
            matchingSubscription(current, url) ??
            (current.length >= MAX_FEEDS_PER_USER ? "limit_reached" : undefined),
          changed: false,
        }));
        if (resolved === "limit_reached") return { status: "limit_reached", retryable: false };
        if (resolved) return await reportExisting(resolved);
        await ensurePublicFeedMetadata(env.RSS_DATA, feed);
        const now = new Date().toISOString();
        const aliases = [...visited].filter((alias) => alias !== canonicalUrl);
        const outcome = await mutateUserSubscriptions<McpSubscriptionAddResult>(
          env.RSS_DATA,
          verifiedUserId,
          (current) => {
            const existing =
              matchingSubscription(current, canonicalUrl) ?? matchingSubscription(current, url);
            if (existing)
              return {
                subscriptions: current,
                result: {
                  status: "already_subscribed",
                  feedId: existing.feedHash,
                  canonicalUrl: normalizePublicFeedUrl(existing.url)!,
                  subscriptionCommitted: true,
                },
                changed: false,
              };
            if (current.length >= MAX_FEEDS_PER_USER)
              return {
                subscriptions: current,
                result: { status: "limit_reached", retryable: false },
                changed: false,
              };
            const subscription: UserSubscription = {
              feedHash: feed.feedHash,
              url: canonicalUrl,
              subscribedAt: now,
              lastAccessedAt: now,
              ...(aliases.length ? { publicFeedAliases: aliases } : {}),
            };
            return {
              subscriptions: [...current, subscription],
              result: {
                status: "added",
                feedId: feed.feedHash,
                canonicalUrl,
                subscriptionCommitted: true,
              },
            };
          },
          { beforeCommit: assertCanCommit },
        );
        if (outcome.status === "already_subscribed")
          return await reportExisting({
            feedHash: outcome.feedId,
            url: outcome.canonicalUrl,
            subscribedAt: now,
          });
        if (outcome.status !== "added") return outcome;
        // The R2 subscription is durable. Independent index/cache failures require repair;
        // they cannot roll it back or be represented as a fully completed addition.
        try {
          await assertCanCommit();
          await dependencies.afterCommit(feed);
        } catch {
          return {
            status: "repair_required",
            feedId: feed.feedHash,
            canonicalUrl,
            subscriptionCommitted: true,
            retryable: true,
          };
        }
        return outcome;
      } catch (error) {
        const result = failure(error);
        if (result) return result;
        throw error;
      }
    },
  };
}
