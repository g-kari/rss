---
description: コード修正後の品質チェック・テスト手順（バグ修正・ロジック変更後に必ず実行）
paths: "**/*.ts,**/*.tsx"
---

# 修正後の必須テスト手順

**バグ修正・ロジック変更を行った場合は、コミット前に必ず動作を検証すること。**

## ロジック単体テスト（node スクリプト）

サーバー不要で検証できる関数（正規表現・パーサー・ユーティリティ等）は `node -e` でインラインスクリプトを書いて動作確認する。

```bash
# 例: 正規表現の修正前後を比較
node -e "
const html = '<article><p>段落1</p><article>inner</article><p>段落2</p></article>';
const result = html.match(/<article\b[^>]*>([\s\S]*)<\/article>/i);
console.log(result?.[1]);
console.log('段落2が含まれるか:', result?.[1].includes('段落2'));
"
```

### 確認観点

- 修正した条件分岐・正規表現が期待通りに動作するか
- 修正前に再現する入力で、修正後は正しく動作するか（before/after 比較）
- エッジケース（空文字・ネスト・複数要素）で意図しない挙動がないか

## 品質チェックは常に実行

```bash
pnpm run check        # Oxlint + Oxfmt + tsgo（高速）
pnpm run typecheck    # tsc — Next.js plugin 込みの完全な型チェック
```

## E2E テスト

バグ修正・新機能追加後は Playwright E2E テストも実行する。

```bash
pnpm run test:e2e                        # 全テスト実行
npx playwright test e2e/xxx.spec.ts     # 特定ファイルのみ
ppnpm run test:e2e:ui                     # UI モードでデバッグ
```

| ファイル                         | 対象                                       |
| -------------------------------- | ------------------------------------------ |
| `e2e/landing.spec.ts`            | 未ログイン時のランディングページ           |
| `e2e/api-health.spec.ts`         | API エンドポイントの基本動作・認証ガード   |
| `e2e/content-extraction.spec.ts` | 全文取得 `extractMainContent` の回帰テスト |

新しいバグ修正を行った場合は、そのバグを再現するテストケースを `e2e/` に追加してから修正すること。

## 環境依存テストの skip パターン

外部サービス認証（`wrangler login` / ngrok / 外部 API キー）が必要な e2e テストは、**未準備時に強制 fail させると pre-commit hook 全体が落ちて関係ない PR まで阻害される**。代わりに `test.beforeAll` で前提条件を確認し、満たさない場合は `test.skip` + 案内メッセージで誘導するパターンに統一する。

```typescript
// e2e/test-seed-integration.spec.ts の例
let seedEndpointAvailable = true;
test.beforeAll(async ({ request }) => {
  try {
    const res = await request.post(`${BASE_URL}/api/test/seed`, { data: {} });
    seedEndpointAvailable = res.status() === 200;
  } catch {
    seedEndpointAvailable = false;
  }
});

test("POST seed: 正しいボディで 200 を返す", async () => {
  test.skip(
    !seedEndpointAvailable,
    "wrangler login required for R2 binding (run: npx wrangler login)",
  );
  // ... テスト本体
});
```

**Why**: 強制 fail させると無関係の PR の pre-commit hook まで阻害される。`test.beforeAll` で「環境準備状態」を判定して skip すれば開発者 onboarding 負担が下がる。

**How to apply**: 新規 e2e テストで以下のいずれかが必要なら、必ず `test.beforeAll` + `test.skip` パターンを採用:

- Cloudflare バインディング（R2 / D1 / KV / AI）への実書き込み・読み込み
- 外部サービス認証（OAuth プロバイダ / Stripe / SendGrid）
- ローカル開発ツール（ngrok / Cloudflare tunnel）
- 環境変数で API キーが必要なテスト

skip メッセージには **次に何をすべきか**（コマンド・URL）を必ず書く。例: `"wrangler login required (run: npx wrangler login)"` / `"set OPENAI_API_KEY env var"`。

## バグ修正の事前判定チェックリスト

`coding-conventions.md` の TDD ルールと当ファイルの「バグを再現するテストケースを追加してから修正すること」を実効化するため、バグ修正に着手する **前に** 以下を必ず判定する。

### Step 1: 再現テストを書けるか判定する

| 起因                            | 対応                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| 純粋関数化できるロジック        | ロジックを `src/lib/` に切り出してから `e2e/` でユニットテスト（Red→Green→Refactor） |
| UI 振る舞い・React レンダリング | e2e infrastructure（認証バイパス・テストデータ投入ヘルパー）が揃っているか確認       |
| Cloudflare バインディング       | dev サーバー起動 + 認証バイパスで e2e 可能か確認                                     |

#### 「純粋関数化できる部分」を見つけるパターン

修正コードが「分類・判別・選択」を含むなら、その判定を pure 関数として切り出せる可能性が高い:

| バグ修正パターン                       | 抽出可能な純粋関数                                          |
| -------------------------------------- | ----------------------------------------------------------- |
| エラーオブジェクトの種別判定           | `isAbortError(err)` / `classifyHttpError(status)`           |
| ID 形式バリデーション                  | `isValidSessionId(s)` / `parseTagIds(input)`                |
| 状態遷移判定                           | `isAutoReadFinished({...})` / `shouldStartAutoSpeak({...})` |
| 描画ソースの選択                       | `selectGalleryImages(prefetched, thumb)`                    |
| 文字列前処理 (URL 置換・HTML strip 等) | `preprocessTtsText(text)` / `buildTtsText(article, ...)`    |
| TTL / cutoff 計算                      | `computeEffectiveReadBeforeCutoff({manual, ttlDays})`       |

**修正前の自問**: 「この修正の `if` 文 / 三項演算子 / `switch` を `src/lib/` の関数に切り出せるか？」答えが Yes なら、必ず切り出して TDD する。No (= React state や DOM 副作用と密結合) なら Step 2 へ。

#### 抽出が難しいケース (e2e UI テストが必要)

- React の `useMemo` / `memo` の identity 安定性に絡むバグ (例: state ref 経由参照で再描画されない)
- `useEffect` の発火タイミング・順序に依存するバグ
- ブラウザ API (Web Share / IntersectionObserver / SpeechSynthesis) の呼び出し副作用
- DOM 構造への直接介入 (focus / scroll position 等)

これらは Step 2 へ進む。

### Step 2: 書けない場合の選択肢

- **infrastructure 不足が原因** → 先に「e2e テスト infrastructure 拡充」Issue を起票し、それを完了してから本 Issue に戻る
- **暫定で修正のみ進める場合** → コミットメッセージ末尾に `テストなし: 理由 = <具体的な理由>` を明記し、ユーザー承認を取ってから commit する

### Step 3: コミット直前の自己点検

`git diff --stat` を実行して以下を確認する：

- バグ修正コミット（feat / fix / バグ修正 などのメッセージ）に `*.spec.ts` の追加・拡張が含まれているか
- 含まれていない場合は Step 1〜2 を再評価する

**Why**: TDD ルールが明文化されていても、実行前の判定プロセスがないと無自覚に省略される。明示的なチェックリストで判定を強制する。
