#!/usr/bin/env node
/**
 * e2e spec ファイルからテストカバレッジマップを自動生成し、
 * `.claude/rules/architecture.md` の `<!-- TEST_COVERAGE_MAP_AUTO_GEN START -->` /
 * `<!-- TEST_COVERAGE_MAP_AUTO_GEN END -->` マーカー間に差し込む。
 *
 * docs drift 根絶 (#731) のため、`prebuild` / `pretypecheck` / `precheck:fix` で実行する。
 *
 * 各 spec の description は冒頭の JSDoc `/** ... *\/` の 1〜3 行目から抽出する。
 * JSDoc がない場合はファイル名から推測した default 行を使う。
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(__dirname, "..");
const e2eDir = join(projectRoot, "e2e");
const docPath = join(projectRoot, ".claude/rules/architecture.md");

const START_MARKER = "<!-- TEST_COVERAGE_MAP_AUTO_GEN START -->";
const END_MARKER = "<!-- TEST_COVERAGE_MAP_AUTO_GEN END -->";

/**
 * spec ファイル本文から先頭の JSDoc コメント 1 行目を抽出する。
 *
 * 期待形式:
 * ```
 * /**
 *  * <description (この行を抽出)>
 *  * ...
 *  *\/
 * ```
 */
export function extractSpecDescription(content) {
  const match = content.match(/^\/\*\*\s*\n\s*\*\s+(.+?)\n/);
  if (!match) return null;
  // 末尾の句読点除去 + trim
  return match[1].trim().replace(/[。．.]\s*$/, "");
}

function buildCoverageTable(specs) {
  const rows = ["| テストファイル | 対象モジュール / 機能 |", "| --- | --- |"];
  for (const { file, description } of specs) {
    rows.push(`| \`${file}\` | ${description} |`);
  }
  return rows.join("\n");
}

function collectSpecs() {
  if (!existsSync(e2eDir)) return [];
  const files = readdirSync(e2eDir)
    .filter((f) => f.endsWith(".spec.ts") && !f.startsWith("_"))
    .sort();
  return files.map((file) => {
    const content = readFileSync(join(e2eDir, file), "utf-8");
    const description = extractSpecDescription(content) ?? "(JSDoc 未記載)";
    return { file, description };
  });
}

function updateDoc(table) {
  const doc = readFileSync(docPath, "utf-8");
  const startIdx = doc.indexOf(START_MARKER);
  const endIdx = doc.indexOf(END_MARKER);
  if (startIdx < 0 || endIdx < 0) {
    console.error(
      `[test-coverage-map] markers not found in ${docPath} — insert ${START_MARKER} ... ${END_MARKER} first`,
    );
    process.exit(1);
  }
  const before = doc.slice(0, startIdx + START_MARKER.length);
  const after = doc.slice(endIdx);
  const next = `${before}\n\n${table}\n\n${after}`;
  if (next === doc) return false;
  writeFileSync(docPath, next, "utf-8");
  return true;
}

function main() {
  const specs = collectSpecs();
  const table = buildCoverageTable(specs);
  const changed = updateDoc(table);
  console.log(
    `[test-coverage-map] ${specs.length} specs scanned, doc ${changed ? "updated" : "unchanged"}`,
  );
}

// Run when invoked directly (not when imported by test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
