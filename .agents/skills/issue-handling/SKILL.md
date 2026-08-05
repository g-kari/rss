---
name: issue-handling
description: この RSS Reader リポジトリで GitHub Issue / PR の閲覧・起票・コメント・クローズ、それらを起点とする実装、または open Issue 0 件時の新規機能開発・リファクタリング・パフォーマンス改善を行うときに必ず使うプロジェクト固有ワークフロー。
---

# Issue handling (Codex entry point)

この skill は Claude Code と Codex で共有するワークフローへの Codex 用入口。

外部の Issue 自動処理 skill / plugin や別 workflow は起動しない。安全判定を含む処理は、以下の正本だけで完結させる。

作業を始める前に、リポジトリルートの
`.claude/skills/issue-handling/SKILL.md` を先頭から末尾まで読み、その指示に従うこと。
参照先から相対パスで指定されたファイルは、参照先のディレクトリを基準に解決する。

正本内の起票主体マーカーだけは実行中のエージェント名に合わせる。Codex から投稿する場合、
`AI 起票 (Claude Code)` / `AI 投稿 (Claude Code)` をそれぞれ
`AI 起票 (Codex)` / `AI 投稿 (Codex)` に置き換える。それ以外のチェックリスト、判断基準、
テンプレート、禁止事項は変更せず適用する。

ワークフローを更新するときは `.claude/skills/issue-handling/SKILL.md` の正本を更新し、
この入口に内容を複製しないこと。
