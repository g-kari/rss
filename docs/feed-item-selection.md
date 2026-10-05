# フィード本文変換前の項目選択

## 契約

更新処理は `parseFeed(xml, { maxItems: FEED_MAX_ITEMS })` を呼び、従来と同じ最新1000件を保存候補にする。上限を超える RSS / Atom / RDF / JSON Feed だけ、raw 項目の全日付を調べてから選択し、選ばれた本文の整形・抜粋・メタデータを作る。先頭1000件での打ち切りはしない。

- 項目数が上限以下なら、日付で並べ替えず発行者順を保つ。
- 日付は既存の ISO 文字列の降順比較。日付なしは空文字扱い、同じ日付の順番は入力順。epoch 値や GUID による別の優先順位は導入しない。
- RSS は `pubDate || dc:date`、RDF は `dc:date || pubDate`。Atom は `published ?? updated` なので空・不正な published から updated へは切り替えない。JSON は date_published の解析結果が null の場合、date_modified の解析結果へ切り替える。
- GUID・表示リンク・本文・抜粋・著者の継承・カテゴリ・画像・独自メタデータの変換は変更しない。
- XML 全体の strict / lenient パースと nested content の入力位置対応での復元は、選択より前に全項目に実行する。
- XML の coercion method を上書きする特殊ノードや非標準型の JSON 項目は、全件変換してから制限する互換経路へ戻す。捨てられる項目の従来の変換エラーを隠さない。
- `parseFeed(xml)` / `parseFeed(xml, {})` は従来どおり無制限。maxItems は0以上の safe integer のみで、0は空の項目配列を返す。

fetch 前の permit、10 MiB 本文制限、解析深度、ストレージ・通知処理は変更しない。この選択は、全フィードを streaming XML に変える仕組みではない。

## 合成データでの確認 (2026-10-05)

元コードは master `6ca184ce6a477a00655921664005894a2d91a89b` の Git blob と照合した16ソース入力から作成した bundle を使用。Node 24.19.0 / Linux x64 / fast-xml-parser 5.11.2、ネットワーク・認証・保存なしで比較した。

6条件 × 元版/候補 × 5回の fresh process を交互順で実行し、本文パースから従来の最後の選択までを計測した。各入力は合成フィードで、10 MiB ケースは10,484,736 bytes未満。

| 条件                             | 元版の中央値 | 候補の中央値 | 時間の変化 |
| -------------------------------- | -----------: | -----------: | ---------: |
| RSS 10,000件 / compact           |     336.4 ms |     271.3 ms |     −19.4% |
| Atom 10,000件 / compact          |     356.1 ms |     307.3 ms |     −13.7% |
| RSS 10,000件 / 約10 MiB          |     409.7 ms |     299.2 ms |     −27.0% |
| RSS 10,000件 / nested / 約10 MiB |     847.9 ms |     692.3 ms |     −18.3% |
| RSS 1,000件 / 約10 MiB           |     180.8 ms |     178.8 ms |      −1.1% |

compact 1,000件の fresh process は、共有ホストの並行作業と冷起動の分散が大きく、56.4→111.5 msとなった。一部の並行作業を止めた4秒間の追加20 processでも50.4→56.1 msだったが、既存レンダーが混在したため、隔離測定とは扱わない。

起動・fixture 生成を除いた同一 process 内の warm 交互比較も実施。各 parse の前に計測外の GC を行い、compact 1,000件を30組、約10 MiB 1,000件と compact 10,000件を各10組計測した。

| 条件                 |   時間 元版→候補 | process全スレッドCPU 元版→候補 |
| -------------------- | ---------------: | -----------------------------: |
| compact RSS 1,000件  |   34.15→33.96 ms |                 65.12→64.99 ms |
| 約10 MiB RSS 1,000件 | 170.90→168.84 ms |               209.38→207.64 ms |
| compact RSS 10,000件 | 237.14→197.85 ms |               324.07→290.03 ms |

この環境では大きなフィードの本文変換削減と warm な通常経路の回帰なしを確認した。冷起動時間の差は未確定。JSON/RDF の性能や本番フィードの分布は未計測。

### メモリと適用範囲の制約

10,000件の process peak RSS 改善は中央値で約1～2 MiBに留まった。全 raw XML tree、nested な場合の第二の tree、全日付の並べ替えは残る。Node の process RSS/全スレッドCPUは Workers の isolate heap/CPUと同じ指標ではなく、128 MiB上限での安全性や cron 全体のメモリを証明しない。R2/D1・記事構築・シリアライズ・同時実行の実環境計測は別途必要。

## 互換性の検証

`src/lib/xml-parser.limit.test.ts` は4形式の0/1/999/1000/1001/1200件、日付 fallback、等しい日付と欠落日付、拡張年の文字列順、nested 本文の対応、強制 strict→lenient fallback、無制限 default、非標準型の除外項目を検証する。`src/cron/fetch.test.ts` は更新処理が1000件の選択を要求することも確認する。

別途、元版の immutable bundle と候補で57 fixtureの全出力フィールド・エラーメッセージの一致を確認した。候補の無制限経路と比較する unit testだけを、元版との独立互換確認の代用にはしていない。
