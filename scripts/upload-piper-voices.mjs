// piper-plus engine 用の voice モデル (HuggingFace) を Cloudflare R2 にセルフホストする
// script (#761 / piper-plus library 採用)。
//
// 背景:
//   piper-plus は `PiperPlus.initialize({ model: <URL> })` で任意 URL からモデルを load 可能。
//   日本語 voice (つくよみちゃん等) は `ayousanz/piper-plus-tsukuyomi-chan` HuggingFace repo に存在し、
//   piper-plus 形式 (MB-iSTFT decoder + 6lang + WavLM Prosody) で配布される。
//
//   R2 にセルフホストすることで:
//   1. HuggingFace 外部依存削減 (CSP 緩和不要、connect-src は same-origin で済む)
//   2. CDN 経由配信で latency 最小化 (Cloudflare edge cache)
//   3. voice ファイル名を library 期待形式 (`<model>.onnx` + `<model>.onnx.json`) に統一
//
// 使い方:
//   npx wrangler login  # 初回のみ
//   npm run upload:piper-voices
//
// 追加 voice: `VOICES` array にエントリ追加 + `src/lib/piper-voices.ts` の
// `PIPER_PLUS_VOICES` + `app/api/piper-voice/[file]/route.ts` の `ALLOWED_FILES` を同期更新。
//
// ライセンス注意:
//   - tsukuyomi-chan-corpus license: CC BY 4.0 + corpus 規約 (https://tyc.rei-yumesaki.net/)
//   - 商用利用条件・クレジット表記要件を遵守すること
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const BUCKET = "rss-reader-data";
const R2_PREFIX = "piper-voices";

/**
 * @typedef {{ repo: string; files: Array<{ src: string; dest: string }> }} VoicePack
 */

/** @type {VoicePack[]} */
const VOICES = [
  {
    repo: "ayousanz/piper-plus-tsukuyomi-chan",
    files: [
      // piper-plus 形式 (6lang fp16 multi-lingual onnx) を R2 配置先のファイル名は
      // `tsukuyomi.onnx` 形式に統一 (piper-voices.ts の `model: "/api/piper-voice/tsukuyomi.onnx"` と整合)。
      {
        src: "tsukuyomi-chan-6lang-fp16.onnx",
        dest: "tsukuyomi.onnx",
      },
      // piper-plus の config は `<model-url>.json` 形式で配置 (= `tsukuyomi.onnx.json`)。
      {
        src: "config.json",
        dest: "tsukuyomi.onnx.json",
      },
    ],
  },
];

const session = join(tmpdir(), `piper-voices-${Date.now()}`);
await mkdir(session, { recursive: true });
console.log(`[upload-piper-voices] tmp dir: ${session}`);

let success = 0;
let failed = 0;
try {
  for (const pack of VOICES) {
    const base = `https://huggingface.co/${pack.repo}/resolve/main`;
    console.log(`\n[upload-piper-voices] repo: ${pack.repo}`);
    for (const { src, dest } of pack.files) {
      console.log(`\n  ===== ${src} -> ${dest} =====`);
      try {
        const url = `${base}/${src}`;
        console.log(`  [DL] ${url}`);
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText} when fetching ${url}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const local = join(session, dest);
        await writeFile(local, buf);
        const sizeMiB = (buf.length / 1024 / 1024).toFixed(2);
        console.log(`  [DL] size: ${sizeMiB} MiB`);

        console.log(`  [upload] r2://${BUCKET}/${R2_PREFIX}/${dest}`);
        execSync(
          `npx wrangler r2 object put "${BUCKET}/${R2_PREFIX}/${dest}" --file="${local}" --remote`,
          { stdio: "inherit" },
        );
        success++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [FAIL] ${src} -> ${dest}: ${msg}`);
        failed++;
      }
    }
  }
} finally {
  await rm(session, { recursive: true, force: true });
}

console.log(`\n[upload-piper-voices] complete: ${success} success / ${failed} failed`);
if (failed > 0) process.exit(1);
