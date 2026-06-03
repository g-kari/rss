import { test, expect } from "@playwright/test";
import {
  isValidIso8601,
  extractIds,
  parseNotes,
  parseSnoozedUntil,
  isValidBase64url,
  parseOrder,
  MAX_ID_LENGTH,
  MAX_NOTE_LENGTH,
} from "../src/lib/validation";

// ── isValidIso8601 ────────────────────────────────────────────

test.describe("isValidIso8601", () => {
  test.describe("正常ケース", () => {
    test("UTC（Z サフィックス）を受け入れる", () => {
      expect(isValidIso8601("2024-11-01T00:00:00Z")).toBe(true);
    });

    test("プラスオフセット付きを受け入れる", () => {
      expect(isValidIso8601("2024-11-01T09:00:00+09:00")).toBe(true);
    });

    test("マイナスオフセット付きを受け入れる", () => {
      expect(isValidIso8601("2024-11-01T00:00:00-05:00")).toBe(true);
    });

    test("ミリ秒付きを受け入れる", () => {
      expect(isValidIso8601("2024-11-01T12:34:56.789Z")).toBe(true);
    });

    test("サフィックスなしを受け入れる", () => {
      expect(isValidIso8601("2024-11-01T00:00:00")).toBe(true);
    });

    test("ミリ秒 + オフセット付きを受け入れる", () => {
      expect(isValidIso8601("2026-05-08T10:30:00.123+09:00")).toBe(true);
    });
  });

  test.describe("異常ケース", () => {
    test("null は拒否される", () => {
      expect(isValidIso8601(null)).toBe(false);
    });

    test("undefined は拒否される", () => {
      expect(isValidIso8601(undefined)).toBe(false);
    });

    test("空文字は拒否される", () => {
      expect(isValidIso8601("")).toBe(false);
    });

    test("数値は拒否される", () => {
      expect(isValidIso8601(1234567890)).toBe(false);
    });

    test("日付のみ（時刻なし）は拒否される", () => {
      expect(isValidIso8601("2024-11-01")).toBe(false);
    });

    test("不正フォーマットは拒否される", () => {
      expect(isValidIso8601("not-a-date")).toBe(false);
    });

    test("月が 2 桁でない場合は拒否される", () => {
      expect(isValidIso8601("2024-1-01T00:00:00Z")).toBe(false);
    });

    test("Unix タイムスタンプ（数値文字列）は拒否される", () => {
      expect(isValidIso8601("1730390400")).toBe(false);
    });
  });
});

// ── extractIds ───────────────────────────────────────────────

test.describe("extractIds", () => {
  test.describe("正常ケース", () => {
    test("文字列配列から ID を返す", () => {
      const result = extractIds(["abc", "def"], 100);
      expect(result).toEqual(["abc", "def"]);
    });

    test("重複を除去する", () => {
      const result = extractIds(["abc", "abc", "def"], 100);
      expect(result).toEqual(["abc", "def"]);
    });

    test("空配列は空配列を返す", () => {
      const result = extractIds([], 100);
      expect(result).toEqual([]);
    });

    test("上限ちょうどは null にならない", () => {
      const ids = Array.from({ length: 5 }, (_, i) => `id${i}`);
      expect(extractIds(ids, 5)).not.toBeNull();
    });
  });

  test.describe("フィルタリング", () => {
    test("空文字列は除外される", () => {
      const result = extractIds(["abc", "", "def"], 100);
      expect(result).toEqual(["abc", "def"]);
    });

    test("MAX_ID_LENGTH を超える文字列は除外される", () => {
      const tooLong = "a".repeat(MAX_ID_LENGTH + 1);
      const result = extractIds([tooLong, "valid"], 100);
      expect(result).toEqual(["valid"]);
    });

    test("MAX_ID_LENGTH ちょうどは通過する", () => {
      const exactly = "a".repeat(MAX_ID_LENGTH);
      const result = extractIds([exactly], 100);
      expect(result).toEqual([exactly]);
    });

    test("文字列以外は除外される", () => {
      const result = extractIds([123, null, "valid"], 100);
      expect(result).toEqual(["valid"]);
    });
  });

  test.describe("上限超過", () => {
    test("上限を超えると null を返す", () => {
      const ids = Array.from({ length: 6 }, (_, i) => `id${i}`);
      expect(extractIds(ids, 5)).toBeNull();
    });

    test("重複排除後に上限内なら null にならない", () => {
      // 重複を含むが、重複排除後は 3 件 → max=3 で null にならない
      const ids = ["a", "a", "b", "b", "c", "c"];
      expect(extractIds(ids, 3)).not.toBeNull();
      expect(extractIds(ids, 3)).toEqual(["a", "b", "c"]);
    });
  });

  test.describe("非配列入力", () => {
    test("null は空配列として扱われ [] を返す", () => {
      expect(extractIds(null, 100)).toEqual([]);
    });

    test("undefined は空配列として扱われ [] を返す", () => {
      expect(extractIds(undefined, 100)).toEqual([]);
    });

    test("オブジェクトは空配列として扱われ [] を返す", () => {
      expect(extractIds({ id: "abc" }, 100)).toEqual([]);
    });

    test("文字列は空配列として扱われ [] を返す", () => {
      expect(extractIds("abc", 100)).toEqual([]);
    });
  });
});

// ── parseNotes ───────────────────────────────────────────────

test.describe("parseNotes", () => {
  test.describe("正常ケース", () => {
    test("正常な Record<string, string> を返す", () => {
      const result = parseNotes({ articleA: "メモ1", articleB: "メモ2" });
      expect(result).toEqual({ articleA: "メモ1", articleB: "メモ2" });
    });

    test("MAX_NOTE_LENGTH ちょうどの value は通過する", () => {
      const longNote = "a".repeat(MAX_NOTE_LENGTH);
      const result = parseNotes({ id: longNote });
      expect(result).not.toBeNull();
      expect(result!["id"]).toBe(longNote);
    });
  });

  test.describe("フィルタリング", () => {
    test("key が空文字のエントリは除外される", () => {
      const result = parseNotes({ "": "メモ", valid: "ok" });
      expect(result).not.toBeNull();
      expect("" in result!).toBe(false);
      expect(result!["valid"]).toBe("ok");
    });

    test("key が MAX_ID_LENGTH 超えのエントリは除外される", () => {
      const longKey = "k".repeat(MAX_ID_LENGTH + 1);
      const result = parseNotes({ [longKey]: "メモ", valid: "ok" });
      expect(result).not.toBeNull();
      expect(result!["valid"]).toBe("ok");
      expect(longKey in result!).toBe(false);
    });

    test("value が MAX_NOTE_LENGTH 超えのエントリは除外される", () => {
      const tooLongNote = "a".repeat(MAX_NOTE_LENGTH + 1);
      const result = parseNotes({ article: tooLongNote, valid: "ok" });
      expect(result).not.toBeNull();
      expect("article" in result!).toBe(false);
      expect(result!["valid"]).toBe("ok");
    });

    test("value が空文字のエントリは除外される", () => {
      const result = parseNotes({ empty: "", valid: "ok" });
      expect(result).not.toBeNull();
      expect("empty" in result!).toBe(false);
    });

    test("value が文字列以外のエントリは除外される", () => {
      const result = parseNotes({ num: 123, valid: "ok" } as Record<string, unknown>);
      expect(result).not.toBeNull();
      expect("num" in result!).toBe(false);
    });
  });

  test.describe("異常ケース", () => {
    test("null は null を返す", () => {
      expect(parseNotes(null)).toBeNull();
    });

    test("undefined は null を返す", () => {
      expect(parseNotes(undefined)).toBeNull();
    });

    test("配列は null を返す", () => {
      expect(parseNotes(["a", "b"])).toBeNull();
    });

    test("文字列は null を返す", () => {
      expect(parseNotes("string")).toBeNull();
    });

    test("有効エントリが 0 件なら null を返す", () => {
      // key が空・value が空のみ
      expect(parseNotes({ "": "" })).toBeNull();
    });
  });

  test.describe("上限切り詰め", () => {
    test("maxNotes を超えるエントリは先頭から切り詰められる", () => {
      const obj: Record<string, string> = {};
      for (let i = 0; i < 5; i++) {
        obj[`article${i}`] = `note${i}`;
      }
      const result = parseNotes(obj, 3);
      expect(result).not.toBeNull();
      expect(Object.keys(result!).length).toBe(3);
    });
  });
});

// ── parseSnoozedUntil ────────────────────────────────────────

test.describe("parseSnoozedUntil", () => {
  test.describe("正常ケース", () => {
    test("未来の ISO 8601 日時を返す", () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1時間後
      const result = parseSnoozedUntil({ article1: future });
      expect(result).not.toBeNull();
      expect(result!["article1"]).toBe(future);
    });

    test("複数の未来日時を返す", () => {
      const future1 = new Date(Date.now() + 3600_000).toISOString();
      const future2 = new Date(Date.now() + 7200_000).toISOString();
      const result = parseSnoozedUntil({ a: future1, b: future2 });
      expect(result).not.toBeNull();
      expect(Object.keys(result!).length).toBe(2);
    });
  });

  test.describe("期限切れエントリの除去", () => {
    test("過去の日時は除去される", () => {
      const past = new Date(Date.now() - 1000).toISOString();
      const result = parseSnoozedUntil({ expired: past });
      expect(result).toBeNull();
    });

    test("過去と未来が混在する場合、過去のみ除去される", () => {
      const past = new Date(Date.now() - 1000).toISOString();
      const future = new Date(Date.now() + 3600_000).toISOString();
      const result = parseSnoozedUntil({ expired: past, valid: future });
      expect(result).not.toBeNull();
      expect("expired" in result!).toBe(false);
      expect(result!["valid"]).toBe(future);
    });
  });

  test.describe("フィルタリング", () => {
    test("key が空文字のエントリは除外される", () => {
      const future = new Date(Date.now() + 3600_000).toISOString();
      const result = parseSnoozedUntil({ "": future, valid: future });
      expect(result).not.toBeNull();
      expect("" in result!).toBe(false);
    });

    test("key が MAX_ID_LENGTH 超えのエントリは除外される", () => {
      const future = new Date(Date.now() + 3600_000).toISOString();
      const longKey = "k".repeat(MAX_ID_LENGTH + 1);
      const result = parseSnoozedUntil({ [longKey]: future, valid: future });
      expect(result).not.toBeNull();
      expect(longKey in result!).toBe(false);
    });

    test("value が ISO 8601 でない場合は除外される", () => {
      const future = new Date(Date.now() + 3600_000).toISOString();
      const result = parseSnoozedUntil({ bad: "not-a-date", valid: future });
      expect(result).not.toBeNull();
      expect("bad" in result!).toBe(false);
    });
  });

  test.describe("異常ケース", () => {
    test("null は null を返す", () => {
      expect(parseSnoozedUntil(null)).toBeNull();
    });

    test("undefined は null を返す", () => {
      expect(parseSnoozedUntil(undefined)).toBeNull();
    });

    test("配列は null を返す", () => {
      expect(parseSnoozedUntil([])).toBeNull();
    });

    test("有効エントリが 0 件なら null を返す", () => {
      expect(parseSnoozedUntil({})).toBeNull();
    });
  });

  test.describe("上限切り詰め", () => {
    test("maxSnoozed を超えるエントリは切り詰められる", () => {
      const future = new Date(Date.now() + 3600_000).toISOString();
      const obj: Record<string, string> = {};
      for (let i = 0; i < 5; i++) {
        obj[`article${i}`] = future;
      }
      const result = parseSnoozedUntil(obj, 3);
      expect(result).not.toBeNull();
      expect(Object.keys(result!).length).toBe(3);
    });
  });
});

// ── isValidBase64url ─────────────────────────────────────────

test.describe("isValidBase64url", () => {
  test.describe("正常ケース", () => {
    test("英数字のみ（パディングなし）を受け入れる", () => {
      // 12文字 base64url = 9バイト
      expect(isValidBase64url("YWJjZGVmZ2hp", 1, 100)).toBe(true);
    });

    test("パディング付きを受け入れる", () => {
      // "YQ==" = "a" (1バイト)
      expect(isValidBase64url("YQ==", 1, 100)).toBe(true);
    });

    test("ハイフン・アンダースコアを含む base64url を受け入れる", () => {
      // URL-safe 文字を含む文字列（decodedBytes が範囲内）
      expect(isValidBase64url("abc-def_ghi", 1, 100)).toBe(true);
    });

    test("minBytes の境界値を受け入れる", () => {
      // "AAAA" → 3バイト → minBytes=3 で通過
      expect(isValidBase64url("AAAA", 3, 100)).toBe(true);
    });

    test("maxBytes の境界値を受け入れる", () => {
      // "AAAA" → 3バイト → maxBytes=3 で通過
      expect(isValidBase64url("AAAA", 1, 3)).toBe(true);
    });
  });

  test.describe("異常ケース", () => {
    test("通常の base64（+ や /）は拒否される", () => {
      // base64url ではなく通常の base64 文字を含む
      expect(isValidBase64url("YWI+", 1, 100)).toBe(false);
      expect(isValidBase64url("YWI/", 1, 100)).toBe(false);
    });

    test("minBytes より小さいと拒否される", () => {
      // "YQ==" = 1バイト → minBytes=2 で拒否
      expect(isValidBase64url("YQ==", 2, 100)).toBe(false);
    });

    test("maxBytes より大きいと拒否される", () => {
      // "AAAA" → 3バイト → maxBytes=2 で拒否
      expect(isValidBase64url("AAAA", 1, 2)).toBe(false);
    });

    test("空文字は 0 バイト → minBytes=1 で拒否される", () => {
      expect(isValidBase64url("", 1, 100)).toBe(false);
    });

    test("スペースを含む場合は拒否される", () => {
      expect(isValidBase64url("YWJ j", 1, 100)).toBe(false);
    });

    // code-quality 監査 (#2, 82% 信頼度): 構造的に不正な base64
    // (`stripped.length % 4 === 1`) は 0 バイトとして silently 通過してしまう。
    test("stripped.length % 4 === 1 (1 文字 + パディング) は構造的不正で拒否される", () => {
      // "A=" — 1 base64 char + 1 padding。stripped="A" (length=1, % 4 == 1)
      // 1 char では 0 byte の base64 group は表現できない。修正前はこれが minBytes=0 で true を返す。
      expect(isValidBase64url("A=", 0, 100)).toBe(false);
    });

    test("単一文字 (パディングなし) も構造的不正", () => {
      // "A" — 1 base64 char、padding なし。同じく invalid。
      expect(isValidBase64url("A", 0, 100)).toBe(false);
    });

    test("5 文字 (パディングなし) も構造的不正 (5 % 4 == 1)", () => {
      // "AAAAA" — 5 chars、stripped length=5、% 4 == 1
      expect(isValidBase64url("AAAAA", 0, 100)).toBe(false);
    });

    test("4 文字 (% 4 == 0) は OK", () => {
      // "AAAA" — 4 chars、3 byte が抽出可能
      expect(isValidBase64url("AAAA", 0, 100)).toBe(true);
    });

    test("2 文字 + パディング (% 4 == 2) は OK", () => {
      // "AA==" — 1 byte
      expect(isValidBase64url("AA==", 0, 100)).toBe(true);
    });

    test("3 文字 + パディング (% 4 == 3) は OK", () => {
      // "AAA=" — 2 byte
      expect(isValidBase64url("AAA=", 0, 100)).toBe(true);
    });
  });
});

// ── parseOrder ────────────────────────────────────────────────

test.describe("parseOrder", () => {
  const MAX = 100;

  test.describe("正常ケース", () => {
    test("0 は OK (非負整数の下限)", () => {
      const result = parseOrder(0, MAX);
      expect(result).toEqual({ ok: true, order: 0 });
    });

    test("max ちょうどは OK", () => {
      const result = parseOrder(MAX, MAX);
      expect(result).toEqual({ ok: true, order: MAX });
    });

    test("中間の整数は OK", () => {
      const result = parseOrder(42, MAX);
      expect(result).toEqual({ ok: true, order: 42 });
    });
  });

  test.describe("異常ケース", () => {
    test("非数値 (string) は INVALID_ORDER", () => {
      const result = parseOrder("5", MAX);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_ORDER");
        expect(result.status).toBe(400);
        expect(result.message).toBe(`order must be a non-negative integer within ${MAX}`);
      }
    });

    test("非整数 (小数) は INVALID_ORDER", () => {
      const result = parseOrder(1.5, MAX);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("INVALID_ORDER");
    });

    test("負数は INVALID_ORDER", () => {
      const result = parseOrder(-1, MAX);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("INVALID_ORDER");
    });

    test("max 超過は INVALID_ORDER", () => {
      const result = parseOrder(MAX + 1, MAX);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("INVALID_ORDER");
    });

    test("Number.MAX_SAFE_INTEGER は INVALID_ORDER (sortByOrder 破壊防止)", () => {
      const result = parseOrder(Number.MAX_SAFE_INTEGER, MAX);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("INVALID_ORDER");
    });

    test("NaN は INVALID_ORDER", () => {
      const result = parseOrder(NaN, MAX);
      expect(result.ok).toBe(false);
    });

    test("undefined は INVALID_ORDER", () => {
      const result = parseOrder(undefined, MAX);
      expect(result.ok).toBe(false);
    });
  });
});
