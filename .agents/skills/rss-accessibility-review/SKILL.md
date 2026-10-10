---
name: rss-accessibility-review
description: RSS Readerのキーボード・accessible name・フォーカス・コントラスト・タッチ領域・reflowを証拠付きで確認するときに使う。アクセシビリティの指摘や関連するUI変更の検証に適用する。
license: MIT
---

# アクセシビリティの証拠確認

まず変更した画面・操作・状態と、今回確認できる環境を特定する。[証拠と判断基準](references/evidence-checks.md) の関連項目を選び、リポジトリのデザイン・入力規則と併せて検証する。

accessible name、native semantics、キーボード操作、focusの行き先、現在状態、サイズ、色とreflowを具体的な要素で確認する。ソース、DOMテスト、実ブラウザー操作、computed style、画像、支援技術で分かったことを区別する。

既存のブラウザー・CI・テストを使う。このskillはLighthouse/axe等を自動インストールせず、sandboxやアクセス制限を変更しない。実ブラウザーが使えないときは、その検証を未実施として残す。

問題は対象・再現条件・利用者への影響・確認した証拠付きで報告する。自動ツールのスコアや警告ゼロを、完全なWCAG準拠の証明にしない。関連する手動・実操作の確認が終わるまで検証済みの範囲を広げない。

Addy Osmaniのweb-quality-skills/accessibilityをRSS用に改変した文章だけのskill。上流のツール実行・導入手順は含めない。出典と修正した数値条件は [skill-sources.md](../../../docs/design/skill-sources.md)。
