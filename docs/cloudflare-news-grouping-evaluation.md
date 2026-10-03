# Cloudflare 製 Clef による日本語ニュース判定

確認日: 2026-10-03。基準 master: `141ad2095b7df3fc6300e5a977d402af18f90581`。

Jev の試験を取り消し、Cloudflare 製・Cloudflare-hosted の **Clef-flash** を評価ツールの既定にした。Clef も明示選択できる。実際の推論はまだ 0 回で、日本語の誤統合・保留率・左右反転の一致・速度は未測定。通常の RSS 表示、Gemma の要約、予算、Cron、AI binding を変更する追加ではない。

## 追加したもの

- `hosted-adapter.mjs`: Cloudflare-made の二つのモデルだけを受け付け、model-specific Workers AI REST の descriptor を生成する純粋関数。通信・認証・再試行・有料モデルへの fallback はない
- 入力の `model: "clef-flash"` / `"clef"` を、外側の `@cf/cloudflare/...` と一致させる。記事・日本語の評価基準は既存 108 件をそのまま使う
- モデルと実際の入力を capture hash に含める。Clef / Clef-flash / 過去の Jev 記録を取り違えず、choice、confidence、確率分布、evidence、usage を検証する
- 捕捉レスポンスのモデル名は選択した selector または完全なモデル ID との一致が必要。未確認の version 名は保留し、別モデルとして黙って受け入れない
- 順序反転を独立標本として数えない採用条件、全ソースを保持して解除できるシミュレーション、mock の精度を `null` にする契約を維持する。本番有効化は常に false

## 実行する

Node 22 以上。依存パッケージ、秘密情報、ネットワークは不要。

```sh
node --test scripts/evaluations/jev-news-grouping/*.test.mjs
node scripts/evaluations/jev-news-grouping/cli.mjs prepare > /tmp/clef-flash-requests.json
node scripts/evaluations/jev-news-grouping/cli.mjs prepare --model @cf/cloudflare/clef --split development
node scripts/evaluations/jev-news-grouping/cli.mjs prepare --split holdout
```

既定は Clef-flash の分類 100 + safety 8 = 108 件。案件系列で development 20 / holdout 80 を分け、holdout の品質は異なる 60 比較、反転耐性は別の 20 比較として報告する。モデルへ正解・系列・閲覧履歴・URL・画像・実記事は渡さない。

`adapter.body` だけが provider 入力で、pairId / requestHash / preflight はローカルの対応付け用。`adapter.pathTemplate` は `/accounts/{account_id}/ai/run/@cf/cloudflare/clef-flash`。gateway ID を追加せず通常の Workers AI 経路を使用する設計で、ログ・cache の抑制は request-level header として示す。これは実際に適用・検証された通信ではない。

後日、無料のみという条件を満たす実験で捕捉した JSON は次の形式にする。`response` は Cloudflare envelope の `result` を改変せず保持する。

```json
{
  "provenance": "captured-clef-flash",
  "results": [{ "pairId": "ja-pair-001", "requestHash": "生成時のSHA-256", "response": {} }]
}
```

```sh
node scripts/evaluations/jev-news-grouping/cli.mjs score --responses /tmp/clef-flash-captures.json --split holdout
node scripts/evaluations/jev-news-grouping/cli.mjs score --responses /tmp/clef-flash-captures.json --split safety
```

Clef は `--model @cf/cloudflare/clef` と `provenance: "captured-clef"` を使う。過去の Jev 形式は `--model typesafe/jev` でオフライン読み取りできるが、有料試験の許可は引き継がない。caller が申告する provenance はサービス実行の認証ではない。mock / 不正 / 欠測 / 混在は採用を通さない。

## 現行仕様と無料のみの条件

[Cloudflare の発表](https://developers.cloudflare.com/changelog/post/2026-10-01-clef-workers-ai/) と [Clef-flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/) は Cloudflare 製・Cloudflare-hosted の decision model と明記する。Flash は 9B、Clef は 27B。typed `noul` / `choice` / `score`、1–64 質問、65,536 token の context。choice は選択と各候補の確率、confidence を返す。画像にも対応するが、この RSS adapter は text-only である。

[Workers AI の料金](https://developers.cloudflare.com/workers-ai/platform/pricing/) は日次合計 **10,000 Neurons** の無料枠を Free / Paid 両方に付け、00:00 UTC にリセットする。枠はアカウント全体で共有する。**Paid では超過分が自動課金されるため、無料枠は厳密な $0 上限ではない。**

| モデル     | 入力 100万 token の価格相当 | 入力 100万 token の Neurons |
| ---------- | --------------------------: | --------------------------: |
| Clef-flash |                       $0.09 |                       8,182 |
| Clef       |                       $0.24 |                      21,818 |

1 件 1,000–3,000 input token と仮置きすると、108 件の Flash は 883.656–2,650.968 Neurons 相当。ただし tokenizer、実 usage、質問の計上方法を未測定なので、残枠の証拠や上限保証には使わない。`recordedUsage` の USD / Neurons も unit-price 相当で、課金額や無料消費の証明ではない。

通常の Workers AI 課金と [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/) は別経路。gateway の Workers AI billing を Unified billing にして選択すると prepaid credit を使う。既存 gateway や支払設定を変更せず、Jev の $0.05、Gemma の月 $1、他用途の予算を流用しない。

現在は日次の共有残量を検証できず、他の AI / Cron 利用に対して残枠を予約する仕組みもないため、`freeOnlyPreflight()` は **HOLD_FREE_QUOTA_UNVERIFIED**、`inferenceAllowed: false` を返す。`live` コマンドは存在しない。料金表の無料枠、古い dashboard の数字、推定 token 数だけで実験を始めない。無料のみの実行を保証できる経路・上限が確認できるまで、推論を止める。

将来実行する場合も 108 件一回、並列 1、再試行なし。development 後に閾値を固定し、holdout + safety を一度評価する。合成の小標本から実際の RSS 精度や自動非表示の安全性を主張しない。採用基準・可逆性・全ソース / 個々の既読状態の扱いは [元の評価設計](jev-news-grouping-evaluation.md) に従う。
