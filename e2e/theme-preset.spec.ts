import { test, expect } from "@playwright/test";
import {
  parseThemePresets,
  serializeThemePresets,
  MAX_THEME_PRESETS,
  THEME_PRESET_NAME_MAX_LENGTH,
  type ThemePreset,
} from "../src/lib/theme-preset";

// `theme-preset.ts` の純粋関数 (parseThemePresets / serializeThemePresets) の振る舞いを
// 全分岐網羅で固定する。Cloudflare バインディング非依存のためユニット相当のテスト。

function makePreset(overrides: Partial<ThemePreset> = {}): ThemePreset {
  return {
    id: "preset-1",
    name: "ダーク + serif + 大",
    theme: "dark",
    fontSize: "large",
    fontFamily: "serif",
    lineHeight: "relaxed",
    contentWidth: "medium",
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

test.describe("parseThemePresets — localStorage 生 string の safe parse", () => {
  test("null → []", () => {
    expect(parseThemePresets(null)).toEqual([]);
  });

  test("undefined → []", () => {
    expect(parseThemePresets(undefined)).toEqual([]);
  });

  test("空文字列 → []", () => {
    expect(parseThemePresets("")).toEqual([]);
  });

  test("不正 JSON → []", () => {
    expect(parseThemePresets("not json")).toEqual([]);
  });

  test("配列でない (object) → []", () => {
    expect(parseThemePresets(JSON.stringify({ foo: "bar" }))).toEqual([]);
  });

  test("配列でない (primitive number) → []", () => {
    expect(parseThemePresets("42")).toEqual([]);
  });

  test("配列でない (string literal) → []", () => {
    expect(parseThemePresets(JSON.stringify("hello"))).toEqual([]);
  });

  test("空配列 → []", () => {
    expect(parseThemePresets("[]")).toEqual([]);
  });

  test("正常 1 件 → 1 件", () => {
    const preset = makePreset();
    expect(parseThemePresets(JSON.stringify([preset]))).toEqual([preset]);
  });

  test("正常複数件 → 全件 (入力順保持)", () => {
    const p1 = makePreset({ id: "id-1", name: "p1" });
    const p2 = makePreset({ id: "id-2", name: "p2", theme: "light" });
    const p3 = makePreset({ id: "id-3", name: "p3", fontSize: "small" });
    expect(parseThemePresets(JSON.stringify([p1, p2, p3]))).toEqual([p1, p2, p3]);
  });

  test("entry に id 欠落 → 該当 skip", () => {
    const valid = makePreset({ id: "ok" });
    const invalid = { ...makePreset({ id: "skip" }), id: undefined };
    const result = parseThemePresets(JSON.stringify([invalid, valid]));
    expect(result).toEqual([valid]);
  });

  test("entry に name 欠落 → 該当 skip", () => {
    const valid = makePreset({ id: "ok" });
    const invalid = { ...makePreset({ id: "skip" }), name: undefined };
    const result = parseThemePresets(JSON.stringify([invalid, valid]));
    expect(result).toEqual([valid]);
  });

  test("entry の name が空文字 → 該当 skip", () => {
    const valid = makePreset({ id: "ok" });
    const invalid = makePreset({ id: "skip", name: "" });
    const result = parseThemePresets(JSON.stringify([invalid, valid]));
    expect(result).toEqual([valid]);
  });

  test("entry の name が上限超過 (31 文字) → 該当 skip", () => {
    const tooLong = "a".repeat(THEME_PRESET_NAME_MAX_LENGTH + 1);
    const valid = makePreset({ id: "ok" });
    const invalid = makePreset({ id: "skip", name: tooLong });
    const result = parseThemePresets(JSON.stringify([invalid, valid]));
    expect(result).toEqual([valid]);
  });

  test("entry の theme が不正 → 該当 skip", () => {
    const valid = makePreset({ id: "ok" });
    const invalid = { ...makePreset({ id: "skip" }), theme: "neon" };
    const result = parseThemePresets(JSON.stringify([invalid, valid]));
    expect(result).toEqual([valid]);
  });

  test("entry の fontSize が不正値 → 該当 skip", () => {
    const valid = makePreset({ id: "ok" });
    const invalid = { ...makePreset({ id: "skip" }), fontSize: "huge" };
    const result = parseThemePresets(JSON.stringify([invalid, valid]));
    expect(result).toEqual([valid]);
  });

  test("entry の fontFamily が不正値 → 該当 skip", () => {
    const valid = makePreset({ id: "ok" });
    const invalid = { ...makePreset({ id: "skip" }), fontFamily: "comic-sans" };
    const result = parseThemePresets(JSON.stringify([invalid, valid]));
    expect(result).toEqual([valid]);
  });

  test("entry の lineHeight が不正値 → 該当 skip", () => {
    const valid = makePreset({ id: "ok" });
    const invalid = { ...makePreset({ id: "skip" }), lineHeight: "extra-wide" };
    const result = parseThemePresets(JSON.stringify([invalid, valid]));
    expect(result).toEqual([valid]);
  });

  test("entry の contentWidth が不正値 → 該当 skip", () => {
    const valid = makePreset({ id: "ok" });
    const invalid = { ...makePreset({ id: "skip" }), contentWidth: "ultrawide" };
    const result = parseThemePresets(JSON.stringify([invalid, valid]));
    expect(result).toEqual([valid]);
  });

  test("entry の createdAt が文字列 → 該当 skip", () => {
    const valid = makePreset({ id: "ok" });
    const invalid = { ...makePreset({ id: "skip" }), createdAt: "1700000000000" };
    const result = parseThemePresets(JSON.stringify([invalid, valid]));
    expect(result).toEqual([valid]);
  });

  test("entry の createdAt が NaN → 該当 skip", () => {
    const valid = makePreset({ id: "ok" });
    // NaN は JSON では null になるので raw object でテスト
    const raw = JSON.stringify([{ ...makePreset({ id: "skip" }), createdAt: null }, valid]);
    expect(parseThemePresets(raw)).toEqual([valid]);
  });

  test("entry が primitive (number / string / null) → 該当 skip", () => {
    const valid = makePreset({ id: "ok" });
    const raw = JSON.stringify([42, "foo", null, valid]);
    expect(parseThemePresets(raw)).toEqual([valid]);
  });

  test("entry が array → 該当 skip", () => {
    const valid = makePreset({ id: "ok" });
    const raw = JSON.stringify([[1, 2, 3], valid]);
    expect(parseThemePresets(raw)).toEqual([valid]);
  });

  test("重複 id → 後勝ち (後の entry が前を上書き)", () => {
    const first = makePreset({ id: "dup", name: "first" });
    const second = makePreset({ id: "dup", name: "second" });
    const result = parseThemePresets(JSON.stringify([first, second]));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("second");
  });

  test("追加プロパティを持つ entry は許容 (既知 field のみ採用)", () => {
    const valid = makePreset();
    const raw = JSON.stringify([{ ...valid, extraField: "ignored" }]);
    const result = parseThemePresets(raw);
    expect(result).toEqual([valid]);
  });
});

test.describe("serializeThemePresets — JSON 化 + 上限切り捨て", () => {
  test("空配列 → '[]'", () => {
    expect(serializeThemePresets([])).toBe("[]");
  });

  test("1 件 → そのまま JSON 化", () => {
    const preset = makePreset();
    const serialized = serializeThemePresets([preset]);
    expect(JSON.parse(serialized)).toEqual([preset]);
  });

  test("上限内 (20 件) → 全件保持", () => {
    const presets = Array.from({ length: MAX_THEME_PRESETS }, (_, i) =>
      makePreset({ id: `id-${i}`, name: `p${i}`, createdAt: 1_000 + i }),
    );
    const serialized = serializeThemePresets(presets);
    const parsed = JSON.parse(serialized) as ThemePreset[];
    expect(parsed).toHaveLength(MAX_THEME_PRESETS);
  });

  test("上限超過 (21 件) → createdAt 降順で新しい順に 20 件残す", () => {
    const presets = Array.from({ length: MAX_THEME_PRESETS + 1 }, (_, i) =>
      makePreset({ id: `id-${i}`, name: `p${i}`, createdAt: 1_000 + i }),
    );
    // 最古は createdAt=1000 (id-0)、最新は createdAt=1020 (id-20)
    const serialized = serializeThemePresets(presets);
    const parsed = JSON.parse(serialized) as ThemePreset[];
    expect(parsed).toHaveLength(MAX_THEME_PRESETS);
    // 最古 (id-0) は切り捨てられている
    expect(parsed.find((p) => p.id === "id-0")).toBeUndefined();
    // 最新 (id-20) は残っている
    expect(parsed.find((p) => p.id === "id-20")).toBeDefined();
  });

  test("入力配列を mutate しない", () => {
    const presets = Array.from({ length: MAX_THEME_PRESETS + 2 }, (_, i) =>
      makePreset({ id: `id-${i}`, name: `p${i}`, createdAt: 1_000 + i }),
    );
    const beforeLength = presets.length;
    const beforeFirstId = presets[0].id;
    serializeThemePresets(presets);
    expect(presets).toHaveLength(beforeLength);
    expect(presets[0].id).toBe(beforeFirstId);
  });

  test("parseThemePresets と round-trip 整合 (serialize → parse で同値)", () => {
    const presets = [
      makePreset({ id: "id-a", createdAt: 1000 }),
      makePreset({ id: "id-b", theme: "light", createdAt: 2000 }),
    ];
    const round = parseThemePresets(serializeThemePresets(presets));
    expect(round).toEqual(presets);
  });
});
