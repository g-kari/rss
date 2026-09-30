"use client";

import { loadJsonArray, loadJsonObject, saveJson, STORAGE_KEYS } from "./storage";

import type { RecommendationDismissal } from "../types";
export type { RecommendationDismissal } from "../types";
export interface DismissalChanges {
  add?: RecommendationDismissal[];
  remove?: string[];
  reset?: boolean;
}
export interface RecommendationConfigChange {
  userId: string;
  recommendationEnabled: boolean;
}
export const RECOMMENDATION_CONFIG_EVENT = "rss-recommendation-push-config";
export const DISMISSAL_TTL_MS = 30 * 86400000;
const MAX_DISMISSALS = 200;

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}
export function isDismissal(value: unknown): value is RecommendationDismissal {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    validId(entry.articleId) &&
    typeof entry.dismissedAt === "number" &&
    Number.isFinite(entry.dismissedAt)
  );
}
export function currentDismissals(entries: RecommendationDismissal[], now = Date.now()) {
  const seen = new Set<string>();
  return entries
    .filter(isDismissal)
    .filter((entry) => {
      const age = now - entry.dismissedAt;
      if (age < 0 || age >= DISMISSAL_TTL_MS || seen.has(entry.articleId)) return false;
      seen.add(entry.articleId);
      return true;
    })
    .slice(0, MAX_DISMISSALS);
}
export function dismissalStorageKey(userId: string) {
  return `${STORAGE_KEYS.ARTICLE_RECOMMENDATION_DISMISSALS}:${userId}`;
}
export function loadDismissals(userId: string, fallback: RecommendationDismissal[] = []) {
  return currentDismissals(loadJsonArray(dismissalStorageKey(userId), fallback, isDismissal));
}
function isChanges(value: unknown): value is DismissalChanges {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    (entry.reset === undefined || typeof entry.reset === "boolean") &&
    (entry.add === undefined || (Array.isArray(entry.add) && entry.add.every(isDismissal))) &&
    (entry.remove === undefined || (Array.isArray(entry.remove) && entry.remove.every(validId)))
  );
}
export function loadDismissalChanges(userId: string, fallback: DismissalChanges): DismissalChanges {
  return mergeDismissalChanges(
    {},
    loadJsonObject(`${dismissalStorageKey(userId)}:pending`, fallback, isChanges),
  );
}
export function saveDismissalChanges(userId: string, changes: DismissalChanges) {
  saveJson(`${dismissalStorageKey(userId)}:pending`, changes);
}
/** Compact queued intentions so undo/reset survive reloads and late responses. */
export function mergeDismissalChanges(
  previous: DismissalChanges,
  next: DismissalChanges,
): DismissalChanges {
  const base = next.reset ? {} : previous;
  const removed = new Set(base.remove ?? []);
  for (const id of next.remove ?? []) removed.add(id);
  const additions = currentDismissals(next.add ?? []);
  const addedIds = new Set(additions.map((entry) => entry.articleId));
  for (const id of addedIds) removed.delete(id);
  const add = currentDismissals([
    ...additions,
    ...(base.add ?? []).filter(
      (entry) => !removed.has(entry.articleId) && !addedIds.has(entry.articleId),
    ),
  ]);
  return {
    ...(base.reset || next.reset ? { reset: true } : {}),
    ...(add.length ? { add } : {}),
    ...(removed.size ? { remove: [...removed].slice(-MAX_DISMISSALS) } : {}),
  };
}
export function applyDismissalChanges(
  entries: RecommendationDismissal[],
  changes: DismissalChanges,
) {
  const removed = new Set(changes.remove ?? []);
  return currentDismissals([
    ...(changes.add ?? []),
    ...(changes.reset ? [] : entries).filter((entry) => !removed.has(entry.articleId)),
  ]);
}
export function recommendationConfigStorageKey(userId: string) {
  return `${dismissalStorageKey(userId)}:config-change`;
}
export function notifyRecommendationConfig(userId: string, recommendationEnabled: boolean) {
  // Other tabs only use this as an invalidation signal; consent is always read from the server.
  saveJson(recommendationConfigStorageKey(userId), {
    recommendationEnabled,
    changedAt: Date.now(),
    nonce: Math.random(),
  });
  window.dispatchEvent(
    new CustomEvent<RecommendationConfigChange>(RECOMMENDATION_CONFIG_EVENT, {
      detail: { userId, recommendationEnabled },
    }),
  );
}
