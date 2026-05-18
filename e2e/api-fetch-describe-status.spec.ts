import { test, expect } from "@playwright/test";
import { describeStatus } from "../src/lib/api-fetch";

/**
 * #804: HTTP status → ユーザー向けメッセージ分類の純粋関数 spec。
 *
 * 特に 401 (自社認証失敗、再ログイン要) と 403 (権限不足) のメッセージ分離を固定する。
 * 上流 fetch 先で 403 を受けた場合に「再ログインしてください」が表示されるとユーザーが
 * 混乱するため、両 status を別メッセージで返すこと。
 */
test.describe("describeStatus — HTTP status → ユーザー向けメッセージ分類", () => {
  test("401 は『再ログイン』メッセージ", () => {
    expect(describeStatus(401)).toBe("認証エラー：再ログインしてください");
  });

  test("403 は『アクセス権限がありません』メッセージ (401 と分離、#804)", () => {
    expect(describeStatus(403)).toBe("アクセス権限がありません");
  });

  test("401 と 403 のメッセージは異なる (再ログイン誤判定防止、#804)", () => {
    expect(describeStatus(401)).not.toBe(describeStatus(403));
  });

  test("413 は『送信データが大きすぎます』", () => {
    expect(describeStatus(413)).toBe("送信データが大きすぎます");
  });

  test("429 は『リクエスト過多』", () => {
    expect(describeStatus(429)).toBe("リクエスト過多：少し待って再試行してください");
  });

  test("504 は『タイムアウト』", () => {
    expect(describeStatus(504)).toBe("タイムアウト：時間をおいて再試行してください");
  });

  test("500 系 (500/502/503) は『サーバーエラー』", () => {
    expect(describeStatus(500)).toBe("サーバーエラー（時間をおいて再試行）");
    expect(describeStatus(502)).toBe("サーバーエラー（時間をおいて再試行）");
    expect(describeStatus(503)).toBe("サーバーエラー（時間をおいて再試行）");
  });

  test("未分類 status は HTTP {N} 形式 (例: 418 / 451)", () => {
    expect(describeStatus(418)).toBe("HTTP 418");
    expect(describeStatus(451)).toBe("HTTP 451");
  });

  test("status undefined は『ネットワークエラー』 (fetch reject 経路)", () => {
    expect(describeStatus(undefined)).toBe("ネットワークエラー");
    expect(describeStatus()).toBe("ネットワークエラー");
  });
});
