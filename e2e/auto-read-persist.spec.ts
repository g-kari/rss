import { test, expect } from "@playwright/test";
import {
  AUTO_READ_RESUME_TTL_MS,
  parsePersistedAutoReadState,
  serializeAutoReadState,
  shouldRestoreAutoMode,
} from "../src/lib/auto-read-persist";

test.describe("parsePersistedAutoReadState — localStorage 値のパース", () => {
  test("正しい JSON → state 復元", () => {
    const raw = JSON.stringify({ enabled: true, savedAt: 1234567890 });
    expect(parsePersistedAutoReadState(raw)).toEqual({ enabled: true, savedAt: 1234567890 });
  });

  test("null → null", () => {
    expect(parsePersistedAutoReadState(null)).toBeNull();
  });

  test("空文字 → null", () => {
    expect(parsePersistedAutoReadState("")).toBeNull();
  });

  test("不正 JSON → null", () => {
    expect(parsePersistedAutoReadState("not json")).toBeNull();
  });

  test("enabled が boolean でない → null", () => {
    const raw = JSON.stringify({ enabled: "true", savedAt: 100 });
    expect(parsePersistedAutoReadState(raw)).toBeNull();
  });

  test("savedAt が数値でない → null", () => {
    const raw = JSON.stringify({ enabled: true, savedAt: "100" });
    expect(parsePersistedAutoReadState(raw)).toBeNull();
  });

  test("savedAt が NaN → null", () => {
    const raw = JSON.stringify({ enabled: true, savedAt: NaN });
    expect(parsePersistedAutoReadState(raw)).toBeNull();
  });

  test("空オブジェクト → null", () => {
    expect(parsePersistedAutoReadState("{}")).toBeNull();
  });

  test("配列 → null", () => {
    expect(parsePersistedAutoReadState("[]")).toBeNull();
  });

  test("追加プロパティがあっても無視して enabled / savedAt のみ採用", () => {
    const raw = JSON.stringify({ enabled: false, savedAt: 999, extra: "ignored" });
    expect(parsePersistedAutoReadState(raw)).toEqual({ enabled: false, savedAt: 999 });
  });
});

test.describe("shouldRestoreAutoMode — リロード時の autoMode 初期値判定", () => {
  const now = 10_000_000;

  test("state なし → false", () => {
    expect(shouldRestoreAutoMode(null, now)).toBe(false);
  });

  test("enabled=false → false (OFF が永続化されてた)", () => {
    expect(shouldRestoreAutoMode({ enabled: false, savedAt: now - 100 }, now)).toBe(false);
  });

  test("enabled=true + 1 分前 → true (期限内)", () => {
    expect(shouldRestoreAutoMode({ enabled: true, savedAt: now - 60 * 1000 }, now)).toBe(true);
  });

  test("enabled=true + 30 分前 → true", () => {
    expect(shouldRestoreAutoMode({ enabled: true, savedAt: now - 30 * 60 * 1000 }, now)).toBe(true);
  });

  test("enabled=true + 59 分前 → true (1 時間境界の内側)", () => {
    expect(shouldRestoreAutoMode({ enabled: true, savedAt: now - 59 * 60 * 1000 }, now)).toBe(true);
  });

  test("enabled=true + ちょうど 1 時間前 → false (期限到達は OFF)", () => {
    expect(
      shouldRestoreAutoMode({ enabled: true, savedAt: now - AUTO_READ_RESUME_TTL_MS }, now),
    ).toBe(false);
  });

  test("enabled=true + 2 時間前 → false (期限超過)", () => {
    expect(shouldRestoreAutoMode({ enabled: true, savedAt: now - 2 * 60 * 60 * 1000 }, now)).toBe(
      false,
    );
  });

  test("enabled=true + 未来時刻 (時計戻り) → false (誤動作防止)", () => {
    expect(shouldRestoreAutoMode({ enabled: true, savedAt: now + 1000 }, now)).toBe(false);
  });

  test("カスタム ttlMs を渡せる", () => {
    // 5 分の TTL で 4 分前 → true / 6 分前 → false
    expect(
      shouldRestoreAutoMode({ enabled: true, savedAt: now - 4 * 60 * 1000 }, now, 5 * 60 * 1000),
    ).toBe(true);
    expect(
      shouldRestoreAutoMode({ enabled: true, savedAt: now - 6 * 60 * 1000 }, now, 5 * 60 * 1000),
    ).toBe(false);
  });
});

test.describe("serializeAutoReadState — 保存値の生成", () => {
  test("enabled=true + now → 正しい JSON", () => {
    const result = serializeAutoReadState(true, 1234);
    expect(JSON.parse(result)).toEqual({ enabled: true, savedAt: 1234 });
  });

  test("enabled=false + now → 正しい JSON", () => {
    const result = serializeAutoReadState(false, 5678);
    expect(JSON.parse(result)).toEqual({ enabled: false, savedAt: 5678 });
  });

  test("生成 → パース round-trip", () => {
    const raw = serializeAutoReadState(true, 999);
    expect(parsePersistedAutoReadState(raw)).toEqual({ enabled: true, savedAt: 999 });
  });
});

test.describe("AUTO_READ_RESUME_TTL_MS — 期限定数", () => {
  test("1 時間 = 3,600,000 ms", () => {
    expect(AUTO_READ_RESUME_TTL_MS).toBe(60 * 60 * 1000);
  });
});
