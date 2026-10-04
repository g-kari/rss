# 同じニュース判定のオフライン比較レポート

合成ニュースの二記事を並べて確認できる HTML レポートを追加したよ〜。108 比較の見出し・短文・媒体を読みながら、正解と理由を折りたたみから確認できるよっ。capture があると誤統合・危険な判定・欠測・正常な保留へ移動できるし、続報は別記事のままって分かるようにしたよ〜 🔎📄

- 実行: `node scripts/evaluations/jev-news-grouping/cli.mjs review > /tmp/news-review.html`
- 既存 JSON の `prepare` / `score`、モデル、閾値、採用条件は変更していない。
- 新規依存、通信、推論、認証、課金、本番 UI / API / Cron / 保存データの変更はない。
- capture なしは未評価、mock はモデル性能の証拠ではない。無料残量は未保証で、本番有効化は false のまま。
- 手順と制約: [Cloudflare ニュース判定評価](../cloudflare-news-grouping-evaluation.md)
