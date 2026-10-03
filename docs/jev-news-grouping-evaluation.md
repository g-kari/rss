# Jev による「同じニュース」判定の日本語評価準備

**2026-10-03 更新:** 実験対象を Cloudflare 製・Cloudflare-hosted の Clef-flash に変更した。Jev の有料試験は取り消し。現在の CLI の既定モデル、無料枠の停止条件、モデル別 capture は [Clef 評価手順](cloudflare-news-grouping-evaluation.md) を参照する。以下の Jev 仕様・費用提案は 2026-10-02 時点の履歴であり、現行の実行許可ではない。

確認日: 2026-10-02。基準コード: `d3c81e826013cf0eec0112b10907edaa580c63f9`。

**現在はオフライン準備のみ。Jev を一度も呼んでおらず、日本語の精度・速度・実料金は未測定。本番採用判定は HOLD。**

## 既存機能との境界

- `src/hooks/useFilteredArticles.ts` は、すでに同一 URL の重複を非表示にし、他のフィード名を `duplicateInfo` に残す。`deduplicateByLink` で制御する既存機能である
- `src/lib/article-recommendations.ts` はローカルの新着・話題・フィード・明示設定で順位を決める。推薦の説明値は AI の確率ではない
- 今回の対象は、URL が違う記事同士の「同じ出来事 / 続報 / 別件」の判定。この評価パッケージは上記の処理を変更せず、UI・API・Cron・R2・KV・設定・通常表示・没入表示にも接続していない
- README、既存リリースノート、依存パッケージは変更しない

## 評価データ

`scripts/evaluations/jev-news-grouping/corpus.mjs` は全文を新規に書いた架空の日本語記事である。公開記事の転載、購読情報、ユーザーの閲覧履歴は含まない。

分類用は 25 の案件系列 × 4 比較 = 100 ケース。同じ出来事 34、続報 33、別件 33。実質 75 の異なる比較に、左右反転 25 ケースを足している。反転ケースは独立標本として精度や採用ゲートを水増ししない。

- development: 5 系列・20 ケース。異なる比較は各クラス 5 件ずつ
- holdout: 残り 20 系列・80 ケース。異なる比較は各クラス 20 件ずつ。development と案件系列を共有しない
- safety: 別枠で 8 ケース。出来事を特定する情報が足りないため、三分類の正解を捏造せず「保留して統合しない」を要求する

カバー範囲: 版番号、開催年度、別製品、地域・障害時刻、JST/UTC、ベータから正式化、噂から公式発表、候補から受賞、訂正・復旧・延期、同じ見出しの別試合、再掲載と続報、複数ニュース混在、引用内の悪意ある分類命令。掲載日時が設定されていない合成記事は `null` とし、本文の出来事の日時と矛盾する架空メタデータを付けない。

正解・理由・系列・左右反転対応はローカル側だけに置く。外部リクエストの識別子も `ja-pair-001` などの不透明 ID にした。モデルへ渡す `input` は記事の見出し・短文・掲載日時・合成媒体名と評価基準だけである。

## オフラインで実行する

Node 22 以上を使用する。新しいパッケージ、認証、環境変数は不要。

```sh
node --test scripts/evaluations/jev-news-grouping/policy.test.mjs
node scripts/evaluations/jev-news-grouping/cli.mjs prepare --model typesafe/jev > /tmp/jev-requests.json
node scripts/evaluations/jev-news-grouping/cli.mjs prepare --model typesafe/jev --split development > /tmp/jev-development.json
node scripts/evaluations/jev-news-grouping/cli.mjs prepare --model typesafe/jev --split holdout > /tmp/jev-holdout.json
node scripts/evaluations/jev-news-grouping/cli.mjs prepare --model typesafe/jev --split safety > /tmp/jev-safety.json
```

`prepare` はデータを stdout に出すだけで通信しない。デフォルトは分類 100 + safety 8 = 108 リクエスト。実行用 API アダプター、秘密情報、デプロイ設定、`live` コマンドは存在しない。

後日、許可された実験で保存したレスポンスは次の形にする。`response` はサービスの JSON を改変せず保存する。`pairId` と `requestHash` は生成したリクエストから対応付ける。REST の Cloudflare エンベロープを使う場合は、その `result` の内側を `response` とする。

```json
{
  "provenance": "captured-jev",
  "results": [{ "pairId": "ja-pair-001", "requestHash": "生成時のSHA-256", "response": {} }]
}
```

```sh
node scripts/evaluations/jev-news-grouping/cli.mjs score --model typesafe/jev --responses /tmp/jev-captures.json --split holdout
node scripts/evaluations/jev-news-grouping/cli.mjs score --model typesafe/jev --responses /tmp/jev-captures.json --split safety
```

`HOLD` は終了コード 2。欠測・重複・ハッシュ不一致・未知のケース・不正な出力も HOLD になる。記録の provenance は呼出者の申告であり、このツールがサービス実行を認証するものではない。`mock` と明示した記録は accuracy / macro-F1 / Brier を `null` とし、採用判定を通さない。テスト内の手作りレスポンスはモデルの性能証拠ではない。

## 判定と安全性

`policy.mjs` は三択の `relationship` と、情報が十分かの `sufficient_evidence` を別々に質問する。レスポンスのラベル集合・確率合計・選択肢と最大確率の一致・有限値・usage・Jev のモデル識別子を検証する。`confidence` を最高確率と同一視しない。

暫定の保留基準は固定してから holdout を評価する:

- 統合: `same_event` 確率 ≥ 0.985、confidence ≥ 0.95、次点との差 ≥ 0.95、十分な証拠の確率 ≥ 0.95
- 続報 / 別件: 最高確率 ≥ 0.85、confidence ≥ 0.75、次点との差 ≥ 0.6、十分な証拠の確率 ≥ 0.95
- 条件を満たさない、情報不足、スキーマ不正、モデル不一致、重複レスポンス: 保留。記事は別々に残す
- 続報は関連づけ候補にするだけで統合しない。重要な追加情報を隠さない

これは日本語で実証した確率校正ではない。保留が多ければ、閾値を黙って下げず development で再検討し、新しい未見データで評価し直す。

`projectGroups` は、呼出側がすでに絞り込んだ記事だけを受け取り、既定で無効。A-B と B-C が同じでも A-C が未確認 / 別件なら 3 件に連鎖統合しない complete-link 方式を採る。グループは全記事オブジェクトをそのまま保持し、ID・媒体・本文・個々の既読 / 保存状態を変えない。`unrollGroups` で元の順序・オブジェクトに戻る。これはシミュレーションで、既存 UI を検証済みとするものではない。

将来 UI に接続する際の不変条件:

1. フィード・検索・期間・既読・保存・ミュートなどの対象範囲を先に確定する。グループ化によって隠れた記事を復活させない
2. 同一 URL の既存処理も含め、全ソースの ID と原文リンクを保持する設計にする。現在の媒体名だけの `duplicateInfo` を、全記事保持ができたと誤認しない
3. 代表を読むだけで他ソースを既読にしない。「全ソースを見る」「この統合を解く」を用意し、解除時に既読・保存・順番を失わない
4. 続報は別カード。通常 / 没入の双方で開ける。没入モードの再生キュー・次へ / 戻る・表示済みカードの継続性を維持する
5. 既存推薦スコアや興味設定には判定確率を混ぜない。無効化すれば既存動作へ戻る
6. 一覧の描画中に API を呼ばない。候補数を制限した非同期評価にし、失敗・期限切れは非統合に戻す。全記事の総当たりを行わない

## 採用ゲート

holdout 80 + safety 8 のサービス記録が必要。分類の品質計算には holdout の異なる 60 比較だけを使い、反転 20 件は順序耐性の別指標にする。

- 誤統合 0 件。続報・別件を same_event にする損失を 20、その他の誤りを 1 または 2 として明示的に重くする
- 異なる同一出来事の比較で 20 件の統合判定。反転の再判定はこの件数に加えない
- 続報 recall ≥ 0.85、macro-F1 ≥ 0.80、反転による分類・保留の食い違い 0
- safety 8 件はすべて正常なレスポンスで保留。欠測や壊れたレスポンスを「情報不足を正しく見抜いた」と数えない
- 欠測 / 重複 / ハッシュ不一致 / 不正レスポンス / 未知ケースなし

通っても結果は `PILOT_PASS_REVIEW_ONLY`。本番有効化は常に false のまま。合成の小標本で実際の RSS の品質は確立しない。誤統合が 0 / 40 の異なる非同一比較でも、独立を仮定した Wilson 95% 上限は約 8.8%。さらに同じ系列内の比較には依存がある。レポートの区間は参考計算であり、実運用の稀な誤り率を保証しない。次段階は許可された公開・利用可能な実記事で、人が確認するシャドー評価。自動非表示への移行は別の判断にする。

## 現行の外部サービス仕様

[Cloudflare の Jev ページ](https://developers.cloudflare.com/ai/models/typesafe/jev/) は `typesafe/jev`、32,000 token、入力 $0.042 / 100万 token、出力・キャッシュ入力 $0 と表示している。typed `noul` / `choice` / `score` を受け取り、選択と確率・confidence・usage を返す。[入力スキーマ](https://developers.cloudflare.com/ai/models/typesafe/jev/schema-input.json) と [出力スキーマ](https://developers.cloudflare.com/ai/models/typesafe/jev/schema-output.json) を確認した。モデルを `input` に混ぜない。Cloudflare スキーマで質問数の上限は確認できず、Clef の上限を移植しない。

[TypeSafe](https://docs.typesafe.ai/api) は Choice 最大 255 選択肢を記載する。[言語サポート](https://docs.typesafe.ai/models#language-support) では英語が最良で、CJK は対応するが精度が下がると説明している。日本語の品質や confidence の有効性を英語の説明から推定しない。

Jev は Cloudflare-hosted の通常モデルと異なる第三者サービス。[Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/) ではプリペイド credit、購入時 5% 手数料、provider 料金の通過課金が説明されている。BYOK の既定キーが使われると支払先・ZDR 適用が変わる。既存アカウントの実経路・残高・必要条件は未確認。無料 neuron 枠を Jev に使えるとは扱わない。[Gateway 制限](https://developers.cloudflare.com/ai-gateway/reference/limits/) の Unified Billing は gateway ごとに 200 requests / 60秒。provider 側の上限をそのまま Cloudflare に当てはめない。

モデルの ZDR 表示は end-to-end のログ無保存を意味しない。Unified Billing の ZDR は Cloudflare 管理の provider 接続に適用し、Gateway の logging は別設定。[ログ](https://developers.cloudflare.com/ai-gateway/observability/logging/) は既定で有効で、リクエスト / レスポンスを含み得る。将来の実験は `cf-aig-collect-log: false` などの適切な設定と、payload・cache・Worker ログを確認してから実行する。今回は合成データのみでも設定を勝手に変更しない。

[TypeSafe privacy](https://typesafe.ai/legal/privacy-policy)、[MCA](https://typesafe.ai/legal/mca)、[DPA](https://typesafe.ai/legal/data-processing) の一般条項には不正防止・法令等の取扱いがある。Cloudflare 経由の ZDR の例外・契約優先・subprocessor 範囲は公開バッジだけから確定できない。購読リスト、private URL、記事全文、ユーザーの閲覧・保存情報はこの実験に送らない。

## 有料テストの提案と開始条件

提案は **合成 108 比較を一回だけ、1 比較 1 request、並列 1、再試行なし、Jev 入力推論費用の上限 $0.05 USD**。これは承認待ちの案で、実行済みでも支出許可でもない。他モデルに許可された予算を流用しない。

生成時の最大 payload は 2,285 UTF-8 bytes / 1,089 Unicode 文字。Jev tokenizer が未測定のため、二つの質問の rubric と内部 overhead を含めて 1 request の billed input を 1,000–3,000 token と仮置きする。108 件なら 108,000–324,000 token、掲載価格で **$0.004536–$0.013608**。これは予測。出力課金・キャッシュ割引は 0 としている。32K × 108 の $0.145152 は全コンテキスト使用時の参考値で、複数質問の課金方法を確認する前の上限保証には使えない。

開始前に必要なもの:

1. Jev を対象にした一回の $0.05 上限の承認。既存 credit の使用を前提とし、credit 購入・auto top-up・新規認証・権限追加は別途確認する。手数料・税・最低購入額が必要なら総額を示して承認を取り直す
2. 対象 account / gateway / 支払経路・モデル価格・利用条件・ログ / cache 設定の読み取り確認。新しい規約の明示受諾が必要なら先に提示する
3. 現行の billed input の数え方と一回の最大課金を確認。未確認なら API を呼ばない
4. 実支出 + 次の 1 回の検証済み最大費用が $0.05 を超える前に停止。108 request の上限も別に守る。Gateway の spend limit だけに頼らない。[Spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/) は完了後計上・eventually consistent なので、それ単独では厳密な支出上限にならない
5. development の確認後に基準を固定し、holdout + safety を一度評価する。途中のエラー・想定外 usage・課金・ログ・規約があれば停止して報告する

この準備を merge しても API 課金・実験・UI の統合・本番有効化は始まらない。
