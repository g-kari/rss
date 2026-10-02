import { describe, expect, it } from "vitest";
import {
  MAX_TOPIC_PREFERENCES,
  normalizeRecommendationTopic,
  parseTopicPreferences,
} from "./recommendation-topics";

describe("topic identity and bounded preferences", () => {
  it("normalizes the same category identities used for scoring", () => {
    expect(normalizeRecommendationTopic("  Ｕｎｉｔｙ  ")).toBe("unity");
    expect(
      parseTopicPreferences([{ topic: " UNITY ", label: "Ｕｎｉｔｙ", value: "more" }]),
    ).toEqual([{ topic: "unity", label: "Ｕｎｉｔｙ", value: "more" }]);
  });
  it("rejects corrupted entries, arbitrary weights and mismatched labels", () => {
    for (const value of [null, false, 4, {}, "bad"])
      expect(parseTopicPreferences(value)).toEqual([]);
    expect(
      parseTopicPreferences([
        null,
        {},
        { topic: "unity", label: "Cooking", value: "less" },
        { topic: "", label: "", value: "more" },
        { topic: "AI", label: "AI", value: 999 },
      ]),
    ).toEqual([]);
  });
  it("deduplicates, caps and keeps special names as data", () => {
    const entries = [
      { topic: "__proto__", label: "__proto__", value: "less" },
      { topic: "Unity", label: "Unity", value: "more" },
      { topic: "ＵＮＩＴＹ", label: "ＵＮＩＴＹ", value: "less" },
      ...Array.from({ length: 100 }, (_, index) => ({
        topic: `tag-${index}`,
        label: `tag-${index}`,
        value: "more",
      })),
    ];
    const result = parseTopicPreferences(entries);
    expect(result).toHaveLength(MAX_TOPIC_PREFERENCES);
    expect(result[0].topic).toBe("__proto__");
    expect(result.filter((entry) => entry.topic === "unity")).toHaveLength(1);
  });
});

it("round-trips categories whose compatibility forms expand or introduce spaces", () => {
  for (const label of ["㍿".repeat(16), "´Topic", "Ｕｎｉｔｙ", "İ".repeat(40)]) {
    const first = parseTopicPreferences([{ topic: label, label, value: "more" }]);
    expect(first).toHaveLength(1);
    expect(parseTopicPreferences(first)).toEqual(first);
    expect(normalizeRecommendationTopic(first[0].topic)).toBe(first[0].topic);
  }
});
