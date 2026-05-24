---
description: コード監査エージェント並行派遣 + 高信頼指摘の連続修正 / 部分達成 / ローテーション運用 / sweep 二段保証など、監査ワークフローの判断軸集約
paths: "e2e/**/*.spec.ts"
---

# コード監査ワークフロー

`coding-conventions.md` から #733 Step 2 で分割した監査エージェント派遣・結果集約・適用判断に関する規範集。

## コード監査は専門エージェント並行派遣 → 高信頼指摘を選別 Issue 化

「issue が無いときに監査して新規 Issue 起票」を依頼されたら、**観点別の専門エージェントを並行派遣**して、各エージェントから 1-3 件の高信頼指摘を集める。1 つの汎用エージェントに「全観点を見て」と依頼すると深さが足りない。

```
並行派遣テンプレート (3 体並列が最適点):
  ├─ feature-dev:code-reviewer (perf 観点)     ← React re-render hotspots / 重い計算の重複 / R2 アクセスパターン
  ├─ feature-dev:code-reviewer (UX/a11y 観点)  ← フォーカストラップ / ARIA / pattern drift
  └─ feature-dev:code-reviewer (simplify 観点) ← 重複 helper 化 / dead code / 過度な複雑性
                                                (security は脆弱性疑い時のみ追加)
```

**3 体並列が最適な理由**:

- 1-2 体: 観点が偏る or 取れる指摘数が少ない (1 サイクルの作業量に届かない)
- 3 体: 各観点で 1-3 件 × 3 観点 = 4-9 件の指摘 → 同サイクルで 5-7 件適用 + 1-2 件 Issue 化が現実的
- 4 体以上 (**監査のみ**): 観点が被って同じ箇所を複数エージェントが指摘するリスク + 消化不能な件数

ただし「**監査 3 体 + 既存 Issue の独立調査 1 体 = 計 4 体**」のミックス並列は OK (観点が完全分離されるため衝突なし、調査結果は別の Issue コメントに転載されるので消化不要)。`react-patterns.md` の「Phase 1 実装中はライブラリ調査エージェントを並列派遣」パターンの拡張として、**監査ローテーション中も別 Issue の Phase 進行に必要な調査を並列で進める** ことで、サイクルあたりの actionable backlog 確保量を最大化できる。

観点を非重複に分離することが重要 (perf エージェントが a11y を見ない、a11y が simplify を見ない)。プロンプトで「focus areas」を明示して観点境界を強制する。

各エージェントへのプロンプトに **必ず含める要素**:

1. **「Find 1-3 high-confidence issues that are genuinely impactful」** — 件数上限 (1-3) + confidence 縛り
2. **Skip if** 節 — 「purely theoretical」「fix complexity > gain」「already addressed」を明示
3. **Report format** — file path + line number / observation / impact / fix の 4 項目
4. **「Use serena tools」** — find_symbol / search_for_pattern で効率的に navigate
5. **語数制限** — 「Report under 400 words」で出力肥大化防止

**How to apply**: 監査依頼 → エージェント結果集約 → 各指摘を:

1. **実コード Read で再現確認** (`サブエージェント調査結果は該当コードで検証してから採用` ルール参照)
2. **高信頼性 (confidence 80+) のみ Issue 化** — ラベル (`performance` / `bug` / `accessibility` 等) + `🤖 AI 起票` バナー必須
3. **Issue 本文に**: 「状況」「影響」「修正方針案 (案 A/B/C)」「推奨」「必要な対応箇所」「関連 (元コメント / 関連実装)」のテンプレート従う
4. **同サイクルで 1 件は対応する** — 監査だけで Issue を量産すると消化不良。最も impact が大きい 1 件をそのサイクルで完結する流れを基本にする

主な使用箇所:

- perf / UX 監査 2 体並行 → 4 件起票 → 1 件同サイクル対応
- perf / UX-a11y / simplify 監査 3 体並行 → 8 件指摘 → 7 件同サイクル一括適用 + 1 件 Issue 化
- perf / UX-a11y / simplify 監査 3 体並行 → 9 件指摘 → 8 件同サイクル一括適用 (a11y 3 + simplify 3 + perf 2) + 1 件 Issue 化の最大消化サイクル更新

### 派生ケース: 監査エージェントに既存規範遵守チェックも依頼すると pattern drift が早期発見される

監査エージェントへのプロンプトに「**既存規範ファイル (`.claude/rules/*.md`) と照合して違反がないか**」を明示すると、**「規範を codify した直後は守られていたが、その後の新規追加コードで drift した」** ケースを早期検出できる。本来 codify 時に「主な使用箇所」コメント + grep 検出パターン (`rule-maintenance.md` 派生ケース 5) で自動 sweep する設計だが、grep で表現しにくい規範 (例: `try/catch → null` に必ず `devError` を併記) は人間判断要のため監査エージェント観点に組み込むのが効率的。

```
プロンプト例 (simplify エージェントへ):
「Focus area の `simplify` に加えて、`browser-platform.md` / `react-patterns.md` 等の
 既存規範ファイルへの違反を 1 件含めても良い。**規範違反は同種コンポーネントの canonical
 pattern と照合 (例: browser-summarizer.ts vs browser-translator.ts) して報告する」
```

**How to apply**: 観点別監査エージェントへのプロンプトに以下を追加 (grep で機械検出できない判断要素を含む規範は canonical pattern との照合で初めて検出可能):

1. **既存規範ファイル (`.claude/rules/*.md`) を読んで、focus area に関連するルールを認識**
2. **canonical pattern を実装している既存ファイル** (例: browser-summarizer.ts / Modal.tsx / read-state-merge.ts) を **対比対象として明示**
3. **「同種コンポーネントを比較 (similar components compare)」で新規ファイルの規範違反を検出**
4. 検出された規範違反は report に **「規範: <ルール名>」「canonical: <ファイル名>」** を含める形で報告

主な使用箇所: simplify エージェントが `browser-translator.ts` の silent `catch { return null }` を発見 (規範: browser-platform.md「silent fallback の禁止 — `try/catch → null` には必ず `devError` を添える」/ canonical: `browser-summarizer.ts`)、即修正で `devError` 追加

#### 派生サブケース: agent 提案の secondary issue は canonical 規範 + e2e spec 影響で個別 verify する

agent が **primary issue + secondary issue (2 件以上)** をまとめて提案するとき、primary は正しくても secondary が **canonical 規範矛盾** or **既存 e2e spec の selector 文字列依存と衝突** することがある。各 issue を **個別に canonical 対比 + spec selector 影響** verify してから採用範囲を minimal scope に絞る。

```
パターン: agent 複合提案の個別 verify フロー
  1. agent report で primary + secondary が並列で提案される
  2. 各 issue を独立に以下 3 軸で verify:
     a. canonical 規範 (.claude/rules/*.md) と整合するか
     b. canonical 実装ファイル (例: A11yHelpers.tsx) と pattern 一致するか
     c. 既存 e2e spec の selector / locator 文字列 (例: `[role="status"]`) と衝突しないか
  3. primary 採用 + secondary 見送りの選別:
     - canonical 一致 + spec 影響なし → 採用
     - canonical 矛盾 → 見送り (agent 提案が誤りの可能性)
     - spec 影響あり → 見送り or spec 同時更新 (scope 拡大、別 Issue 検討)
  4. commit message で「採用 primary + 見送り secondary の理由」を明示
```

**典型的な見送りパターン**:

| agent 主張                                 | 見送り理由                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| 「role attribute を削除」                  | canonical implementation 既使用 + e2e spec の selector 依存                       |
| 「class name を統一」                      | 既存 caller の className prop で参照 + テーマ切替の動的注入と衝突                 |
| 「prop を削除」                            | 既存 caller の type 互換性破壊 + ComponentProps<typeof Child> 経由 forward と衝突 |
| 「element type 変更 (`<p>` → `<div>` 等)」 | semantic HTML 仕様変更 + 既存 CSS selector (`p.article-content` 等) と衝突        |
| 「event handler 名を rename」              | 既存 caller の onXxx prop と type 互換性破壊                                      |

**How to apply**: agent 提案 (特に複合提案で secondary 含む) を採用前に以下 (canonical 規範矛盾 + spec selector 依存衝突は agent が認識しない盲点、`feedback_subagent_verification.md` の実コード Read 規範 + e2e spec grep で構造的予防可能):

1. **各 issue を個別に 3 軸 verify** (canonical 規範 / canonical 実装 / e2e spec selector)
2. **canonical 矛盾の secondary は採用見送り** (agent 主張が誤りの可能性高い)
3. **spec 影響ありの secondary は scope 評価**: spec 同時更新が容易なら一括採用、scope 大なら別 Issue 起票
4. **commit message で primary 採用 / secondary 見送り の判断軸を明示** (将来の AI / 開発者の誤判定防止 + agent prompt 改善材料)

**反例 (本派生サブケース不要なケース)**:

- agent が **single issue のみ提案** → 個別 verify 不要、ゴールド sign 評価で十分
- secondary が **primary と完全独立 + canonical 整合** → 通常採用 (個別 verify は 1 回で済む)
- agent が canonical pattern を明示引用済 → verify は最小限で OK

主な使用箇所:

- `ToastContainer.tsx` (本サイクル commit `9c1a5c46`) — agent 提案:
  - Primary (永続 aria-live mount): canonical `A11yHelpers.tsx` 一致 → **採用**
  - Secondary (`role="status"` 削除): canonical `A11yHelpers.tsx` が `role="status" + aria-live` 両用 (矛盾) + `regression-load-more-fail.spec.ts:101` の `[role="status"]` selector 依存 → **見送り**
  - 結果: scope minimal で primary のみ 1 行修正 (touch 1 file)、SR announce 改善達成 + e2e spec 影響ゼロ

### 派生ケース: 高信頼度の独立修正は「Issue 起票せず同サイクルで連続修正」する

監査エージェントの指摘が以下の条件を全て満たす場合、Issue 起票をスキップして **同サイクルで連続修正 → 各 commit を master 反映** が効率的:

1. **修正範囲が 1〜2 ファイルに局所** (cross-cutting でない)
2. **設計判断不要** (ユーザー UX に影響する選択肢がない、または規範実装が既に存在)
3. **TDD 可能 or typecheck/e2e で動作保証可能**
4. **既存修正パターンの複製で済む** (例: `ConfirmModal` の `returnFocusRef` パターンを `FocusModeOverlay` にコピー)

```
アンチパターン (過剰起票):
  監査エージェント 3 体派遣 → 9 件発見
  → 全件 Issue 起票 (起票だけで 30 分)
  → 同サイクルで 1 件のみ対応
  → 残 8 件はユーザー判断待ちで放置

修正パターン (連続修正):
  監査エージェント 3 体派遣 → 9 件発見
  → 高信頼 6 件を実コード検証で確定
  → 6 件を 4 commit にバッチング (関連性で集約) して連続 master 反映
  → 残 3 件 (主観・大規模) のみ Issue 起票してユーザー判断仰ぐ
```

**How to apply**: 監査結果を以下の表で振り分け (Issue は「ユーザー判断が必要なもの」に集中):

| 判定                               | 例                                           | 対応                                              |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| 規範パターン複製 + 1〜2 ファイル   | focus restore 抜け / null check 漏れ / typo  | **同サイクルで修正** (Issue 起票不要)             |
| 既存純粋関数 + TDD 可能な perf bug | useMemo deps 誤り / parse の per-record 実行 | **同サイクルで修正 + spec 追加** (Issue 起票不要) |
| 設計判断要 (案 A/B/C 比較)         | 新機能追加 / 大規模リファクタ / 命名選択     | **Issue 起票** (案提示してユーザー判断仰ぐ)       |
| 主観評価要                         | デザイン色変更 / 配置調整                    | **Issue 起票** (本人視点が必要)                   |

連続修正のときも、各 commit の RELEASE_NOTES 追記 + master 反映 + push は省略しない (デプロイ可能な状態を保つ)。

#### 派生サブケース: 「confidence ≥ 90 + canonical pattern 完全一致 + touch ≤ 2 file」3 条件揃いは **即着手ゴールド sign**

agent 監査結果の中で以下 **3 条件全て** が揃った提案は、verify から commit までの cadence が最短で、サイクルあたりの actionable 消化量を最大化する **ゴールド sign**。**実コード verify を 5 分以内で済ませて連続修正フローへ即投入** する判断を加速する。

**3 条件**:

1. **confidence ≥ 90**: agent 自己評価で 90% 以上 (中身が確実、partial / unclear 表現なし)
2. **canonical pattern 完全一致**: `.claude/rules/*.md` 既存規範の specific section に直接 mapping (agent report で「規範: ファイル名 § セクション 完全一致」を明記している)
3. **touch ≤ 2 file**: 修正範囲が小規模 (cross-cutting / Context lift up / state hoisting 不要)

`audit-workflow.md § 派生「規範パターン複製 + 1〜2 ファイル」` を満たすことが必要条件、それに **confidence ≥ 90 + canonical pattern 完全一致** が加わって即着手の確度が出る。

**verify 短縮の手順** (5 分以内):

1. **agent 引用の canonical pattern を `find_symbol` / `Read` で実コード確認** (規範該当 section を実コードと突き合わせ、1-2 分)
2. **対象 file の signature 確認** (caller 数 + 影響範囲、`find_referencing_symbols` で 1 分)
3. **agent 提案の diff を mental simulation** (修正後コードを想像、type 整合 + 既存 spec 影響を頭の中で評価、1-2 分)
4. 3 step 全て pass なら **即着手**、verify でズレ発見なら降格 (Issue 起票 or scope 縮小)

**該当する典型パターン**:

| canonical 規範                                                                | 即着手例                                                                   |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `react-state-ref.md § 派生「複数 state を return する hook を useMemo wrap」` | `useFilteredArticles` 36 field useMemo wrap (1 commit)                     |
| `react-state-ref.md § 派生「モジュールレベル sentinel は Object.freeze」`     | `OgpCacheContext` null-object freeze (1 commit)                            |
| `helper-drift.md § 「新規 hook で既存 lib helpers grep」`                     | `useSaveArticleUrl` で `classifyHttpError` 適用 (1 commit)                 |
| `design-system.md § アイコン / Spinner canonical`                             | `SaveUrlModal` Spinner + aria-busy (1 commit)                              |
| `react-component-split.md § 派生「JSX 描画 helper unknown 受け defensive」`   | `#811` `ai-summary-parse.ts` / `#812` `image-proxy-url.ts` (1 commit each) |
| `helper-drift.md § 派生「同名 enum / type alias 化」`                         | `useArticleAi` の `AiErrorType = HttpErrorType` (1 commit)                 |

**反例 (ゴールド sign 不成立で慎重判定が必要なケース)**:

- **confidence 90+ だが canonical なし** → 新規規範策定要素、設計判断要、Issue 起票候補
- **canonical 一致 + touch ≥ 3 file** → scope そこそこ大、`実装着手前に「影響範囲 vs 利得」で再評価` 派生ケース適用
- **confidence < 90** → agent 自身が partial / unclear 表現あり、verify でズレ発覚する可能性高い、追加調査要

**How to apply**: agent 監査結果を受領したら以下の順で振り分け (`audit-workflow.md § 派生「規範パターン複製 + 1〜2 ファイル」` の判定表より一歩 specific):

1. **3 条件チェック** (confidence ≥ 90 + canonical 完全一致 + touch ≤ 2 file) を agent report の冒頭で確認
2. 3 条件揃い → **5 分 verify → 即着手 (本派生サブケース)**
3. 1 つでも条件未達 → **既存「実装着手前に「影響範囲 vs 利得」で再評価」派生ケースに従う** (scope 縮小 or Issue 起票降格)
4. retrospective に **「ゴールド sign 該当数 / 採用数」を記録**、3 条件揃いの adoption rate を追跡 (規範浸透度の指標)

**反例 (本派生サブケース不要なケース)**:

- agent が 1 件しか提案していないサイクル → 全体ローテーション戦略が別途必要、3 条件 sign の効用低
- 設計判断要素 (新規 dep / 新 infra / UX 主観評価) を含む提案 → confidence 90+ でも canonical 不一致で sign 不成立

主な使用箇所:

- 本サイクル UX 候補 1 (`useSaveArticleUrl` classifyHttpError、conf 92 + `helper-drift.md` canonical + touch 1) と候補 2 (`SaveUrlModal` Spinner、conf 88 で sign 微未達だが canonical 強で即着手) — verify から master 反映まで 10 分で完結
- 前サイクル perf 候補 1 (`useFilteredArticles` useMemo wrap、conf 92 + `react-state-ref.md` canonical + touch 1) — 同上 cadence

##### サブパターン: 「confidence < 90 + canonical 完全一致 + touch ≤ 2 + 3 サイクル滞留」も **ゴールド sign 代替判定** として即着手可

本サブケース本体は「3 条件揃い」を ゴールド sign としたが、**3 サイクル滞留 lesson** (`rule-maintenance.md § 3 派生「3 サイクル経過で AI 自走採用判断」`) の場合は confidence < 90 でも以下 **代替 3 条件** を満たせば即着手可:

1. **canonical 完全一致**: ゴールド sign 本体と同要件 (`.claude/rules/*.md` 既存規範に直接 mapping)
2. **touch ≤ 2 file**: 同上 (scope 小規模)
3. **3 サイクル経過 lesson** (`rule-maintenance.md § 3 派生`): Issue 起票後 3 サイクル滞留 + 明示 reject なし + 反例 (重大な行動変化 / 既存規範矛盾 / ユーザー判断要素 / 3 サイクル未満) 全 No

理由: **3 サイクル滞留自体が品質シグナル** で、agent confidence 値とは独立した「ユーザー反対なし + 規範 mapping 安定 + 長期 verify 期間あり」の証拠。confidence 80 でも canonical 強なら即着手の確度が出る。

**verify 手順 (3 サイクル滞留版)**:

1. **Issue 起票時の前提を Phase 0 で再 verify** — 3 サイクル経過で codebase が変わっている可能性、または起票時の前提が誤っていた可能性 (`feedback_subagent_verification.md` の延長で実コード Read 必須)
2. **Phase 0 verify で起票時前提のズレ発覚なら descope or 案変更** — 例: `#814` で「ReactNode 仮定で id wire 副作用大」と起票時想定したが、実は `subtitle?: string` 型で副作用ゼロと判明
3. **ズレ発覚で「案 A が明確な正解」と確定なら即着手** (case A-Revised pattern、`#813` 同様の前例あり)
4. **ズレなしで起票時案 A/B/C のまま** → ユーザー判断要素残存、温存継続

**反例 (本サブパターン不適用)**:

- **設計判断要素が Phase 0 verify でも解消されない** (例: `#815` の真因深掘り) → 自走採用見送り
- **3 サイクル経過しても明示反対コメントあり** → 自走採用禁止
- **重大な行動変化を伴う** (例: 認証 / 暗号 / API contract 破壊) → 自走採用見送り

主な使用箇所: `#814` Modal aria-describedby — agent confidence 80% で ゴールド sign 微未達だったが、3 サイクル滞留 + ConfirmModal canonical 完全一致 + touch 1 file の代替 3 条件で即着手判定、Phase 0 verify で起票時 ReactNode 仮定の誤りを修正 (subtitle?: string 型確認) → 案 A 自走採用 + close (本サイクル commit `c2e118f3`)

##### サブパターン: 「機械的 sweep refactor 例外」— `touch ≤ 2` 微未達でも一括適用 OK

本サブケース本体 + 「3 サイクル滞留代替判定」は共通条件として `touch ≤ 2 file` を課すが、**機械的 sweep refactor** (sed で 1 コマンド完結する import path 変更 / 機械的 rename 等) の場合は touch ≥ 3 file でも一括適用 OK と例外規定する。

**機械的 sweep refactor の 3 条件** (全充足で touch 例外):

1. **機械的置換** (sed / regex で 1 コマンド完結、人間判断による file 毎の case 分岐なし)
2. **設計判断不要** (canonical 明確 + 既存挙動互換、`@/` → `../` 等の de facto canonical 統一)
3. **既存 spec で regression verify 可能** (typecheck pass + 既存 unit test pass で機能担保、新規 spec 追加不要)

`touch ≤ 2` 微未達 (touch 3-5) でも本 3 条件揃いなら **「sweep の atomicity が高い + Phase 分離コスト > 一括 commit 利得」** で一括適用が canonical。Phase 分離するとレビュー単位が「機械的 sweep 1/N、2/N、...」になって意味が薄まる。

**例外を許容する根拠**:

- **diff 量が小さい** (1 行 import path × N file = total N 行修正、N=4 でも 11 行程度)
- **mental simulation のコストが低い** (各 file の修正は同 pattern、複雑な意味判断なし)
- **bisect 不要** (機械的置換で binary search 単位が無意味)
- **revert も簡単** (`git revert <sha>` で一発、scope 限定済)

**反例 (本例外サブパターン不適用)**:

- **機械的でない判断混入**: 各 file で「ここは absolute のまま残す」「ここは relative」のような judgment 要素あり → 機械的でない、Phase 分離で個別判断
- **type system 変更を伴う**: import path 変更で型推論が変わる可能性 (前 #815 で `FeedItem.tsx` 削除実装試行時の謎の implicit any 罠) → 機械的でない、調査要
- **import side effect (副作用 import)** を含む: `import "../setup-something"` のような側 effect import は順序依存あり、機械的置換不可

**verify 手順 (機械的 sweep refactor 版)**:

1. **sweep 範囲を grep で全件確認** (touch 対象 file 数 + 各 file の hit 数を把握)
2. **sed で 1 コマンド機械的置換** (file 跨ぎ + pattern 列挙で 1 sweep 完結)
3. **typecheck + check + 関連 unit test を 1 サイクルで実行** (regression 検出)
4. **diff 量を `git diff --stat` で確認**: insertion ≈ deletion (機械的置換の特性) + total line 数 ≤ 数十行 で sweep 適切性 verify

主な使用箇所: `#816` `src/hooks/` `@/` → `../` 統一 (touch 4 file + 計 11 import path 変更) — agent confidence 92% で ゴールド sign 本体の touch ≤ 2 sign 微未達だったが、sed 1 コマンド + 設計判断不要 + 既存 unit test 110/110 pass で regression verify 完了、`useImageDownload` (前 commit `ce85793d`、touch 1) と合計 5 file 統一済で de facto canonical 完全達成 (235 vs 0)

### 派生ケース: 監査エージェントの提案は実装着手前に「影響範囲 vs 利得」で再評価する

監査エージェントは **「fix の概要」だけ提示** することが多く、実装範囲の見積りが甘い (例: 「2 つの hook を統合」と書いてあるが、実は **Context lift up + 4 ファイル変更** が必要なケース)。連続修正の判定表で「規範パターン複製 + 1〜2 ファイル」に該当しても、実際にコードを Read してみたら 5 ファイル超え/Context 設計要となることがある。

```
パターン: 着手前の再評価ステップ
  1. エージェント提案を読む (例: "useTotalUnreadCount を useSidebarFeeds に統合")
  2. 影響範囲の Read で実装スコープを確認:
     - 削除する hook の caller を grep
     - 統合先 hook の caller を grep (子コンポーネントだけか? Context lift 要か?)
     - state 共有の方向 (parent → child / child → parent / sibling)
  3. 着手判定:
     - 「1〜2 ファイル + 既存パターンの延長」 → そのまま連続修正
     - 「Context 新設 / hook lift up / 3 ファイル超え」 → Issue 起票へ降格
     - 「設計判断必要 (Context vs prop drilling vs callback)」 → Issue 起票
  4. Issue 起票時は **エージェント分析結果 + 案 A/B/C + 推奨案** をテンプレで貼る
```

**How to apply**: 監査エージェント提案を受けたら (短い report は scope を過小評価しがち、着手前の Read 1-2 回で PR 規模を予測):

1. **「変更対象ファイル数」と「新規ファイル数」を Read で見積る** (caller grep, 既存 export grep)
2. **3 ファイル超え or 新 Context/Provider 必要** なら Issue 起票へ降格
3. **既存規範パターン (Modal.tsx の focus trap, ShareMenu の portal menu 等) のコピー** なら 1〜3 ファイルでもそのまま着手 (パターン適用は予測可能)
4. **エージェント分析が含む「partial」「unclear」表現** に注意。「could be merged」「should be extracted」など曖昧な動詞は実装スコープが大きいシグナル
5. Issue 起票時は **エージェントの impact 計算と confidence** を引用しつつ、**案 A/B/C + 必要な対応箇所 (具体ファイル名)** を必ず列挙

主な使用箇所: perf 監査 (useTotalUnreadCount 統合) — エージェント 85% 信頼度だったが Read で Context lift up 必要と判明 → Issue 起票して降格

#### 派生サブケース: 「caller 0 件判定」agent 結果は **複数 relative path pattern** で grep 再 verify する

simplify / dead code 監査 agent が「caller 0 件 → 削除可能」と判定したとき、**agent の grep pattern が限定的で relative path 経由 (`../X` / `./X`) を見落とす罠** がある。`feedback_subagent_verification.md` ルール「サブエージェント分析結果は Read で再現確認してから採用」を path grep にも厳密適用する。

```bash
# アンチパターン: agent prompt が単一 path pattern で grep 0 件判定
# 例: agent は `from "components/X"` 形式の絶対 path 風 import のみ grep
# → relative path 経由 (`from "../X"` / `from "./X"`) を全く見ない

# 修正パターン: 複数 path pattern を 1 コマンドで網羅 grep
grep -rnE "from\s+[\"'].*[/\"']<target>[\"']" src/ app/ \
  --include="*.ts" --include="*.tsx" \
  --exclude="release-notes-data.ts" 2>/dev/null
# ↑ 正規表現で path 末尾 `<target>` を match、relative / absolute 両方拾う
```

**How to apply**: 「caller 0 件」「dead export」判定 agent report を採用するとき、**実装着手前** に必ず以下を実行 (agent caller 検査の見落としは削除実施後に typecheck error 連鎖で発覚し、scope 拡大 + revert で 1 サイクル消費する罠):

1. **複数 path pattern で 1 コマンド grep** 実行 (上記 snippet) — relative path (`../X` / `./X`) / index file 経由 (`from "./feature"` で `feature/index.ts` 解決) / 全 pattern を網羅
2. **0 件確認 + 削除影響範囲確認の 2 段** で実コード verify:
   - 0 件確認: 上記 grep で本当に 0 件
   - 影響範囲: 削除後 typecheck が pass するか dry-run (`git stash` で一旦戻して typecheck 状態を base 状態と比較)
3. **agent 結果との差分があれば revert + Issue 起票** で次サイクル送り (`audit-workflow.md § 派生「実装着手前に影響範囲 vs 利得で再評価」` で scope 拡大回避)
4. **逆方向 verify** も併用: 「target file の export 全件を **逆方向** grep して caller list を構築」する方法。`grep -rnE "import .*from.*<target>"` で全 import 文を抽出 → 各 caller を Read で意図確認

**反例 (agent caller 0 件が正しいケース)**:

- target file が **`.md` / `.json` / 設定ファイル** で import されない (path 経由 caller 元から無い)
- target file が **既に `git rm --cached` で untracked + production deploy 対象外**
- target file が **新規追加直後で実 caller がまだ無い** (Phase 0 抽象型のみ commit 段階)

主な使用箇所: 候補 4 `FeedItem.tsx` dead re-export 削除提案 — agent simplify confidence 92% で「caller 0 件」と判定したが、`feed-sidebar/index.tsx:17` + `SpecialViewButton.tsx:3` + `CategorySection.tsx:5` + `FeedGroupsSection.tsx:7` の **4 caller** が `../FeedItem` relative path で import 中。削除実施後の typecheck で謎の implicit any 連鎖発生 (`feed-item/index.tsx` 直接 import 経由で type 推論 path が変わる現象) → revert + Issue `#815` 起票で次サイクル送り。本派生サブケースで構造的に予防可能化

### 派生ケース: 監査エージェントの提案は「prop 受け口」と「配線」を分離して部分達成できる

「Issue 起票へ降格」の前に、**「prop 受け口の追加 (1 ファイル)」と「配線 wiring (3〜4 ファイル + state lift up 等)」を分離** して **prop 受け口だけ同サイクル commit + 配線は別 Issue 起票** という部分達成パターンを採れることがある。「全部か全くやらないか」の二択でなく、安全な前半だけ commit を進められる。

```
パターン: 受け口と配線を分離
  1. エージェント提案を Read で再評価 → 全体は 3-4 ファイル touch + state lift up
  2. 「目的のコンポーネント側」(例: ArticleListEmptyState) は 1 ファイル touch で
     受け口 prop (onAddFeed?: () => void) + UI 要素 (CTA ボタン) を追加可能
  3. 「呼び出し側」(例: App.tsx) は state lift up + caller chain 全部修正で 3-4 ファイル
  4. 受け口だけ commit、配線は別 Issue で案 A/B/C 提示

判定:
  - 受け口の prop が optional (`?`) で、未配線でも既存挙動を変えないか? → YES なら部分達成 OK
  - 受け口が非 optional / 配線必須なら → 全体まとめて Issue 起票
```

**How to apply**: 監査エージェント提案を Read で再評価したとき:

1. **「受け口」と「配線」を分離可能か** を判定:
   - 受け口 (新 prop / 新 Context value) の追加が **1〜2 ファイル touch + 既存挙動非破壊** で完結するか
   - 配線 (caller chain 修正 / state lift up / Provider 構成変更) は別 PR で完結する規模か
2. **YES なら部分達成パターン採用**:
   - 受け口部分を同サイクル commit (RELEASE_NOTES に「prop 受け口のみ、配線は別 Issue」と明記)
   - 配線 Issue を gh issue create で起票 → 「prop 受け口は commit XXX で既存」を所与として案 A/B/C 提示
3. **NO なら全体まとめて Issue 起票** (従来通り)

**反例 (部分達成 NG)**:

- 受け口 prop が **非 optional** で配線なしだと typecheck error → 全体まとめて Issue
- UI 要素を追加するが配線なしだと **「ボタンが押せるが何も起きない」破綻 UX** → 全体まとめて
- 受け口が **runtime invariant に依存** (例: 「この prop が undefined のときは throw」) → 全体まとめて

主な使用箇所: UX 監査 (空状態 CTA) — `ArticleListEmptyState` + `ArticleList` に `onAddFeed?: () => void` 受け口だけ commit、`App.tsx` の state lift up は別 Issue 起票 (案 A state lift up / 案 B Context expose / 案 C 重複 modal)

### 派生ケース: 監査エージェントの観点はサイクル横断でローテーションする

過去 3-5 サイクルで perf / a11y / simplify 等を連続派遣済なら、次サイクルは **未走査観点** (bug / 新機能 / security narrow scope / docs drift / Dependabot alerts / refactor / dead code) で多様化する。同観点を連続派遣すると以下の問題が発生:

1. **発見の重複**: 同観点エージェントは同じ hot path を Read するため、結果が前回と類似
2. **観点疲弊**: perf 改善の余地は本来限られており (1-2 cycle で大半消化)、連続派遣で発見が枯渇する
3. **未走査観点のバグ累積**: bug / security / docs drift は cross-cutting で、低頻度派遣だと潜在問題が累積する

**ローテーション運用 (3 観点 × 3 サイクルで 1 周)**:

| サイクル   | 観点 1          | 観点 2   | 観点 3                |
| ---------- | --------------- | -------- | --------------------- |
| N          | perf            | a11y     | simplify              |
| N+1        | bug             | 新機能   | docs drift mechanical |
| N+2        | security narrow | refactor | dead code             |
| N+3 (循環) | perf            | a11y     | simplify              |

3-5 サイクル間隔で同観点が戻るので、間に他観点で発見した改修が次回派遣時の「新しい view」になる。

**How to apply**:

1. **サイクル開始時に過去 3 サイクルの派遣観点を確認** (`git log --since="2 weeks ago" --grep="監査エージェント"` 等で履歴抽出)
2. **未走査観点を優先**: 過去 3 サイクル未派遣の観点 (例: bug / security / Dependabot) を本サイクルに投入
3. **機械的に検出可能な観点は subagent 不要**: docs drift / Dependabot alerts / dead code grep は `find + grep + comm` / `gh api` で直接実行可能 → エージェント枠を bug / 新機能 / security 等の判断要観点に確保
4. **新機能監査は special care**: false positive 率が他観点より高いため、agent prompt に「verification grep with command output」を強制 (`coding-conventions.md` の派生ケース「実コード grep で必ず実存確認」と統合)

**反例 (ローテーション不要なケース)**:

- 直前 cycle で大規模 refactor を行ったとき → 同 hot path を perf / a11y 再派遣して新発見を期待可能
- ユーザーが特定観点を明示指示 ("perf 観点だけ深く見て") → ローテーション無視で指示優先

主な使用箇所: 41st (security narrow) → 42nd (e2e regression test) → 43rd (perf / a11y / simplify) → 44th (bug / 新機能 / docs drift / Dependabot) で 1 周完了。各サイクルで 4-9 件発見、消化 4-7 件で安定運用

### 派生ケース: 観点別 Issue 起票 agent の prompt 必須 3 要件

observation rotation で派遣する agent や、Step 0 sweep で「全 Issue が判断待ち + 自走着手なし」と判定して **loop directive 第 3 段階 (= コード精査して観点別 Issue 作成)** を発動するときの agent prompt は、3 つの mandatory step を必ず含めないと **既存対応済の提案 / 設計矛盾を含む提案 / 副作用許容しがたい提案** が大量混入する。

3 つの mandatory step (1 つでも欠落すると agent report 品質劣化):

1. **既存実装の現状確認 (`find_symbol` / `get_symbols_overview`)** — 対象モジュールの signature と既存対応状況を agent に最初に確認させる。「対応済リストを prompt で提示」だけでは agent が見落とすケースがある (例: orchestrator 化済 hook を「分割未対応」と誤認)
2. **対象モジュール間の「保存内容 vs 必要情報」1:1 マッピング検証** — 重複 fetch / 重複 cache / 重複 hook 等の統合提案では、送信元と送信先の field レベル差分を起票時に確認させる。マッピング未検証で起票すると実装着手時に「UX 劣化なしの統合不可能」が露呈する
3. **依存追加 / 上書き提案の副作用 scope 確認** — `pnpm.overrides` 追加 / dep bump / config 変更等の提案では、`pnpm install` が lock 全体を refresh して semver caret range 内の minor 更新が連鎖する罠を明示。`pnpm outdated` で minor 更新候補を一覧化させて副作用規模を起票時に表面化する

**3 step の何が default 振る舞いより優れているか**:

| step   | agent の default 振る舞い                     | 3 step 適用後                             |
| ------ | --------------------------------------------- | ----------------------------------------- |
| step 1 | 「対応済リスト」を prompt で示しても見落とす  | find_symbol で実コード確認 → 見落としゼロ |
| step 2 | 「重複 fetch あるから統合しよう」型の表面提案 | field 差分検証で「真の統合効果」評価      |
| step 3 | 「dep bump で解決」型の機械的提案             | 副作用 scope を起票時に表面化             |

**How to apply**: 観点別 Issue 起票 agent を派遣する prompt を書くとき (3 step を skip した agent は「既存対応済の提案 + 設計矛盾の提案 + 副作用過大の提案」を返してきて main thread の検証コストが scope に膨らむ、prompt に組み込めば agent 側で自動的に質を担保できる):

1. **prompt の冒頭セクションに「以下 3 step を必ず実施」を明示** — 1 つでも省略しないよう「ALL を完了してから提案」と強調
2. **step 1 (find_symbol 確認)**: 対象モジュール名 + 「signature 取得 + 対応済状況を確認」を明記。`serena` MCP の `find_symbol` / `get_symbols_overview` を優先利用するよう指示
3. **step 2 (1:1 マッピング)**: 統合 / 重複改善型の提案では「送信元と送信先の field レベル差分を必ず確認」を明記。差分があれば設計案 4 案 (schema 拡張 / 別 cache / UX 劣化容認 / 見送り) で trade-off 提示させる
4. **step 3 (副作用 scope)**: 依存追加 / 上書き型では「`pnpm install` が lock 全体 refresh + 副作用 minor 更新の連鎖リスクを明示」を必須要件として書く
5. **agent report に「3 step 確認結果」セクションを必須化** — skip された step があれば再派遣 (1 サイクル消費するが品質担保のため許容)

**反例 (3 step が overkill なケース)**:

- agent task が **既知の機械的検出のみ** (例: dead export grep / TODO コメント sweep) → step 1-3 不要、直接実行
- agent task が **新規 lib 提案 (現状コードベースとの相互作用なし)** → step 1-2 不要
- agent task が **既存 Issue の調査 (既に Issue 本文で前提固まっている)** → 別系統の「Issue 本文の前提検証」(本ファイル別派生ケース) を適用

主な使用箇所:

- Refactor agent — `useFilteredArticles.ts` を「分割未対応」と誤判定 (実際は `useArticleFilters` / `useArticleSorting` / `useArticlePagination` orchestrator 化済) → step 1 skip が原因
- `#808` OGP cache 統合 — `useOgpCache` は画像 URL のみ / `useContentLinkPreviews` は 3 field 必要の設計矛盾が起票時に見落とされた → step 2 skip が原因
- `#807` ws bump — `pnpm.overrides` 追加で副作用 minor 7 件連鎖 + e2e 21 件 fail → step 3 skip が原因

### 派生ケース: 規範 codify 後の grep sweep を「retrospective 本文に結果引用」+「次サイクル開始時に再 sweep」で二段保証する

`rule-maintenance.md` 派生ケース 5 (規範 codify 後は code drift も機械的に sweep する) と派生ケース 6 (code-quality バグ修正時に同 pattern の grep 検出コマンドを併記 + 後続 sweep を Issue 化) は **「規範 codify 時に検出 grep を併記する」** を要求しているが、それだけでは **「codify 時の grep 結果が 0 件を保証しない」** ため、別ファイルに同種バグが残存していることが後の cycle で判明する。

**二段保証パターン**:

1. **codify 時の grep 結果を retrospective commit message / 規範本文に明示引用**
   - 例: `grep -rEn 'a > b \? a : b|until > prev|publishedAt > [a-z]+\.publishedAt' src/ → 0 件 (適用済 src/lib/read-state-merge.ts / read-state-prune.ts)`
   - 結果が 0 件であることを書くことで「全箇所適用済」を文書で証跡化
2. **次サイクル開始時に再 sweep をルーティン化**
   - bug 監査エージェント派遣時に `Pre-narrowed scope` に「過去 3 cycle で codify した bug pattern の sweep」を含める
   - エージェント prompt 例: `Check if the following codified bug patterns are fully swept across the codebase: 1. ISO 8601 lexicographic comparison (canonical: Date.parse), 2. ...`

**How to apply**:

1. **規範 codify 時**: 検出 grep コマンドを実行 → 0 件であることを retrospective commit message に引用
2. **0 件でない場合**: 残箇所を同 commit で連続修正、または別 Issue 起票で sweep
3. **次サイクル開始時 (or 3 サイクル後)**: bug 監査エージェントの prompt に「**過去 codify した bug pattern を grep sweep**」を含める
4. **発見した場合**: 規範 codify 時に「sweep 漏れがあった」事実を retrospective に追記して保証強化

主な使用箇所: `isLaterIso` / `pruneOldReadIds` の lexicographic ISO 比較バグを codify したが、`useFilteredArticles.ts` 同種バグが 6 cycle 後の bug 監査エージェントで発見 → 二段保証を追加運用ルール化

### 派生ケース: subagent (implementer 役) への refactor 委譲 prompt は touch ≤ 3 ファイル + signature 確定済 trivial 置換に絞る

sonnet モデルで動く subagent (implementer 役) に **3 ファイル超えの refactor** を委譲すると、agent 側で対象ファイル全件 Read + 既存 spec Read + 設計判断で **context overflow (autocompact thrashing) を起こして中断** する典型的な罠がある。Security audit エージェントで同様の罠 (broad-scope prompt → context overflow → 中断) は本ファイル別派生ケースで既知だが、**implementer 役の refactor タスクでも同じ罠が成立する**。

```
アンチパターン (overflow を起こした実例):
  prompt: "3 hooks (useSpeechSynthesis 260 行 + usePiperTts 570 行) の
          rate/voice/volume 制御を共通 hook に集約して 2 既存 hook を置換"
  → agent: 両 hook 全文 Read + spec 構造把握 + 共通 hook 設計 + 2 既存 hook 置換
          → context 圧迫 → autocompact thrash → 中断 (新 hook ファイル untracked のみ残る)

修正パターン (Phase 分離):
  prompt 1: "新 hook A を Write + spec 1 件で TDD (signature 確定)"  → 1 commit
  prompt 2 (次サイクル): "既存 hook X を新 hook A 呼出に置換"        → 1 commit
  prompt 3 (次サイクル): "既存 hook Y を新 hook A 呼出に置換"        → 1 commit
```

**How to apply**: subagent (implementer 役) に refactor を委譲する prompt を書くときに以下を判定 (sonnet モデルは context 余裕が opus より少なく、3 ファイル × 数百行 の同時把握で thrashing が発生する閾値が低い):

1. **touch ファイル数を見積もる** (Read 対象を含む) — **4+ ファイルなら委譲 NG**、Phase 分離して各 Phase で touch ≤ 3 に
2. **signature が確定済か** — 「共通 hook の戻り値 / option / generic 引数」を **メイン opus 側で確定** してから委譲。agent に signature 設計を任せない (設計判断は context を喰う + agent が誤推測する)
3. **既存 hook の特殊副作用 (silent reset / 直接 state setter 呼出 / 内部 ref 操作) を事前に grep** して prompt に明記。共通 hook 化で**動かなくなる箇所**を agent が後から発見すると context が膨らむ
4. **TDD spec が新規 1 件で完結するか** — 既存 spec 群を読み直す必要がある (既存 spec が internal state を assert している等) なら Phase 分離

**反例 (4+ ファイル委譲が妥当なケース)**:

- 各ファイルが **独立変更** (機械的 sweep / 同一 pattern 置換 N 件) で agent が 1 ファイルずつ完結可能 → touch 多くても context 圧迫しない
- 既存 spec を一切読まない (typecheck + 既存 e2e のみで担保) refactor → context 節約

主な使用箇所: TTS engine の rate/voice/volume 共通化を 1 subagent 委譲で 3 hooks 跨ぎ実行 → context overflow で中断、新 hook 作成のみで次サイクルに Phase 分離。次サイクルでは Phase B-1 (useTtsControls に setVoiceUriSilent variant 追加 + 15 ケース TDD spec) を 2 ファイル touch に絞って 1 implementer に委譲 → 1 commit で完了 (signature 確定済の trivial 置換に絞った成功事例)

### 派生ケース: subagent 並列実行で別 implementer の touch ファイルに pre-commit auto-fix が偶発的影響を及ぼす罠

3+ implementer を並列稼働させると、各 agent が `git commit` する瞬間に pre-commit hook (`oxlint --fix` / `oxfmt` / 他 lint auto-fix) が **agent 自身が触っていないファイル** を format 修正して commit に取り込むことがある。具体的には:

```
時刻 t0: implementer A が ファイル X を Edit (#783 useReadState 系 sweep)
時刻 t1: implementer B が ファイル Y を Edit (#782 wasm 認証)
時刻 t2: implementer B が `git commit` → pre-commit hook が ファイル X (A 編集中) を auto-fix で format
        → ファイル X の format 修正分が B の commit に取り込まれる
時刻 t3: implementer A が `git pull --rebase origin master`
        → B が取り込んだ X の format 分と A の Edit が rebase で衝突 (or A が rebase 後 push)
```

実害は **commit boundary が混在** することと **rebase 解決の手間** + **bisect 時に「なぜこの commit にこのファイルの format 修正が入っているのか」が不可解になる** 点。

```bash
# アンチパターン例 (1 サイクル内で 6 commit のうち b7bcfb7d に意図しないファイルが含まれる):
b7bcfb7d security(api/wasm,piper-voice): ...
  touched: 4 ファイル (本来は 3 ファイル、useReadStateTags.ts は #783 implementer 編集中だった pre-commit auto-fix の影響)

# 修正パターン: 並列稼働時の auto-fix 露出を抑える運用
# A: 各 implementer に「auto-fix で意図しないファイルが含まれた場合は git restore して再 commit」と prompt 明記
# B: pre-commit hook の auto-fix 対象を「staged file のみ」に限定 (.pre-commit-config.yaml で files: パターン制限)
# C: 並列実行する implementer の touch 範囲を完全に分離 (異なるディレクトリ / 異なる関心事)
```

**How to apply**: 3+ implementer を並列委譲するときに以下を判定 (auto-fix の commit 取り込みは小さなノイズだが累積すると bisect / blame 困難になり commit semantics が壊れる):

1. **touch 対象ディレクトリが重ならないか** を確認 (`src/lib/` と `src/hooks/` 分離 / `app/api/` と `src/components/` 分離 等)
2. 重なる場合は **agent prompt で「commit 前に `git diff --stat` で touch ファイルが想定範囲内か確認、想定外ファイルが含まれていたら `git restore <file>` で revert してから再 commit」を明記**
3. **完了報告の `touched: N files` を main thread で検証** — 想定より多ければ「何が含まれたか」を確認し、別 implementer の作業との重複 / pre-commit auto-fix 影響を切り分け
4. **将来的には `.pre-commit-config.yaml` の auto-fix hook を `files: ^staged-only.*$` のように staged file のみに限定** (但し本プロジェクトの oxlint+oxfmt は repo-wide auto-fix がデフォルト挙動なので config 修正コストあり)

**反例 (auto-fix 混入が許容されるケース)**:

- 1 implementer のみ稼働 (並列なし) → auto-fix は単一 commit に閉じる、問題なし
- 並列でも touch ディレクトリが完全分離 → 物理的に auto-fix が他 implementer に影響しない
- format / lint の auto-fix が **そもそも全 implementer で同じ結果** になる (idempotent) → 取り込まれても害なし、ただし commit semantics は依然汚れる

主な使用箇所: 1 サイクル内で 6 implementer 並列稼働中、#782 implementer の pre-commit hook が #783 implementer 編集中の `useReadStateTags.ts` を auto-fix で format → `b7bcfb7d` commit に意図しないファイル混入 (#783 implementer は rebase で吸収して進行継続したが commit boundary 汚染)

### 派生ケース: subagent 中断時の unstaged 変更を main opus で Read + 検証 + 自前 commit で回復するパターン

3 並列 implementer のうち 1-2 体が autocompact thrashing で中断したとき、**unstaged 変更が残置される場合と完全 revert される場合の 2 パターン** がある:

| 残置状態                  | 対処                                                                             |
| ------------------------- | -------------------------------------------------------------------------------- |
| unstaged 変更が残っている | main opus で `git diff` で内容検証 → typecheck/check → 自前 commit + push で吸収 |
| 完全 revert (変更ゼロ)    | 作業ロスト確定、次サイクル送り (Issue にコメントで進捗共有)                      |

main opus による自前 commit 吸収フロー:

```bash
# 1. 状態確認
git status
git log --oneline -5
git diff --stat src/<target>.ts

# 2. 変更内容を Read で検証 (規範整合 + 機能変化なし確認)
# - deps 配列から ref 削除されているか
# - 規範コメント追加されているか
# - eslint-disable-next-line が必要箇所に付与されているか

# 3. typecheck + check
pnpm run typecheck
pnpm run check

# 4. 検証 OK なら自前 commit + push
git add <target files>
git commit -m "..."  # pre-commit hook 通過
git push origin master
```

**How to apply**: 3+ 並列 implementer で中断通知 (autocompact thrashing 等) を受けたら以下のフロー (実装が 80% 完了して unstaged で残っている場合、main opus による Read + 検証 + commit で「ロスト 1 hour」を「メイン 5 分」で回復できる):

1. **`git status` + `git log` + `git diff --stat`** で残置状態を 1 ターンで確認
2. **完全 revert なら** Issue にコメントして次サイクル送り (それ以上の回復努力は不要)
3. **unstaged 残置なら** `git diff <files>` で内容検証:
   - 規範整合 (deps 削除パターンが canonical と一致)
   - touch 範囲が想定内 (agent prompt の指示通り)
   - 自走 5 条件の機能変化なし担保
4. typecheck + check で機械的検証
5. 検証 OK なら main opus で自前 commit + push (pre-commit hook を通過させる)
6. **検証 NG (部分実装で中途半端 / 想定外ファイル混入 / 機能変化あり) なら `git restore` で revert** + 次サイクル送り

**反例 (自前 commit 不可なケース)**:

- 変更が **論理的に完結していない** (TDD spec を書きかけて Red 確認していない、必要な周辺修正が抜けている) → restore + 次サイクル送り
- 変更が **大規模で main opus 自身の context も圧迫する** (200+ 行 diff の Read + 検証) → 次サイクル新 implementer 委譲
- 検証で **規範違反 / 想定外変更** が発覚 → restore + agent prompt を refine して再委譲

**並列実行時の中断パターン (本プロジェクト実測、複数サイクル累積)**:

- 1 並列: thrash ほぼなし
- 2 並列: thrash 5% 程度
- 3 並列 (touch 1 ファイル/各、signature 確定済 trivial 置換): thrash 10-20% 程度
- 3 並列 (touch 2-3 ファイル含む、TDD spec 新規含む): **thrash 30-60%**
- 6 並列 (1 サイクル全期間): commit 全件成功するが pre-commit auto-fix 衝突発生 (前派生ケース参照)

main opus 側 context も並列体数に比例して圧迫されるため、**touch 多ファイル / 大規模 refactor は 1-2 並列が安全**。

**Phase 分離の段階別実証パターン**:

複数 Phase に分解した refactor / 新機能 Issue で、各 Phase の touch / 規模を実測することで「**どの粒度なら subagent 委譲で完結するか**」の経験則が累積する。本プロジェクト実測:

- **Phase α (signature / 抽象型定義 / 純粋関数 + spec)**: 1-2 ファイル touch、subagent 委譲で完結率 90%+
- **Phase β (canonical 流用の既存 hook 置換)**: 1 ファイル touch、subagent 委譲で完結率 80%+ (1 体目は thrash 経験、2 体目は前 commit を canonical 参考に成功)
- **Phase γ (component 統合 / UI 適用)**: 3-5 ファイル touch、subagent 委譲で完結率 50% 程度、main opus 直接実行が無難
- **Phase δ (全 caller 一括展開)**: 5+ ファイル touch、subagent 委譲不可、Phase 更分割推奨

主な使用箇所:

- useFeeds/useFeedData/useFocusMode の useSyncedRef deps 8 箇所 sweep が implementer thrash で commit 直前に中断 → main opus が `git diff` 検証 + typecheck + 自前 commit `3d96a84a` で吸収
- 同サイクル Phase B-2 useSpeechSynthesis は完全 revert で次サイクル送り判定 → 次サイクルで main opus が Phase B-3 commit `1bcc3067` を canonical 参考にして直接 `replace_symbol_body` で実装 → 1 commit `ec315819` で完結 (Phase β 成功事例)
- #788 Phase 1 (hook + component + spec) を 1 subagent に「+ ImageGallery 適用」まで委譲 → thrash で適用部分 revert、新規 3 ファイルは untracked で残置 → main opus が検証 + commit `dfe05271`、ImageGallery 適用は Phase 2 として次サイクル分離 (Phase α 成功 / Phase γ 失敗 の混合委譲パターン)
