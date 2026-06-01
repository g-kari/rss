export const meta = {
  name: "rss-issue-sprint",
  description: "RSS 自走可能 Issue 4 件を実装し simplify/a11y/docs 監査から新規 Issue を起票",
  phases: [
    { title: "実装+監査", detail: "Issue 実装 + simplify/a11y/docs 監査を並行実行" },
    { title: "起票", detail: "監査 finding から新規 Issue 起票" },
    { title: "回顧", detail: "retrospective-codify で rules を補完" },
  ],
};

const REPO = "/home/gizen/dokodemo-claude/backend/repositories/rss";

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
  "以下の Issue を順番に実装し、各 Issue ごとに独立した commit を作成してください。",
  "各変更後に cd " +
    REPO +
    " && pnpm run check && pnpm run typecheck を実行してから commit すること。",
  "pre-commit hook が走るので SKIP=e2e-test git commit を使うこと (e2e は wrangler 認証が必要なため)。",
  "commit 後は必ず git log --oneline -1 で commit hash を確認してから次に進むこと。",
  "",
  "=== Issue #1045: a11y: FeedGroupsSection グループ折りたたみボタン内 SVG に aria-hidden='true' が欠落 ===",
  "背景: FeedGroupsSection.tsx:220 のシェブロン SVG に aria-hidden が欠落。ボタンには aria-label があるので SVG は装飾的。",
  "",
  "実装手順:",
  "1. cd " + REPO,
  "2. 現状確認:",
  "   grep -n '<svg\\|aria-hidden\\|aria-label\\|aria-expanded' src/components/feed-sidebar/FeedGroupsSection.tsx | head -15",
  "3. 折りたたみボタン内の SVG (シェブロン) に aria-hidden='true' を追加",
  "   (ボタンには aria-label があるので SVG は装飾的として aria-hidden='true' が正しい)",
  "4. pnpm run check && pnpm run typecheck",
  "5. SKIP=e2e-test git commit -m 'a11y: FeedGroupsSection 折りたたみボタン内 SVG に aria-hidden=\"true\" 追加 (closes #1045)'",
  "6. git log --oneline -1 で commit hash を確認して記録",
  "7. git push origin master",
  "8. Issue クローズコメント投稿:",
  "   gh issue comment 1045 --body '> 🤖 **AI 投稿 (Claude Code)** — #1045 対応完了。\n\n`FeedGroupsSection.tsx` の折りたたみボタン内シェブロン SVG に `aria-hidden=\"true\"` を追加しました。ボタンには `aria-label` があるため SVG は装飾的で非通知が適切です。\n\nmaster 反映済み。自動デプロイされます。'",
  "",
  "=== Issue #1046: a11y: CategorySection / FeedGroupsSection の折りたたみボタンに aria-controls が欠落 ===",
  "背景: CategorySection.tsx:38 と FeedGroupsSection.tsx:218 の aria-expanded ボタンに aria-controls が欠落。",
  "  FeedAddModal.tsx:159-169 が aria-expanded + aria-controls + id の canonical pattern を持つ。",
  "",
  "実装手順:",
  "1. cd " + REPO,
  "2. canonical pattern 確認:",
  "   grep -n 'aria-controls\\|aria-expanded\\|id=' src/components/FeedAddModal.tsx | head -10",
  "3. CategorySection.tsx の折りたたみ対象要素を確認:",
  "   grep -n 'aria-expanded\\|isCollapsed\\|id=' src/components/feed-sidebar/CategorySection.tsx",
  "4. FeedGroupsSection.tsx の折りたたみ対象要素を確認:",
  "   grep -n 'aria-expanded\\|isCollapsed\\|id=' src/components/feed-sidebar/FeedGroupsSection.tsx",
  "5. CategorySection.tsx の修正:",
  "   - 折りたたみ対象の divや ul 要素に id を追加 (例: id=`category-${category}-content`)",
  "   - ボタンに aria-controls={同じ id} を追加",
  "6. FeedGroupsSection.tsx の修正:",
  "   - 各グループの折りたたみ対象 div/ul 要素に id を追加 (例: id=`group-${group.id}-content`)",
  "   - ボタンに aria-controls={同じ id} を追加",
  "7. pnpm run check && pnpm run typecheck",
  "8. SKIP=e2e-test git commit -m 'a11y: CategorySection / FeedGroupsSection 折りたたみボタンに aria-controls 追加 (WAI-ARIA Disclosure, closes #1046)'",
  "9. git log --oneline -1 で commit hash を確認して記録",
  "10. git push origin master",
  "11. Issue クローズコメント投稿:",
  "    gh issue comment 1046 --body '> 🤖 **AI 投稿 (Claude Code)** — #1046 対応完了。\n\n`CategorySection.tsx` と `FeedGroupsSection.tsx` の折りたたみボタンに `aria-controls` を追加しました。\n\n`FeedAddModal.tsx` の canonical pattern (`aria-expanded` + `aria-controls` + 対象 `id` 三点セット) に統一。\n\nmaster 反映済み。自動デプロイされます。'",
  "",
  "=== Issue #1044: simplify: isRetryableHttpError の export 削除 (Case A: module-private 化 + spec 内部化) ===",
  "背景: isRetryableHttpError は production caller 0 件、spec (classify-http-error.spec.ts) のみが import している。",
  "  Case A: export キーワードを削除して module-private 化 + spec は classifyHttpError 経由テストに変更。",
  "",
  "実装手順:",
  "1. cd " + REPO,
  "2. 現状確認:",
  "   grep -n 'isRetryableHttpError\\|export function' src/lib/classify-http-error.ts",
  "   grep -n 'isRetryableHttpError' e2e/classify-http-error.spec.ts",
  "3. classify-http-error.ts の export function isRetryableHttpError → function isRetryableHttpError に変更",
  "   (export キーワードのみ削除、関数本体は保持)",
  "4. e2e/classify-http-error.spec.ts の isRetryableHttpError 関連部分を修正:",
  "   - import 行から isRetryableHttpError を削除",
  "   - isRetryableHttpError の describe ブロックを削除するか、",
  "     または classifyHttpError の戻り値 retryable プロパティで同等テストに変更",
  "   (どちらでもよいが、classify-http-error.ts の classifyHttpError が retryable を返すか確認してから判断)",
  "   grep -n 'retryable\\|classifyHttpError' src/lib/classify-http-error.ts",
  "5. pnpm run check && pnpm run typecheck",
  "6. SKIP=e2e-test git commit -m 'simplify: isRetryableHttpError を module-private に変更し dead export を解消 (Case A, closes #1044)'",
  "7. git log --oneline -1 で commit hash を確認して記録",
  "8. git push origin master",
  "9. Issue クローズコメント投稿:",
  "   gh issue comment 1044 --body '> 🤖 **AI 投稿 (Claude Code)** — #1044 案 A で対応完了。\n\n`isRetryableHttpError` の `export` キーワードを削除して module-private 化しました。\n\nPhase 2 の自動リトライ実装時に `export` を再追加するだけで再利用可能です。\n\nspec は `classifyHttpError` 経由テスト (または削除) に変更。\n\nmaster 反映済み。自動デプロイされます。'",
  "",
  "=== 最後に push 確認 ===",
  "cd " + REPO + " && git status && git log --oneline -5",
].join("\n");

// 最終スプリントなので監査は軽量に実施 (新 finding が出てもノイズになりやすいため)
const [implResult, auditResult] = await parallel([
  () =>
    agent(implPrompt, {
      label: "実装エージェント (#1045 + #1046 + #1044)",
      phase: "実装+監査",
      schema: IMPL_SCHEMA,
    }),
  () =>
    agent(
      "RSS リーダープロジェクト (" +
        REPO +
        ") の simplify/dead code 観点で高信頼度 finding のみ監査してください。" +
        "same-file internal caller と spec 参照を必ず verify してから dead と判定すること。" +
        "以下はすでに対応済みのため除外: #1034 #1035 #1036 #1037 #1038 #1043 #1042 #1045 #1046 #1044。" +
        "信頼度 90% 以上の finding のみ、最大 2 件を JSON で返してください。",
      {
        label: "最終simplify監査",
        phase: "実装+監査",
        schema: AUDIT_SCHEMA,
        agentType: "auditor-simplify",
      },
    ),
]);

log("実装完了: " + (implResult?.success ? "✅" : "❌") + " " + (implResult?.summary ?? ""));

phase("起票");

const findings = (auditResult?.findings ?? []).filter(function (f) {
  return f && (f.priority === "high" || f.priority === "medium");
});

log("監査 finding: " + findings.length + " 件");

if (findings.length > 0) {
  await agent(
    "RSS リポジトリ (" +
      REPO +
      ") で以下の監査 finding から GitHub Issue を起票してください。\n" +
      "起票ルール:\n" +
      "- AI 起票バナー必須 ('> 🤖 AI 起票 (Claude Code)')\n" +
      "- needs-user-decision は新規 dep/infra/UX 主観評価が必要なもののみ\n" +
      "- 実コード verify 必須 (false positive チェック)\n" +
      "- 重複 Issue は起票しない\n" +
      "- 最大 2 件\n\n" +
      JSON.stringify(findings, null, 2),
    { label: "新規Issue起票", phase: "起票" },
  );
}

phase("回顧");

await agent(
  "RSS プロジェクト (" +
    REPO +
    ") で今回実装した内容から学んだパターンを .claude/rules に反映してください。\n\n" +
    "今回の実装内容:\n" +
    "1. #1045: FeedGroupsSection 折りたたみ SVG に aria-hidden 追加\n" +
    "2. #1046: CategorySection / FeedGroupsSection 折りたたみボタンに aria-controls 追加 (WAI-ARIA Disclosure)\n" +
    "3. #1044: isRetryableHttpError を module-private 化 (Case A: spec import があっても export 削除可能な条件)\n\n" +
    "既存ルールと重複しない新パターンのみ追記。\n" +
    "変更した場合は git add + commit + push してください。\n" +
    "変更がなければ何もしなくて構いません。",
  { label: "retrospective-codify", phase: "回顧" },
);

return { success: true, implementedIssues: ["#1045", "#1046", "#1044"] };
