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

## 3. retrospective-codify 実行時の文体ガイド

セッション末の retrospective でルール追記するときは、**最初から原則 1・2 を満たす形で書く**。「2026-05-09 の #XXX で発覚した教訓」のような書き方をしない。

書く前に「このルール本文を 1 年後の AI が読んで理解できるか / 真似できるか」を自問する。理解できないなら抽象化が足りない。

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

```bash
# src/lib/ の drift 検出例
find src/lib -maxdepth 1 -name "*.ts" -type f | xargs -n1 basename | sort > /tmp/actual_lib.txt
grep -oP "^    [a-z][a-z0-9-]+\.ts" .claude/rules/architecture.md | sed 's/^ *//' | sort -u > /tmp/doc_lib.txt
comm -23 /tmp/actual_lib.txt /tmp/doc_lib.txt  # 未文書化ファイルのみ出力

# spec ファイルの drift 検出例
find e2e -name "*.spec.ts" -type f | xargs -n1 basename | sort > /tmp/actual_specs.txt
grep -oP "\| \`[a-z][a-z0-9-]+\.spec\.ts\`" .claude/rules/architecture.md | sed 's/| `//;s/`//' | sort -u > /tmp/doc_specs.txt
comm -23 /tmp/actual_specs.txt /tmp/doc_specs.txt
```

検出後は各 spec / lib ファイルの先頭 12 行を `head -12` で読んで責務を把握し、1 行 description を書くだけ。**エージェント往復より直接実行が速い** (待機 + 結果整形なし)。

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
3. 検出された箇所は **意図的な例外** (perf 最適化等で旧パターン継続) と **規範違反** に分類:
   - 意図的例外には **その理由をコメント明記** して次回 sweep で再検出されないようにする
   - 規範違反は同サイクルで連続修正
4. sweep 結果が 0 件になったら sweep 完了 (規範が全コードに浸透)

**反例 (sweep 不要なケース)**:

- 規範が **判断要素を含む** もの (例: 「巨大コンポーネント機能別分割」は何が「巨大」かが文脈依存) → grep だけでは判別不可、人間判断要
- 規範が **新規追加コードのみ対象** (既存コードは維持) で明示されているもの

主な使用箇所: 2026-05-10 サイクル — `useReadingProgress` を `useSyncedRef` 化 + 規範 codify → 数サイクル後に `grep -rEnB1 "Ref\.current\s*="` sweep で 4 hooks / 5 ref 残骸検出 → 一括連続修正

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

1. **新規 rule 追加時** — paths を書いた直後に上記検出コマンドで全 rule の paths を一覧、近接重複がないか確認
2. **大規模 rule 分割サイクル末** — 分割で新規 rule が複数追加された後、必ず sweep して dead path / 重複を排除
3. **親プロジェクトからの rule コピペ後** — paths が親 dir を含んでいないか必ず確認
4. **paths 削除の判断軸** — 27 行程度の短い rule は paths 削除して常時ロード許容 (paths 設計コスト > 常時ロード コスト)

**反例 (paths 精緻化が overkill なケース)**:

- 50 行以下の rule は paths 不要 (常時ロードで context impact 最小)
- 1 rule で複数 path 群に跨る場合は **広い superset** (`src/**/*.ts`) で OK (subset 列挙は冗長)
- 「全 code edit でロードしたい」(coding-conventions 等の core rule) は `src/**/*.ts,src/**/*.tsx,app/**/*.ts,app/**/*.tsx,src/cron/**/*.ts` のような広いセットで意図通り

主な使用箇所: #728 案 B 部分達成サイクル — 5 件精緻化 (build-check.md dead path 削除 + react-patterns / browser-platform / design-system の subset 重複削除 + quality-checks の グローバル限定) を 1 commit で完結
