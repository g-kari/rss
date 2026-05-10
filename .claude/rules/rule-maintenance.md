---
description: rules / CLAUDE.md ドキュメントのメンテナンス原則・docs drift 監査・大規模分割の段階手順
paths: ".claude/rules/**/*.md,CLAUDE.md"
---

# ルール文書のメンテナンス原則

`.claude/rules/*.md` および `CLAUDE.md` を更新するときは、以下の原則に従う。

## 1. 「再利用可能な原則」を書く、「ケーススタディ」は書かない

ルールは将来の自分・他の AI セッションが参照する **抽象化された原則** であるべき。「Why」「How to apply」を書くときは、**特定 Issue 番号や日付セッション** に依存しない形で記述する。

```markdown
❌ アンチパターン (具体的すぎる):
**Why**: 2026-05-09 の #663 (オートモードで概要だけ読み上げ + 同記事ループ) で、
hasContent がサマリで true になっていたため shouldTriggerAutoFetch が「既に
読める」と判定して全文 fetch をスキップ → サマリ fallback で TTS が即起動 →
概要だけ読み上げ。

✅ 修正パターン (再利用可能):
**Why**: 同名の派生 boolean が UI 用と判定用で意味がブレると、片方の用途で
「既に十分」と判定されて他方の処理（fetch トリガーなど）がスキップされる
連鎖バグが起きる。
```

抽象化された Why は「なぜそのルールが必要か」を新規開発者にも伝えられる。Issue 番号と日付は git log で追える。

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

**Why**: 機能追加 PR のレビュアーは「動くか」「テストがあるか」を見るが、docs 更新までは確認しきれない。docs drift は単独で発見しやすく単独で修正しやすい (実装変更を伴わない pure docs 修正) ため、AI 自走サイクルが暇なときに **専用監査** で集中対応するのが効率的。

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

**Why**: サブエージェント rate limit は数時間続くことがある。actionable issue が枯渇している状況でサイクルを丸ごと浪費するより、**機械的検出可能なタスク** (drift / dead exports / missing TDD coverage) を直接実行する方が時間効率が高い。docs drift は判断要素なし (ファイルが存在するか / 文書に記載があるかの二択) なので、メインエージェントの判断力でも十分。

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

**Why**: docs drift は「ファイル存在 vs 文書記載」の **2 つの集合の差分** を取るタスクで、機械的に見える。だが現実には:

- gitignored ファイルは「存在するが文書化対象外」(集合 A の部分集合)
- 別ディレクトリのファイルは「文書化されているが agent の scan 範囲外」(集合 B の漏れ)

両方を考慮しないと「実存するから drift」「文書から消えてるから drift」の両方の判定が誤る。1 ファイルあたり 2 秒で検証可能 (`git check-ignore` / `find` 1 回ずつ) なので、agent report の全件に対して必ず実施する。

**How to apply**: docs drift 監査エージェントから report を受けたら:

1. **gitignored 検証**: agent が指摘した全ファイルパスに `git check-ignore -v` で gitignored 確認 → ignored なら false positive 判定
2. **scan 範囲拡大検証**: 「削除済」主張のファイルは `find src -name "<basename>"` / `find . -name "<basename>"` で別ディレクトリ確認 → 別 path で見つかれば false positive
3. **残った真 drift のみ Issue 化** — 0 件なら起票不要、1-3 件なら同 commit で修正、4+ 件なら omnibus Issue 起票
4. agent prompt 改善: 次回派遣時に「gitignored ファイルは除外して列挙して」「scan 対象は src/ 全体 (lib / config / hooks / components / cron / contexts) を網羅して」を明示

主な使用箇所: 40th cycle docs drift 監査 — agent が 5 件 drift 主張 → 検証で gitignored 4 件 (release-notes-data.ts / \_test-import\*.spec.ts × 2 / auth-utils-edge.spec.ts) + scan 範囲限定 1 件 (shortcuts.ts は src/config/ に実在) と判明、**真の drift = 0** で Issue 起票却下

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

**Why**: 「規範を文章化する」工程と「全コードへの規範適用」工程は別物。1 ファイル修正で codify を完了したと感じても、実際には他に残骸が散在している。新規開発者がコピペで増やすこともある。`docs drift` と同じく **judgment 不要 + grep で機械検出可能** なので、actionable issues 枯渇サイクルの sweep 対象として最適。

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

**Why**: `code-quality` バグ修正は **「特定の関数だけ直して終わり」になりがち** だが、実際には:

1. **同じ author** が同 pattern を別ファイルで書いている可能性 (新規 hook 追加時など)
2. **コピペ起源の sibling 関数群** で全体が同 pattern を共有 (例: `mergeNotes` / `mergeSnoozed` / `mergeTags` / `chooseLater` の merge 系統)
3. **テスト spec が無い古いコード** で隠れている可能性

`grep` で機械的に sweep すれば「**今この瞬間の全コード**」を確認できる。新規追加コードの drift は派生ケース 5 (規範 codify 後の sweep) でカバー、既存コードの drift は本派生ケースでカバーする。

**How to apply**: code-quality バグ修正 retrospective で:

1. **「修正した bug pattern」を grep で表現可能か** を判定 (lexicographic 比較 / off-by-one / null check / 等価ガード等は可能)
2. 可能なら **検出コマンドを規範本文に併記** + 同サイクルで `grep -rEn '<pattern>' src/` を実行
3. 残骸検出 → 同 commit で連続修正 (1 PR = 1 関心事を維持できる規模なら)
4. 残骸多数 → **「next cycle で sweep」Issue 起票** (本サイクル commit を肥大化させない)
5. retrospective-codify では **「sweep 結果」も記載** (「sweep で 0 件」or 「N 件発見、別 Issue 起票」)

主な使用箇所: 2026-05-10 38th cycle — `chooseLater` / `mergeSnoozed` で ISO 8601 lexicographic 比較バグを修正 → code-quality #1 (34th cycle で `read-state-prune.ts` の同類修正後) **規範は codify 済だったが grep sweep が抜けていた** ため 4 cycle 越しに sibling ファイルで再発。本派生ケースで「sweep 併記 + Issue 化」を運用ルール化

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

**Why**: ドキュメント分割は機能変更ではないため typecheck / e2e ではバグが捕捉できない。視覚的な diff レビューが頼りになるため、**1 コミットの diff 量を 200-300 行以下** に保つことが重要。`#694 Step 1` では 4 セクション 189 行を抽出して合計 +203 / -186 (= ~390 行 diff) で運用上ギリギリ許容ライン。

**How to apply**: 800 行超の rule ファイルを分割するとき:

1. **Issue 起票** で分割案 A (一括) / B (目次追加のみ) / C (段階分割) を提示
2. **案 C 採用** が基本 (リスク最小化)
3. 1 サイクル 1 Step、各 Step は **1 トピック完結**
4. ユーザーが Step N の結果を見て **継続 OK / 中止 / 別案に切替** を判断できる粒度を保つ

主な使用箇所: `react-patterns.md` (#694 Step 1 — `coding-conventions.md` から state/ref クラスター 4 セクション抽出、180 行削減)

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

**Why**: skill 化を計画段階で承認した後で gitignore 衝突に気付くと、すでに `git mv` でファイル移動を実行済みのケースで「commit できない / 戻すと履歴が汚れる」状態になる。実装着手前の `.gitignore` 確認 1 コマンドでこの罠を完全回避できる。

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

**Why**: 「14 open issues + 1 サイクル」で全件 sequential 処理すると 1 件 5 分換算でも 70 分超え、コンテキストも肥大化。3 トラック並列なら調査 5 件 (5 分並列) + 実装 1-2 件 (10 分 sequential) + コメント 5-7 件 (10 分 sequential) で合計 25-30 分。役割境界が明確になることで「どの issue は今サイクル / 次サイクル」の判断も整理される。

**How to apply**: 「issue 多数の状態で issue 処理依頼を受けた」サイクルでは、最初に Issue 分類 (A/B/C/D) を表で整理してからトラック起動。skill のチェックリスト (Step 1: 自分起票確認 / Step 2: ユーザー本人コメント抽出 / Step 3: 状態判定) を全 issue に一括実行してから分類するのが効率的 (本人コメント抽出は `for n in ...; do gh issue view $n ...; done` でバッチ処理)。

主な使用箇所: 14 件 open issue を 1 サイクルで処理 — 調査 5 並列 (#720 / #718 / #714 / #713 / #709) → 設計方針コメント投稿、実装トラック (#711 Phase 1 / #715 Phase 2) は AI 自走条件外で残置、判断仰ぎ (#682 / #674) で status コメント、軽微 (#725) は最適化作業で解決済としてクローズ
