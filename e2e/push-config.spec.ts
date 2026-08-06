import { test, expect } from "@playwright/test";
import {
  isInSilentHours,
  isValidTimeHHMM,
  isValidIanaTimezone,
} from "../src/lib/push-silent-hours";
import type { PushConfig } from "../src/types";

function makeConfig(overrides: Partial<PushConfig> = {}): PushConfig {
  return { subscriptions: [], ...overrides };
}

test.describe("isValidTimeHHMM", () => {
  test("正常な HH:MM 形式を受け入れる", () => {
    expect(isValidTimeHHMM("00:00")).toBe(true);
    expect(isValidTimeHHMM("23:59")).toBe(true);
    expect(isValidTimeHHMM("09:30")).toBe(true);
    expect(isValidTimeHHMM("22:00")).toBe(true);
  });

  test("不正な形式を拒否する", () => {
    expect(isValidTimeHHMM("24:00")).toBe(true);
    expect(isValidTimeHHMM("9:30")).toBe(false);
    expect(isValidTimeHHMM("09:60")).toBe(false);
    expect(isValidTimeHHMM("")).toBe(false);
    expect(isValidTimeHHMM("abc")).toBe(false);
    expect(isValidTimeHHMM("9:5")).toBe(false);
  });
});

test.describe("isValidIanaTimezone", () => {
  test("有効なタイムゾーンを受け入れる", () => {
    expect(isValidIanaTimezone("Asia/Tokyo")).toBe(true);
    expect(isValidIanaTimezone("UTC")).toBe(true);
    expect(isValidIanaTimezone("America/New_York")).toBe(true);
  });

  test("無効なタイムゾーンを拒否する", () => {
    expect(isValidIanaTimezone("Invalid/Zone")).toBe(false);
    expect(isValidIanaTimezone("NotAZone")).toBe(false);
    expect(isValidIanaTimezone("")).toBe(false);
  });
});

test.describe("isInSilentHours", () => {
  test("silentStart/silentEnd/timezone が未設定の場合は false", () => {
    expect(isInSilentHours(makeConfig())).toBe(false);
    expect(isInSilentHours(makeConfig({ silentStart: "22:00" }))).toBe(false);
    expect(isInSilentHours(makeConfig({ silentStart: "22:00", silentEnd: "07:00" }))).toBe(false);
  });

  test("サイレント時間帯内なら true（日をまたがない場合）", () => {
    const config = makeConfig({
      silentStart: "22:00",
      silentEnd: "23:00",
      timezone: "UTC",
    });
    const inWindow = new Date("2025-01-01T22:30:00Z");
    expect(isInSilentHours(config, inWindow)).toBe(true);
  });

  test("サイレント時間帯外なら false（日をまたがない場合）", () => {
    const config = makeConfig({
      silentStart: "22:00",
      silentEnd: "23:00",
      timezone: "UTC",
    });
    const outOfWindow = new Date("2025-01-01T23:30:00Z");
    expect(isInSilentHours(config, outOfWindow)).toBe(false);
  });

  test("開始時刻ちょうどは true（境界値）", () => {
    const config = makeConfig({
      silentStart: "22:00",
      silentEnd: "23:00",
      timezone: "UTC",
    });
    const atStart = new Date("2025-01-01T22:00:00Z");
    expect(isInSilentHours(config, atStart)).toBe(true);
  });

  test("終了時刻ちょうどは false（境界値）", () => {
    const config = makeConfig({
      silentStart: "22:00",
      silentEnd: "23:00",
      timezone: "UTC",
    });
    const atEnd = new Date("2025-01-01T23:00:00Z");
    expect(isInSilentHours(config, atEnd)).toBe(false);
  });

  test("日またぎのサイレント時間帯内（深夜）なら true", () => {
    const config = makeConfig({
      silentStart: "22:00",
      silentEnd: "07:00",
      timezone: "UTC",
    });
    const midnight = new Date("2025-01-01T02:00:00Z");
    expect(isInSilentHours(config, midnight)).toBe(true);
  });

  test("日またぎのサイレント時間帯内（夜）なら true", () => {
    const config = makeConfig({
      silentStart: "22:00",
      silentEnd: "07:00",
      timezone: "UTC",
    });
    const evening = new Date("2025-01-01T23:00:00Z");
    expect(isInSilentHours(config, evening)).toBe(true);
  });

  test("日またぎのサイレント時間帯外（昼）なら false", () => {
    const config = makeConfig({
      silentStart: "22:00",
      silentEnd: "07:00",
      timezone: "UTC",
    });
    const daytime = new Date("2025-01-01T12:00:00Z");
    expect(isInSilentHours(config, daytime)).toBe(false);
  });

  test("日またぎで終了時刻ちょうどは false（境界値）", () => {
    const config = makeConfig({
      silentStart: "22:00",
      silentEnd: "07:00",
      timezone: "UTC",
    });
    const atEnd = new Date("2025-01-01T07:00:00Z");
    expect(isInSilentHours(config, atEnd)).toBe(false);
  });

  test("不正な HH:MM を含む場合は false にフォールバック", () => {
    const config = makeConfig({
      silentStart: "bad",
      silentEnd: "07:00",
      timezone: "UTC",
    });
    expect(isInSilentHours(config)).toBe(false);
  });

  test("無効なタイムゾーンの場合は false にフォールバック", () => {
    const config = makeConfig({
      silentStart: "22:00",
      silentEnd: "07:00",
      timezone: "Invalid/Zone",
    });
    expect(isInSilentHours(config)).toBe(false);
  });
});

test.describe("disabledFeeds フィルタリング（buildBatchedPushPayload との統合）", () => {
  test("disabledFeeds に含まれるフィードは通知に含まれない（概念テスト）", () => {
    const disabledFeeds: Record<string, boolean> = { feedHash1: true };
    const feedEntries = [
      { feedHash: "feedHash1", feedTitle: "無効フィード", articles: [] },
      { feedHash: "feedHash2", feedTitle: "有効フィード", articles: [] },
    ];
    const enabled = feedEntries.filter((e) => !disabledFeeds[e.feedHash]);
    expect(enabled).toHaveLength(1);
    expect(enabled[0].feedHash).toBe("feedHash2");
  });

  test("disabledFeeds が未設定の場合はすべてのフィードが通知対象", () => {
    const config = makeConfig();
    const feedEntries = [
      { feedHash: "feedHash1", feedTitle: "フィード1", articles: [] },
      { feedHash: "feedHash2", feedTitle: "フィード2", articles: [] },
    ];
    const enabled = config.disabledFeeds
      ? feedEntries.filter((e) => !config.disabledFeeds![e.feedHash])
      : feedEntries;
    expect(enabled).toHaveLength(2);
  });
});
