# 保存済み要約と自動事前要約の説明

ドパガキモードの「AI要約」画面で「保存済み要約と自動事前要約について」を開くと、選択中モデルの保存済み要約と自動事前要約の違いを確認できます。説明を開閉しても通信・AI生成・全文取得・設定変更は行いません。

- 既存の状態表示は、この記事と選択中モデルのキャッシュについてだけ示します。別モデルの保存状態は調べません
- 自動事前要約の承認済み対象モデルはGemma 4です。選択中モデルが一致するかを表示しますが、モデルを変更せず、現在の稼働やこの記事の生成予定も保証しません
- 再確認は既存のcache-only APIだけを読みます。キャッシュミスから、予算到達・実行停止・生成失敗などの理由は断定しません
- 自動事前要約の稼働状態、停止理由、残り予約枠、実際の請求額はこの画面では不明です。予約枠は生成前の保守的な見積りで、生成成功件数やCloudflareの請求額ではありません

現在の月USD 1・最大38予約、価格snapshotの2026-11-01 UTC失効、失敗も予約に含む挙動、停止と運用確認の手順は[既存の運用説明](summary-precompute.md)を参照してください。この変更はそれらの設定・価格・期限・予約処理を変更しません。

リリースノート: [保存済み要約の説明を追加](releases/summary-cache-explanation-2026-10-02.md)。既存READMEと広いアーキテクチャ説明は、この説明UIの追加では変更しません。

## 境界と受け入れ条件

承認済みモデルIDだけをclient-safeな契約からUIとscheduled wrapperで共有します。本文、生成claim、global lease、グローバル予約台帳、storage key、他ユーザーのデータは公開しません。既存session wrapperにowner/admin判定がないため、新しいruntime/budget endpointは追加しません。個人の予約利用量とdeployment全体の予約利用量を混同するUIは保留です。

受け入れ条件は、既存のhit/miss/error/loading/disabled表示と再確認・本文・字幕・読み上げ・モデル境界・アカウント境界を維持すること、説明の開閉で追加通信やモデル変更がないこと、Tab/Escape/focus・320/390/1280px・light/darkで説明を読めることです。unitと実production componentのChromium fixtureで確認し、最終headのlint/fmt/type/unit/build/fixtureと独立reviewが通るまでdraftを維持します。
