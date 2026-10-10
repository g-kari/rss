# RSS向けデザインskillの出典と適応

この3つのproject skillは文章だけの設計・レビュー支援。Codexのproject discovery用 `.agents/skills/` に置く。元のrunner・installer・binary・hook・MCP設定を含まず、実行権限や公開権限を追加しない。

## 使い分け

- [rss-design-review](../../.agents/skills/rss-design-review/SKILL.md): 画面の主目的、情報の優先順位、読書と管理の密度、全体の見た目を判断する。
- [rss-web-interface-review](../../.agents/skills/rss-web-interface-review/SKILL.md): フォーム・検索・メニュー・設定等の通常のWeb UI動作を点検する。
- [rss-accessibility-review](../../.agents/skills/rss-accessibility-review/SKILL.md): 関連するキーボード・名前・色・サイズ・reflowを詳細に検証する。

依頼と変更に合うskillを選び、必要なreferenceだけを読む。毎回3つすべてを同時に読むことや、固定人数のreview panelは要求しない。プロジェクトの指示、[デザインシステム](../../.claude/rules/design-system.md)、最新の採用方針を優先する。

## 固定した出典

| 適応先                   | 元のrepositoryとcommit                                                                                                                        | 対象                                                                               | ライセンス                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| rss-design-review        | [pbakaus/impeccable](https://github.com/pbakaus/impeccable/tree/d631a8827f99414d2b6daba4ef08b7f8701751d7)                                     | Read / Operate / layout / typeset / polish、skillの構成を調査し、RSS用の文章へ改変 | [Apache-2.0](licenses/impeccable-Apache-2.0.txt)、[元のNOTICE](licenses/impeccable-NOTICE.md) |
| rss-web-interface-review | [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines/tree/434b7f91364665f2f733b310ec54809bf8f37937) | command.mdの固定版をreferenceへ原文収録し、独自の入口を作成                        | [MIT](licenses/vercel-MIT.txt)                                                                |
| rss-accessibility-review | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills/tree/afa8da942115f2961fdbfa80807ea0b232ff6c00)               | accessibilityの点検観点をRSS用の文章へ改変                                         | [MIT](licenses/web-quality-MIT.txt)                                                           |

原文を調査したファイルのexact commit、Git blob SHA、SHA-256、byte数、取得日時は [skill-source-lock.json](skill-source-lock.json)。適応文は元のファイルと同一ではないため、元のdigestを適応文のdigestとして扱わない。上流やOpenAIの公式認定・endorsementを意味しない。

ImpeccableのNOTICEは改変せず保存した。そこに記載された他のplatform/referenceを、このbundleへ別途収録したという意味ではない。ここで改変したApache-2.0の文章はrss-design-reviewのSKILLとreading-and-operating referenceのみ。

## 適応時の変更

- Impeccableの自動context/detector/agent coordinationとplatform engine downloadは除いた。自動Impeccable scanや上流コマンドを提供すると説明しない。
- Vercelのagent-skills wrapperは収録していない。guidelines repositoryのMITは別repositoryのwrapperへ推定で適用しない。native buttonのEnter/Space、virtualizationの閾値、日本語のコピー規則はRSSの実態へ適応する。
- Addyの自動Lighthouse/axe導入とツール指定は除いた。large textのcontrast条件をW3Cのpoint/CSS px区別に修正した。18ptは24 CSS px、14ptは約18.67 CSS pxであり、18px/14pxではない。[W3C 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- 既存のcompact 3ペイン、semantic tokens、inline SVG、12pxの操作ラベル下限、fine 32px / coarse 44px、読書11常用操作と副次disclosure、focus/Space所有権を判断基準へ組み込んだ。
- 実描画と実操作をソース推論から区別し、同条件の比較・exact tested source・未検証範囲を要求する。静止画像や自動スコアだけで全体の操作性・WCAG準拠を宣言しない。

今後更新するときは新しいexact commitとlicenseを再確認し、差分を読み、lockを更新する。mutable `latest`へ自動追従しない。
