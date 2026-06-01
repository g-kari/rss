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
  "=== Issue #1043: a11y: FeedQuickSwitchModal と SearchBar の combobox に aria-haspopup='listbox' が欠落 (WAI-ARIA 1.2) ===",
  "背景: FeedQuickSwitchModal.tsx:145 と SearchBar.tsx:171 の role='combobox' に aria-haspopup='listbox' が欠落。",
  "  WAI-ARIA 1.2 §6.6.1 では combobox のポップアップが listbox の場合 aria-haspopup='listbox' が必須。",
  "",
  "実装手順:",
  "1. cd " + REPO,
  "2. FeedQuickSwitchModal.tsx の combobox 確認:",
  "   grep -n 'role=\"combobox\"\\|aria-haspopup\\|aria-expanded' src/components/FeedQuickSwitchModal.tsx | head -10",
  "3. SearchBar.tsx の combobox 確認:",
  "   grep -n 'role=\"combobox\"\\|aria-haspopup\\|aria-expanded' src/components/article-list-header/SearchBar.tsx | head -10",
  "4. 両ファイルの role='combobox' 要素に aria-haspopup='listbox' を追加",
  "   (既存の aria-expanded / aria-controls の後に追加するのが自然)",
  "5. pnpm run check && pnpm run typecheck",
  "6. SKIP=e2e-test git commit -m 'a11y: FeedQuickSwitchModal / SearchBar の combobox に aria-haspopup=\"listbox\" 追加 (WAI-ARIA 1.2, closes #1043)'",
  "7. git log --oneline -1 で commit hash を確認して記録",
  "8. git push origin master",
  "9. Issue クローズコメント投稿:",
  '   gh issue comment 1043 --body \'> 🤖 **AI 投稿 (Claude Code)** — #1043 対応完了。\n\n## 対応内容\n\n`FeedQuickSwitchModal.tsx` と `SearchBar.tsx` の `role="combobox"` 要素に `aria-haspopup="listbox"` を追加しました。\n\nWAI-ARIA 1.2 §6.6.1 に従い、listbox をポップアップとして持つ combobox に必須属性を付与。\n\nmaster 反映済み。自動デプロイされます。\'',
  "",
  "=== Issue #1042: a11y: EngagementSegmentButton のデスクトップタッチターゲットに lg:min-w/h-[24px] が未設定 (WCAG 2.5.8) ===",
  "背景: EngagementSegmentButton.tsx:42 の className にモバイル向け min-w/h-[44px] はあるがデスクトップ向け lg:min-w/h-[24px] がない。",
  "  commit 56f7c87f で ToggleIconButton に同じクラスを追加済み (canonical pattern)。",
  "",
  "実装手順:",
  "1. cd " + REPO,
  "2. EngagementSegmentButton.tsx の現状確認:",
  "   grep -n 'className\\|min-w\\|min-h' src/components/article-view/EngagementSegmentButton.tsx",
  "3. ToggleIconButton の canonical pattern 確認:",
  "   grep -n 'lg:min-w\\|lg:min-h' src/components/article-view/ToggleIconButton.tsx",
  "4. EngagementSegmentButton.tsx に lg:min-w-[24px] lg:min-h-[24px] を追加",
  "   (モバイル向け max-md:min-w-[44px] max-md:min-h-[44px] と対で追加する)",
  "5. pnpm run check && pnpm run typecheck",
  "6. SKIP=e2e-test git commit -m 'a11y: EngagementSegmentButton デスクトップタッチターゲット lg:min-w/h-[24px] 追加 (WCAG 2.5.8, closes #1042)'",
  "7. git log --oneline -1 で commit hash を確認して記録",
  "8. git push origin master",
  "9. Issue クローズコメント投稿:",
  "   gh issue comment 1042 --body '> 🤖 **AI 投稿 (Claude Code)** — #1042 対応完了。\n\n## 対応内容\n\n`EngagementSegmentButton.tsx` に `lg:min-w-[24px] lg:min-h-[24px]` を追加しました。\n\n`ToggleIconButton` (commit `56f7c87f`) と同じデスクトップタッチターゲット最小値を明示的に設定。\n\nmaster 反映済み。自動デプロイされます。'",
  "",
  "=== Issue #1039 の部分対応: SortButton SVG aria-hidden 追加 (問題 1 のみ) ===",
  "背景: #1039 には 3 つの問題があり、問題 1 (SVG aria-hidden) のみ自走可能。",
  "  問題 2 (aria-pressed) と問題 3 (touch target) は UX 判断が必要なので手をつけない。",
  "",
  "実装手順:",
  "1. cd " + REPO,
  "2. SortButton.tsx の SVG を確認:",
  "   grep -n '<svg\\|aria-hidden' src/components/article-list-header/SortButton.tsx",
  "3. 3 つの SVG (line 26, 39, 52 付近) に aria-hidden='true' を追加",
  "4. pnpm run check && pnpm run typecheck",
  "5. SKIP=e2e-test git commit -m 'a11y: SortButton SVG に aria-hidden=\"true\" 追加 (#1039 問題 1/3 対応)'",
  "   (closes キーワードは付けない。問題 2/3 が残っているため Issue はクローズしない)",
  "6. git log --oneline -1 で commit hash を確認して記録",
  "7. git push origin master",
  "8. Issue に部分対応コメント投稿:",
  "   gh issue comment 1039 --body '> 🤖 **AI 投稿 (Claude Code)** — #1039 問題 1 (SVG aria-hidden) 自走対応。\n\n## 問題 1 対応済み (commit を確認)\n\n`SortButton.tsx` の 3 つのインライン SVG に `aria-hidden=\"true\"` を追加しました。\n\n## 残課題 (問題 2/3)\n\n- **問題 2**: `aria-pressed` — `sortOrder` 状態の機械可読表現。UX 判断 (どのボタンに aria-pressed をどの値で付与するか) が必要。\n- **問題 3**: モバイルタッチターゲット 44px 拡大 — 既存 class 構成との兼ね合いで UX 判断が必要。\n\n引き続き needs-user-decision 状態を維持します。'",
  "",
  "=== 最後に push 確認 ===",
  "cd " + REPO + " && git status && git log --oneline -5",
].join("\n");

const [implResult, auditResults] = await parallel([
  () =>
    agent(implPrompt, {
      label: "実装エージェント (#1043 + #1042 + #1039 部分)",
      phase: "実装+監査",
      schema: IMPL_SCHEMA,
    }),
  () =>
    parallel([
      () =>
        agent(
          "RSS リーダープロジェクト (" +
            REPO +
            ") の simplify/dead code 観点で監査を実施してください。" +
            "未使用 export, 重複ロジック, 不要な thin wrapper を探してください。" +
            "same-file internal caller と spec 参照も必ず確認してから dead と判定してください。" +
            "以下はすでに対応済み Issue のため除外してください: #1034, #1035, #1036, #1037, #1038。" +
            "信頼度 80% 以上の finding のみ、最大 3 件を JSON で返してください。",
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
            ") の accessibility (a11y) 観点で監査を実施してください。" +
            "ARIA 属性の欠落, focus trap, キーボードナビゲーション, タッチターゲット, 類似コンポーネント間の乖離を調査してください。" +
            "以下はすでに対応済み・起票済みのため除外してください: " +
            "ShareMenu/CollectionDropdown focus (#1035), GalleryContextMenu SVG (#1038), SortButton (#1039), " +
            "BulkActionToolbar roving tabindex (#1040), FeedQuickSwitchModal/SearchBar aria-haspopup (#1043), EngagementSegmentButton (#1042)。" +
            "信頼度 80% 以上の finding のみ、最大 3 件を JSON で返してください。",
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
            ") の docs-drift 観点で監査を実施してください。" +
            "architecture.md に記載があるが実コードに存在しないファイル・シンボル、" +
            "実コードにあるが docs に未記載の主要な新機能 hook / lib (2025年以降に追加されたもの優先) を調査してください。" +
            "信頼度 80% 以上の finding のみ、最大 3 件を JSON で返してください。",
          {
            label: "docs-drift監査",
            phase: "実装+監査",
            schema: AUDIT_SCHEMA,
            agentType: "docs-drift-detector",
          },
        ),
    ]),
]);

log("実装完了: " + (implResult?.success ? "✅" : "❌") + " " + (implResult?.summary ?? ""));

phase("起票");

const allFindings = (auditResults ?? [])
  .filter(Boolean)
  .flatMap(function (r) {
    return Array.isArray(r) ? r : [r];
  })
  .filter(Boolean)
  .flatMap(function (r2) {
    return r2 && r2.findings ? r2.findings : [];
  })
  .filter(function (f) {
    return f && (f.priority === "high" || f.priority === "medium");
  });

log("監査 finding 合計: " + allFindings.length + " 件");

if (allFindings.length > 0) {
  await agent(
    "RSS リポジトリ (" +
      REPO +
      ") で以下の監査 finding から GitHub Issue を起票してください。\n" +
      "起票ルール:\n" +
      "- AI 起票バナー必須 ('> 🤖 AI 起票 (Claude Code)')\n" +
      "- needs-user-decision ラベルは新規 dep/infra/UX 主観評価が必要なもののみ\n" +
      "- 実コードで false positive でないか必ず verify してから起票\n" +
      "- 重複 Issue は起票しない (gh issue list --state open で確認)\n" +
      "- 最大 4 件\n\n" +
      "Findings:\n" +
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
    "1. #1043: FeedQuickSwitchModal / SearchBar combobox に aria-haspopup='listbox' 追加 (WAI-ARIA 1.2)\n" +
    "2. #1042: EngagementSegmentButton に lg:min-w/h-[24px] 追加 (WCAG 2.5.8)\n" +
    "3. #1039 問題 1: SortButton SVG に aria-hidden='true' 追加 (問題 2/3 は needs-user-decision 継続)\n\n" +
    "既存ルールと重複する内容は追加しないこと。新しいパターンのみ追記。\n" +
    "変更した場合は git add + commit + push してください。\n" +
    "変更がなければ何もしなくて構いません。",
  { label: "retrospective-codify", phase: "回顧" },
);

return { success: true, implementedIssues: ["#1043", "#1042", "#1039-partial"] };
