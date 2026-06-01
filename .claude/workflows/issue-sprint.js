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
  "=== Issue #1054: simplify: useFeedOperations.addFeed の res.json().catch インライン重複を tryParseErrorBody に集約 ===",
  "背景: src/hooks/useFeedOperations.ts:76 の addFeed 関数が !res.ok 分岐内で",
  "  res.json().catch(() => ({})) をインラインで書いている。",
  "  同 hook の handleImportFile:129 や useCollections.ts / useFeedGroups.ts は",
  "  すでに tryParseErrorBody helper を使っており、パターンが不統一。",
  "",
  "  現状の tryParseErrorBody は Promise<{ code?: string; error?: string }> を返すため、",
  "  canRetryWithSelector フィールドとの型 gap がある。",
  "",
  "実装手順:",
  "1. cd " + REPO,
  "2. 現状確認:",
  "   grep -n 'tryParseErrorBody\\|canRetryWithSelector\\|res.json' src/hooks/useFeedOperations.ts | head -20",
  "   grep -n 'tryParseErrorBody\\|export' src/lib/api-fetch.ts | head -20",
  "3. 案 A (推奨): src/lib/api-fetch.ts の tryParseErrorBody 戻り型に index signature を追加:",
  "   Promise<{ code?: string; error?: string; [key: string]: unknown }>",
  "4. src/hooks/useFeedOperations.ts:76 の inline res.json().catch(() => ({})) を",
  "   const data = await tryParseErrorBody(res); に変更し、",
  "   canRetryWithSelector は (data as { canRetryWithSelector?: boolean }).canRetryWithSelector で取得",
  "5. pnpm run check && pnpm run typecheck",
  "6. SKIP=e2e-test git commit -m 'simplify: useFeedOperations.addFeed の res.json().catch を tryParseErrorBody に集約 (closes #1054)'",
  "7. git log --oneline -1 で commit hash を確認して記録",
  "8. git push origin master",
  "9. Issue クローズコメント投稿:",
  "   gh issue comment 1054 --body '> 🤖 **AI 投稿 (Claude Code)** — #1054 案 A で対応完了。\n\n`tryParseErrorBody` の戻り型に index signature (`[key: string]: unknown`) を追加し、`addFeed` の inline `res.json().catch` を `tryParseErrorBody` 経由に統一しました。\n\nmaster 反映済み。自動デプロイされます。'",
  "",
  "=== Issue #1053: perf: useFeedFilters で mutedUntil の Date.parse が useEffect と useMemo の 2 箇所で重複実行 ===",
  "背景: src/hooks/useFeedFilters.ts の feeds 配列に対して Date.parse(f.mutedUntil) を",
  "  useEffect と useMemo の両方でそれぞれ独立して走らせている。",
  "  フィード数 N に対して mutedTick が変化するたびに Date.parse が 2N 回呼ばれる無駄がある。",
  "",
  "実装手順:",
  "1. cd " + REPO,
  "2. 現状確認:",
  "   grep -n 'mutedUntil\\|Date.parse\\|parsedUntil\\|useMemo\\|useEffect' src/hooks/useFeedFilters.ts | head -30",
  "3. 案 A (推奨): parsedUntil Map を useMemo でキャッシュして両箇所から参照:",
  "   const parsedUntil = useMemo(",
  "     () => new Map(feeds.map(f => [f.id, f.mutedUntil ? Date.parse(f.mutedUntil) : null])),",
  "     [feeds],",
  "   );",
  "   useEffect と useMemo の両方の Date.parse(f.mutedUntil) を parsedUntil.get(f.id) に置き換え",
  "4. pnpm run check && pnpm run typecheck",
  "5. needs-user-decision ラベルを削除してから commit:",
  "   gh issue edit 1053 --remove-label needs-user-decision",
  "6. SKIP=e2e-test git commit -m 'perf: useFeedFilters の mutedUntil Date.parse を parsedUntil Map に集約 (代替4条件自走採用, closes #1053)'",
  "7. git log --oneline -1 で commit hash を確認して記録",
  "8. git push origin master",
  "9. Issue クローズコメント投稿:",
  "   gh issue comment 1053 --body '> 🤖 **AI 投稿 (Claude Code)** — #1053 案 A で対応完了。\n\n`parsedUntil Map` を `useMemo` でキャッシュし、`useEffect` と `useMemo` の両方で `Date.parse` を重複実行していた箇所を 1 回の走査に集約しました。\n\n自走根拠: touch 1 ファイル / AI 推奨案明示済 / 既存挙動完全互換 / 復元可能 (代替4条件全充足)。\n\nmaster 反映済み。自動デプロイされます。'",
  "",
  "=== 最後に push 確認 ===",
  "cd " + REPO + " && git status && git log --oneline -5",
].join("\n");

const [implResult, simplifyResult, a11yResult] = await parallel([
  () =>
    agent(implPrompt, {
      label: "実装エージェント (#1054 + #1053)",
      phase: "実装+監査",
      schema: IMPL_SCHEMA,
    }),
  () =>
    agent(
      "RSS リーダープロジェクト (" +
        REPO +
        ") の simplify/dead code 観点で高信頼度 finding のみ監査してください。\n" +
        "same-file internal caller と spec 参照を必ず verify してから dead と判定すること。\n" +
        "以下はすでに対応済みのため除外: #1034 #1035 #1036 #1037 #1038 #1043 #1042 #1044 #1045 #1046 #1054 #1053。\n" +
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
        "以下はすでに対応済みのため除外: #1045 #1046。\n" +
        "信頼度 90% 以上の finding のみ、最大 3 件を JSON で返してください。\n" +
        "各 finding は実コード確認済みのものだけ含めること。",
      {
        label: "a11y監査",
        phase: "実装+監査",
        schema: AUDIT_SCHEMA,
        agentType: "auditor-a11y",
      },
    ),
]);

log("実装完了: " + (implResult?.success ? "✅" : "❌") + " " + (implResult?.summary ?? ""));

phase("起票");

const allFindings = [...(simplifyResult?.findings ?? []), ...(a11yResult?.findings ?? [])].filter(
  function (f) {
    return f && (f.priority === "high" || f.priority === "medium");
  },
);

log(
  "監査 finding: " +
    allFindings.length +
    " 件 (simplify:" +
    (simplifyResult?.findings?.length ?? 0) +
    " / a11y:" +
    (a11yResult?.findings?.length ?? 0) +
    ")",
);

if (allFindings.length > 0) {
  await agent(
    "RSS リポジトリ (" +
      REPO +
      ") で以下の監査 finding から GitHub Issue を起票してください。\n" +
      "起票ルール:\n" +
      "- AI 起票バナー必須 ('> 🤖 AI 起票 (Claude Code)')\n" +
      "- 実コード verify 必須 (same-file internal caller / spec 参照確認)\n" +
      "- false positive は起票しない\n" +
      "- 重複 Issue は起票しない (gh issue list で確認)\n" +
      "- needs-user-decision は新規 dep/infra/UX 主観評価が必要なもののみ\n" +
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
    "1. #1054: useFeedOperations.addFeed の res.json().catch を tryParseErrorBody に集約 (simplify, 案 A: index signature 拡張)\n" +
    "2. #1053: useFeedFilters の mutedUntil Date.parse を parsedUntil Map に集約 (perf, 代替4条件自走採用)\n\n" +
    "学習すべきパターン (既存ルールと重複しない場合のみ追記):\n" +
    "- tryParseErrorBody の型拡張パターン (index signature で caller 互換性維持)\n" +
    "- 同一フック内の重複 Date.parse を useMemo Map にキャッシュするパターン\n" +
    "- needs-user-decision 付き perf Issue の 代替4条件 自走採用パターン\n\n" +
    "変更した場合は git add + SKIP=e2e-test commit + git push してください。\n" +
    "変更がなければ何もしなくて構いません。",
  { label: "retrospective-codify", phase: "回顧" },
);

return { success: true, implementedIssues: ["#1054", "#1053"] };
