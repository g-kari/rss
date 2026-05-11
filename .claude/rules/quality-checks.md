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

**How to apply**: 新規 e2e テストで以下のいずれかが必要なら、必ず `test.beforeAll` + `test.skip` パターンを採用 (強制 fail させると無関係 PR の pre-commit hook まで阻害される):

- Cloudflare バインディング（R2 / D1 / KV / AI）への実書き込み・読み込み
- 外部サービス認証（OAuth プロバイダ / Stripe / SendGrid）
- ローカル開発ツール（ngrok / Cloudflare tunnel）
- 環境変数で API キーが必要なテスト

skip メッセージには **次に何をすべきか**（コマンド・URL）を必ず書く。例: `"wrangler login required (run: npx wrangler login)"` / `"set OPENAI_API_KEY env var"`。

### 派生ケース: brittle UI 描画前提の e2e は **try/catch + test.skip(true, ...)** で adaptive skip する

ギャラリー / 仮想スクロール / ポータル menu のような **環境依存で render が安定しない UI** を assert する e2e では、対象要素が UI に現れない場合に test.skip で安全 skip する pattern を採用する。strict assert (timeout で fail) は CI 全体を不安定化するため、「**前提条件を assert してから本検証へ進む / 前提が崩れたら skip**」の 2 段階構造に分割する。

```typescript
test("ギャラリー画面で X が描画される", async ({ page }) => {
  test.skip(!seedEndpointAvailable, "wrangler login required ...");
  await seedFeed(...);
  await page.addInitScript(() => localStorage.setItem("rss-layout", "gallery"));
  await page.goto(`/?feed=${FEED_HASH}`);

  // Phase 1: 前提となる記事カード描画を確認
  const articleCard = page.locator(`#article-${id}`);
  try {
    await expect(articleCard).toBeVisible({ timeout: 5000 });
  } catch {
    test.skip(
      true,
      "記事カードが UI に現れない (レイアウト切替 / フィード選択が dev 環境で安定しない)",
    );
    return;
  }

  // Phase 2: 本検証 (描画前提が満たされた後の assert)
  const failedText = articleCard.locator("text=取得失敗");
  await expect(failedText).toBeVisible({ timeout: 8000 });
});
```

**How to apply**: e2e spec で「対象要素が UI に現れる」が前提条件になる場合 (strict assert で timeout fail させると 5-10% 偽陽性で全 PR がブロックされ real regression と判別不能になるため):

1. **Phase 1 (前提確認)** を `try { await expect(element).toBeVisible({ timeout: 5000 }) }` で囲む
2. catch で `test.skip(true, "前提条件が満たされない理由を具体的に記述")` を呼んで return
3. **Phase 2 (本検証)** は visible な要素に対して assert (timeout はもう少し長め: 8000ms 等で UI 反映遅延を吸収)
4. skip メッセージは **「環境依存」「実装変更」を区別** して将来の調査ヒントを残す
5. 1 spec で 1 件の skip を許容することで、**他の spec / 他の test case が引き続き走る**

**反例 (adaptive skip 不要なケース)**:

- 純粋関数の入出力検証 (e2e でなく unit test 範疇) → 直接 assert で OK
- ログイン画面 / 静的ページの基本要素 → 描画は安定しており skip 不要
- API レスポンスを直接検証する test (UI 描画を経由しない) → page.request で直接 assert

主な使用箇所: `regression-load-more-fail.spec.ts` / `regression-ogp-fallback.spec.ts` (ギャラリー記事カード描画前提の adaptive skip)

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

## TDD spec を書いて Red にならないときは「テスト設計を疑う前にバグ再現条件を再確認」する

監査エージェントの指摘に基づいて TDD spec を書いたとき、**最初の `npx playwright test` で全 pass (Red にならない)** ことがある。これは以下のいずれか:

1. **テスト設計の前提が甘い** — エージェント分析の attack vector が「同年月日同時刻」「特定形式入力」のような限定条件で、本プロジェクトの実データ前提では再現しない
2. **エージェント分析の confidence が overstated** — 「85% 信頼度」だが実バグでなく theoretical 指摘
3. **既に修正済み or 別経路で防御済み** — Range check / 上位の guard で間接的に弾かれている

```
パターン: Red 確認できないときの判断フロー
  1. spec 書く → 全 pass (Red にならない)
  2. 自問: 「私が書いた spec の入力は、エージェント分析の attack vector を再現しているか?」
     - エージェント例: "2026-01-01T00:00:00+00:00 < 2026-01-01T00:00:00.000Z" は同時刻
     - 私の spec: 異なる月日の比較 → 攻撃 vector 再現していない
  3. 攻撃 vector を **正確に再現** する spec を書き直す
  4. それでも Red にならない → エージェント分析が overstated。実バグではない可能性
  5. 判定:
     - **実バグなら**: spec を Red にする入力を見つけて Red→Green→Refactor
     - **theoretical なら**: defensive 修正として実装変更 + spec を「regression 防止」に位置付け
     - **既に防御済みなら**: 修正不要。エージェント発見だが実装不要として skip
```

**How to apply**: TDD spec を書いた後 (Red にならない時点で **テストか実装か分析のどれかが間違っている** ことを示すシグナルとして活用):

1. **必ず最初に Red 確認**: `npx playwright test e2e/<file>.spec.ts` で **新規 spec が fail** することを確認
2. Red にならないなら、上記フローで判断:
   - 攻撃 vector の再現精度を確認
   - 再現できないなら、エージェント分析を「theoretical / 既に防御済み」と判定
3. **theoretical なケース** での修正は OK だが、コミットメッセージ / RELEASE_NOTES に「**defensive 改善** (実バグでなく潜在バグ防止)」を明記
4. **実バグでないなら**: 同じ修正パターンを今後の他箇所に適用する判断に使える (spec を「regression 防止」として残す価値あり)

**反例**: 「Red にならないからいいや」と spec を削除する → エージェント分析の取り組みが無駄になる + 同じ問題が再発した時に検出する手段がなくなる。**spec は Red にならなくても残す**。

主な使用箇所: code-quality 監査 (lexicographic 比較バグ) — エージェント 85% 信頼度だったが、本プロジェクトの実データ前提では Red にならず、defensive 改善 + regression 防止 spec として commit

### 派生ケース: TDD spec が pure function 層で pass する場合、真因は CSS / runtime レイヤー

ユーザー報告のバグが **「特定環境で再現する UI 表示問題」** (例: 「動画が表示されない」「画像が引き伸ばされる」「フォーカスが行方不明」) のとき、最初に純粋関数層 (パーサー / 抽出 / 変換 / バリデーション) を疑って TDD spec を書きがち。だが spec が pass する場合、**真因は CSS / runtime レイヤーにある可能性が高い** ことを認識する必要がある。

```
パターン: TDD spec pass → CSS / runtime 層を疑う調査フロー
  1. UI 表示問題の bug 報告を受ける
  2. 純粋関数層 (extractMainContent / postProcess / sanitizeHtml 等) で TDD spec
  3. spec が pass → 真因は別レイヤー
  4. 候補:
     a. CSS (display: none / 0 サイズ / overflow: hidden / 当該 selector 欠落)
     b. クライアント React 描画 (dangerouslySetInnerHTML 経路 / 条件分岐 / 子の hidden 判定)
     c. ブラウザ runtime (CORS / referrer policy / CSP / event listener)
     d. WebStorage (localStorage 不正値 / sessionStorage 衝突)
  5. 候補 a (CSS) を最優先で確認: `app/globals.css` で当該要素タイプの rule が
     定義されているか grep 確認
  6. CSS rule 欠落なら **defensive 対応 + regression spec (extractor 層に
     残す価値あり)** で完結。それ以外なら b / c / d へ
```

**How to apply**: UI 表示問題の bug 報告を受けたら (spec が pass した時点で「真因は別レイヤー (CSS / runtime / WebStorage)」と切り分けられる利点を活かす):

1. **Step 1**: 純粋関数層 (extractor / parser / transformer) を疑う TDD spec を書く
2. **Step 2 (Red 確認)**: spec が fail するか確認
   - **Fail (Red)** → 純粋関数層が真因、Red→Green→Refactor で修正
   - **Pass (Green)** → 真因は別レイヤー、Step 3 へ
3. **Step 3 (CSS 確認)**: `app/globals.css` で当該 HTML element 型の rule を grep
   - 例: `<video>` 問題なら `grep -n "video\|aspect-ratio" app/globals.css`
   - rule 欠落なら **canonical pattern (例: `.article-content img`) を複製して rule 追加**
4. **Step 4 (React 描画確認)**: ArticleContentBody / 該当コンポーネントで `dangerouslySetInnerHTML` 経路を Read、条件分岐や子コンポーネントで hidden 化されないか確認
5. **Step 5 (CORS / runtime 確認)**: ブラウザ DevTools での実機確認をユーザーに依頼 (本番 / dev で再現確認、`api-fetch` ログ等)
6. **Step 2 で書いた spec は削除しない** — pure function 層の regression 防止として残す価値あり

**反例**: spec が pass した時点で「バグなしと判定して終了」しない。pure function は OK でも view layer で消えている可能性が常にある。

主な使用箇所: digitallover.moe で `<video>` が表示されない bug 報告 → extractMainContent 経由の TDD spec が pass → CSS で `.article-content video` rule 欠落と判明 → defensive 対応で `.article-content video { width: 100%; height: auto; ... }` 追加 + regression spec を残す
