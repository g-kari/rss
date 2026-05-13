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

主な使用箇所: TTS engine の rate/voice/volume 共通化を 1 subagent 委譲で 3 hooks 跨ぎ実行 → context overflow で中断、新 hook 作成のみで既存 hook 置換は次サイクル送りに Phase 分離
