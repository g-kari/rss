import { test, expect } from "@playwright/test";
import {
  isWorkersAiModelId,
  AI_MODELS,
  VALID_MODEL_IDS,
  DEFAULT_AI_MODEL,
} from "../src/lib/ai-models";

/**
 * isWorkersAiModelId の単体テスト（Issue #586）。
 *
 * ai-route-helper.ts は Cloudflare バインディング（R2・AI・KV）に依存しているため
 * 直接テストできないが、同ファイルが依存する ai-models.ts の純粋関数は
 * バインディング不要でテスト可能。
 */

test.describe("isWorkersAiModelId — 許可された全モデル ID", () => {
  for (const { id, label } of AI_MODELS) {
    test(`${label}（${id}）は true を返す`, () => {
      expect(isWorkersAiModelId(id)).toBe(true);
    });
  }
});

test.describe("isWorkersAiModelId — 無効な値は false を返す", () => {
  test("空文字列は false", () => {
    expect(isWorkersAiModelId("")).toBe(false);
  });

  test("任意の文字列は false", () => {
    expect(isWorkersAiModelId("gpt-4")).toBe(false);
  });

  test("存在しない Workers AI モデル ID は false", () => {
    expect(isWorkersAiModelId("@cf/meta/llama-3.1-8b")).toBe(false);
  });

  test("モデル ID の部分文字列は false", () => {
    expect(isWorkersAiModelId("llama-3.1-8b-instruct")).toBe(false);
  });

  test("undefined は false", () => {
    expect(isWorkersAiModelId(undefined)).toBe(false);
  });

  test("null は false", () => {
    expect(isWorkersAiModelId(null)).toBe(false);
  });

  test("数値は false", () => {
    expect(isWorkersAiModelId(42)).toBe(false);
  });

  test("オブジェクトは false", () => {
    expect(isWorkersAiModelId({ id: "@cf/meta/llama-3.1-8b-instruct" })).toBe(false);
  });

  test("配列は false", () => {
    expect(isWorkersAiModelId(["@cf/meta/llama-3.1-8b-instruct"])).toBe(false);
  });

  test("大文字小文字が異なる場合は false", () => {
    expect(isWorkersAiModelId("@CF/META/LLAMA-3.1-8B-INSTRUCT")).toBe(false);
  });
});

test.describe("DEFAULT_AI_MODEL", () => {
  test("デフォルトモデルは有効なモデル ID である", () => {
    expect(isWorkersAiModelId(DEFAULT_AI_MODEL)).toBe(true);
  });

  test("デフォルトモデルは Llama 3.1 8B", () => {
    expect(DEFAULT_AI_MODEL).toBe("@cf/meta/llama-3.1-8b-instruct");
  });
});

test.describe("VALID_MODEL_IDS", () => {
  test("VALID_MODEL_IDS は AI_MODELS の id を全て含む", () => {
    for (const { id } of AI_MODELS) {
      expect(VALID_MODEL_IDS).toContain(id);
    }
  });

  test("VALID_MODEL_IDS の長さは AI_MODELS と一致する", () => {
    expect(VALID_MODEL_IDS.length).toBe(AI_MODELS.length);
  });

  test("VALID_MODEL_IDS の全要素は isWorkersAiModelId で true になる", () => {
    for (const id of VALID_MODEL_IDS) {
      expect(isWorkersAiModelId(id)).toBe(true);
    }
  });
});

// #698: articleId 形式バリデーション (旧仕様) は ai-route-helper.ts から完全削除
// (cross-user cache poisoning 対策で url ベースの sha256 hash key に切替)
// 旧 articleId regex の spec はここで一括削除済 (commit history で過去経緯を参照)。
