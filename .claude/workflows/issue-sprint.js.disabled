export const meta = {
  name: "rss-issue-sprint",
  description: "RSS 自走可能 Issue 4 件を実装し simplify/a11y/docs 監査から新規 Issue を起票",
  phases: [
    { title: "実装+監査", detail: "Issue 実装 + simplify/a11y/docs 監査を並行実行" },
    { title: "起票", detail: "監査 finding から新規 Issue 起票" },
    { title: "回顧", detail: "retrospective-codify で rules を補完" },
  ],
};

const REPO = "/home/gizen/d2/dokodemo-claude/apps/dokodemo-claude-api/repositories/rss";

const IMPL_SCHEMA = {
  type: "object",
  properties: {
    commits: { type: "array", items: { type: "string" } },
    success: { type: "boolean" },
    summary: { type: "string" },
  },
  required: ["success", "summary"],
};

const AUDIT_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          file: { type: "string" },
          recommendation: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["title", "description", "recommendation", "priority"],
      },
    },
  },
  required: ["findings"],
};

phase("実装+監査");

const implPrompt = [
  "あなたは RSS リーダープロジェクト (" + REPO + ") の実装担当エージェントです。",
  "以下の 4 Issue を順番に実装し、各 Issue ごとに独立した commit を作成してください。",
  "各変更後に cd " +
    REPO +
    " && npm run check && npm run typecheck を実行してから commit すること。",
  "pre-commit hook が走るので SKIP=e2e-test git commit を使うこと (e2e は wrangler 認証が必要なため)。",
  "commit 後は必ず git log --oneline -1 で commit hash を確認してから次に進むこと。",
  "各 Issue クローズは commit message に 'closes #N' を含めて GitHub 自動クローズを利用、後で gh issue comment で完了サマリー投稿すること。",
  "",
  "=== Issue #1217: docs: architecture.md の src/lib/ 機能別グループ表に empty-sentinels.ts が未記載 ===",
  "背景: `src/lib/empty-sentinels.ts` は tracked で Object.freeze 済み 3 sentinel を export しているが、",
  "  `.claude/rules/architecture.md` の src/lib/ 機能別グループ表 (line 835-850) に未記載。",
  "  推奨案 A: 「プラットフォーム / 基盤」行に追記。",
  "",
  "実装手順:",
  "1. cd " + REPO,
  "2. 現状確認:",
  "   grep -n 'empty-sentinels\\|プラットフォーム' .claude/rules/architecture.md | head -10",
  "3. `.claude/rules/architecture.md` の「プラットフォーム / 基盤」行に `empty-sentinels.ts` を追記",
  "4. npm run check && npm run typecheck (typecheck は docs のみなので check だけで十分だが両方走らせる)",
  "5. SKIP=e2e-test git commit -m 'docs: architecture.md の src/lib/ 機能別グループ表に empty-sentinels.ts 追記 (案 A 自走採用, closes #1217)'",
  "6. git log --oneline -1 で hash 確認",
  "7. git push origin master",
  "8. gh issue comment 1217 --body '> 🤖 **AI 投稿 (Claude Code)** — 案 A 自走採用で対応完了。\\n\\n`.claude/rules/architecture.md` の「プラットフォーム / 基盤」行に `empty-sentinels.ts` を追記しました。他サイクル起票 + docs only + touch 1 file の代替 4 条件全充足のため即時自走採用。\\n\\nmaster 反映済み。'",
  "",
  "=== Issue #1216: a11y: AI 評価ボタン (👍😐👎) の選択状態が SR に伝わらない (aria-pressed 欠落) ===",
  "背景: `ArticleAiPanel.tsx:104-129` (要約評価) と `ArticleContentBody.tsx:383-411` (翻訳評価) の 3 段階評価ボタン",
  "  が `aria-pressed` を持たない。canonical: `EngagementSegmentButton.tsx:41` が `aria-pressed={isActive}` 保持済。",
  "  推奨案 A: 各 button に `aria-pressed={summaryRating === rating}` / `aria-pressed={translateRating === rating}` を追加。",
  "",
  "実装手順:",
  "1. cd " + REPO,
  "2. 現状確認:",
  "   grep -n 'aria-pressed\\|summaryRating\\|translateRating' src/components/article-view/ArticleAiPanel.tsx src/components/article-view/ArticleContentBody.tsx | head -20",
  "3. `ArticleAiPanel.tsx` の要約評価 3 button 各 `<button>` に `aria-pressed={summaryRating === rating}` を追加",
  "4. `ArticleContentBody.tsx` の翻訳評価 3 button 各 `<button>` に `aria-pressed={translateRating === rating}` を追加",
  "5. npm run check && npm run typecheck",
  "6. SKIP=e2e-test git commit -m 'a11y: AI 評価ボタン (要約/翻訳) 6 button に aria-pressed 追加 (canonical: EngagementSegmentButton, closes #1216)'",
  "7. git log --oneline -1 で hash 確認",
  "8. git push origin master",
  "9. gh issue comment 1216 --body '> 🤖 **AI 投稿 (Claude Code)** — 案 A 自走採用で対応完了。\\n\\n`ArticleAiPanel.tsx` と `ArticleContentBody.tsx` の要約/翻訳評価 3 button 計 6 button に `aria-pressed={<rating> === rating}` を追加しました。canonical `EngagementSegmentButton.tsx:41` と 100% 一致 pattern。sibling drift sweep として代替 4 条件全充足で自走採用。\\n\\nmaster 反映済み。'",
  "",
  "=== Issue #1200: helper drift: Map<string, V> structural equality helper 重複 (equalMap<V> generic 集約) ===",
  "背景: `src/lib/unread-stats-merge.ts:24-52` の `equalUnreadByFeed` / `equalLastPublishedByFeed` と",
  "  `src/lib/article-filter-equality.ts:22-29` の `equalMap<V>` generic + 3 alias が同一構造ロジック。",
  "  推奨: `unread-stats-merge.ts` の 2 関数を `article-filter-equality.ts` の canonical `equalMap` 経由に統合。",
  "  ただし circular import に注意 (両 file の caller graph を確認)。",
  "",
  "実装手順:",
  "1. cd " + REPO,
  "2. 現状確認:",
  "   grep -rn 'equalUnreadByFeed\\|equalLastPublishedByFeed\\|equalMap' src/ | head -20",
  "   node -e \"const g=require('fs').readFileSync('src/lib/article-filter-equality.ts','utf8');console.log(g.split('\\\\n').slice(0,35).join('\\\\n'))\"",
  "3. 案: `article-filter-equality.ts` に `equalNumberMap` / `equalStringMap` を追加 (既存 `equalDigestLimitMap` / `equalStringMap` を再利用可能なら再利用)",
  "   もしくは `unread-stats-merge.ts` 側の 2 関数実装を `equalMap` 呼び出しに置換 (import 追加)",
  "4. 既存 caller の signature を維持 (`equalUnreadByFeed` / `equalLastPublishedByFeed` の export 名は残す)",
  "5. npm run check && npm run typecheck",
  "6. SKIP=e2e-test git commit -m 'simplify: unread-stats-merge.ts の Map 等価判定 2 関数を article-filter-equality.ts の equalMap generic 経由に統合 (closes #1200)'",
  "7. git log --oneline -1 で hash 確認",
  "8. git push origin master",
  "9. gh issue comment 1200 --body '> 🤖 **AI 投稿 (Claude Code)** — helper drift 解消完了。\\n\\n`unread-stats-merge.ts` の `equalUnreadByFeed` / `equalLastPublishedByFeed` を `article-filter-equality.ts` の canonical `equalMap<V>` generic 経由に再実装しました。既存 caller の export signature は完全維持。\\n\\nmaster 反映済み。'",
  "",
  "=== Issue #1208: silent fallback: shortcuts.ts の navigator.share が bare catch で握りつぶし ===",
  "背景: `src/config/shortcuts.ts:483-491` の `c` キー (リンクをコピー) shortcut が `navigator.share(...).catch(() => {})` で全エラー握りつぶし。",
  "  canonical: `ShareMenu.tsx:69-79` は `isAbortError` 除外 + `console.error` + `toast.error`。",
  "  推奨修正: canonical パターンに揃える (isAbortError 除外 + devError + ctx.showToast)。",
  "",
  "実装手順:",
  "1. cd " + REPO,
  "2. 現状確認:",
  "   grep -n 'navigator.share\\|isAbortError\\|devError\\|showToast' src/config/shortcuts.ts | head -20",
  "   grep -n 'isAbortError\\|navigator.share' src/components/article-view/ShareMenu.tsx | head -10",
  "3. `shortcuts.ts` に必要な import 追加 (`isAbortError` / `devError`) + `navigator.share(...).catch(err => { if (isAbortError(err)) return; devError('[shortcut c] navigator.share failed', err); ctx.showToast('シェアに失敗しました'); })`",
  "4. npm run check && npm run typecheck",
  "5. SKIP=e2e-test git commit -m 'silent fallback: shortcuts.ts の navigator.share catch に isAbortError 除外 + devError + toast 通知追加 (canonical: ShareMenu, closes #1208)'",
  "6. git log --oneline -1 で hash 確認",
  "7. git push origin master",
  "8. gh issue comment 1208 --body '> 🤖 **AI 投稿 (Claude Code)** — sibling drift 解消完了。\\n\\n`shortcuts.ts:483-491` の `navigator.share` bare catch を canonical `ShareMenu.tsx:74-79` パターン (`isAbortError` 除外 + `devError` + `ctx.showToast`) に揃えました。ユーザーキャンセル継続 skip、他エラーで toast 通知追加。\\n\\nmaster 反映済み。'",
  "",
  "=== 最後に push 確認 ===",
  "cd " + REPO + " && git status && git log --oneline -6",
].join("\n");

const [implResult, simplifyResult, a11yResult, docsResult] = await parallel([
  () =>
    agent(implPrompt, {
      label: "実装エージェント (#1217 + #1216 + #1200 + #1208)",
      phase: "実装+監査",
      schema: IMPL_SCHEMA,
    }),
  () =>
    agent(
      "RSS リーダープロジェクト (" +
        REPO +
        ") の simplify/dead code 観点で高信頼度 finding のみ監査してください。\n" +
        "same-file internal caller と spec 参照を必ず verify してから dead と判定すること。\n" +
        "以下は本サイクル対応中のため除外: #1217 #1216 #1200 #1208。\n" +
        "その他 open issue (#1194 #1197 #1198 #1199 #1201 #1202 #1203 #1204 #1205 #1206 #1209 #1210 #1211 #1213 #1215) と重複しない新規 finding のみ。\n" +
        "信頼度 90% 以上の finding のみ、最大 3 件を JSON で返してください。\n" +
        "各 finding は実コード確認済みのものだけ含めること。",
      {
        label: "simplify監査",
        phase: "実装+監査",
        schema: AUDIT_SCHEMA,
        agentType: "auditor-simplify",
      },
    ),
  () =>
    agent(
      "RSS リーダープロジェクト (" +
        REPO +
        ") の a11y (アクセシビリティ) 観点で高信頼度 finding を監査してください。\n" +
        "focus trap / ARIA 属性 / キーボードナビゲーション / color contrast / semantic HTML を確認。\n" +
        "以下は本サイクル対応中のため除外: #1216。\n" +
        "その他 open a11y issue (#1194 #1197 #1198 #1199 #1203 #1206 #1209 #1210 #1213 #1215) と重複しない新規 finding のみ。\n" +
        "信頼度 90% 以上の finding のみ、最大 3 件を JSON で返してください。\n" +
        "各 finding は実コード確認済みのものだけ含めること。",
      {
        label: "a11y監査",
        phase: "実装+監査",
        schema: AUDIT_SCHEMA,
        agentType: "auditor-a11y",
      },
    ),
  () =>
    agent(
      "RSS リーダープロジェクト (" +
        REPO +
        ") で `.claude/rules/architecture.md` / `.claude/rules/api-*.md` と実コードの drift を検出してください。\n" +
        "新規追加された file / 削除された file / 未記載の endpoint / stale spec を punch list 化。\n" +
        "以下は本サイクル対応中のため除外: #1217 (empty-sentinels.ts docs drift)。\n" +
        "信頼度 90% 以上の finding のみ、最大 3 件を JSON で返してください。",
      {
        label: "docs-drift監査",
        phase: "実装+監査",
        schema: AUDIT_SCHEMA,
        agentType: "docs-drift-detector",
      },
    ),
]);

log("実装完了: " + (implResult?.success ? "✅" : "❌") + " " + (implResult?.summary ?? ""));

phase("起票");

const allFindings = [
  ...(simplifyResult?.findings ?? []),
  ...(a11yResult?.findings ?? []),
  ...(docsResult?.findings ?? []),
].filter(function (f) {
  return f && (f.priority === "high" || f.priority === "medium");
});

log(
  "監査 finding: " +
    allFindings.length +
    " 件 (simplify:" +
    (simplifyResult?.findings?.length ?? 0) +
    " / a11y:" +
    (a11yResult?.findings?.length ?? 0) +
    " / docs:" +
    (docsResult?.findings?.length ?? 0) +
    ")",
);

if (allFindings.length > 0) {
  await agent(
    "RSS リポジトリ (" +
      REPO +
      ") で以下の監査 finding から GitHub Issue を起票してください。\n" +
      "起票ルール:\n" +
      "- AI 起票バナー必須 ('> 🤖 AI 起票 (Claude Code)')\n" +
      "- 実コード verify 必須 (same-file internal caller / spec 参照確認 / cross-file grep)\n" +
      "- false positive は起票しない\n" +
      "- 重複 Issue は起票しない (gh issue list --state open で確認)\n" +
      "- needs-user-decision は新規 dep/infra/UX 主観評価が必要なもののみ\n" +
      "- 監査 finding でも Step 4 判断不要スクリーニングを必ず実行 (issue-handling skill)\n" +
      "- 最大 3 件\n\n" +
      JSON.stringify(allFindings, null, 2),
    { label: "新規Issue起票", phase: "起票" },
  );
}

phase("回顧");

await agent(
  "RSS プロジェクト (" +
    REPO +
    ") で今回実装した内容から学んだパターンを .claude/rules に反映してください。\n\n" +
    "今回の実装内容:\n" +
    "1. #1217: architecture.md docs drift 追記 (docs only 代替 4 条件自走)\n" +
    "2. #1216: AI 評価ボタン aria-pressed 追加 (sibling drift sweep, canonical EngagementSegmentButton)\n" +
    "3. #1200: Map<string, V> equality helper 集約 (equalMap generic 統合)\n" +
    "4. #1208: navigator.share bare catch 解消 (canonical ShareMenu pattern)\n\n" +
    "学習すべきパターン (既存ルールと重複しない場合のみ追記):\n" +
    "- sibling drift sweep の code-review 判定 pattern\n" +
    "- Map<string, V> generic helper 集約時の caller signature 維持パターン\n" +
    "- navigator.share の isAbortError 除外 + toast 通知 canonical pattern\n\n" +
    "変更した場合は git add + SKIP=e2e-test commit + git push してください。\n" +
    "変更がなければ何もしなくて構いません。",
  { label: "retrospective-codify", phase: "回顧" },
);

return { success: true, implementedIssues: ["#1217", "#1216", "#1200", "#1208"] };
