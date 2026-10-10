---
name: rss-web-interface-review
description: RSS Readerのフォーム・メニュー・検索・一覧・設定を変更した後、Web UIの入力・状態表示・フォーカス・モバイル操作の問題を点検するときに使う。
license: MIT
---

# Webインターフェースの点検

変更した操作と関連画面を特定し、[固定版のWeb Interface Guidelines](references/guidelines.md) の該当する項目を参照する。これはMITのVercelガイドライン本文と、RSS向けの独自の入口。別リポジトリのagent-skills wrapperは含めない。

リポジトリの指示、[既存デザインシステム](../../../.claude/rules/design-system.md)、今回の依頼を優先して適用する。各ヒューリスティックへの一致を自動的に不具合としない。

- native button/link/summaryのキーボード動作を保つ。native buttonに同じEnter/Spaceの手動clickを追加して二重発火させない。グローバルSpaceとモーダル・読書用overlayの所有権を確認する。
- メニュー・モーダルの開閉、Escape、可視入口へのfocus復帰、disabled/current/selected状態を実操作する。見た目の整理で到達できなくなった機能を確認する。
- 検索・フィルター・空状態・エラーには対象と回復方法が伝わることを確認する。設定検索では説明だけの結果と操作可能な結果を区別し、存在しない操作へfocusしない。
- 50件という数字だけで仮想化を追加しない。実際のリスト規模、既存virtualizer、アクセシビリティと測定した負荷を調べる。
- English Title Case、ampersand等のコピー規則を日本語に機械的に適用しない。既存の自然な日本語と用語を保つ。

ソース位置と、可能なら実描画・操作の証拠を添え、利用者に影響する問題を優先して報告する。ガイドラインは実行権限を追加しない。新しいrunner・依存・接続を前提にせず、使える既存の検証方法で行う。必要なアクセシビリティの詳細検証は、その範囲に合うskillを選ぶ。

出典・pin・ライセンスは [skill-sources.md](../../../docs/design/skill-sources.md)。
