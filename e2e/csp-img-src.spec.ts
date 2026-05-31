import { test, expect } from "@playwright/test";

/**
 * CSP img-src ディレクティブの回帰テスト (#923)
 * 外部ドメイン直書きを削除して proxy 強制を CSP レベルで保証する。
 *
 * 全ての外部画像は /api/image-proxy 経由であるため、
 * img-src に外部ドメインを直接許可する必要はない。
 */

// middleware.ts の STATIC_CSP_SUFFIX を直接 import して検証する
// Node.js (Playwright の import) では next/server が依存しているため、
// 文字列パターンで中身を評価する純粋なアプローチを採用する
import { readFileSync } from "fs";
import { join } from "path";

test("middleware.ts の img-src に外部ドメインを直接記載しないこと (#923)", () => {
  const middlewarePath = join(process.cwd(), "middleware.ts");
  const content = readFileSync(middlewarePath, "utf-8");

  // img-src ディレクティブの行を抽出
  const imgSrcLine = content
    .split("\n")
    .find((line) => line.includes('"img-src') || line.includes("'img-src"));

  expect(imgSrcLine).toBeDefined();

  // qiita-user-contents.imgix.net と game.watch.impress.co.jp が
  // img-src に直接記載されていないことを確認
  expect(imgSrcLine).not.toContain("qiita-user-contents.imgix.net");
  expect(imgSrcLine).not.toContain("game.watch.impress.co.jp");
});

test("middleware.ts の img-src が self と blob: のみを許可していること (#923)", () => {
  const middlewarePath = join(process.cwd(), "middleware.ts");
  const content = readFileSync(middlewarePath, "utf-8");

  // img-src ディレクティブの行を抽出
  const imgSrcLine = content
    .split("\n")
    .find((line) => line.includes('"img-src') || line.includes("'img-src"));

  expect(imgSrcLine).toBeDefined();

  // img-src の値を抽出して検証
  // 期待値: "img-src 'self' blob:" のみ（https:// で始まる外部ドメインがない）
  // 外部ドメインが追加されていると https:// が含まれる
  const imgSrcValue = imgSrcLine!
    .trim()
    .replace(/^["']/, "")
    .replace(/["'],?$/, "");
  expect(imgSrcValue).toBe("img-src 'self' blob:");
});
