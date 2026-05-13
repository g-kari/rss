---
description: URL 比較正規化 / gh api 上流調査 / 生 HTML デバッグ / 自動生成 pre-script / TTS ハイライト整合性 / 同症状別経路パターン
paths: "src/lib/**/*.ts,src/hooks/**/*.ts"
---

# 開発調査パターン

## URL 比較は decodeURI で正規化してから

URL の `pathname` を文字列で直接比較すると、**percent-encoding の大文字小文字差異**で意図しない不一致を引き起こす。`%E5` と `%e5` は同じ文字を表すが、ブラウザは仕様上正規化しない。

```typescript
// NG: 大文字 %E5 と小文字 %e5 で不一致になる
if (curUrl.pathname === nextUrl.pathname) { ... }

// OK: decodeURI で正規化してから比較
function normalizePathname(p: string): string {
  try {
    return decodeURI(p);
  } catch {
    return p.toLowerCase(); // 不正シーケンスは lowercase fallback
  }
}
const curPath = normalizePathname(curUrl.pathname);
const nextPath = normalizePathname(nextUrl.pathname);
if (curPath === nextPath) { ... }
```

**いつ発生するか**: WordPress / canonical URL / RSSHub などで動的生成されたリンクは、入力時点の URL とは異なる percent-encoding 形式を持つことがある。ユーザーがブラウザに直接入力した URL は大文字、HTML 内のリンクは小文字、のような不一致が頻発。

**主な使用箇所**: `src/lib/content.ts#isPaginatedVariant`（everia.club 等のページング検出）

## 上流連携サービスの実装確認は `gh api search/code` で効率化する

外部依存 (例: `id.0g0.xyz` の JWT 発行ロジック / OEmbed provider 各社のレスポンス形式) の実装を確認したいとき、ローカル clone なしで **GitHub API 経由でリモートリポジトリのソースコードを直接調査** できる。Issue で「上流の修正状況を確認して」のような依頼を受けたら、以下 4 ステップで完結する。

```bash
# Step 1: ディレクトリ構造把握 (top-level dirs)
gh api repos/{owner}/{repo}/git/trees/master --jq '.tree[] | select(.type == "tree") | .path'

# Step 2: keyword で symbol 検索 (search/code)
gh api "search/code?q=repo:{owner}/{repo}+{keyword}+language:TypeScript" \
  --jq '.items[].path'

# Step 3: 該当ファイル本文取得 (base64 decode)
gh api repos/{owner}/{repo}/contents/{path} --jq '.content' | base64 -d

# Step 4: caller 横断確認 (path 複数 loop で grep)
for path in path1 path2 path3; do
  echo "===== $path ====="
  gh api "repos/{owner}/{repo}/contents/$path" --jq '.content' | base64 -d \
    | grep -E "{symbol_pattern}"
done
```

**How to apply**: ユーザー指示に「**上流 / 連携サービス / 別リポジトリ を調査して**」が含まれたら以下のフロー:

1. **対象リポジトリ特定**: `gh repo list {owner} --limit 100 --json name,description` で候補列挙
2. **Step 1 でディレクトリ把握** (`workers/` `src/` `packages/` 等のトップレベル構造)
3. **Step 2 で keyword search** (調査対象の関数名 / 型名 / 設定 key)
4. **Step 3 で 1〜3 ファイル本文取得** (search 結果の最も関連深いもの)
5. **Step 4 で caller を横断確認** (規約が全パスで守られているか検証)
6. **調査結果を Issue コメント** で:
   - 該当ファイル `:path:line` への GitHub URL リンク
   - 該当コードの引用 (3-5 行)
   - 「OAuth 経路は必ず X 渡す」のような **横断的な事実** を表として整理

**反例 (gh api でなくローカル clone が必要なケース)**:

- **ビルド・実行が必要** (型チェック / e2e 実行 / wasm ビルド) — gh api は静的読み取りのみ
- **コード生成が複数ファイルに渡る** (新機能を上流側に PR で送りたい等) — その場合 fork + clone
- **diff 比較を 100 ファイル超** で行いたい — gh api は API rate limit に当たる

主な使用箇所: rss-reader → 0g0-id `workers/id/src/utils/token-pair.ts#issueTokenPair` 調査 — `aud = clientId ?? IDP_ORIGIN` 確認 + caller 4 経路 (auth/exchange / token/auth-code / auth/refresh / token/refresh-grant) 横断確認 → 「OAuth 経路は必ず clientId 渡す」を 5 分で検証

## デバッグ: 生 HTML を見る必要があるとき

`WebFetch` は markdown 化された結果を返すため、`<a>` タグの正確な構造や percent-encoding 形式が見えない。**ブラウザを介さず生 HTML を取得**するには：

```bash
node -e "
fetch('URL_HERE', { headers: { 'User-Agent': 'Mozilla/5.0' } })
  .then(r => r.text())
  .then(html => {
    const i = html.indexOf('Pages:');
    if (i >= 0) console.log(html.slice(i, i + 1500));
  });
"
```

特定の HTML フラグメントを `indexOf` で位置探索して周辺を出力する手法が、巨大ページの分析で有効。

## 自動生成ファイルは全実行パスで生成フックを設置する

`.gitignore` 対象の自動生成ファイル（`scripts/sync-*.mjs` で生成されるなど）は、**ビルドだけでなく lint / typecheck / e2e のすべての実行パス** で生成されるよう pre-script を設置する。

```json
// アンチパターン: prebuild だけ。CI の typecheck で生成漏れ
{
  "scripts": {
    "prebuild": "node scripts/sync-release-notes.mjs",
    "build": "next build",
    "typecheck": "tsc --noEmit",
    "check": "vp check"
  }
}

// 修正パターン: 全 entry に pre-script 設置
{
  "scripts": {
    "prebuild": "node scripts/sync-release-notes.mjs",
    "build": "next build",
    "pretypecheck": "node scripts/sync-release-notes.mjs",
    "typecheck": "tsc --noEmit",
    "precheck": "node scripts/sync-release-notes.mjs",
    "check": "vp check",
    "precheck:fix": "node scripts/sync-release-notes.mjs",
    "check:fix": "vp check --fix"
  }
}
```

**How to apply**: 自動生成ファイルを参照するスクリプトを追加するときは、想定される実行コマンド (`build` / `dev` / `typecheck` / `check` / `test:e2e` 等) **すべてに pre-script を設置** する。スクリプトが軽量 (数十 ms 以下) なら頻繁に走っても性能影響なし。重いなら以下を検討:

- 出力ファイルの存在チェックでスキップする idempotent な実装にする
- CI でのみ明示的に実行するステップを追加する

代替策: 自動生成ファイルを `.gitignore` から外して commit する（trade-off: PR diff が増える、人間が手で編集してしまうリスク）。

## 「読み上げ / 表示 / ハイライト」の source 整合性をペアで担保する

TTS / 字幕 / カラオケ系 UI で「**speak されるテキスト**」と「**ハイライト対象のテキスト**」が **異なる source** から派生していると、「読まれているのと違う場所がハイライトされる」乖離バグが発生する。`useTtsHighlight(sentences, ttsRate, ttsPlaying, ttsSupported)` のような hook は **sentences (=ハイライト対象) と speak text の source を同期**しないと安全でない。

```typescript
// アンチパターン: speak text と ハイライト sentences の source が別
const ttsText = buildTtsText(article, processedContent, translatedText, summaryText);
//   ↑ summaryText (要約) を優先で speak する設計
const ttsSentences = wrapSentencesInHtml(processedContent).sentences;
//   ↑ 常に processedContent (記事本文) から sentence 抽出
//   → 要約読み上げ中は speak text != ハイライト対象 で乖離

const { activeSentenceIndex } = useTtsHighlight(ttsSentences, ttsRate, ttsPlaying, ttsSupported);
// → 100ms 間隔で記事本文の sentence を進む。実際は要約読み上げているのにハイライトは記事本文上を時間ベースで進む

// 修正パターン: 別 source 読み上げ中はハイライト全停止
const isReadingDifferentSource = autoMode && autoSummarize && !!aiResult;
const effectiveSentences = isReadingDifferentSource ? EMPTY_SENTENCES : ttsSentences;
const { activeSentenceIndex } = useTtsHighlight(effectiveSentences, ...);
//   ↑ 空配列 → activeSentenceIndex = -1 維持 → ハイライト発生しない
```

**How to apply**: 読み上げ系 / 字幕系 hook を実装するとき:

1. `speak(text)` に渡る text の **真の source** (どの fallback chain の枝か) を判定するフラグを保持 (`isReadingX`)
2. ハイライト sentences は **同じ source の HTML から派生** したものかチェック
3. 異なる source なら、以下の選択肢:
   - **最小**: ハイライト全停止 (空 sentences で activeIndex = -1 維持)
   - **中規模**: 別 source の sentence span を生成 (要約 UI に span ラッパー導入)
   - **大規模**: 全 source で sentence 化 (parser を speak/highlight 共通化)
4. **最小実装でも違和感は解消** されるので、Phase 1 として最小、Phase 2 で機能拡張パターンが安全
5. **空 sentences の安定 reference** (`const EMPTY_SENTENCES: Sentence[] = []`) をモジュールレベルで宣言。条件で `[]` を毎 render 作ると useMemo / useEffect 依存キーが invalidate される

主な使用箇所: `useArticleViewState` の `isReadingSummary` / `effectiveTtsSentences` (オートモード + 自動要約で要約読み上げ中の wrong-source ハイライト抑制)

## 同症状でも別経路の可能性を疑う

「ギャラリーが止まる」「TTS が止まる」のような **同じ症状の連続バグ報告** は、修正後も別経路で再発する可能性が高い。1 つ修正しただけで「同症状の Issue は全部解決」と思い込まないこと。

**How to apply**:

- 「同症状の Issue を再起票された」ら、**前回修正のコミット diff** を読み直して「自分が直したのは本当に唯一の原因か」を疑う
- 「修正したのに直らない」「修正したのにまた起きた」のキーワードがコメントに出たら、必ず別経路を疑って再調査
- バグ修正のコミットメッセージには **「真因 = 〇〇」** を明記して、別経路調査時の参照点にする
