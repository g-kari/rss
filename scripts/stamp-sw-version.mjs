/**
 * public/sw.js の CACHE_VERSION をビルド日時ベースの文字列に置換する。
 * deploy 前に実行することで、デプロイごとに旧キャッシュが自動削除される。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const swPath = resolve(import.meta.dirname, "../public/sw.js");
const content = readFileSync(swPath, "utf-8");

const version = `rss-${Date.now().toString(36)}`;
const updated = content.replace(
  /^const CACHE_VERSION = ".*";$/m,
  `const CACHE_VERSION = "${version}";`,
);

writeFileSync(swPath, updated);
console.log(`sw.js CACHE_VERSION → "${version}"`);
