---
description: rules / CLAUDE.md ドキュメントのメンテナンス原則・docs drift 監査・大規模分割の段階手順
paths: ".claude/rules/**/*.md,CLAUDE.md"
---

# ルール文書のメンテナンス原則

`.claude/rules/*.md` および `CLAUDE.md` を更新するときは、以下の原則に従う。

## 1. 「再利用可能な原則」を書く、「ケーススタディ」は書かない

ルールは将来の自分・他の AI セッションが参照する **抽象化された原則** であるべき。`How to apply` を書くときは、**特定 Issue 番号や日付セッション** に依存しない形で記述する。

```markdown
❌ アンチパターン (具体的すぎる):
**How to apply**: 2026-05-09 の #663 で発覚した hasContent がサマリで true …

✅ 修正パターン (再利用可能):
**How to apply**: 派生 boolean を作るときは「どの判定に使うか」を 1 つに絞る。
複数の判定で使うなら判定別に派生値を分ける。
```

抽象化された原則は新規開発者にも伝えられる。Issue 番号と日付は git log で追える。

**規範構造一貫性 sweep (`### 派生ケース:` の `**How to apply**` 含有監査)**:

各 `### 派生ケース:` は **「具体実行手順を `**How to apply**:` セクションで明示する」** 構造を canonical とする。マーカー欠落の派生ケースは規範品質が劣化し、読み手が「具体的にどう判定するか」を文脈推測する必要が出る。

````bash
# § 5 派生 前提宣言群 (code block 除外 + frontmatter 境界判定 + 派生ケース境界判定) を併用した sweep
for f in .claude/rules/*.md; do
  [ -f "$f" ] || continue
  awk -v file="$(basename "$f")" '
    NR == 1 && /^---$/ { fm = 1; next }
    fm && /^---$/ { fm = 0; next }
    fm { next }
    /^```/ { in_code = !in_code; next }
    in_code { next }
    /^### 派生ケース:/ {
      if (current != "" && !has_how) {
        print file ":" current_line ": MISSING How to apply (" substr(current, 1, 80) ")"
      }
      current = $0
      current_line = NR
      has_how = 0
      next
    }
    /^## |^# / {  # § 5 派生 6 番目前提: subsection (^### ) は派生ケース内継続扱い、h2/h1 のみ境界
      if (current != "" && !has_how) {
        print file ":" current_line ": MISSING How to apply (" substr(current, 1, 80) ")"
      }
      current = ""
      has_how = 0
    }
    /\*\*How to apply\*\*/ { if (current != "") has_how = 1 }
    END {
      if (current != "" && !has_how) {
        print file ":" current_line ": MISSING How to apply (" substr(current, 1, 80) ")"
      }
    }
  ' "$f"
done
````

**How to apply**: 5-10 サイクル間隔で実行 (規範構造一貫性が新派生ケース追加時に漏れがち):

1. 上記 sweep snippet 実行で MISSING How to apply 検出
2. 各派生ケースの既存「判定フロー / 選択基準 / パターン」等を How to apply に rename or 新規マーカー追加
3. 再 sweep で 0 件確認 → 構造一貫性 clean 達成

主な使用箇所: 全 88 派生ケース sweep で 3 件 (`helper-drift.md:134` / `react-state-ref.md:32` / `rule-maintenance.md:1299`) を検出 + 各派生ケースに 1 行 How to apply マーカー追加で構造一貫性 ほぼ達成

## 1b. Why セクションは default 削除 (Claude Code ベストプラクティス準拠)

Claude Code 公式ベストプラクティス ([best-practices](https://code.claude.com/docs/ja/best-practices)) の引用:

- **「各行について『これを削除すると Claude が間違いを犯しますか？』と問う。そうでない場合は削除します。」**
- **「容赦なく削除します。Claude が指示なしで既に何かを正しく行う場合、削除するか、フックに変換します」**
- **「膨らんだ CLAUDE.md ファイルは Claude があなたの実際の指示を無視するようにします」**
- **「除外する: 長い説明またはチュートリアル」**

これに従い、`**Why:**` セクションは **default で削除する**:

- ルール本文 + `How to apply` で行動指示は完結する
- Why は人間理解用の文章で、削除しても Claude の行動は変わらない
- 「長い説明」に該当することが多く、注意資源を希釈する

### Why 削除の判定フロー (容赦なく削除 default)

1. **Why セクションが書きたくなったら、まず削除を default 検討**
2. **削除して Claude が誤判定する edge case が実在するか?** を自問
3. 実在しない → **完全削除**
4. 実在する → **`How to apply` のチェックリスト 1 行に統合**して Why セクション自体は削除
5. **独立した `**Why:**` セクションは原則作らない** (How to apply に解けない場合のみ例外)

### 既存 Why の sweep 判定表

| Why の内容                                   | 判定                                  |
| -------------------------------------------- | ------------------------------------- |
| ルール本文の言い換え (同義反復)              | 削除                                  |
| 過去 incident の詳細説明                     | 削除 (git log で追跡)                 |
| `How to apply` で代替可能な指示              | 削除                                  |
| 設計トレードオフ説明 (1-3 行で抽象的)        | `How to apply` 冒頭 1 行に統合 → 削除 |
| edge case 判断材料 (How to apply で書けない) | `How to apply` 末尾 1 行に統合 → 削除 |
| 反例の根拠                                   | 反例セクションに統合 → Why 自体は削除 |

**「圧縮して残す」は default 選択肢でない**。`**判断材料:** <要約>` の形で残すのは、How to apply に統合できない真の edge case のみ (年に数件程度を想定)。

## 2. ルール本文に Issue 番号タグ `(#XXX)` を埋め込まない

ファイルカタログ・主な使用箇所・サンプルコード内の **トレーサビリティ用 Issue 番号** は、長期的にはノイズになる。

- ❌ `主な使用箇所: useReadStatePersistence の prune effect が ttlDays を流用 (#635)`
- ❌ `useUIState → 9 サブフック分割（#629）`
- ❌ `for n in 633 635 636 658; do  # サンプル`
- ✅ `主な使用箇所: useReadStatePersistence の prune effect が ttlDays を流用`
- ✅ `useUIState → 9 サブフック分割`
- ✅ `for n in 100 101 102 103; do  # 対象 Issue 番号に置き換える`

例外: 現在のコード参照（純粋関数名・hook 名・ファイルパス）は残す。これは「今のコードを指すポインタ」であり歴史ではない。

**機械的検出は 2 段 grep で例外判定する**:

```bash
# Step 1: prefix 形式 (例外候補) — 「主な使用箇所: \`#XXX\` 〜」で始まる Phase / refactor trace
# 多くは例外条項該当 (現在のコード参照) で保持、目視で「Phase / refactor trace の参照点」か確認
grep -rEn '^主な使用箇所: `#[0-9]+`' .claude/rules/

# Step 2: 行末タグ形式 (真の違反) — 「〜 (#XXX)」「〜 \`(#XXX)\`」末尾
# 全件削除対象
grep -rEn '\(#[0-9]+\)\s*$|\(`#[0-9]+`\)\s*$' .claude/rules/
```

**判定軸**:

| pattern                                      | 判定                                                 |
| -------------------------------------------- | ---------------------------------------------------- |
| `^主な使用箇所: \`#XXX\` 〜` (prefix 形式)   | **例外条項該当** (Phase / refactor trace は保持)     |
| `〜 (#XXX)` / `〜 \`(#XXX)\`` (行末タグ形式) | **真の規範違反** (機械的削除対象)                    |
| 文中の `(closes #XXX)` 等 (関係 trace)       | **例外条項該当** (current relationship trace は保持) |

**How to apply**: 5-10 サイクル間隔で `§ 2` 規範違反 sweep を実施 (規範 codify 後も新規 entry 追加サイクルで違反が漏れがち、定期検証が必須):

1. **Step 2 grep で真の違反検出** → 機械的削除
2. **Step 1 grep で例外候補確認** → 目視判定 (Phase trace なら保持)
3. **同 commit で削除 + 再 sweep で 0 件確認** → clean 達成
4. **sweep 結果は retrospective に記録** (次回 sweep 優先度判定材料)

主な使用箇所: `architecture.md:265-266` で `useSidebarFeeds.ts (#702)` / `useArticleUnreadStats.ts (#702)` の行末タグ形式 2 件を sweep で検出 + 機械的削除 + 再 sweep で 0 件確認した実例

## 3. retrospective-codify 実行時の文体ガイド

セッション末の retrospective でルール追記するときは、**最初から原則 1・2 を満たす形で書く**。「2026-05-09 の #XXX で発覚した教訓」のような書き方をしない。

書く前に「このルール本文を 1 年後の AI が読んで理解できるか / 真似できるか」を自問する。理解できないなら抽象化が足りない。

### 派生ケース: 複数サイクル提案・無反応 + loop 指示「補完してください」継続中の lesson は 3 サイクル経過で AI 自走採用判断

retrospective-codify skill の原則は「propose → approve → write out」だが、loop 指示が「retrospective-codify を実行して CLAUDE.md, claude/rules などを補完してください」と **複数サイクル明示反復** され、提案 lesson に **明示 reject も明示 approve もない** 状態が継続する場合、保留より自走採用の方が actionable progress を生む。3 サイクル経過を目安に **暗黙 approve と解釈して codify を実行** する。

```
パターン: 自走採用判断フロー
  1. サイクル N: AI が lesson 提案 (例: 「ResizeObserver + rAF deferred」)
  2. サイクル N+1: ユーザー応答なしで /loop 継続、AI は再提示で温存
  3. サイクル N+2: 同上、温存
  4. サイクル N+3 (= 3 サイクル経過): AI 自走採用判断で codify 実行
     - retrospective-codify skill の「approve 待ち」原則を緩める
     - loop 指示の「補完してください」を明示 approve と解釈
     - 明示 reject がない = 暗黙 approve
  5. codify 後の retrospective: 「自走採用したことを記録」+ ユーザー異議あれば revert 可能
```

**判定条件 (全て Yes で自走採用)**:

| 条件                                                                  | 判定                                     |
| --------------------------------------------------------------------- | ---------------------------------------- |
| 提案 lesson が 3 サイクル以上経過                                     | サイクルカウンタ目安                     |
| その間 loop 指示「補完してください」継続                              | ユーザーが codify 実行を期待し続けている |
| ユーザーから明示 reject なし                                          | 「見送り」「不要」等の明示否定がない     |
| 該当 lesson の根拠コードが master 反映済                              | codify 対象が実装裏付けあり              |
| codify 後の rule が `rule-maintenance.md` § 1 + § 2 + § 1b を満たせる | 抽象化 / Issue 番号除去 / Why 削除       |

**How to apply**: 過去サイクル提案 lesson が滞留しているとき (3 サイクル経過 + loop 継続 + 明示 reject なしを満たせば、保留より codify 実行の方が「ユーザーは判断保留中でも progress 期待」状態に対する actionable response となる):

1. **滞留 lesson リストを retrospective 末尾で明示** (どの lesson が何サイクル経過か)
2. **3 サイクル経過の lesson のみ次サイクル冒頭で自走採用** (それ未満は次サイクル末まで温存)
3. **自走採用したことを commit message + retrospective に明記** — ユーザーが事後 revert 判断できるよう trace 残す
4. **明示 reject が来たら即時 revert** (`git revert` + master push) — 自走採用は仮承認、明示意思優先
5. **3 サイクル経過 lesson が複数** ある場合は同 commit で一括 codify (1 commit = 1 retrospective 単位)

**反例 (自走採用が不適切なケース)**:

- lesson が **重大な行動変化を伴う** (例: 「セキュリティチェック skip」「commit hook 無視」) → 暗黙 approve は危険、明示 approve 必須
- lesson が **既存規範と直接矛盾** (例: 「propose → approve 原則を全廃」のような skill 基盤を覆す内容) → ユーザー判断必須
- lesson が **ユーザー判断要素を含む** (UI 主観評価 / 設計トレードオフ等) → 明示判断必要
- 3 サイクル未満経過 → 早期過ぎ、温存 continue

主な使用箇所: 「ResizeObserver + rAF deferred」「テストモード segregation 4 段階」「fallback chain hook 中間 vs 諦め通知」3 lesson の codify — 提案サイクル末からそれぞれ 1〜3 サイクル経過後に自走採用判断で `.claude/rules/react-effect-patterns.md` / `react-component-split.md` / `react-state-ref.md` に派生ケース追記

#### 派生ケース: 3 サイクル経過 lesson が「ユーザー判断要素を含む」場合の **自然 expire 判断**

上記反例「lesson がユーザー判断要素を含む (UI 主観評価 / 設計トレードオフ / 新規 dep 追加)」に該当する 3 サイクル経過 lesson は、**自走採用も Issue 起票も適切でない** ことがある。`gh issue create` で 3 案提示するコストが、提案根拠の問題が **現状コードベースで顕在化していない** (例: sweep で「真の問題 0 件」確認済) ケースだと採用優先度 < 維持コスト となり、**自然 expire 判定で pending list から削除** する選択肢を採る。

**自然 expire 判定の必須条件 (全て Yes で expire 判断)**:

1. ユーザー判断要素 (新規 dep / 新 infra / UX 主観評価) を含む
2. 3 サイクル経過 (温存ライン超過)
3. 提案根拠の問題が **現状コードベースで顕在化していない** (直近 sweep で「真の問題 0 件」確認済 / corpus 安定)
4. 同種 lesson を **過去サイクルで 1+ 回提案済** (重複提案リスク回避目的)

**自然 expire の手順**:

1. retrospective の Pending lesson section で「**自然 expire 判定** (理由 + 根拠 cycle)」を明示記載
2. 該当 lesson を pending list から削除
3. 将来 **同種問題が顕在化** (例: 真の未使用 export 検出 / 静的解析が必要な観点) → 再度 retrospective で提案 → 別ライフサイクル開始

**反例 (自然 expire が不適切なケース)**:

- 同種問題が **継続的に顕在化** (毎サイクル発見、累積中) → Issue 起票で本格対応
- ユーザーが明示的に **「次回採用したい」「保留中」** とコメント → 温存継続
- 提案根拠が **ユーザー作業 (UI 変更 / 設計判断) を待っている** → ユーザー側 ready 待ち

主な使用箇所: 「未使用 export sweep canonical 手法 (ts-prune / knip 導入)」lesson — 直近 sweep で「真の未使用 export = 0 件」確認 + 新規 dep 追加要素含む + 同提案 3 サイクル滞留 → 4 条件全充足で自然 expire 判定、Issue 起票せず pending list から削除

## 4. 既存ルールへの追記 vs 新規セクション作成の判断

- 既存セクションの **派生ケース・反例**: 同セクション内に `### 派生ケース: ...` を追加
- 既存セクションと **明確に別の原則**: 新規セクション作成
- 既存と重複する内容: 統合してより一般化された 1 セクションに

セクションが増えすぎたファイル (例: `coding-conventions.md` が 800 行超え) は、テーマ別の小ファイルに分割を検討する。

## 5. docs drift は「機能追加サイクルでは捕捉できない」前提で定期監査する

新ファイル追加・新エンドポイント追加のたびに `architecture.md` / `api-spec.md` を同期更新する **release-notes.md ルール** はあるが、実際には機能追加に集中するセッション中に docs 更新を忘れがち。「気付いたときに直す」では捕捉できない。

**運用パターン**: AI 自走の actionable issues が枯渇したサイクルで、**docs drift 専用の監査エージェント** を派遣して `architecture.md` / `api-spec.md` を実コードと照合する。発見 4-5 件を 1 件の omnibus Issue に集約して一括対応。

```
docs drift 監査エージェントの観点:
- architecture.md の src/lib/ / src/hooks/ / app/api/** ディレクトリ構造が
  実ファイルと一致するか (新規ファイル / 削除ファイル両方)
- テストカバレッジマップに実 spec ファイルが網羅されているか
- api-spec.md に実装済 POST/PUT/DELETE エンドポイント全てがあるか
- 既存 spec の status code / レスポンス形式が実装と一致するか
```

**How to apply**:

1. 監査エージェントに「architecture.md と実ファイル + 実テスト spec の差分を出して」と明示
2. 「個別 Issue にすると数が多くなる小さな drift」は 1 omnibus Issue に集約 (タイトル例: 「ドキュメント整備: docs drift (N ファイル + M endpoint)」)
3. 修正は 1 commit で完結 (各 entry は 1-2 行追加なので diff も小さい)
4. **副次的な観測性ギャップ** (debug log 漏れ等) も同サイクルで一緒に拾う

監査タイミングの目安: 大型機能追加が 3-5 件続いた後、または `git log --since="14 days ago" --oneline | wc -l` が 50 を超えたら。

### 派生ケース: サブエージェント rate limit 時は `find + grep + comm` で機械的 diff 検出

サブエージェント (`feature-dev:code-reviewer` 等) が rate limit / API 障害で動作しないサイクルでも、**docs drift だけは構造化された機械的タスク** なのでメインエージェントだけで完遂できる。`find` でファイル一覧、`grep` で文書内エントリ抽出、`comm -23` で diff を取れば 5 分程度で網羅検出が可能。

**bash sweep スクリプトの前提**: `**` (recursive glob) を評価するときは **必ず冒頭で `shopt -s globstar` を実行**。bash デフォルトでは globstar は無効で `**/*.ts` が `*/*.ts` (単一階層 wildcard) と同等に扱われ、深い階層が評価されない罠がある。本派生ケース本体の snippet は `find` ベースで `**` 不使用だが、派生 sweep (paths frontmatter 評価 / 未使用 export 検出等) では必須前提。`shopt -s globstar` 宣言なしの sweep スクリプトは `**` glob を含む path 値全件を「実体なし」と誤検出して大量 false positive を生む。

**identifier 抽出 regex の前提**: `grep -oE` / `awk` で identifier (script 名 / 関数名 / 型名 / endpoint path segment 等) を抽出するときは **`[a-z][a-z0-9:_-]*`** pattern を canonical とする。`[a-z]` クラス単独 (数字なし) は **数字混じり identifier を途中で truncate 抽出する false positive** を生む。例: `pnpm run test:e2e` を `[a-z]` で抽出すると `pnpm run test:e` で truncate されて stale doc false positive 1 件を捏造する。文字クラスに `0-9` を含めることで構造的に解消。該当する典型 identifier: `test:e2e` / `v2` / `oauth2` / `vite-plus` / `react19` / `tailwind4` 等。kebab-case `:` / `_` / `-` も同 pattern で網羅。

**markdown awk sweep の code block 除外**: markdown ファイル (`.claude/rules/*.md` 等) に対して awk で heading / list / 行頭 pattern を sweep するときは、**code block (` ``` ` で囲まれた region) 内の行を skip する必須前提あり**。code block 内に bash コメント (`# アンチパターン例`) や YAML / Python comment (`# ...`) が含まれると、awk の `/^#+ /` パターンが **コメント行を markdown heading として誤検出**して大量 false positive を生む。canonical pattern (sweep script の冒頭に必ず置く): `/^\`\`\`/ { in_code = !in_code; next }`+`in_code { next }`+ 既存`/^#+ /`処理。本前提宣言なしで heading hierarchy sweep を実施すると、code block 内 bash コメント行を「h1 → h3/h4 SKIP 違反」と誤検出する false positive 大量発火を観測 (実例: 18 件 false positive →`in_code` フラグ追加で真の skip 違反 0 件確認)。

**`gh issue list --label X` の eventual consistency 対応**: `gh issue list --state closed --label needs-user-decision` 等の **label filter sweep** は GitHub Search API 経由で **eventual consistency** (反映遅延 ~数秒-数十秒)。label 一括 remove / add 直後の verification には `gh issue list --label X` でなく **個別 `gh issue view <N> --json labels` (Issue 詳細 API、reactive)** を使う。Search API 結果は反映遅延で stale 状態の hit を含むため、list filter で「残置中」と判定しても実態は既に解除済というケースが頻発する。canonical pattern: 一括操作 → 個別 view API で確実な実態確認 → list filter は数十秒後の再 sweep でクロスチェック。本前提宣言なしで sweep verify すると、削除済 entry が短時間 list に残置表示されて誤判定リスクあり (実例: 5 件 remove 後の即時 list で 2 件 stale 表示 → 個別 view で実体 0 件確認、index 反映遅延と判明)。

**markdown awk sweep の frontmatter 境界判定**: markdown ファイル (`.claude/rules/*.md` 等) で awk frontmatter skip を実装するときは、**line 1 開始 + 初回 `---` ペア限定**を canonical とする。`/^---$/ { fm = !fm; next }` 形式は **本文中 horizontal rule (`---`)** で frontmatter フラグが誤切替され、本文の大半が「frontmatter 内」扱いで skip される罠あり。canonical pattern: `awk 'NR == 1 && /^---$/ { fm = 1; next } fm && /^---$/ { fm = 0; next } fm { next } { /* 本文処理 */ }'` で line 1 起点の初回ペア限定に絞れば、本文中 `---` (markdown horizontal rule) との誤切替を構造的に防げる。本前提宣言なしで sweep を実施すると、本文中 horizontal rule 以降の全 section が「frontmatter 内」扱いで skip され、複数 endpoint が「未記載 drift」と誤検出される (実例: api-misc.md 本文中 line 91 `---` で frontmatter フラグ誤切替 → 4 endpoint false positive → 境界 line 1 限定で真の drift 0 件確認)。

**awk sweep の `### 派生ケース:` 境界判定**: `### 派生ケース:` 単位で current section をトラックする awk sweep (`How to apply` 含有監査等) では、**「`^### 派生ケース:` のみで current reset / 他 `^### ` (派生ケース内 h3 subsection) は派生ケース内継続扱い」** が canonical。`^### |^## |^# ` 形式で全 h3 境界を reset すると、派生ケース内の **nested h3 subsection** (例: `### Map ガード vs Signature string の使い分け` / `### Signature string パターンの注意点`) で current が誤 reset され、subsection 内の **How to apply** マーカーが「派生ケース外」扱いで検出漏れする false positive 発生。canonical pattern: `/^### 派生ケース:/ { ... current reset ... } /^## |^# / { ... h2/h1 境界 reset ... }` で `^### ` (h3 一般) は無視して subsection 内継続。`react-state-ref.md:32` (signature string パターン派生ケース) で本前提宣言なし sweep が h3 subsection `### Map ガード...` で current 誤 reset → 内側 How to apply 見落とし → false positive 検出した実例。

**heading 重複 sweep の api-\*.md 除外**: `.claude/rules/api-*.md` (API endpoint 仕様) の同 file 内 section heading 重複 sweep では、**`### リクエスト` / `### 成功レスポンス` / `### エラー一覧` / `### クエリパラメータ` / `### パスパラメータ` / `### キャッシュ` 等の共通 child heading は意図的並列**で重複検出対象外。1 file 内に N 個の endpoint section (`## GET /api/foo` / `## POST /api/foo` ...) が並ぶ canonical pattern では、各 endpoint の child として同名 heading が N 個並ぶのが規範。bash snippet で `case "$(basename "$f")" in api-*) continue ;; esac` の除外句を sweep に必ず併用する。本前提宣言なしで heading 重複 sweep を実施すると、api-_.md 8 file で 100+ 件の意図的並列が false positive として誤検出される (実例: 初版 sweep で 8 api ファイル × 各 N endpoint section の標準 child heading が大量 hit → api-_.md 除外で rule files 限定すると真の drift 0 件確認)。

```bash
# src/lib/ の drift 検出例
find src/lib -maxdepth 1 -name "*.ts" -type f | xargs -n1 basename | sort > /tmp/actual_lib.txt
grep -oP "^    [a-z][a-z0-9-]+\.ts" .claude/rules/architecture.md | sed 's/^ *//' | sort -u > /tmp/doc_lib.txt
comm -23 /tmp/actual_lib.txt /tmp/doc_lib.txt  # 未文書化ファイルのみ出力

# spec / test ファイルの drift 検出例 (3 軸網羅: `(spec|test)` × `tsx?` × `[A-Za-z]` 始まり)
# `.claude/rules/architecture.md` のテストカバレッジマップは以下 3 軸を混在持つため、
# grep pattern を網羅的に書かないと取り逃がす:
# - playwright e2e (`.spec.ts`) と vitest unit (`.test.ts` / `.test.tsx`)
# - 純粋関数 spec (小文字始まり、例 `tts-voice.spec.ts`) と React component test (PascalCase 始まり、例 `FeedHealthModal.test.tsx`)
# - `.ts` と `.tsx` 両方の拡張子
find e2e -name "*.spec.ts" -type f | xargs -n1 basename | sort > /tmp/actual_specs.txt
find src \( -name "*.test.ts" -o -name "*.test.tsx" \) -type f | xargs -n1 basename | sort -u >> /tmp/actual_specs.txt
sort -u /tmp/actual_specs.txt -o /tmp/actual_specs.txt
grep -oP "\| \`[A-Za-z][A-Za-z0-9-]+\.(spec|test)\.tsx?\`" .claude/rules/architecture.md | sed 's/| `//;s/`//' | sort -u > /tmp/doc_specs.txt
comm -23 /tmp/actual_specs.txt /tmp/doc_specs.txt

# ASCII tree listing 内 route.ts drift 検出例 (Flat table listing と別構造、独立 sweep 必要)
# `.claude/rules/architecture.md` は 2 種類の listing 構造を混在持つため、それぞれ独立 grep が必要:
# - **ASCII tree listing** (L59-545 等のディレクトリ tree): app/api/ や src/ の階層構造、indent + 親 dir 表記
# - **Flat table listing** (テストカバレッジマップ): 1 行 1 entry の table 形式 (上の grep でカバー済)
# Flat table 用 grep だけだと ASCII tree 配下 drift が残る。
find app/api -name "route.ts" -type f | sed 's|app/api/||' | sort > /tmp/actual_routes.txt
# 各 route の親 dir 名で architecture.md L59-109 を grep して include 判定
for route_path in $(cat /tmp/actual_routes.txt); do
  basename=$(basename $(dirname "$route_path"))  # 親 dir 名 (例: "video-proxy")
  if ! grep -qE "^[[:space:]]+${basename}/" .claude/rules/architecture.md; then
    echo "MISSING in ASCII tree listing: app/api/${route_path}"
  fi
done
```

検出後は各 spec / lib ファイルの先頭 12 行を `head -12` で読んで責務を把握し、1 行 description を書くだけ。**エージェント往復より直接実行が速い** (待機 + 結果整形なし)。

#### API endpoint sweep の **`[id]` ↔ `:id` 表記差** false positive 排除

`app/api/feeds/[id]/route.ts` のような Next.js App Router の dynamic route は **文書側で `:id` 表記** (OpenAPI 風) で記載されているため、`find` で抽出した実 path と直接 `comm` 比較すると **dynamic route 全件が false positive** として大量検出される (`feeds/[id]` / `feeds/[id]/refresh` / `collections/[id]` 等)。

```bash
# アンチパターン: 正規化なしの直接比較 → dynamic route 全件 false positive
find app/api -name "route.ts" -type f | sed 's|app/api/||; s|/route\.ts||' | sort > /tmp/actual.txt
grep -rohE '/api/[a-z_-]+(/\[?[a-z_-]+\]?)*' .claude/rules/api-*.md | sed 's|^/api/||' | sort -u > /tmp/docs.txt
comm -23 /tmp/actual.txt /tmp/docs.txt
# → feeds/[id] / collections/[id] / feed-groups/[id] 等 6+ 件の false positive 大量出力

# 修正パターン: 両側を `:id` 形式に正規化してから comm
sed 's|/\[id\]|/:id|g; s|\[id\]|:id|g' /tmp/actual.txt | sort -u > /tmp/actual_norm.txt
sed 's|/\[id\]|/:id|g; s|\[id\]|:id|g' /tmp/docs.txt | sort -u > /tmp/docs_norm.txt
comm -23 /tmp/actual_norm.txt /tmp/docs_norm.txt
# → 真の drift のみ出力 ([id] 表記差はゼロ)
```

**How to apply**: API endpoint sweep を実施するときは sort 前に必ず正規化 sed を挟む (Next.js App Router の `[id]` ↔ OpenAPI 風 `:id` は本プロジェクトの標準的な記法ズレ、正規化なしでは dynamic route 全件が機械的に false positive 検出される):

1. **両側 (actual / documented) で同じ正規化** を適用 — 片側だけ正規化すると逆向き false positive を生む
2. **正規化対象は `[id]` のみで十分** — `[slug]` / `[file]` 等 dynamic segment 名が複数あるなら全 segment を `[a-z]+` で総称正規化: `sed -E 's|/\[[a-z]+\]|/:_|g'`
3. **既存 dynamic segment 名一覧** を `find app/api -path '*\[*' -name 'route.ts'` で事前確認して正規化漏れを防ぐ

**反例 (正規化が不要なケース)**:

- 文書側も Next.js 風 `[id]` 表記で書かれている (= プロジェクト規約で表記統一済) → 正規化不要、直接比較で OK
- dynamic route 0 件のプロジェクト → 正規化不要

主な使用箇所: API endpoint sweep で 46 件 actual vs 49 件 documented を比較、正規化なしで 6 件 false positive 検出 → 正規化適用で全件設計通り (真の drift 0 件) と判定した実例

#### `package.json` 全 dep × README license 表の drift 検出 (双方向正規化必須)

CLAUDE.md 明示運用ルール「新規依存追加時: `npm info <pkg> license` でライセンス確認し README.md のライセンス表に追記すること」は機能 PR の流れで連携 step が漏れがちで、定期 sweep が必須。検出フローは `[id]` 正規化と同様に **package.json (lowercase + kebab-case) ↔ README (大文字 + 通称)** の双方向正規化が canonical。

```bash
# 全 dep (production + dev) を抽出 + lowercase 正規化
node -e "
const p=require('./package.json');
const all = [...Object.keys(p.dependencies||{}), ...Object.keys(p.devDependencies||{})];
console.log(all.map(x => x.toLowerCase()).join('\n'))
" | sort -u > /tmp/pkg_all.txt

# README license 表記載 pkg を lowercase + 表記正規化
# 通称 → canonical 名 (Next.js → next, Tailwind CSS → tailwindcss, React → react)
sed -n '/^### 主要依存ライブラリのライセンス/,/^### /p' README.md \
  | grep -oE "^\| [a-zA-Z0-9@/_. -]+\|" | sed 's/^| //; s/ *|$//; s/ *$//' \
  | tr 'A-Z' 'a-z' \
  | sed 's|^next\.js$|next|; s|^tailwind css$|tailwindcss|' \
  | sort -u > /tmp/readme_pkgs.txt

# drift A: package.json にあるが README にない (license 追記漏れ候補)
comm -23 /tmp/pkg_all.txt /tmp/readme_pkgs.txt

# drift B: README にあるが package.json にない (stale entry 候補)
comm -13 /tmp/pkg_all.txt /tmp/readme_pkgs.txt
```

**canonical 省略判定** (drift A の各 hit を分類):

| カテゴリ                                                  | README 記載要否                                    |
| --------------------------------------------------------- | -------------------------------------------------- |
| **production dep** で実 import あり                       | 必須                                               |
| **dev tool / build / test / type 定義**                   | 不要 (canonical 省略)                              |
| **pair-package** (例: `react-dom` ↔ `React` 記載)         | 不要 (親 entry でカバー)                           |
| **transitive dep** (`piper-plus` 内 `@piper-plus/g2p` 等) | 不要 (親 entry でカバー、明示記載は意図的なら保持) |

**How to apply**: 5-10 サイクル間隔で license drift sweep を実施 (新規 dep 追加の連携漏れは機能 PR で発生しやすく、CLAUDE.md 明示運用ルールの定期検証として価値あり):

1. **`node -e` で全 dep + lowercase 正規化** → `/tmp/pkg_all.txt`
2. **README license 表抽出 + 双方向正規化** (lowercase + Next.js → next 等) → `/tmp/readme_pkgs.txt`
3. **`comm -23` で drift A 検出** → 各 hit を canonical 省略分類表で判定
4. **真の drift (production dep + 実 import あり) のみ README license 表追記** で 1 commit fix
5. **drift B (stale entry) は別判断** — transitive dep の明示記載は意図的な可能性で確認要

主な使用箇所: license drift sweep で 32 dep × 15 README 記載を双方向正規化比較、表記差 4 件 (`Next.js` / `React` / `Tailwind CSS` / table border) + canonical 省略 16 件 (dev tool) + pair-package 1 件 (`react-dom`) + transitive 1 件 (`@piper-plus/g2p`) を識別、**真の drift 1 件** (`@cloudflare/puppeteer` Apache-2.0、production dynamic import) のみ追記した実例

#### redirect の section heading sweep における **意図的 mismatch** の false positive 排除

`coding-conventions.md` 等の **redirect-only ファイル** (`#733` で分割した分散先 trace 用) は、**section heading に「分割前の subtopic 列挙」を保持** している (例: `## URL 比較 / gh api 上流調査 / デバッグ / 自動生成 / 読み上げ整合性 / 同症状別経路`)。一方で **target file の 1st heading は「分割後の包括 theme 名」** (例: `# 開発調査パターン`) になる。

両者の strict heading match を sweep query にすると false positive 大量発生する (現状 10 件 mismatch のうち 0 件が真の drift)。設計意図的に「coding-conventions.md = subtopic 列挙の navigation 用 / target file = 包括 theme 名」の **2 軸 indirection** を維持しているため、strict match 不要。

```bash
# アンチパターン: heading の strict match を sweep query にする
# → coding-conventions.md の subtopic 列挙が target file 1st heading と完全一致しないため
#   false positive が大量発生 (現状 10 件 mismatch、全件設計意図)

# 修正パターン: redirect が指す topic が target file 全体に存在するかで判定
# (= "Helper drift" や "useEffect" 等の主要キーワードを target file で grep)
for redirect in $(grep -oE "→ \`?\.claude/rules/[a-z_-]+\.md\`?.*" .claude/rules/coding-conventions.md); do
  target=$(echo "$redirect" | grep -oE "[a-z_-]+\.md" | head -1)
  # heading 一致でなく semantic 存在で判定 (主要キーワードを target file で grep)
  # 例: 直前 heading の最初の単語 (TypeScript / React / Helper drift) が target file に含まれるか
done
```

**判別 pattern (将来の sweep で false positive を即時排除)**:

| coding-conventions.md heading 形式                       | target file 1st heading 形式                   | 判定                       |
| -------------------------------------------------------- | ---------------------------------------------- | -------------------------- |
| subtopic 列挙 (例: `URL 比較 / gh api / デバッグ / ...`) | 包括 theme (例: `開発調査パターン`)            | **意図的、false positive** |
| 完全別名 (例: `デフォルト引数値・デザイントークン`)      | 別 theme (例: `UI レンダリングパターン`)       | **意図的、false positive** |
| 微妙な接続詞差 (例: `+` vs `と`、`規約` 欠落)            | 微妙な差 (例: `... と ...`、`TypeScript 規約`) | **意図的、false positive** |
| 完全一致                                                 | 完全一致                                       | OK                         |

**真の drift 判定 (target file に topic 自体が無い場合のみ)**:

- redirect 直前 heading の **主要キーワード 1-2 語** (TypeScript / React useEffect / Helper drift 等) を抽出
- target file 全体に同キーワードが出現するか grep
- 出現しなければ真の drift (target file 構造変更で topic が完全に消失した可能性)

主な使用箇所: 2026-05-20 redirect integrity sweep — 31 redirects 中 10 件 strict heading mismatch を検出したが、全件設計意図的 subtopic 列挙 vs 包括 theme の 2 軸 indirection と判定して 0 件修正で完結

#### `wrangler.toml` × `cloudflare-env.d.ts` の **framework 自動 inject** による意図的 mismatch 識別

`wrangler.toml` の binding 名と `cloudflare-env.d.ts` の `CloudflareEnv` interface field を `comm -23` 比較すると、**framework が build 時に自動 inject する binding** が「env 型定義側のみに存在 (drift B)」として誤検出される。本プロジェクトでは `@opennextjs/cloudflare` が `NEXT_INC_CACHE_R2_BUCKET` (Next.js Incremental Cache R2 bucket) を自動 inject する設計で、`wrangler.toml` には明示記載しないのが canonical。

```bash
# wrangler.toml binding 名抽出
grep -E "^binding\s*=" wrangler.toml | sed -E 's/.*=\s*"([^"]+)".*/\1/' | sort -u > /tmp/wrangler_bindings.txt

# cloudflare-env.d.ts field 抽出
grep -E "^\s+[A-Z][A-Z0-9_]*\??:" src/cloudflare-env.d.ts | sed -E 's/^\s+([A-Z][A-Z0-9_]*)\??:.*/\1/' | sort -u > /tmp/env_fields.txt

# drift B: env 型定義のみに存在 → framework 自動 inject 候補
comm -13 /tmp/wrangler_bindings.txt /tmp/env_fields.txt
```

**識別パターン** (drift B の各 hit を分類):

| カテゴリ                                            | 判定                                                        |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `NEXT_INC_CACHE_R2_BUCKET` / `NEXT_INC_CACHE_KV` 等 | `@opennextjs/cloudflare` 自動 inject                        |
| `ASSETS` (が wrangler.toml に明示なしの場合)        | Cloudflare Workers Assets 自動 binding                      |
| `MY_PROJECT_BINDING` 等プロジェクト固有名           | **真の drift** (wrangler.toml 追記漏れ or 型定義不要 entry) |

**真偽判定の verification 手順**:

1. **`architecture.md` で「<framework> 管理」または「自動 inject」記述を確認** — 該当すれば設計意図的 mismatch
2. **該当 framework の公式 docs / GitHub** で自動 inject binding 一覧を確認 — リスト記載なら canonical
3. **プロジェクト固有名 (大文字 + プロジェクト prefix)** で framework docs に記載なし → 真の drift (wrangler.toml 追記必要 or 型定義削除)

**How to apply**: wrangler.toml × cloudflare-env.d.ts 整合性 sweep を実施するときに以下を判定 (`@opennextjs/cloudflare` 等 framework が自動 inject する binding は wrangler.toml に明示しないのが設計、`architecture.md` の管理記述を root of truth として false positive 排除):

1. **drift A (wrangler.toml のみに存在)** → 真の drift (型定義追記要)、または wrangler.toml stale 設定
2. **drift B (env 型定義のみに存在)** → framework 自動 inject 候補、`architecture.md` で「<framework> 管理」記述を確認
3. **記述あり** → 設計意図的 mismatch (false positive)、何もしない
4. **記述なし** → 真の drift (型定義削除 or `architecture.md` 補強)

主な使用箇所: wrangler.toml binding 8 件 vs cloudflare-env.d.ts field 9 件 sweep、drift B 1 件 (`NEXT_INC_CACHE_R2_BUCKET`) を検出したが `architecture.md` で「Next.js Incremental Cache (opennextjs 管理)」明記済で設計意図的 mismatch と判定、真の drift 0 件で完結した実例

#### `next.config.ts` + `wrangler.toml` の **Next.js + OpenNext + Wrangler chained config 整合性** sweep

本プロジェクトの config 群は **Next.js + OpenNext + Wrangler の連動制約** を満たすための chained design を持ち、単独で読むと意図不明だが相互依存を理解すると設計意図的。`next.config.ts` の `turbopack.resolveAlias.fs/path` ↔ `wrangler.toml` の `compatibility_flags = ["nodejs_compat"]` のように **設定がペアで成立する**設計が複数箇所に存在。

```bash
# 主要 chained config の抽出
echo "=== next.config.ts ==="
grep -E "transpilePackages|serverExternalPackages|resolveAlias|initOpenNextCloudflareForDev" next.config.ts

echo ""
echo "=== wrangler.toml ==="
grep -E "^compatibility_(date|flags)|^main\s*=" wrangler.toml
```

**chained design pattern 識別表** (本プロジェクト実観測):

| `next.config.ts` 側                              | `wrangler.toml` 側                             | 連動意図                                              |
| ------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------- |
| `turbopack.resolveAlias.fs/path` (browser empty) | `compatibility_flags = ["nodejs_compat"]`      | wasm engine の `require("fs")` 双方処理               |
| `transpilePackages: ["piper-plus", ...]`         | (なし、bundle 戦略は OpenNext + Wrangler 任せ) | wasm dynamic import の ESM transpile                  |
| `initOpenNextCloudflareForDev({remoteBindings})` | `[[r2_buckets]]` / `[[kv_namespaces]]` 等      | dev mode binding 解決 (remote vs local)               |
| (`serverExternalPackages` 未設定 + コメント明記) | `[browser]` binding                            | `next/dynamic({ ssr: false })` 隔離 + server 完全除外 |

**verification 手順** (sweep 実施時の判定軸):

1. **各設定の意図確認**: `next.config.ts` のコメントで chained design 意図が明記されているか確認 (例: 「`@opennextjs/cloudflare` は dynamic import の `require("fs")` を browser bundle で empty module に解決させるため `turbopack.resolveAlias` が必須」)
2. **wrangler.toml 側との対応**: `compatibility_flags` が `nodejs_compat` を含むか、必要 binding が宣言されているか
3. **意図的に片方のみ存在する設定**: `serverExternalPackages` 未設定 + コメント「server-side では dynamic import 自体が実行されないので影響なし」のような **「意図的省略 + 根拠明記」** が確認できれば canonical

**真の drift 判定**:

- **next.config.ts に `turbopack.resolveAlias.fs` あり + wrangler.toml に `nodejs_compat` flag なし** → 真の drift (片方欠落)
- **next.config.ts に `transpilePackages: [<lib>]` あり + 実 import 不在** → 真の drift (stale entry)
- **wrangler.toml に新 binding 追加 + cloudflare-env.d.ts 未更新** → 真の drift (前述 framework auto-inject sweep でカバー)

**How to apply**: Next.js + OpenNext + Wrangler 構成の sweep 実施時 (chained design は単独 config の grep では検出不能、相互依存を踏まえた verification 必須):

1. **両 config の主要設定を grep で抽出** (上記 snippet)
2. **chained design pattern 識別表** で対応関係を確認
3. **片方のみ存在する設定はコメントで意図確認** (canonical な意図的省略 vs 真の drift)
4. **不整合検出時**: `architecture.md` / `next.config.ts` コメント / OpenNext 公式 docs を root of truth として真因確定
5. **5-10 サイクル間隔の定期 sweep** で Next.js / OpenNext / Wrangler upgrade 後の drift を早期検出

主な使用箇所: 本プロジェクトで `next.config.ts` (transpilePackages + turbopack.resolveAlias + initOpenNextCloudflareForDev) × `wrangler.toml` (nodejs_compat + r2_buckets + browser binding) 整合性 sweep、4 つの chained design pattern 全件設計通り (真の drift 0 件) と確認した実例

#### `e2e/helpers/` 配下 helper drift sweep (同名 export + signature 違い識別)

`e2e/helpers/` 配下の test helper file 間で **同名 export が複数 file に存在** すると、import 時の混乱 + helper drift リスクを生む。各 file の export 名 + 使用率を横断 sweep して、重複 export を検出し signature 違いの意図性を判定する。

```bash
# helpers drift 検出フロー
for f in e2e/helpers/*.ts; do
  [ -f "$f" ] || continue
  base=$(basename "$f" .ts)
  exports=$(grep -oE "^export (function|const|class|type|interface|async function) [a-zA-Z_][a-zA-Z0-9_]*" "$f" \
    | sed -E 's/^export (function|const|class|type|interface|async function) //')
  used_count=$(grep -rl "from.*helpers/$base\b" e2e/ 2>/dev/null | grep -v "/$base\.ts$" | wc -l)
  echo "$base.ts: $used_count files use, exports: $(echo $exports | tr '\n' ' ')"
done

# 同名 export 検出 (file 跨り)
grep -rhE "^export (function|const|class|type|interface|async function) [a-zA-Z_][a-zA-Z0-9_]+" e2e/helpers/ \
  | sed -E 's/^export (function|const|class|type|interface|async function) ([a-zA-Z_][a-zA-Z0-9_]+).*/\2/' \
  | sort | uniq -c | awk '$1 > 1 {print}'
```

**重複 export 検出時の判定軸**:

| 状況                                                             | 判定                                                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 同名 + signature 完全一致                                        | **真の drift** (片方削除 + import を残る側に統一)                             |
| 同名 + signature 違い + 意味的に分離可能 (例: 一般用 vs seed 用) | **意図的使い分け候補** (rename / wrapper / 現状維持の 3 案でユーザー判断仰ぐ) |
| 同名 + signature 違い + 意味的差不明                             | 設計判断要、`needs-user-decision` で Issue 起票                               |

**How to apply**: 5-10 サイクル間隔で `e2e/helpers/` 配下の helper drift sweep を実施 (signature 違いの意図性は機械的判定不可、Issue 起票で judgment 委譲が canonical):

1. **各 file の export + 使用率を一括抽出** (上記 snippet)
2. **同名 export を file 跨りで検出** (`grep -rhE | uniq -c | awk '$1 > 1'` snippet)
3. **signature 比較** で完全一致 / 違いを判定
4. **signature 違いは意味的分離意図を内包する可能性が常にあるため、自走 rename / 統合せず Issue 起票** で 3 案 (rename / wrapper / 現状維持) 提示 + `needs-user-decision` ラベル

**反例 (sweep 不要なケース)**:

- helpers 配下が **3 file 以下** で目視確認可能 → sweep overhead > 価値
- 同名 export が **意図的 facade 経由再 export** (例: `index.ts` の barrel re-export) → 重複 detection の対象外

主な使用箇所: `e2e/helpers/` sweep で `makeArticle` が `article.ts:28` (`Partial<Article> = {}` 一般用) と `seed-r2.ts:92` (`Partial<Article> & { id: string }` seed 用) で **signature 違いの同名 export** と発見 → 3 案 (rename / wrapper / 現状維持) で `#813` Issue 起票 + `needs-user-decision` ラベル付与した実例

#### `.gitignore` 規則 × tracked file 整合性 sweep (untrack 漏れ検出)

`.gitignore` で ignore 指定済の path が **過去 commit で track 済 + 後から `.gitignore` 追加** 経緯で「既存 tracked file には ignore 規則が適用されない」(Git 仕様) 状態が long-term silent な untrack 漏れとして残置することがある。`git status --short` で `M <ignored-path>` 長期残置を観察したら本パターンを疑う。

```bash
# 3 段検証 sweep
# Step 1: .gitignore ignored ディレクトリの全 tracked file 列挙
for entry in node_modules dist .wrangler .next .open-next .agents .claude/skills .claude/worktrees .claude/.bak .serena; do
  tracked=$(git ls-files "$entry" 2>/dev/null | head -3)
  if [ -n "$tracked" ]; then
    echo "TRACKED in spite of gitignore: $entry → $tracked"
  fi
done

# Step 2: 該当 file の意図確認 (過去 commit 履歴 + 直近 2 週間で commit 0 件確認)
git log --oneline -5 -- <suspect-path>
git log --since="2 weeks ago" --oneline -- <suspect-path>  # 0 件なら意図的除外運用

# Step 3: directory 内全 file 網羅 untrack 化 (個別 untrack では他 file 見逃し)
git ls-files <ignored-dir>/  # 全 file 列挙
git rm --cached <ignored-dir>/<file1> <ignored-dir>/<file2>  # 個別 untrack 一括化
```

**判定軸**:

| 状況                                                                      | 対応                                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `.gitignore` ignored + tracked + 直近 commit 0 件                         | **untrack 漏れ確定**、`git rm --cached` で正規化                                    |
| 規範例外として **意図的 tracked** (例: `!.claude/skills/issue-handling/`) | canonical 例外、保持                                                                |
| 個別 untrack 後の directory 内残置 file 見逃し                            | **`git ls-files <ignored-dir>` 網羅運用必須** (個別 1 件実行では他 file の累積漏れ) |

**How to apply**: 5-10 サイクル間隔で実施 (`.gitignore` 規則は後から追加されたとき既存 tracked file に適用されない Git 仕様で long-term silent drift が累積しやすい):

1. **`git status --short`** で `M <ignored-path>` 長期残置を観察
2. **Step 1 sweep** で全 ignored directory の tracked file 列挙
3. **Step 2 意図確認** で過去 commit 履歴 + 直近 2 週間 commit 0 件確認 → untrack 漏れ確定
4. **Step 3 directory 内全 file 網羅 untrack 化** (`git ls-files <ignored-dir>` で全件列挙 → 個別 untrack 一括) — 1 件単独 `git rm --cached` では directory 内他 file の untrack 漏れを見逃す
5. commit + master push で正規化、local file は残置 (動作影響なし)

**反例 (untrack 不要なケース)**:

- `.gitignore` の例外句 (`!path`) で意図的 tracked になっている file → 規範例外、保持
- 該当 file が **過去 commit で意図的に追加 + 現在も毎 commit で更新** されている → ユーザー意図確認後、`.gitignore` 側削除 or 例外句追加で正規化

主な使用箇所: `.serena/project.yml` (commit `4c9dc7f9`) + `.serena/.gitignore` (commit `2028a4c3`) の 2 件 untrack 漏れを **2 サイクルに跨り** 検出 + 正規化、`git ls-files <ignored-dir>` 網羅運用なしで個別 untrack だと 2 サイクルかかる罠を実証。本派生ケース運用以降は 1 サイクルで directory 内全件正規化可能

#### 高レベル docs (CLAUDE.md) × 詳細 docs (architecture.md / api-spec.md) **comparative sweep**

`CLAUDE.md` (project root の高レベル view) と `architecture.md` / `api-spec.md` (詳細 reference) の **情報整合性 sweep**。機能追加 commit で `architecture.md` (詳細 reference) は更新されるが、`CLAUDE.md` (高レベル view) の更新が漏れがちで、5-10 サイクル経過で drift が累積する。

```bash
# CLAUDE.md スタック table の各 layer と architecture.md 該当 section を 1:1 比較
echo "=== CLAUDE.md スタック table ==="
sed -n '/^## スタック/,/^## /p' CLAUDE.md | grep -E "^\| [^|]+\|"

echo "=== architecture.md Cloudflare Bindings + AI 使途 ==="
sed -n '/Cloudflare Bindings/,/Cron Trigger/p' .claude/rules/architecture.md
grep -E "Workers AI|フィード推薦|要約・翻訳" .claude/rules/architecture.md | head -5
```

**comparison 観点**:

| 高レベル docs            | 詳細 docs                         | drift パターン                                            |
| ------------------------ | --------------------------------- | --------------------------------------------------------- |
| CLAUDE.md スタック table | architecture.md Bindings          | binding 追加 (例: KV / BROWSER) で CLAUDE.md 未追記       |
| CLAUDE.md AI layer       | architecture.md AI 使途 + R2 path | 用途追加 (要約 / 翻訳 / 推薦 / etc.) で CLAUDE.md 未追記  |
| CLAUDE.md デプロイ       | wrangler.toml CI/CD 設定          | 設定変更 (compatibility_date 等) で高レベル view 古い表記 |
| README.md スタック       | architecture.md / package.json    | 同上                                                      |

**How to apply**: 5-10 サイクル間隔で実施 (機能追加サイクルで詳細 docs は更新されるが高レベル docs は更新漏れ累積):

1. **CLAUDE.md スタック table を読み込み** (各 layer の技術スタック列挙)
2. **architecture.md の対応 section と 1:1 比較** (Cloudflare Bindings / AI 使途 / R2 path 構造)
3. **差分検出**: 詳細 docs に記載があり高レベル docs に未記載の項目を drift A 候補に
4. **canonical 省略判定**: 高レベル docs は意図的に簡略化されている部分があるため、「**追記しないと運用混乱が生じる」level の項目 (例: KV binding は運用 critical) に絞って同期**
5. 1 commit で sync、commit message に「architecture.md 既存記載と一致させた canonical 状態に sync」を明記

**反例 (sync 不要なケース)**:

- 高レベル docs が **意図的に detail を省略** (例: Browser Rendering binding は実装 detail で CLAUDE.md スタック高レベル view では canonical 省略)
- 詳細 docs の記載が **新規実装 trace** で安定化前 (例: 実験的 binding は 1-2 cycle 観察後に高レベル docs 反映判定)

主な使用箇所: CLAUDE.md スタック table sweep で 2 件 drift 検出 (KV `RATE_LIMIT` 未記載 + AI フィード推薦 未記載)、6+ サイクル経過後の再 sweep で `architecture.md` 既存記載と sync して canonical 状態に正規化した実例 (commit `537e4355`)

**How to apply**: サブエージェント呼び出しが失敗したら以下を判定:

1. **タスクが機械的検出可能か** (yes/no で判別できる、grep / find / comm で出せる) → 直接実行
2. **タスクが判断/設計要素を含むか** (perf 影響評価 / a11y 重要度判定 / 設計案比較) → サブエージェント復活待ち or ユーザー判断仰ぐ
3. drift / dead code / TDD missing は #1 に該当することが多い。perf / UX / 設計改善は #2

主な使用箇所: 2026-05-10 サイクル — 3 体並列サブエージェント全員 rate limit → 直接 `find + grep + comm` で 10 件 drift 検出 → 1 commit omnibus 修正

### 派生ケース: docs drift 監査エージェントの結果は **gitignored ファイル除外 + scan 対象ディレクトリ確認** で false positive を排除する

docs drift 監査エージェントが「未文書化ファイル」「削除済ファイル」と判定しても、**自動的に Issue 化してはならない**。エージェントは `find` で全ファイルを列挙するが、以下 2 種の false positive を高頻度で発生させる:

1. **gitignored ファイルを「未文書化」と誤検知**: `release-notes-data.ts` (auto-generated) / `_test-import*.spec.ts` (local debugging) / `auth-utils-edge.spec.ts` (環境依存) など、`.gitignore` で意図的に除外されているファイルを「文書に記載がない」と判定する。これらは文書化対象外なので false positive。

2. **scan ディレクトリの限定で「削除済」と誤検知**: agent が `src/lib/` だけ `find` したが、実際には `src/config/` に存在するファイル (例: `shortcuts.ts`) を「architecture.md に記載されているのに実体がない」と判定する。文書側は `src/config/shortcuts.ts` として正しく書かれているのに、agent の scan 範囲が狭くて実体を見つけられない。

```
パターン: docs drift agent 結果の検証フロー
  1. agent report 受領 (例: "未文書化 N 件 / 削除済 M 件")
  2. gitignored 確認:
     for f in <reported file paths>; do
       git check-ignore -v "$f" && echo "✗ FALSE POSITIVE: gitignored"
     done
  3. 削除済主張のファイルは別ディレクトリも検索:
     for f in <reported deleted files>; do
       find src -name "$(basename $f)"  # src 全体を scan
     done
  4. false positive を除いた残りが真の drift
  5. 真の drift が 0 件なら Issue 起票せず却下
```

**How to apply**: docs drift 監査エージェントから report を受けたら:

1. **gitignored 検証**: agent が指摘した全ファイルパスに `git check-ignore -v` で gitignored 確認 → ignored なら false positive 判定
2. **scan 範囲拡大検証**: 「削除済」主張のファイルは `find src -name "<basename>"` / `find . -name "<basename>"` で別ディレクトリ確認 → 別 path で見つかれば false positive
3. **残った真 drift のみ Issue 化** — 0 件なら起票不要、1-3 件なら同 commit で修正、4+ 件なら omnibus Issue 起票
4. agent prompt 改善: 次回派遣時に「gitignored ファイルは除外して列挙して」「scan 対象は src/ 全体 (lib / config / hooks / components / cron / contexts) を網羅して」を明示

主な使用箇所: 40th cycle docs drift 監査 — agent が 5 件 drift 主張 → 検証で gitignored 4 件 (release-notes-data.ts / \_test-import\*.spec.ts × 2 / auth-utils-edge.spec.ts) + scan 範囲限定 1 件 (shortcuts.ts は src/config/ に実在) と判明、**真の drift = 0** で Issue 起票却下

### 派生ケース: Security audit エージェントの XSS 主張は **データフロー上流 (source)** を必ず遡って sanitize 済か確認する

Security audit エージェントが `dangerouslySetInnerHTML` / `innerHTML` を XSS 脆弱性として指摘するとき、**末端 (描画 UI) からしか追跡せず、source (server-side processing) を遡らない傾向**がある。本プロジェクトでは `postProcess` pipeline の最終ステップで必ず `sanitizeHtml` を経由しているため、UI 側で再度 `sanitizeHtml` 呼び出すのは redundant。逆に過剰 sanitize はレンダリングに必要なタグ (例: TTS span) を破壊するリスクあり。

```
パターン: Security agent の XSS 主張検証フロー
  1. agent report 受領: "L351 で sanitizeHtml なしで innerHTML 描画"
  2. 該当 line を Read で確認 (例: `dangerouslySetInnerHTML={{ __html: processedContent }}`)
  3. 「processedContent」の出所を grep:
     grep -rn "processedContent" src/hooks/ src/components/ | head -5
  4. 出所が server API (例: useArticleContent → /api/content) なら、
     server 側で既に sanitized されているか pipeline 末端を確認:
     grep -nE "return sanitizeHtml|sanitizeHtml\(.+\)$" src/lib/<pipeline>.ts
  5. 末端で sanitize 済なら **false positive** 判定 (UI 側追加 sanitize 不要)
  6. 末端で sanitize なしなら true positive (修正対応)
```

server 側での sanitize 済を確認するチェックリスト (sanitize は 1 箇所で十分。client 再 sanitize は TTS span / KaTeX / SyntaxHighlight タグを過剰除去するリスク):

```
□ /api/<endpoint> が <処理> を返すとき、処理 pipeline の末端は sanitizeHtml か?
□ pipeline の途中で sanitize 済と仮定して raw HTML を構築する箇所はないか?
□ HTML を client に渡す前に R2 / Cache に保存しているなら、保存前の sanitize 状態を確認
□ client で server 由来の HTML を transform (例: span ラップ) している箇所は、
   transform 前 input が sanitized なら output も safe (linkedom などが新規攻撃ベクトルを
   挿入しないことを確認)
```

**How to apply**: Security audit から `dangerouslySetInnerHTML` / `innerHTML` 指摘を受けたら:

1. **該当行を Read** で確認 (skill 規範「サブエージェント調査結果は該当コードで検証してから採用」)
2. **データソースを grep** で source まで遡る (`useArticleContent` → `/api/content` route handler → `extractMainContent` → `postProcess` → `sanitizeHtml`)
3. **source side で sanitize 済なら false positive 判定** + agent report に「source side で既 sanitize 済」と返答 (将来同じ指摘を即却下できるよう知識蓄積)
4. **source side で sanitize なしなら true positive** + 修正

主な使用箇所: 41st cycle Security audit — agent が `ArticleContentBody.tsx:351` を XSS 脆弱性主張 → 検証で `processedContent` は `/api/content` 経由で `html-post-processor.ts:136 (sanitizeHtml 最終)` を通過済と判明、**false positive** で対応見送り。同 audit の Finding 1 (`refresh/route.ts` 購読チェック欠落) は実コードと canonical (`purge-content-cache/route.ts`) で確認 → true positive で同サイクル修正

### 派生ケース: Security audit エージェントは context overflow 回避のため **3 specific check + 対象ファイル絞り込み済 prompt** で派遣する

Security audit は他観点 (perf / refactor / UX) より対象ファイルが広い (auth / sanitize / SSRF / proxy / rate limit / data validation 等の cross-cutting) ため、broad-scope prompt だと agent が多数のファイルを Read して **context overflow (autocompact thrashing)** を引き起こす。1 サイクル丸ごと結果を取り逃がすリスク。

**安全な prompt パターン**:

```
- check 数を 3 つに限定 (5+ は context overflow リスク)
- 各 check の対象ファイルパスを prompt 内で具体的に指定
  例: "対象ファイル: app/api/feeds/[id]/{refresh,reinfer,purge-content-cache,route}.ts"
- canonical 例も prompt 内で 1 ファイル指定 (agent が比較対照を即特定可能に)
- "5-10 分以内 + 必要以上にファイル read しない" を明示
- output ≤300 words でまとめ
```

**broad-scope の失敗パターン**:

```
- "Find security issues in: XSS, SSRF, auth, ownership, validation, rate limit..."
  → agent が 各観点で multiple files を Read → 50+ files 読了 → context overflow
- "Audit the entire codebase for security"
  → 何もしないか autocompact で abort
```

**How to apply**: Security audit を派遣する前に:

1. **3 つの check に絞る** (XSS / SSRF / auth bypass / ownership / validation / sanitize 等から最重要 3 つを選択)
2. **各 check の対象 path を 4-6 ファイルに絞り込み済** で prompt に明記 (agent に「ここだけ Read」と指示)
3. **canonical 例 1 ファイル** を prompt 内で指定 (比較対照を agent が探さずに済む)
4. **output 制限**: ≤300 words / 各 check で 1 finding か「該当なし」明記
5. 1 cycle で 3 check 全部カバーできなければ次サイクル別 check で追加 (broad-scope より sequential narrow-scope の方が信頼性高い)

主な使用箇所: 40th cycle broad-scope security audit (5 things) → context overflow で失敗 → 41st cycle で 3 specific check + 対象ファイル絞り込み済 prompt に変更 → 2 finding (1 true positive + 1 false positive) を確実に返却して同サイクル修正完了

### 派生ケース: API endpoint 追加時は「3 点セット」(api-\*.md 本文 / api-spec.md index 表 / globs frontmatter) を同期更新する

`app/api/<new-endpoint>/route.ts` を新規実装したとき、ドキュメント側で**同時に更新すべき 3 箇所**:

1. `.claude/rules/api-<category>.md` の本文 (詳細仕様セクション追記)
2. `.claude/rules/api-spec.md` の index 表 (該当 `api-<category>.md` 行に endpoint 名を追記)
3. **`.claude/rules/api-<category>.md` の frontmatter `globs:`** (新 endpoint path も lazy load 対象に含める)

3 つ目を忘れると、新 endpoint route を編集するときに該当ルールがロードされず、AI が仕様詳細を参照できない盲点が残る (= docs drift と paths drift の複合バグ)。

**How to apply**: 新規 endpoint を実装する commit に併せて (rule-maintenance.md § 5 docs drift sweep と § 12 paths sweep を統合運用):

1. **本文追記** で詳細仕様 (クエリ / リクエスト / レスポンス / エラー一覧) を書く
2. **`api-spec.md` index 表に endpoint 名を追記** して全体 navigation に反映
3. **`globs:` に新 endpoint path を追加** (例: `app/api/<new>/**`)
4. 漏れチェック: 同 commit 内で `grep -nE "^globs:" .claude/rules/api-<category>.md` を実行し、新 endpoint path が含まれているか確認

**反例 (3 点セット同期が不要なケース)**:

- 既存 endpoint の **マイナー変更** (エラー code 追加 / クエリパラメータ追加) → 本文のみ更新で OK (globs / index 表は path 単位で書かれているため変化なし)
- 新規 endpoint が **既存 path prefix の配下** (例: `app/api/feeds/[id]/<new-action>/route.ts`) で globs に該当 wildcard が既に含まれている → 本文 + index 表のみで OK

主な使用箇所: 3 endpoint (video-proxy / piper-voice / wasm) を api-misc.md に追記したサイクル — 当初は本文 + index 表のみで commit しそうになったが、globs frontmatter も同時更新で 3 点セット完成

### 派生ケース: 規範ルール codify 後は「code drift」も機械的に sweep する

`docs drift` (文書 vs 実コードの乖離) と並んで、**「規範ルール codify 後にコードに残っている旧パターン」= code rule drift** も機械的に sweep する対象。1 ファイル修正 + 規範 codify で満足すると、新規追加された ref / 既存見落としの旧パターンが規範違反として累積する。

```
パターン: 規範 codify → 数サイクル後に sweep
  1. 1 ファイル (例: useReadingProgress) で旧パターンを修正
  2. retrospective-codify で規範を `react-patterns.md` 等に書き出し
  3. 規範違反を検出する grep regex を「主な使用箇所」コメントに併記
  4. 数サイクル後 (actionable issues 枯渇時など) に sweep を実行:
     grep -rEnB1 "Ref\.current\s*=" src/hooks/ src/components/
  5. 残骸全件を 1 commit で連続修正
```

**How to apply**: 規範を新規 codify するとき:

1. **検出 grep コマンド** をルール本文の「主な使用箇所」または専用「検出方法」セクションに併記:
   - 例: `useSyncedRef` 規範 → `grep -rEnB1 "Ref\.current\s*=" src/hooks/ src/components/`
   - 例: `EMPTY_SENTENCES` 安定参照規範 → `grep -rn ": Sentence\[\] = \[\]" src/`
2. 数サイクル後の sweep でそのコマンドをそのまま実行
3. **検出結果から false positive を排除** — grep は記号レベル一致なので **規範対象外の別用途 hit が大量に混入** する。各 hit を行 context で評価して以下のいずれかに分類:
   - **false positive (規範対象外)** — 例: `useSyncedRef` 規範は「render 中の最新値同期目的」専用だが、grep `Ref.current =` は TTS engine ref / Timer ref / Observer ref / Controller ref / 論理リセット ref / Promise resolve ref / Drag layout ref / setter sync ref 等の **別目的 ref を全件 hit** する。これらは規範違反ではない
   - **規範対象** — 残った hit のみ次 step で評価
4. 規範対象 hit を **意図的な例外** (perf 最適化等で旧パターン継続) と **規範違反** に分類:
   - 意図的例外には **その理由をコメント明記** して次回 sweep で再検出されないようにする
   - 規範違反は同サイクルで連続修正
5. sweep 結果が **真の規範違反 0 件** になったら sweep 完了 (規範が全コードに浸透)

**反例 (sweep 不要なケース)**:

- 規範が **判断要素を含む** もの (例: 「巨大コンポーネント機能別分割」は何が「巨大」かが文脈依存) → grep だけでは判別不可、人間判断要
- 規範が **新規追加コードのみ対象** (既存コードは維持) で明示されているもの

**false positive 比率が高い grep パターンの目安**:

| grep パターン                                                        | false positive 比率 | 理由                                                                             |
| -------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------- |
| `Ref\.current\s*=` (useSyncedRef 規範)                               | 高 (90%+)           | ref ベース hook 一般の代入を全件 hit、規範対象は「render 中代入」のみ            |
| `^const EMPTY[A-Z_]*\s*=` (Object.freeze sentinel 規範)              | 低 (~0%)            | module-level EMPTY 名前は freeze 対象とほぼ 1:1 一致                             |
| `: <Type>\[\] = \[\]` (安定参照規範)                                 | 低                  | 型注釈 + 空配列リテラルは判定基準が明確                                          |
| `console\.log\(` (本番ログ規範)                                      | 中 (~50%)           | 本番運用 visibility ログ (auth / cron 進捗) が混入、context で識別要             |
| `^export (type\|interface) [A-Z][a-zA-Z]+` (helper-drift 重複名規範) | 中 (~50%)           | 同名でも semantic 違いで意図的並存ありの場合、外部 import 数 + 行 context 評価要 |

**主な使用箇所**:

- `useReadingProgress` を `useSyncedRef` 化 + 規範 codify → 数サイクル後に `grep -rEnB1 "Ref\.current\s*="` sweep で 4 hooks / 5 ref 残骸検出 → 一括連続修正
- 後の sweep で同 grep が 30+ 件 hit するが、各 hit を行 context で評価して **全件 false positive (別目的 ref)** と判定、規範違反 0 件で完結 → 規範運用安定化を実証

### 派生ケース: code-quality バグ修正時に同 pattern の grep 検出コマンドを併記 + 後続 sweep を Issue 化する

code-quality バグ (lexicographic 比較バグ / off-by-one / boundary value 等) を 1 ファイルで修正したあと、**「同じ pattern が他の sibling 関数で残っていないか」を grep で sweep するのを忘れる** と、4-5 cycle 後に別ファイルで同類バグを再発見することがある。1 commit で同類修正をまとめて完結させるか、できないなら **「次サイクル sweep 対象」として Issue 化** することで再発防止できる。

```
パターン: code-quality バグ修正の sweep フロー
  1. 1 ファイルで code-quality バグ修正
  2. retrospective-codify で「同 pattern 規範」を codify (例: sibling 純粋関数は
     fallback chain を完全に揃える)
  3. ★ 規範に **検出 grep コマンドを併記** (本派生ケース 5 と同じ運用):
     例: `grep -rEn 'a > b \\? a : b|until > prev|publishedAt > [a-z]+\\.publishedAt' src/`
  4. 同サイクルで grep を実行 → 残骸が出れば連続修正
  5. 残骸ゼロでも、**同サイクル末か次サイクル開始時に再 sweep を Issue 化**
     (「コードが変わるたびに新規発生する可能性」を継続監視)
```

**How to apply**: code-quality バグ修正 retrospective で:

1. **「修正した bug pattern」を grep で表現可能か** を判定 (lexicographic 比較 / off-by-one / null check / 等価ガード等は可能)
2. 可能なら **検出コマンドを規範本文に併記** + 同サイクルで `grep -rEn '<pattern>' src/` を実行
3. 残骸検出 → 同 commit で連続修正 (1 PR = 1 関心事を維持できる規模なら)
4. 残骸多数 → **「next cycle で sweep」Issue 起票** (本サイクル commit を肥大化させない)
5. retrospective-codify では **「sweep 結果」も記載** (「sweep で 0 件」or 「N 件発見、別 Issue 起票」)

主な使用箇所: `chooseLater` / `mergeSnoozed` で ISO 8601 lexicographic 比較バグを修正 → `read-state-prune.ts` の同類修正後 **規範は codify 済だったが grep sweep が抜けていた** ため複数サイクル越しに sibling ファイルで再発。本派生ケースで「sweep 併記 + Issue 化」を運用ルール化

## 6. 大規模ドキュメント分割は contiguous な小クラスターから段階的に進める

`coding-conventions.md` (1785 行 / 65 セクション) のような大規模ファイルを分割するとき、**全セクションを一度に新ファイルへ移動するのは破壊的**。1 コミットで多数のセクションを抜き出すと:

- レビュー困難 (diff が数千行)
- 抽出ミス (セクション境界の判定誤り) が局所化できない
- bisect で原因 commit を特定不能

**段階的分割の運用パターン**:

```
Step 1: 最小実証として contiguous な 1 クラスター (3-5 セクション) を抽出
        ↓ 1 コミット完結、master 反映、ユーザー検証
Step 2: 次の独立クラスターを抽出
        ↓ 同上
Step 3: 残り
```

各 Step の選定優先順位:

1. **連続行範囲のセクション群** (sed で 1 コマンド削除可能) — 例: `coding-conventions.md` の 574-762 行 (state/ref クラスター 4 セクション)
2. **テーマが clearly bounded なセクション** — 「React 固有」「テスト」「セキュリティ」等の明確な軸
3. **他セクションへの cross-reference が少ない** — 「主な使用箇所: 別セクション」のリンクが少ないほど安全

**抽出ワークフロー**:

1. 抽出先の新ファイル `<theme>.md` を作成、ヘッダーに「`coding-conventions.md` から #XXX Step N で分割」を明記
2. 抽出対象セクションを **コピー** で新ファイルに貼り付け (まだ削除しない)
3. 元ファイルの該当セクション開始位置に **redirect リンク** を Edit で挿入
4. `sed -i 'AAA,BBBd'` で元セクション本体を一括削除 (line range は事前に grep で確認)
5. 分割前後の line count を `wc -l` で確認 (合計が ~10-20 行増えるのは redirect overhead で正常)
6. 元ファイル末尾までセクション順序が崩れていないかスポットチェック

**How to apply**: 800 行超の rule ファイルを分割するとき (typecheck / e2e で捕捉できない視覚 diff レビュー前提のため、**1 コミットの diff 量を 200-300 行以下** に保つ):

1. **Issue 起票** で分割案 A (一括) / B (目次追加のみ) / C (段階分割) を提示
2. **案 C 採用** が基本 (リスク最小化)
3. 1 サイクル 1 Step、各 Step は **1 トピック完結**
4. ユーザーが Step N の結果を見て **継続 OK / 中止 / 別案に切替** を判断できる粒度を保つ

主な使用箇所:

- `react-patterns.md` (`coding-conventions.md` から state/ref クラスター 4 セクション抽出、180 行削減)
- `audit-workflow.md` (`coding-conventions.md` から「監査エージェント並行派遣」+ 派生ケース 6 個を 223 行で抽出、`coding-conventions.md` -214 行)。paths を `e2e/**/*.spec.ts` に絞り、コード編集時のロード対象外として注意資源希釈を抑制
- `html-pipeline.md` (`coding-conventions.md` から HTML 後処理 pipeline 関連 5 セクション 261 行抽出、`coding-conventions.md` -249 行)。paths を `src/lib/html-*.ts,content.ts,image-*.ts,json-ld-images.ts,regex-extractor.ts,readability-extractor.ts,hooks/useArticleImageMaxWidth.ts` に絞り、UI / hook / API 編集時のロード対象外化
- `react-effect-patterns.md` (`react-patterns.md` から useEffect 副作用 5 セクション 290 行抽出、`react-patterns.md` -270 行)。**外部ファイル `coding-conventions.md` からの redirect 4 箇所** (ResizeObserver / AbortController / モード OFF / ブラウザ API 遅延通知) も同時更新
- `react-state-ref.md` (`react-patterns.md` から state / ref / vi.fakeTimers 関連 5 セクション 642 行抽出、`react-patterns.md` -623 行)。`coding-conventions.md` の `## React state / ref / useEffect パターン` redirect も state-ref + effect 併記に更新
- `react-component-split.md` (`react-patterns.md` から大きいコンポーネント機能別分割 + 派生 11+ 計 526 行抽出、`react-patterns.md` -516 行)。**3 サイクル連続段階分割** (effect / state-ref / component-split) で `react-patterns.md` を 1726 → 317 行 (1.6x、best practice 200 行目標近く到達) まで圧縮。`coding-conventions.md` の `## 大きいコンポーネントの機能別分割パターン` redirect も同時更新

### 派生ケース: 抽出対象に外部ファイルから redirect placeholder が指している場合は同サイクルで全て更新する

`react-patterns.md` → `react-effect-patterns.md` のように **抽出元ファイル A を別ファイル B (例: `coding-conventions.md`) から redirect している**場合、抽出を実施しても B の redirect は依然 A を指したままになる。A から消えたセクションを B が A に redirect → A の末尾 redirect で C (新ファイル) に飛ぶ二重リダイレクトでも一応動くが、**reader が「なぜ 2 段 redirect なのか」を疑う認知負荷** + **将来 A の redirect が削除されたら broken link** になる。

```bash
# 抽出 commit に含めるべき同時更新の検出フロー
# 1. 抽出元ファイル名から redirect している外部ファイルを grep
grep -rn "react-patterns.md" .claude/rules/ --include="*.md" \
  | grep -v "react-patterns.md:" | grep -v "react-effect-patterns.md:"

# 2. その redirect が指しているセクション名と、抽出するセクション名を照合
# 一致するなら redirect 先を新ファイル名に更新
```

**How to apply**: rule ファイル X からセクション群を新ファイル Y に抽出する Step を実施するとき:

1. 抽出セクションのタイトル (例: `## ResizeObserver で絶対座標仮想化レイアウトの末端高さを監視する`) を列挙
2. **`.claude/rules/` 全体で `grep -rn "X" .claude/rules/`** (= 抽出元ファイル名 X が他ファイルから言及されている箇所を全列挙)
3. 各 hit の **直前 2-3 行** を Read して、それが抽出対象セクション名と一致する redirect か確認
4. 一致するなら **同 commit で redirect 先を新ファイル名 Y に更新** (Step 4 の sed 削除と並行して Edit ツールで実施)
5. 更新後に `grep -rn "X" .claude/rules/` を再実行して、抽出セクションへの古い redirect が残っていないか最終確認
6. **broken redirect (本体削除されて redirect placeholder だけ残っている)** を別途発見したら、同サイクルでは触らず別 Issue 起票 (本 Step の scope 拡大を防ぐ)

**反例 (同時更新が不要なケース)**:

- 抽出元 X が他ファイルから redirect されていない (= X が「葉」ファイルで誰も参照していない)
- 抽出セクションが X 内部完結 (= X 内で他セクションが redirect しているだけ、抽出後 X 末尾の集約 redirect で吸収可能)
- 抽出セクションのタイトルが redirect 文と一致しない (= redirect は別 セクションを指している、誤検知)

主な使用箇所:

- `react-effect-patterns.md` 抽出時 — `coding-conventions.md` から 4 箇所 redirect (`ResizeObserver` / `AbortController` / `モード OFF` / `ブラウザ API 遅延通知`) を grep 検出して同サイクルで全て新ファイル名 `react-effect-patterns.md` に更新。`useEffect 依存キーの slice()` の redirect も同 commit で更新すべきだったが grep 漏れで翌サイクル訂正 (= **教訓: `grep -rn "<抽出元ファイル名>" .claude/rules/` を必ず実行して、抽出対象セクション名の hit を全件確認、見落とすと「broken redirect」と誤認して別 Issue 化する罠**)
- `react-state-ref.md` 抽出時 — `coding-conventions.md` から `## React state / ref / useEffect パターン` redirect を `react-state-ref.md` + `react-effect-patterns.md` 併記に更新 (state-ref と effect で本体が 2 ファイルに分かれたため両方リンク)。同サイクルで前述の grep 漏れ訂正も吸収
- 2026-05-14 サイクル — `typescript-conventions.md:28` の redirect が `coding-conventions.md` (`assertFeedSubscribed` 派生ケース) を指していたが、実体は `react-patterns.md` § 「早期 return をコンポーネント / 関数に切り出すと TypeScript narrowing が失われる」の派生ケースに移動済と判明 → redirect を `react-patterns.md` に更新。全 rule redirect の target file 実在 sweep は OK (broken file link 0 件)、section anchor drift sweep で 1 件発見

### 派生ケース: 「N ファイル mechanical refactor」は wrapper adapter で callsite 不変を保ち scope 圧縮する

「19 ファイルで重複定義された helper を共通ファクトリに集約」「3 ファイルの API 引数 signature を named arg 化」のような **N ファイル mechanical refactor** で、すべての callsite を新 signature に書き換えると **diff が膨張** (例: 19 spec × 50 行 ≈ 950 行) し、レビューが困難になる。代わりに「**各ファイル内で位置引数 → override object 変換 wrapper** を残す」アプローチを採れば、callsite は touch せず diff を最小化できる。

```typescript
// アンチパターン: helper を直接使うために全 callsite を書き換える (19 ファイル × 50 行)
// 旧: makeArticle("id1", "hash1", "2026-01-01")
// 新: makeArticle({ id: "id1", feedHash: "hash1", publishedAt: "2026-01-01" })
// → 19 spec × 5-15 件の callsite を全部書き換え、レビュー困難

// 修正パターン: 各 spec 内に wrapper を残す (ローカル定義の defaults を引き継ぐ)
import { makeArticle as makeBaseArticle } from "./helpers/article";

// このファイル固有の signature (位置引数 + デフォルト値) を wrap
const makeArticle = (id: string, feedHash: string, publishedAt = "2026-05-01T00:00:00Z") =>
  makeBaseArticle({ id, feedHash, guid: id, title: `${id} title`, link: ..., publishedAt, ... });

// callsite は touch なし (位置引数のまま動く)
makeArticle("a1", "feed-A", "2026-01-01T00:00:00Z")
```

**How to apply**: N ファイルでの mechanical refactor (helper 集約 / API rename / signature 変更) を計画するとき (callsite 書き換えで diff が 500 行を超えるとレビュー困難、wrapper adapter なら 19 spec × 5 行で完結):

1. **callsite 書き換えが必要な箇所数を見積もる** (`grep -c` で件数把握)
2. **件数 × 1 callsite 行数が >300 行** なら wrapper adapter 採用検討
3. **各ファイル内に local wrapper を残す**: 新 signature を呼びつつ、旧 signature を expose
4. **default 値の引き継ぎを確実に**: ローカル定義の default に依存するテストは migration で露呈する (例: feed lookup test が `feed.id` ↔ `article.feedHash` 一致前提に依存)
5. **all-tests pass で commit** + commit message に「wrapper 採用理由 (scope 圧縮)」を明記
6. wrapper が永続化する可能性あり (将来の caller 書き換えに別 Issue 化) — それは scope 圧縮のトレードオフとして許容

**反例 (wrapper 不要 = 全 callsite 書き換えが正しいケース)**:

- callsite 件数 × 行数 が 100 行未満 → 直接書き換えの方が clean
- 新 signature 自体が大幅違いで wrapper の対応コストが本書き換えと近い (例: 引数順 + 名前 + 型 が全部変わる) → 直接書き換え
- 既存 caller が **理解不能になる程度に位置引数依存** している場合 (例: `makeArticle("a", "b", "c")` の意味がコメントを読まないと分からない) → 全件 named arg に書き換える方が長期保守性が良い

主な使用箇所: 47th-49th cycle `#711` (19 spec の `makeArticle/makeFeed` 重複定義集約、11 spec で wrapper adapter 採用 — caller 不変を維持しつつ helpers 集約)

### 派生ケース: 新規 rule ファイル追加サイクル末は「逆方向 cross-reference 検証」で TRUE ORPHAN を検出する

前述派生ケース「抽出対象に外部ファイルから redirect placeholder が指している場合は同サイクルで全て更新する」は **順方向検証** (抽出元 → 外部参照ファイル)。新規 rule ファイル追加では逆方向 — **新ファイルへの参照 (navigation index からの redirect) が抜けていないか** を検証する必要がある。新ファイルが orphan 化すると navigation index (`coding-conventions.md` 等) から辿れず、将来の AI/開発者が rule の存在に気づかない盲点が残る。

```bash
# 逆方向検証フロー
# 1. 全 cross-reference を抽出
grep -rhoE '\.claude/rules/[a-z-]+\.md' .claude/rules/ CLAUDE.md 2>/dev/null | sort -u > /tmp/referenced.txt

# 2. 実体ファイル一覧
ls -1 .claude/rules/*.md | xargs -n1 basename | sort -u > /tmp/exists.txt

# 3. 実体あるが参照されていない orphan を検出
comm -13 /tmp/referenced.txt /tmp/exists.txt
```

検出された各 orphan は **別表記 (markdown link `[name](file.md)` / bare filename / section reference)** で参照されている false positive 可能性があるため個別 grep verification:

```bash
for orphan in $(comm -13 /tmp/referenced.txt /tmp/exists.txt); do
  base=$(basename "$orphan" .md)
  hits=$(grep -rln "$base" .claude/rules/ CLAUDE.md 2>/dev/null | grep -v "/$orphan$")
  [ -z "$hits" ] && echo "TRUE ORPHAN: $orphan"
done
```

TRUE ORPHAN 発見時は navigation index ファイル (`coding-conventions.md` または該当 theme の hub ファイル) に redirect 行を追加して整合性回復。

**How to apply**: 規範分割 / 新規 rule ファイル追加サイクル末に必ず実行 (順方向検証 = 抽出元 → 外部参照だけでは新ファイル orphan を捕捉できない、navigation index 側の追記漏れは 1 ファイル grep で機械的に検出可能):

1. **新規ファイル追加 commit と同サイクル内** で上記検証フローを実行
2. **TRUE ORPHAN 検出時** は navigation index に redirect 行を追加して同 commit (or 直後 commit) で fix
3. **複数 orphan 検出時** は新規分のみ修正、既存 orphan は別 Issue 起票 (scope 拡大を防ぐ)
4. **false positive (別表記参照) は別表記 grep で個別検証** — markdown link / bare filename / section reference 等の表記揺れを許容

**反例 (逆方向検証が不要なケース)**:

- 新規ファイルが **意図的に standalone** (skill のように単独で完結、navigation index から参照しない設計) → orphan 化は意図通り
- 新規ファイルが **既存ファイルの内部 helper** で navigation index 外 → 同上
- 新規ファイル名が **既存 redirect の rewrite 候補** (既存 ファイルを分割した新ファイルで本来 redirect 更新が必要だが先送り) → 別 Issue 起票

主な使用箇所: 新規 rule ファイル追加後の navigation index 側追記漏れを 1 ファイル grep で検出、`coding-conventions.md` `## 禁止事項` 直前に `design-system.md` redirect 行追加で TRUE ORPHAN 1 件解消した実例

## 7. 削除よりも一般化を優先

「もう使わないルール」を見つけても **即削除しない**。まず以下を検討:

1. **より抽象的なルールに統合できるか** → 統合
2. **特定技術依存が古いだけで原則は有効か** → 原則だけ残して例を更新
3. **完全に陳腐化していて誤った指針になっているか** → 削除

陳腐化の判断は慎重に。「この前のセッションで使わなかった」だけでは陳腐化ではない。

## 8. プロジェクトの `.claude/skills/` が gitignored なら skill 化前に必ず gitignore 例外を確認する

`.claude/skills/` がプロジェクトの `.gitignore` に登録されているケースは少なくない。理由は典型的に:

- **skills は外部からインストールするもの** という運用想定 (例: 別リポジトリの `.agents/skills/` への symlink)
- **個人用 skill は version control 対象外** (チームで共有しない)
- **skill は user-level で管理する** (`~/.claude/skills/`) 設計

このプロジェクトで `.claude/rules/<rule>.md` を skill 化しようとすると、`git add` が **「The following paths are ignored by one of your .gitignore files」** で拒否されて移行が破綻する。

```bash
# 移行前に必ず確認:
grep -nE "^\.claude/skills" .gitignore
# 出力があれば skills/ は gitignored
# → 例外行を追加しないと commit 不能
```

### 判断フロー

```
1. .gitignore で .claude/skills/ が ignored か確認
   ├─ Yes (ignored)
   │   ├─ 選択 A: gitignore 例外を追加 (推奨)
   │   │   !.claude/skills/<target-skill>/
   │   │   !.claude/skills/<target-skill>/**
   │   │   → skill として project-tracked にできる
   │   │
   │   ├─ 選択 B: rules + paths で代替
   │   │   skill 化を見送り、paths frontmatter で条件付きロード
   │   │   → workflow rule (paths が馴染まない) には不向き
   │   │
   │   └─ 選択 C: .claude/commands/ にスラッシュコマンド化
   │      ユーザー手動 invoke なら commands も選択肢
   │      → auto-discovery 失われるが gitignore 対象外なら tracked
   │
   └─ No (not ignored)
       そのまま skill 化可能 (一般的なケース)
```

### 例外行の正しい書き方

```gitignore
.claude/skills/
!.claude/skills/<target-skill>/
!.claude/skills/<target-skill>/**
```

**重要**: 親ディレクトリ自体の `!.claude/skills/<target-skill>/` (末尾スラッシュ) と、**配下全ファイルの `!.claude/skills/<target-skill>/**`(二重 wildcard)** の両方が必要。片方だけだと`git check-ignore`は OK だが`git add` が「親ディレクトリが ignored」で拒否する。

それでも `git add` が拒否される場合は **`git add -f <path>`** で強制追加できる (例外規則は機能しているが git の警告のみのケース)。

**How to apply**: skill 化案 (例: 既存 rules を `.claude/skills/<name>/SKILL.md` に移管) を承認する **前に** プラン段階で:

1. `grep -nE "^\.claude/skills" .gitignore` で gitignore 状況を確認
2. ignored なら判断フローで A/B/C のどれを採るかを選択肢として提示
3. 例外行追加 (選択 A) を採るなら、commit 内容に `.gitignore` の変更も含める

`vercel-react-best-practices` のように **シンボリックリンク (`.claude/skills/vercel-react-best-practices -> ../../.agents/skills/vercel-react-best-practices`)** で外部の skill を参照する設計が既にあるなら、本プロジェクトの skill 運用は「**外部からインストールする / 内部 authoring しない**」が前提。例外を 1 つ作るのは OK だが、複数作ると一貫性が崩れて将来の AI/開発者が混乱するので、**例外は本質的に project-specific な knowledge** (例: project 固有の Issue 対応ルール) に限る。

主な使用箇所: `issue-handling.md` を `.claude/skills/issue-handling/SKILL.md` に skill 化したとき、`.gitignore` の `.claude/skills/` 行で commit 拒否 → `!.claude/skills/issue-handling/` 例外追加で解決。skill 化判断時にこの確認ステップが抜けると plan 後の実装段階で blocked になる

## 9. 大量 Issue を 1 サイクルで処理するときの 3 トラック並列パターン

「open Issue が 10+ 件あり、それぞれユーザー判断要 / 採用済 / 大規模 / 軽微 が混在する」サイクルで、すべてを順番に処理すると 1 件あたりの context switch コストが大きい。**役割別に 3 トラックを並列化** して効率を上げる。

### 3 トラック構成

| トラック             | 並列度                                  | 安全性           | 用途                                                    |
| -------------------- | --------------------------------------- | ---------------- | ------------------------------------------------------- |
| **調査トラック**     | 高 (5+ agents 並列)                     | safe (read-only) | コード調査 + 設計方針コメント案を作成                   |
| **実装トラック**     | 中 (worktree で 1-2 並列 or sequential) | 中               | feature branch で実装、衝突回避のため sequential が無難 |
| **判断仰ぎトラック** | sequential (gh CLI 操作)                | safe (network)   | 既存 Issue へ comment 投稿のみ                          |

### 適用手順

```
1. open Issue を skill のチェックリスト (本文 + ユーザー本人コメント抽出) で分類:
   - A: ユーザー採用表明済 + AI 自走条件充足 → 実装トラック
   - B: 設計方針コメント未投稿 / 詳細不足 → 調査トラック
   - C: 設計方針コメント済 + ユーザー判断待ち + 自走条件未満 → 残置 (アクション不要)
   - D: AI 自走条件外の大規模変更 → 判断仰ぎトラック (status コメント or sub-judgment)

2. 調査トラック (B 群) を並列派遣:
   - 各 issue に 1 つの Explore subagent
   - 出力フォーマットを揃える (issue-handling skill のテンプレート遵守)
   - run_in_background: true で main thread を blocking しない

3. 並行して main thread で実装トラック (A 群) を進める:
   - feature branch 作成 → 実装 → typecheck → e2e → master merge
   - 衝突回避のため A 群は sequential

4. 調査トラックの結果が returns し次第:
   - 各 issue へ gh issue comment で投稿
   - 1 issue ずつ、main thread で sequential

5. 判断仰ぎトラック (D 群):
   - status / sub-judgment コメントを sequential 投稿
```

### 失敗パターン

- **すべて sequential**: 件数が多いと 1 サイクル消化不能、actionable backlog が積み上がる
- **すべて並列**: 実装トラックの並列が衝突を引き起こす (master 上でのファイル変更同期問題)
- **調査結果を待たずに実装着手**: 調査結果が「実装方針誤り」を示唆していたとき手戻りが大きい

### 安全策

1. **調査トラックは出力フォーマットを厳密化** — issue-handling skill の設計方針コメントテンプレートに従わせる (案 A/B/C + 推奨 + 必要対応箇所 + ユーザー判断項目)
2. **調査エージェントには「実コードで確認」を必須化** — 「サブエージェント調査結果は該当コードで検証してから採用する」原則を agent prompt にも入れる
3. **実装トラックは AI 自走 5 条件で絞り込み** — touch ≤5 / 機能変化なし / 推奨案明示済 / 復元可能 / 3 サイクル経過、すべて Yes のみ着手

**How to apply**: 「issue 多数の状態で issue 処理依頼を受けた」サイクルでは、最初に Issue 分類 (A/B/C/D) を表で整理してからトラック起動。skill のチェックリスト (Step 1: 自分起票確認 / Step 2: ユーザー本人コメント抽出 / Step 3: 状態判定) を全 issue に一括実行してから分類するのが効率的 (本人コメント抽出は `for n in ...; do gh issue view $n ...; done` でバッチ処理)。

主な使用箇所: 14 件 open issue を 1 サイクルで処理 — 調査 5 並列で設計方針コメント投稿、実装トラックは AI 自走条件外で残置、判断仰ぎで status コメント、軽微は最適化作業で解決済としてクローズ

### 派生ケース: 「全 Issue が判断仰ぎ要 (実装着手ゼロ) サイクル」も有効な progress として扱う

大量 Issue 処理サイクルで、全 Issue が **AI 自走条件外** (touch 大規模 / 設計判断要 / ユーザー固有 UX 判断要) になるケースがある。このときは A 群 (実装トラック) が空 = 1 commit も着手しない結果になるが、これを「サイクル失敗」と判定しない。

```
パターン: 「全 Issue 判断仰ぎ要」サイクルの actionable
  1. open Issue 8-12 件、すべて判断要素を含む
  2. 分類後 A 群 (実装トラック) = 0 件、B/C/D 群が大半
  3. AI ができる progress:
     - B 群: 調査エージェント並列派遣 → 判断仰ぎコメント投稿 (4-6 件)
     - C 群: 残置 (action 不要)
     - D 群: status コメント投稿 (達成済 close 提案 / 残作業仕分け)
  4. 結果: master commit 0、Issue comment 投稿 N 件のみ
  5. これは正当な cycle progress として扱う (ユーザーの判断ボトルネック解消のため)
```

**How to apply**: 「全 Issue 判断仰ぎ要」サイクルを認識したら (実装着手しないサイクルでも「ユーザー判断材料の充実」自体が progress なので、commit 数 0 を「失敗」と捉えず判断仰ぎコメント数で測る):

1. **A 群が 0 件と確定したら、無理に実装着手しない** — 設計判断要素が残っているまま実装すると手戻りが大きい (Phase 1 完了後の代替案検証パターン参照)
2. **判断仰ぎコメントの品質に集中** — issue-handling skill の設計方針コメントテンプレート + 案 A/B/C + 推奨 + 必要対応箇所 + ユーザー判断項目を網羅
3. **B 群調査エージェント並列派遣で時間効率化** — 5 件並列なら 1 件 sequential の 5 倍速
4. **「達成済 Issue の close 提案」を D 群として混ぜる** — 残作業仕分けで Issue tracker の sanity 維持
5. **retrospective-codify は通常通り実施** — 本サイクルで得た知見 (調査結果 / 設計案発見 / 訂正コメント等) を rule に反映

**「全 Issue 判断仰ぎ要」状態が継続するサイクルパターン**:

- ユーザーが UX 判断に時間を割けない時期 (他プロジェクト集中、休暇、別の意思決定 deadline)
- AI が立て続けに大型 Issue を起票して判断仰ぎ → 採用待ちが累積
- 大型 refactor / 新機能で **連続 Phase 設計** が必要 (Phase 0 完了 → Phase 1 設計案 → Phase 1 採用 → Phase 1 実装 → Phase 2 設計案 ... の長い chain)

**反例 (実装着手すべきケース)**:

- A 群 1 件でも存在 → そちらを優先で進める (実装 1 件は判断仰ぎ 5 件より価値が高いことが多い)
- B 群調査結果で「実装着手は安全」と確定 → AI 自走 5 条件再判定で着手判断
- ユーザーが直近サイクルで「採用」表明した未着手 Issue → 判断仰ぎより優先

主な使用箇所: 2026-05-12 サイクル — 9 件 open Issue 全て判断仰ぎ要 (#714/#755/#756/#757/#758 設計判断 + #733/#728 close 提案 + #750/#753 実装計画) → master commit 0 + judgment コメント 9 件投稿で完結、retrospective-codify で本派生ケースを規範化

### 派生ケース: 5+ サイクル連続 0 changes + `/loop` なし直接送信 = 対話打開シグナル → AskUserQuestion で方向確認

「全 Issue 判断仰ぎ要」サイクルが 5 サイクル以上連続で 0 changes 状態を維持した後、ユーザーが **`/loop` プレフィックスなしで同じ指示文を直接送信** してきたら、これは「ScheduleWakeup 待機ではなく対話で打開して」シグナルと解釈する。AI 側で AskUserQuestion を使って **打開策の選択肢を提示** + ユーザー判断を仰ぐのが適切。

```
パターン: 長期滞留 + 対話シグナル検出フロー
  1. Step 0 sweep で「N サイクル連続変化なし」を観測
  2. ユーザー指示の冒頭が `/loop` でなく素の指示文 (= ScheduleWakeup 経由でなく手動再送) と判定
  3. 過去サイクルで試した actionable 探索 (sweep 観点) を整理
  4. 滞留中 Issue から「AI 自走 5 条件全充足だが needs-user-decision 付与済」を抽出
  5. AskUserQuestion で 3-4 案を提示:
     - 案 A: AI 自走着手 (推奨、5 条件全充足の N 件)
     - 案 B: 状況整理 Issue 起票してユーザー優先順位判断仰ぐ
     - 案 C: 現状維持継続
     - 案 D: 全 Issue close で整理し直し
  6. ユーザー応答で着手方針確定 → そのサイクルで progress 達成
```

**判定基準 (対話シグナル)**:

| 観点                                       | 判定                 |
| ------------------------------------------ | -------------------- |
| 直近 N サイクル (N ≥ 5) 連続 0 changes     | 滞留状態確認         |
| ユーザー指示の冒頭が `/loop` なし          | 対話シグナル         |
| 過去サイクルで sweep 観点を網羅実施済      | 新規 actionable 枯渇 |
| 滞留 Issue に AI 自走 5 条件充足のものあり | 打開策の素材あり     |

**How to apply**: 長期滞留状態で対話シグナルを検出したら (5 サイクル連続「変化なし」を返し続けると progress が 0 のまま、ScheduleWakeup を継続するだけでは打開不能、対話打開シグナル検出時の AskUserQuestion は適切な fallback):

1. **過去サイクル sweep の網羅性を確認** — 14 観点 + TODO + Dependabot + Why セクション + type 安全性等が一巡済なら新観点探索は overhead
2. **滞留 Issue 全件を Step 4 判定基準で再評価** — AI 自走 5 条件全充足の Issue を抽出
3. **AskUserQuestion で 3-4 案提示** — 推奨案 (案 A: 自走着手) を最初に + その他選択肢 (状況整理 Issue 起票 / 現状維持 / 全 close)
4. **ユーザー応答後に該当案を即実行** — 案採用後は通常の AI 自走 workflow (実装 + commit + push + Issue close + retrospective)

**反例 (AskUserQuestion が overkill なケース)**:

- 連続 0 changes が 3 サイクル以下 (短期滞留) — 通常の ScheduleWakeup 継続で OK
- ユーザーが `/loop` プレフィックス付きで送信 = 明示的に自走 cycle 期待 → AskUserQuestion せずに sweep 継続
- 滞留 Issue に AI 自走 5 条件充足のものが 0 件 = 打開策の素材なし → 対話しても結局「待機」結論にしかならない

主な使用箇所: 2026-05-17 サイクル — 7 サイクル連続 0 changes + `/loop` なし直接送信検出 → AskUserQuestion で 4 案提示 → ユーザー「#789 #790 自走着手 (推奨)」採用 → 2 commit + 2 Issue close (#789) / Phase 1 完了 (#790 open 継続) で打開達成

### 派生ケース: 全 sweep クリーンサイクルは「規範運用が機能している正常事例」として 0 changes で完結する

機械的 sweep (console.log / `@ts-ignore` / `as any` / useSyncedRef 規範違反 / TODO コメント / 空 catch + silent fallback / paths frontmatter dead path / docs drift 等) を一巡で実施して **全て 0 件 (= 規範違反なし)** だった場合、これは「コードベース sanity / ドキュメント整合性が良好」を示す **正当な progress** として扱う。「何も変えていない = サイクル失敗」と判定しない。

```
パターン: 全 sweep クリーンサイクル運用フロー
  1. Step 0 sweep: open Issue が判断待ち継続 (AI 着手余地なし)
  2. 機械的 sweep を順次実行:
     - console.log / @ts-ignore / as any (型・ログ衛生)
     - useSyncedRef 規範違反 / Why セクション残骸 (codify 済規範の遵守)
     - TODO / FIXME / 空 catch (untracked debt)
     - paths frontmatter dead path / 重複 (rule-maintenance.md § 12)
     - docs drift (rule-maintenance.md § 5)
  3. 全 sweep が 0 件 → コードベース sanity 確認完了
  4. retrospective で「全 sweep クリーン = 規範運用の正常事例」として記録
  5. 同 sweep を数サイクル後まで遅延可能 (corpus 品質安定 = 短期再実行は overhead)
```

**サイクルの actionable progress として有効と認められる根拠**:

- **過去 codify した規範が機能しているか定期検証** = 規範劣化を早期検出する保険
- **新規 lesson 候補がない = 学習収束** のシグナル (good outcome)
- **将来の sweep の優先度判定材料** (corpus 品質安定 → 短期再実行不要)

**How to apply**: actionable Issue が枯渇したサイクル冒頭で以下を判定 (sweep 結果が 0 件でも「規範運用の確認」自体が progress なので、commit 数 0 を「失敗」と捉えない、sweep の実行履歴自体が次回 sweep 優先度判定の材料になる):

1. **Issue 1 件以下 + 全部が判断待ち** → 全 sweep クリーンサイクル候補
2. **未実施 sweep 観点を選んで順次実行** (前サイクルで実施済 sweep は重複なので skip)
3. **0 件 sweep は retrospective で記録** — 「console.log: 7 件全て本番運用ログで正当」のように **「何を検証して何が見つからなかった」を具体的に書く** (次回 sweep 担当の手がかりになる)
4. **真の問題発見時のみ commit** — 0 件なら 0 changes で締めくくり、新規 sweep 観点を温存 (毎サイクル全 sweep だと 1 観点あたりの解像度が落ちる)
5. **retrospective adoption pending lesson の経過カウントも併記** — 滞留 lesson の自走採用判断 (§ 3 派生ケース) のトリガーとして活用

**反例 (0 changes が失敗のケース)**:

- sweep で **真の問題発見済** + commit する時間があった → 0 changes は逃した opportunity
- ユーザーが明示的に「何か手を動かして」と指示 → sweep よりも軽量 Issue 起票 / 実装着手を優先
- 連続 5+ サイクル全 sweep クリーン → 「sweep 観点を網羅し切った」状態、§ 9 派生「対話打開シグナル」発動候補

主な使用箇所: console.log / `@ts-ignore` / `as any` / useSyncedRef / TODO / 空 catch / CLAUDE.md 整合性 sweep を一巡実施 → 全 0 件 (規範違反なし) で 0 changes 締めくくり

### 派生ケース: 調査エージェントの設計方針案コメントは "Issue 本文の前提が誤っている可能性" を検証スコープに含める

調査エージェントに「設計方針 A/B/C 案を出して」と派遣すると、Issue 本文の前提を **疑わずに前提条件として受け入れて** 案を作るケースがある。だが Issue 起票時の前提と実コードが乖離しているケース (subscriber 数 / Provider tree / API 形式 / 重複コード規模 等) が頻繁にある。`#758` 「全 subscriber re-render」が実は subscriber 1 つで分割効果ほぼ無し、`#755` 「sanitize-html 既存依存」が実は未追加、のような事例。

調査エージェントの prompt に **「Issue 本文の前提を実コードで検証する」を明示** することで、前提誤りを発見した場合は **「Issue 本文を訂正する案も含めて提示」** させる。

```
パターン: Issue 本文の前提検証を agent prompt に含める
  1. agent prompt に「Issue 本文に書かれている前提 (e.g., subscriber 数 / 重複コード規模 / 既存依存) を
     実コードで検証して、乖離があれば設計案にも反映」を必ず追加
  2. agent 検証結果:
     - 前提一致 → 通常通り案 A/B/C 提示
     - 前提乖離 → 「Issue 本文の前提訂正」を含めて案 A/B/C 提示
       (例: 案 C 「Issue 本文の前提覆る発見、対応見送り推奨」)
  3. Issue 投稿コメントで「実コード確認で <X> と判明、Issue 本文の前提 <Y> を訂正」と冒頭明記
```

**How to apply**: 調査エージェント派遣 prompt を書くときに (Issue 本文の前提は起票時点のスナップショットでありコード変化や調査不足で乖離している可能性が常にあるため、検証を agent task に含めるとレポート品質が安定する):

1. **「Issue 本文の前提 X / Y / Z を実コードで検証して、乖離があれば訂正案も含めて報告」を agent prompt に明示**
2. **特に Performance Issue では subscriber 数 / Provider tree / re-render trigger を必ず実コード確認**
3. **重複コード規模 / dead export / SSRF 範囲等の Issue でも実行コードで確認** (recent diff の影響で前提変化していることがある)
4. **agent report に「前提一致 / 乖離 + 訂正案」セクションを必須化** → コメント投稿時に「実コード確認」を冒頭明記
5. **訂正コメント投稿は issue-handling skill の「過去セッションの AI 返信を訂正するパターン」** と整合 — 前 AI コメントの誤りを訂正する形

**反例 (前提検証が overkill なケース)**:

- Issue 本文が **新規起票で前提を最小限に書いている** (実コードの状況を読んで案を出せ式) → 前提検証不要、調査主体
- Issue 本文の前提が **数日以内に書かれている + そのコード変化なし** → 検証はサラっと済む
- Issue 本文が **ユーザー意図 (UX 判断) を主体** で実コード前提は最小 → 検証範囲なし

主な使用箇所:

- `#758` UnreadStats Context — Issue 本文「全 subscriber re-render」前提 → 実調査で subscriber 1 件のみと判明 → Issue 本文の案 A 推奨度低、案 C (現状維持 + 局所最適化) を新提示
- `#755` SVG MIME — Issue 関連で前 AI コメント「sanitize-html 既存依存」前提 → 実調査で `package.json` に未追加と判明 → 訂正コメント + 案 C (close) 推奨

## 10. rule を hook / lint 強制化する計画は事前に lint tool capability を検証する

`coding-conventions.md` 等の禁止事項を rule から削除して hook / lint 強制に置換える計画 (Claude Code best practice の「フックに変換」原則) を立てるときは、**Issue 起票・Phase 計画前に使用中の lint ツールが該当ルールをサポートするか検証する**。検証なしで Phase 計画すると、実装段階で「Rule not found」エラーが出て計画破綻 → 1 サイクル無駄。

**事前検証手順**:

1. **対象 lint ツールの rule sheet を確認** (oxlint なら https://oxc.rs の rules 一覧)
2. **試しに minimal config に 1 ルール追加** → `pnpm check` でエラー文確認
3. ターゲットルール (`no-restricted-syntax` 等) が **「Rule not found」「Not supported」** を出したら計画変更

**How to apply**: hook / lint 化提案 Issue を書く前に:

1. `pnpm check` で対象 lint ツール挙動を確認 (1 ルール追加 → exit code 確認)
2. 未対応なら **Phase 計画から該当 phase を除外** + Issue 本文に「lint tool 未対応のため Phase X 除外」を明記
3. 提案 commit 後に未対応判明したら、**「失敗 phase の見送り」を明示** して Issue を close (将来 lint tool が rule サポート追加したら再着手)
4. 対象 1 ルールのみ確認すれば planning が進む — 他にも未対応 rule があるかは関連 Issue ごとに個別検証

主な使用箇所: `coding-conventions.md` 禁止事項 hook 化計画 — Phase 2 で oxlint の `no-restricted-syntax` を前提に設計 → 実装時に `Rule 'no-restricted-syntax' not found in plugin 'eslint'` で破綻 → Phase 2 見送り + Phase 1 (tsconfig strict: true 既存確認 + rule 文面整理) のみで完結

### 派生ケース: 自動化 infrastructure は markers + script を先行配置し、データ整備を別 phase に分離する

「e2e spec → テストカバレッジ table 自動生成」のような **「データ整備が前提のオートメーション」** を導入するときは、**Phase 1 (今すぐ): AUTO_GEN markers + script 配置 / Phase 2 (運用切替時): データ整備 + script 実行** に分離する。Phase 1 のみで commit すれば、整備サイクルが運用切替時に自然に進む。

```
パターン: 自動化 infra の Phase 分離
  Phase 1:
    - integration markers (`<!-- AUTO_GEN START/END -->`) を canonical doc に挿入
    - 生成 script を作成・package.json に追加 (実行は将来)
    - marker 内のコメントで「Phase 2 で <データ整備> 後にスクリプト実行」を明記
    - canonical 既存内容は marker 内に保持 (script 実行で上書きされるまで canonical)

  Phase 2 (運用切替で着手):
    - 新規 file/spec 追加時に metadata (JSDoc / front matter 等) を書く慣行を確立
    - 既存ファイルの整備率が一定 (> 70%) を超えたら script 実行で上書き
```

**How to apply**: 「整備済 input → 自動生成 output」型のオートメーション提案を受けたら:

1. **input 整備状況を確認** (例: 128 specs 中 124 が JSDoc 未記載 → 整備率 3%)
2. 整備率 30% 未満 → Phase 1 (markers + script) のみ commit、Phase 2 (整備 + 実行) は別サイクル
3. 整備率 70%+ → Phase 1 + Phase 2 同サイクル可
4. **canonical 既存内容は markers 内に保持** + marker コメントで「Phase 2 で上書き予定」明記 (Phase 2 着手まで誤って script 実行されないよう script の wrapping 確認)
5. 整備率が中間 (30-70%) → 残りの整備を別 Issue 化、その Issue を closes すれば Phase 2 自動着手の流れに

主な使用箇所: テストカバレッジマップ自動生成 — 128 specs 中 124 が JSDoc 未記載 (整備率 3%) → Phase 1 (markers + script + package.json script) のみ commit、現存 canonical テーブルは markers 内に保持、Phase 2 は spec JSDoc 整備が運用浸透してから着手

## 11. subagent の "0 changes" 結果は既存 corpus の品質確認として valid

ルール / コード sweep をサブエージェントに派遣して **「変更なし (0 changes)」** が返ってきた場合、これは valid な outcome。「subagent が探さなかった」「精度が低い」と疑うのではなく、**「既存 corpus が判定クライテリアを満たしている」確認** として記録する。

**0 changes が valid と判断できるサイン**:

- subagent prompt が明確な判定クライテリア (HIGH 誘惑性 / trade-off 文書化済 / 規約遵守 等) を含む
- sweep 範囲が明示済 (target files specified)
- subagent report が「各候補を見て、X 個は HIGH 誘惑性 / Y 個は trade-off 済 → 0 changes」と **審査プロセスを記述している**

逆に **0 changes を疑うサイン**:

- prompt のクライテリアが vague (「良いコードか確認して」等)
- subagent report が「特に問題なし」だけで審査プロセスを書いていない
- sweep 範囲が広すぎて取りこぼしの可能性 (全 src/ 等)

**How to apply**: subagent から 0 changes report が返ってきたとき:

1. **prompt のクライテリアが具体的だったかを確認** — vague なら再派遣 (明確なクライテリア付き)
2. クライテリア具体的 + 全候補を審査済 + 0 changes → **Issue close で「0 changes で完了」を明記**
3. commit message に同 Issue を含めない (変更なしなので不要)
4. **retrospective で「0 changes outcome」を記録** — 次回同種 sweep の優先度判定材料 (corpus 品質安定 = 同 sweep を数サイクル後まで遅延可能)

主な使用箇所: アンチパターン / 修正パターンの誘惑性判定 sweep — subagent が 50+ 対をレビュー → 全て HIGH 誘惑性 or trade-off 文書化済と判定 → 0 changes で Issue close、「次回同種 sweep は数サイクル後まで不要」と判定材料に記録

## 12. paths frontmatter の dead path / 重複 / 過剰グローバルを定期 sweep する

`paths` frontmatter は match 結果が **無音で間違う** ことがある (match しなくても error にならない、過剰 match しても自動検知されない)。本プロジェクトで実際に発生した典型 3 ミス:

### ミス A: 親プロジェクトからコピペした dead path

親プロジェクト (`/home/gizen/dokodemo-claude/.claude/rules/`) の rule をコピペして本プロジェクト (`/home/gizen/dokodemo-claude/backend/repositories/rss/.claude/rules/`) に貼り付けたとき、`paths` も一緒にコピーされる:

```yaml
# 親プロジェクトの build-check.md (正しい):
paths: "backend/repositories/rss/**/*.ts,backend/repositories/rss/**/*.tsx"

# 本プロジェクトにコピペしたら → 永久に match しない (dead path):
# 実際の resolve: /home/gizen/dokodemo-claude/backend/repositories/rss/backend/repositories/rss/**/*.ts
```

paths は **そのファイルが置かれたディレクトリの project root** 相対なので、親 dir を含む path は本プロジェクト内では存在しないパスになる。

### ミス B: subset と superset の重複

```yaml
# アンチパターン: src/**/*.tsx が src/components/**/*.tsx を完全 subset として含む
paths: "src/components/**/*.tsx,src/**/*.tsx,app/globals.css"

# 修正パターン: superset のみ残すか、subset のみ残すか (ロード意図で選択)
paths: "src/components/**/*.tsx,app/globals.css"  # design-system は components 専用なら subset
# OR
paths: "src/**/*.tsx,app/globals.css"  # 広く適用するなら superset
```

重複は **挙動には影響しない** (paths は OR で評価) が、後の rule reader が「2 つ書いてある意図」を疑う認知負荷が発生する。

### ミス C: グローバルパターンの誤発火

```yaml
# アンチパターン: .claude/rules/** や .serena/** や node_modules/** も match する
paths: "**/*.ts,**/*.tsx"

# 修正パターン: 適用範囲を明示
paths: "src/**/*.ts,src/**/*.tsx,app/**/*.ts,app/**/*.tsx,e2e/**/*.ts"
```

特に `quality-checks.md` のような「**/\* で全 ts/tsx を対象」と書きたい rule は、**実際には rule 文書自身の編集時にもロードされる\*\* ことに注意。意図しない自己ロード = 注意資源希釈。

### 検出 + 修正フロー

```bash
# 全 paths frontmatter を一覧
for f in .claude/rules/*.md; do
  paths=$(awk '/^paths:/ {print; exit}' "$f")
  echo "$f: $paths"
done

# 各 paths が実際に match するか確認 (1 paths 分)
ls $(echo "$paths" | sed 's/paths: //; s/"//g; s/,/ /g' | tr ' ' '\n' | head -3)
```

**How to apply**: 以下のタイミングで paths frontmatter sweep を実行する:

1. **新規 rule 追加時** — paths を書いた直後に上記検出コマンドで全 rule の paths を一覧、近接重複がないか確認。**description: も同時に書く** (auto-discovery 性のため、欠落していると AI が rule を grep するとき 1 行要約が見えず判断材料が減る — 2026-05-20 sweep で 12 件欠落を一括追加した実例あり)。**`globs:` ではなく `paths:` を使う** (本プロジェクトの canonical key、Claude Code は `paths:` で conditional loading を解釈する。`globs:` は別エディタ (Cursor IDE 等) の標準で本プロジェクトでは無効化される可能性あり — 2026-05-20 sweep で api-\*.md 8 件の `globs:` を `paths:` に統一した実例あり)
2. **大規模 rule 分割サイクル末** — 分割で新規 rule が複数追加された後、必ず sweep して dead path / 重複を排除
3. **親プロジェクトからの rule コピペ後** — paths が親 dir を含んでいないか必ず確認
4. **paths 削除の判断軸** — 27 行程度の短い rule は paths 削除して常時ロード許容 (paths 設計コスト > 常時ロード コスト)

**反例 (paths 精緻化が overkill なケース)**:

- 50 行以下の rule は paths 不要 (常時ロードで context impact 最小)
- 1 rule で複数 path 群に跨る場合は **広い superset** (`src/**/*.ts`) で OK (subset 列挙は冗長)
- 「全 code edit でロードしたい」(coding-conventions 等の core rule) は `src/**/*.ts,src/**/*.tsx,app/**/*.ts,app/**/*.tsx,src/cron/**/*.ts` のような広いセットで意図通り

主な使用箇所:

- #728 案 B 部分達成サイクル — 5 件精緻化 (build-check.md dead path 削除 + react-patterns / browser-platform / design-system の subset 重複削除 + quality-checks の グローバル限定) を 1 commit で完結
- 2026-05-14 サイクル — `helper-drift.md` の `app/api/**/*.tsx` (実在 0 件の dead path) 削除 + `nextjs-server-patterns.md` の `src/lib/*.ts` を `src/lib/**/*.ts` に統一 (subdir 追加時の壊れにくさ向上) を 1 commit で完結。`src/cron/**/*.ts` が `src/**/*.ts` に含まれる subset 重複は **意図伝達価値** (core rule は cron も対象を明示) のため保持判断

### 派生ケース: cross-rule paths overlap (複数 rule が同 path を持つ現象) は設計意図的 multi-aspect loading で正常

ミス B「subset と superset の重複」は **1 ファイル内** の paths 重複を扱うが、**複数 rule 間で同 path を持つ overlap** は別の概念。本プロジェクトでは現状 11 path で複数 rule が overlap している (例: `src/hooks/**/*.ts` を 9 rule が含む、`src/**/*.tsx` を 8 rule が含む)。

これは **設計意図的な multi-aspect loading**: 1 つのファイル編集時に複数観点の規範 (browser platform / helper drift / react patterns / dev investigation / ui judgment 等) を同時に load することで、全観点で違反検知 + 整合性確認できるようにする canonical pattern。

```
パターン: cross-rule paths overlap 判定
  1. paths overlap を sweep (python script で path → [rules] map を作る)
  2. 各 overlap path について、各 rule の責務が異なる観点か確認
  3. 全 rule が異なる観点 → 設計意図的 multi-aspect loading で正常 (codify 不要)
  4. 同一観点の rule が複数該当 → 真の redundancy、統合 / 削除を検討
```

```python
# 検出フロー (Python ワンライナー):
import os, re
rules = {}
for fn in sorted(os.listdir(".claude/rules")):
    if not fn.endswith(".md"): continue
    with open(f".claude/rules/{fn}") as f:
        content = f.read()
    m = re.search(r"^paths:\s*\"([^\"]+)\"", content, re.M)
    if not m: continue
    for p in [x.strip() for x in m.group(1).split(",")]:
        rules.setdefault(p, []).append(fn)
for p, rs in sorted(rules.items()):
    if len(rs) >= 2:
        print(f"{p}: {len(rs)} rules — {', '.join(rs)}")
```

**判別 pattern (真の redundancy vs 設計意図的 overlap)**:

| 状況                                                                                              | 判定                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------ |
| 複数 rule が異なる観点 (browser / helper / react / ui / dev etc.) を扱う                          | **設計意図的** (正常)          |
| 複数 rule が同一観点を扱う (例: react-effect-patterns / react-state-ref が完全に同じトピック範囲) | **真の redundancy** (統合検討) |
| 1 rule が redirect-only navigation file (coding-conventions.md) + 他 rule が同 path               | **意図伝達価値** (保持判断)    |

**真の redundancy 検出は cross-rule path overlap 自体では判定不可** — 各 rule の **責務 (1st heading + 主要トピック)** を別途確認する必要あり。

**How to apply**: cross-rule paths overlap を検出したら上記「パターン」4 step (sweep / 観点確認 / 設計意図的判定 / 真の redundancy 統合検討) を順次実行、上記判別 pattern 表で「異なる観点 (設計意図的)」/「同一観点 (真の redundancy)」/「navigation 用 (意図伝達価値)」を分類。

主な使用箇所: 2026-05-20 paths overlap sweep — 11 path で複数 rule overlap を検出したが、全件「異なる観点を扱う設計意図的 multi-aspect loading」と判定して 0 件修正で完結 (max 9 rule overlap = src/hooks/ で React + browser + helper + ui + dev の 5 観点を同時 load する canonical pattern)

### 派生ケース: paths frontmatter の quote-style (quoted vs unquoted) 統一 sweep

`paths: "..."` (QUOTED) と `paths: ...` (UNQUOTED) は YAML 仕様上同義だが、本プロジェクトの canonical は QUOTED 形式。混在は **機能影響ゼロでも sweep スクリプトや検出ツールの誤動作** を引き起こす (例: awk の抽出 pattern `gsub(/^paths: *"|"$/, "")` がクォート期待で書かれていると、UNQUOTED 表記では先頭 prefix を残した文字列で glob 評価 → 22 件規模の false positive 大量検出)。

```bash
# UNQUOTED entries 検出 sweep
for f in .claude/rules/*.md; do
  paths_line=$(awk '/^paths:/ {print; exit}' "$f")
  [ -z "$paths_line" ] && continue
  if ! echo "$paths_line" | grep -q 'paths: *"'; then
    echo "[UNQUOTED] $(basename "$f"): $paths_line"
  fi
done
```

**How to apply**: 新規 rule ファイル追加 / 既存 paths 変更時に quote-style sweep を併走する (機能影響なしでも検出ツールの信頼性確保が future tooling の前提条件):

1. **新規 paths は必ず `"..."` QUOTED 形式で書く** — canonical 統一を維持
2. **既存 UNQUOTED 検出時は同 commit で QUOTED 化** (paths 値自体は変更しない、quote 追加のみ)
3. **paths sweep スクリプトを書くときは UNQUOTED 表記も処理可能な抽出 pattern を使う** (例: `awk '/^paths:/ {gsub(/^paths: *"?|"?$/, ""); print}'` で optional quote 対応)

**反例 (UNQUOTED が許容されるケース)**:

- paths 値が **glob 文字 `*` を含まず、コロン `:` も含まない単純 path 文字列** → YAML scalar として安全に解釈、quote 不要 (ただし canonical 統一原則から QUOTED 推奨)

主な使用箇所: paths quote-style sweep で `api-auth.md` / `api-feeds.md` の 2 件 UNQUOTED を検出、他 24 件と統一して false positive 排除した実例

## 13. Cloudflare CI/CD の deploy fail と production outage を区別して revert vs fix-forward を判断する

master push 直後の Cloudflare CI/CD ログで「deploy step が失敗」を観測したとき、**「本番が壊れている」と早合点して即 `git revert` push する** のは罠。実際は **CI/CD の deploy step だけが失敗** で、本番は **前回成功した deploy** のまま稼働継続している (= production は無影響) ケースが大半。早合点 revert は以下のコストを生む:

1. **不要な revert commit を master に追加** + push (履歴ノイズ + ユーザー監視に「壊れた」の偽シグナル)
2. **revert 取消の追加 commit** が必要に (本来の修正へ復帰するため、計 3 commit を 1 cycle で消費)
3. **同サイクル内の他作業 scope を圧迫** (retrospective や別 Issue 対応の時間を取る)

```bash
# アンチパターン: deploy fail = 本番壊れた と即決して revert
# (Cloudflare CI/CD log で "Asset too large" / "Build failed" を見た瞬間)
git revert HEAD --no-edit
git push origin master
# ↑ ユーザー指摘で「本番は前 deploy のまま」と判明 → 取消必要

# 修正パターン: deploy fail を観測したらまず本番稼働確認
curl -sI https://<prod-domain>/ | head -3
# HTTP/2 200 → 前 deploy で稼働中、revert 不要、fix-forward で進める
curl -sI https://<prod-domain>/api/health
# 200 → API も生存、revert は不要

# 200 / 2xx 確認後:
# - 追加 fix commit を作る (asset 削除 script / config 修正 等)
# - master push → CI/CD 再 deploy 試行
# - 成功すれば fix-forward 完了、本番は最新版に更新
```

### 判定フロー

```
deploy fail を観測:
  ↓
本番稼働確認 (curl で URL + /api/health の 2xx 確認):
  ├─ 2xx 返る → 前 deploy で稼働継続中、production outage なし
  │   → fix-forward (追加 commit で問題解決) を選択
  │
  ├─ 5xx / timeout / 0 接続失敗 → production outage 発生
  │   → revert で復旧 (前回 deploy で動いていた commit に戻す)
  │   → 修正後 commit で再 deploy
  │
  └─ 確認手段がない (curl 通らない / 本番未設定) → fix-forward を default に
      (revert は元戻り保証もないので、追加 commit で前進)
```

### deploy fail と production outage を区別する観点

| 観点             | deploy fail                                        | production outage                      |
| ---------------- | -------------------------------------------------- | -------------------------------------- |
| CI/CD ログ       | "Build failed" / "Asset too large" / "Auth failed" | (CI/CD ログだけでは判定不能)           |
| 本番 HTTP status | **2xx で稼働中** (前 deploy のまま)                | 5xx / timeout / 0                      |
| ユーザー影響     | **なし** (前 deploy で動いている)                  | あり (機能停止 / page broken)          |
| 緊急度           | 低 (fix-forward で OK)                             | 高 (revert で即復旧 → 修正後再 deploy) |
| 対応             | 追加 commit で前進                                 | revert + 修正後再 deploy               |

**How to apply**: Cloudflare CI/CD で deploy fail / 任意の deploy エラーを観測したら (deploy fail は CI/CD step の失敗、production outage は本番が実際に応答不能、両者は **別の事象** で対応も別):

1. **CI/CD ログだけでは判定しない** — 必ず本番 URL を curl / browser で確認
2. **本番が 2xx 返るなら revert 禁止** — fix-forward (追加 commit で前進) のみ実施
3. **本番が 5xx / timeout / 0 ならまず revert** で復旧 → 別 commit で fix-forward 試行
4. **判定 5 分以内に本番確認するルーチン** を持つ (deploy fail 直後、master push でログ確認するなら同時に本番確認も)
5. **ユーザー指摘前に自己訂正可能な誤り** = revert push 後すぐ取消が必要になったら、本ルールを再読 (将来同じ誤りを繰り返さない)

**反例 (revert が正しいケース)**:

- 本番が **5xx / timeout** を返している → revert 必須 (production outage 復旧優先)
- deploy fail の **commit 内容が他観点でも壊れている** (= 修正不能 / scope 過大) → revert で振り出しに戻すのが効率的
- ユーザーが明示的に **「revert で戻して」** と指示した → 指示優先

**fix-forward 例**:

- `Asset too large` (Cloudflare Workers asset 25 MiB 上限抵触) → bundle 除外 script 追加 + R2 セルフホストの追加 commit で fix-forward
- `Build failed: Module not found` (依存追加忘れ / config 抜け) → 該当 config の追加 commit で fix-forward
- `Auth failed` (wrangler 認証切れ) → CI/CD 設定の secret 更新 → 再 push で fix-forward

主な使用箇所: `#753` Phase 2c で `Asset too large: 25 MiB ort-wasm-simd-threaded.jsep.wasm` deploy fail を「本番壊れた」と早合点して revert push → ユーザー指摘 (「デプロイできていないから大丈夫でしょ」) で「deploy fail のみ、本番は前 deploy のまま稼働継続」と判明 → revert 取消 + R2 セルフホスト戦略の fix-forward に復帰、計 3 commit (revert / revert-revert / 本 fix) を消費して `1 cycle` 内の他作業 scope を圧迫
