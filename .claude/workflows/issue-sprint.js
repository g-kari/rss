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

// ====================================================================
// Issue #1021: Codex 対応 — AGENTS.md シンボリックリンク作成
// ====================================================================
const implPrompt = [
  "あなたは RSS リーダープロジェクト (" + REPO + ") の実装担当エージェントです。",
  "以下の Issue を順番に実装し、各 Issue ごとに独立した commit を作成してください。",
  "各変更後に cd " +
    REPO +
    " && pnpm run check && pnpm run typecheck を実行してから commit すること",
  "",
  "=== Issue #1021: Codex 対応 — CLAUDE.md 制御ファイルの Codex 用シンボリックリンク ===",
  "背景: Claude Code は CLAUDE.md を制御ファイルとして使用するが、OpenAI Codex CLI は AGENTS.md を使用する。",
  "  同じ内容を両ツールで利用できるようにシンボリックリンクを作成する。",
  "",
  "実装手順:",
  "1. cd " + REPO,
  "2. AGENTS.md が存在しないか確認: ls AGENTS.md 2>/dev/null || echo 'not found'",
  "3. 存在しない場合、相対シンボリックリンク作成: ln -sf CLAUDE.md AGENTS.md",
  "4. 確認: ls -la AGENTS.md",
  "5. git add AGENTS.md && git commit -m 'feat: AGENTS.md → CLAUDE.md シンボリックリンク追加 (Codex 対応, closes #1021)'",
  "6. git push origin master",
  "7. Issue クローズコメント投稿:",
  "   gh issue comment 1021 --body '> 🤖 **AI 投稿 (Claude Code)** — Issue #1021 対応完了。\\n\\n## 対応内容\\n\\n`AGENTS.md → CLAUDE.md` シンボリックリンクを追加しました。\\n\\nOpenAI Codex CLI は `AGENTS.md` を制御ファイルとして参照するため、既存の `CLAUDE.md` へのシンボリックリンクを作成することで同一の設定・ルールを両ツールで共有できます。\\n\\n## 確認方法\\n\\n```bash\\nls -la AGENTS.md\\n# AGENTS.md -> CLAUDE.md と表示されること\\n```\\n\\n## commit\\n\\n`git log --oneline -1` で確認してください。'",
  "",
  "=== Issue #946: スヌーズショートカット — Case B 確定クローズ ===",
  "背景: #619 でユーザーが「処理残していいけどオミットします。」と明示。スヌーズ shortcut は意図的にオミット済み。",
  "  Case B (現状維持) が #619 のユーザー判断で確定しているため、Issue をクローズする。",
  "",
  "実装手順:",
  "1. needs-user-decision ラベル解除: gh issue edit 946 --remove-label needs-user-decision",
  "2. クローズコメント投稿:",
  "   gh issue comment 946 --body '> 🤖 **AI 投稿 (Claude Code)** — #619 のユーザー判断を確認。\\n\\n## 判断確定: 案 B（現状維持）\\n\\n#619 「スヌーズ機能いる？」でユーザーが「処理残していいけどオミットします。」と明示されていました。\\nスヌーズショートカット `z` は意図的なオミットであることが確認できたため、本 Issue は **案 B（現状維持）** として完了とします。\\n\\nバックエンド実装 (`snoozeArticle` / `snoozedUntil`) は将来再有効化する選択肢として残っています。'",
  "3. Issue クローズ: gh issue close 946",
  "",
  "=== Issue #908: /api/articles サーバーサイド全文検索 — 案 A / 案 B コスト試算 ===",
  "背景: ユーザーが「A,Bで試算して」とコメント。R2 コストを試算してから実装判断をする必要がある。",
  "",
  "試算して以下コメントを投稿してください:",
  "gh issue comment 908 --body '<試算結果>",
  "試算内容:",
  "- 案 A (GET /api/articles?q=...): R2 全ページスキャンコスト",
  "  * PAGE_SIZE=500 × MAX_PAGES=500 = 最大 250,000 記事",
  "  * 1 検索 = 最大 500 R2 Class B 操作 (読み取り)",
  "  * R2 Class B: $0.36 / 100万操作",
  "  * 1 検索あたりコスト: 500 / 1,000,000 × $0.36 = $0.00018",
  "  * 月 1,000 回検索: $0.18/月 (R2 コストのみ)",
  "  * 懸念: 全ページ逐次読み取りなので応答遅延が大きい",
  "",
  "- 案 B (KV 転置インデックス): KV 書き込み/読み取りコスト",
  "  * Cron (30分ごと) での KV 書き込み: KV write = $5 / 100万操作",
  "  * インデックス更新頻度: 48回/日 × 30日 = 1,440回/月",
  "  * KV 1MB/key 上限: 250,000 記事の転置インデックスは複数 key 分割必須",
  "  * 実装複雑度が高く、KV 書き込みコストが蓄積する",
  "  * 月インデックス更新コスト試算: 1,440 × (分割 key 数) / 1,000,000 × $5",
  "",
  "バナー: > 🤖 **AI 投稿 (Claude Code)** から始めること",
  "コメントに試算数値と推奨案を明記し、実装前にユーザー確認を促すこと",
  "",
  "=== 最後に push ===",
  "cd " + REPO + " && git status",
].join("\n");

const [implResult, auditResults] = await parallel([
  () =>
    agent(implPrompt, {
      label: "実装エージェント",
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
            "ARIA 属性の欠落, focus trap, キーボードナビゲーション, タッチターゲット 44px 未満, 類似コンポーネント間の乖離を調査してください。" +
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
            "実コードにあるが docs に未記載の主要 hook / lib を調査してください。" +
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
      "起票ルール: AI 起票バナー必須 ('> 🤖 AI 起票 (Claude Code)'), " +
      "needs-user-decision ラベルは新規 dep/infra/UX 主観評価が必要なもののみ, " +
      "実コードで false positive でないか必ず verify してから起票すること, 重複 Issue は起票しない, 最大 4 件\n\n" +
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
    "1. #1021: AGENTS.md → CLAUDE.md シンボリックリンクで Codex 対応\n" +
    "2. #946: #619 ユーザー判断 (オミット確定) を確認して Case B で Issue クローズ\n" +
    "3. #908: R2 コスト試算コメント投稿 (案 A / 案 B 比較)\n\n" +
    "既存ルールと重複する内容は追加しないこと。新しいパターンのみ追記。\n" +
    "変更した場合は git add + commit + push してください。",
  { label: "retrospective-codify", phase: "回顧" },
);

return { success: true, implementedIssues: ["#1021", "#946", "#908"] };
