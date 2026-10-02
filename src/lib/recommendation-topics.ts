export type TopicPreferenceValue = "more" | "less";
export interface TopicPreference {
  topic: string;
  label: string;
  value: TopicPreferenceValue;
}
export const MAX_TOPIC_PREFERENCES = 64;
export const TOPIC_PREFERENCE_POINTS = 6;

/** Use exactly the same normalized category identity for evidence and explicit feedback. */
export function normalizeRecommendationTopic(value: string): string {
  return value.trim().slice(0, 60).normalize("NFKC").toLowerCase().trim().slice(0, 60).trim();
}

/** Local storage is untrusted; keep a bounded, unique list, never arbitrary score values. */
export function parseTopicPreferences(value: unknown): TopicPreference[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: TopicPreference[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { label, topic, value: preference } = entry as Record<string, unknown>;
    if (typeof label !== "string" || typeof topic !== "string") continue;
    const normalized = normalizeRecommendationTopic(topic);
    const trimmedLabel = label.trim().slice(0, 60);
    if (!normalized || !trimmedLabel || normalized !== normalizeRecommendationTopic(trimmedLabel))
      continue;
    if (preference !== "more" && preference !== "less") continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push({ topic: normalized, label: trimmedLabel, value: preference });
    if (result.length === MAX_TOPIC_PREFERENCES) break;
  }
  return result;
}
