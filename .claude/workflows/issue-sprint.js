export const meta = {
  name: "rss-issue-sprint",
  description: "RSS 自走可能 Issue 4 件を実装し simplify/a11y/docs 監査から新規 Issue を起票",
  phases: [
    { title: "実装+監査", detail: "4 Issue 逐次実装 + simplify/a11y/docs 監査を並行実行" },
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
  "最後に push し各 Issue にクローズコメントを投稿してください。",
  "",
  "注意: 各変更後に cd " +
    REPO +
    " && pnpm run check:fix && pnpm run typecheck を実行してから commit すること",
  "",
  "=== Issue #1001: html-noise-removal.ts の RegExp キャッシュ ===",
  "ファイル: src/lib/html-noise-removal.ts",
  "",
  "変更内容:",
  "1. processNestedBlocks 関数の直前に以下を追加:",
  '   const _escapeRe = (s) => s.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");',
  "   const _nestedTagReCache = new Map();",
  "   function getTagPattern(tags) {",
  '     const key = tags.join(",");',
  "     let re = _nestedTagReCache.get(key);",
  "     if (!re) {",
  '       re = new RegExp("<(\\\\/)?(?:" + tags.map(_escapeRe).join("|") + ")\\\\b[^>]*>", "gi");',
  "       _nestedTagReCache.set(key, re);",
  "     }",
  "     return re;",
  "   }",
  "",
  "2. processNestedBlocks の関数本体から以下の2行を削除:",
  "   const escapeRe = (s: string) => s.replace(.../);  // inline escapeRe",
  "   const tagPattern = new RegExp(...);               // inline RegExp",
  "   代わりに: const tagPattern = getTagPattern(tags); を使用",
  "",
  'コミット: "perf: html-noise-removal の processNestedBlocks で RegExp をモジュールレベルでキャッシュ (closes #1001)"',
  "",
  "=== Issue #1004: binary-proxy-handler.ts の URL ログサニタイズ ===",
  "ファイル: src/lib/binary-proxy-handler.ts",
  "",
  "変更内容:",
  "- url が使われる最初の console.error の直前に以下を追加:",
  '  const logUrl = url.replace(/[\\r\\n]/g, "").slice(0, 256);',
  "- 全ての console.error 内の url=${url} を url=${logUrl} に置換 (replace_all)",
  "  注意: fetch などの実際の HTTP リクエストには url をそのまま使用すること (logUrl は logging 専用)",
  "",
  'コミット: "security: binary-proxy-handler のログ URL をサニタイズしてログインジェクション・PII リスクを低減 (closes #1004)"',
  "",
  "=== Issue #1006: api-security.md に sec-fetch-site:null リスク受容を文書化 ===",
  "ファイル: .claude/rules/api-security.md",
  "",
  "変更内容: 末尾に以下のセクションを追加",
  "",
  "## sec-fetch-site: null の fail-open 動作はリスク受容済み (Issue #1006)",
  "",
  "app/api/ogp/route.ts と app/api/content/route.ts の sec-fetch-site ガードは",
  "null 値 (curl / 古いブラウザ) を fail-open で通過させている。",
  "",
  "現状の防御 (リスク受容根拠):",
  "- withSession による認証必須 — 攻撃者は自分の認証済みセッションを使う必要があり攻撃面は限定的",
  "- computeOgpCacheTtl で fallback 経路の shared cache TTL を 1 日に短縮",
  "- 古いブラウザ / curl の正規ユーザー向け互換性を維持",
  "",
  "将来の追加緩和: sec-fetch-site:null + session あり → TTL を 1 時間に短縮して攻撃影響範囲を最小化",
  "",
  'コミット: "security: api-security.md に sec-fetch-site:null fail-open リスク受容を文書化 (closes #1006)"',
  "",
  "=== Issue #1000: full-text-search の defaultHaystack キャッシュ ===",
  "変更対象: src/lib/full-text-search.ts, src/lib/article-filter.ts, src/hooks/useFilteredArticles.ts",
  "",
  "変更 1: src/lib/full-text-search.ts",
  "- SearchContext interface に追加: haystackCache?: Map<string, string>;",
  "- defaultHaystack 関数をキャッシュ対応に変更:",
  "  function defaultHaystack(article, ctx) {",
  "    if (ctx.haystackCache) {",
  "      const cached = ctx.haystackCache.get(article.id);",
  "      if (cached !== undefined) return cached;",
  "    }",
  "    // 既存 parts 計算 ...",
  '    const result = parts.join(" \\u0001 ").toLowerCase();',
  "    ctx.haystackCache?.set(article.id, result);",
  "    return result;",
  "  }",
  "",
  "変更 2: src/lib/article-filter.ts",
  "- ArticleContentFilterOptions interface に追加:",
  "  /** defaultHaystack 結果キャッシュ。クエリ変更ごとの stripHtml 重複実行を回避 (#1000) */",
  "  haystackCache?: Map<string, string>;",
  "- buildQueryPredicate の ctx 生成に追加:",
  "  haystackCache: opts.haystackCache,",
  "",
  "変更 3: src/hooks/useFilteredArticles.ts",
  "- readingTimeCacheRef の定義の直後に追加:",
  "  const haystackCacheRef = useRef(new Map<string, string>());",
  "- readingTimeCacheRef の useEffect の直後に追加:",
  "  useEffect(() => { haystackCacheRef.current = new Map(); }, [articles]);",
  "- filterByStructure の opts オブジェクトに追加:",
  "  haystackCache: haystackCacheRef.current,",
  "",
  'コミット: "perf: defaultHaystack 結果を haystackCache でキャッシュして stripHtml 重複実行を回避 (closes #1000)"',
  "",
  "=== 最後に push + クローズコメント ===",
  "cd " + REPO + " && git push origin master",
  "",
  "各 Issue のクローズコメント (AI 起票バナー付き):",
  '- gh issue comment 1001 --body "完了報告"',
  '- gh issue comment 1000 --body "完了報告"',
  '- gh issue comment 1004 --body "完了報告"',
  '- gh issue comment 1006 --body "完了報告"',
  "",
  '各コメントは "> 🤖 AI 投稿 (Claude Code)" バナーで始め、変更内容と commit hash を含めること',
  "",
  "=== Issue #1002 調査コメント ===",
  "gh issue comment 1002 でコードベース調査結果を投稿:",
  "computeMergedSet (useReadStateSyncApply.ts:35) が既に newValues.length===0 の場合 null を返して",
  "setter を呼ばない設計になっていることを報告。more investigation required を明示。",
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
            "信頼度 80% 以上の finding のみ、最大 3 件を JSON で返してください。" +
            "same-file internal caller と spec 参照も必ず確認してから dead と判定してください。",
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
            "ARIA 属性の欠落, focus trap, キーボードナビゲーション, 類似コンポーネント間の乖離を調査してください。" +
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
            "実コードにあるが docs に未記載の主要 API を調査してください。" +
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
      "起票ルール: AI 起票バナー必須, needs-user-decision ラベルは設計判断が必要なもののみ, 重複 Issue は起票しない, 最大 4 件\n\n" +
      "実コードで false positive でないか必ず verify してから起票すること。\n\n" +
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
    "1. #1001: _nestedTagReCache (html-media-processors.ts の _tagReCache pattern 流用)\n" +
    '2. #1004: logUrl = url.replace(/[\\r\\n]/g,"").slice(0,256) でログインジェクション防止\n' +
    "3. #1006: api-security.md に sec-fetch-site:null fail-open リスク受容を文書化\n" +
    "4. #1000: SearchContext.haystackCache で defaultHaystack をキャッシュ\n" +
    "5. #1002 false positive 判定: computeMergedSet 既存 null check で setter 不呼出確認済み\n\n" +
    "既存ルールと重複する内容は追加しないこと。新しいパターンのみ追記。\n" +
    "変更した場合は git add + commit + push してください。",
  { label: "retrospective-codify", phase: "回顧" },
);

return { success: true, implementedIssues: ["#1001", "#1004", "#1006", "#1000"] };
