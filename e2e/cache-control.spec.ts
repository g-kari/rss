import { test, expect } from "@playwright/test";
import {
  parseCacheControl,
  computeNextFetchEarliestAt,
  CACHE_CONTROL_MIN_SECONDS,
  CACHE_CONTROL_MAX_SECONDS,
} from "../src/lib/fetch";

/**
 * Cache-Control パーサー / 次回フェッチ時刻計算のユニットテスト。
 *
 * issue #116: サイトが返す Cache-Control に従って cron の取得間隔を最適化し
 * 配信元サーバーへのアクセス量をコントロールする。
 */

test.describe("parseCacheControl", () => {
  test("null / undefined / 空文字 は全てデフォルト値を返す", () => {
    expect(parseCacheControl(null)).toEqual({
      noStore: false,
      mustRevalidate: false,
      maxAgeSeconds: null,
    });
    expect(parseCacheControl(undefined)).toEqual({
      noStore: false,
      mustRevalidate: false,
      maxAgeSeconds: null,
    });
    expect(parseCacheControl("")).toEqual({
      noStore: false,
      mustRevalidate: false,
      maxAgeSeconds: null,
    });
  });

  test("max-age=N を読み取る", () => {
    expect(parseCacheControl("max-age=600").maxAgeSeconds).toBe(600);
  });

  test("s-maxage は max-age より優先される", () => {
    expect(parseCacheControl("max-age=60, s-maxage=3600").maxAgeSeconds).toBe(3600);
  });

  test("no-store を認識する", () => {
    const r = parseCacheControl("no-store, max-age=0");
    expect(r.noStore).toBe(true);
  });

  test("no-cache / must-revalidate を認識する", () => {
    expect(parseCacheControl("no-cache").mustRevalidate).toBe(true);
    expect(parseCacheControl("must-revalidate").mustRevalidate).toBe(true);
    expect(parseCacheControl("proxy-revalidate").mustRevalidate).toBe(true);
  });

  test("大文字小文字混在を正規化する", () => {
    expect(parseCacheControl("Max-Age=120, No-Store").maxAgeSeconds).toBe(120);
    expect(parseCacheControl("Max-Age=120, No-Store").noStore).toBe(true);
  });

  test("壊れた値（負数・非数値）は無視する", () => {
    expect(parseCacheControl("max-age=-1").maxAgeSeconds).toBeNull();
    expect(parseCacheControl("max-age=abc").maxAgeSeconds).toBeNull();
    expect(parseCacheControl("max-age=").maxAgeSeconds).toBeNull();
  });

  test("ダブルクォートで囲まれた値も読める", () => {
    expect(parseCacheControl('max-age="300"').maxAgeSeconds).toBe(300);
  });

  test("空白と複数ディレクティブを許容する", () => {
    const r = parseCacheControl("  public ,  max-age=180 , must-revalidate  ");
    expect(r.maxAgeSeconds).toBe(180);
    expect(r.mustRevalidate).toBe(true);
  });

  test("未知ディレクティブは無視して他を読む", () => {
    const r = parseCacheControl("public, immutable, max-age=90");
    expect(r.maxAgeSeconds).toBe(90);
  });
});

test.describe("computeNextFetchEarliestAt", () => {
  const NOW = 1_700_000_000_000; // 固定時刻

  test("no-store は null（常に再取得）", () => {
    expect(computeNextFetchEarliestAt("no-store", NOW)).toBeNull();
  });

  test("max-age 欠落は null（通常どおり条件付き GET に任せる）", () => {
    expect(computeNextFetchEarliestAt("public", NOW)).toBeNull();
    expect(computeNextFetchEarliestAt(null, NOW)).toBeNull();
  });

  test("max-age が MIN 未満は MIN にクランプ", () => {
    expect(computeNextFetchEarliestAt("max-age=60", NOW)).toBe(
      NOW + CACHE_CONTROL_MIN_SECONDS * 1000,
    );
  });

  test("max-age が MAX 超過は MAX にクランプ", () => {
    expect(computeNextFetchEarliestAt("max-age=99999999", NOW)).toBe(
      NOW + CACHE_CONTROL_MAX_SECONDS * 1000,
    );
  });

  test("MIN ≤ max-age ≤ MAX はそのまま使う", () => {
    expect(computeNextFetchEarliestAt("max-age=3600", NOW)).toBe(NOW + 3600 * 1000);
  });

  test("s-maxage が優先される", () => {
    expect(computeNextFetchEarliestAt("max-age=60, s-maxage=3600", NOW)).toBe(NOW + 3600 * 1000);
  });

  test("no-cache / must-revalidate は max-age があっても null（サーバー検証必須）", () => {
    expect(computeNextFetchEarliestAt("no-cache, max-age=3600", NOW)).toBeNull();
    expect(computeNextFetchEarliestAt("must-revalidate, max-age=3600", NOW)).toBeNull();
  });
});
