# R2 バックアップ / ディザスタリカバリ手順

R2 バケット `rss-reader-data` に保存されているユーザーデータ・共有フィード・AI キャッシュを運用中に喪失させないためのバックアップ戦略と復旧手順をまとめる。

> **対象読者**: 本プロジェクトの運用者 (master ブランチを管理し、Cloudflare アカウントへのアクセス権を持つ者)。
> **前提**: `wrangler.toml` の `[[r2_buckets]]` で `binding = "RSS_DATA"` / `bucket_name = "rss-reader-data"` が定義済みであること。

## なぜ必要か

- **ユーザーデータ喪失リスク**: 購読リスト (`users/{userId}/subscriptions.json`)、既読状態 (`users/{userId}/read-state.json`)、ノート・スヌーズ・ブックマークはすべて R2 にしか存在しない。ロールバック・誤削除・バケット破損で即座に失われる。
- **Cloudflare R2 はバージョニング非対応**: オブジェクト上書き時の履歴が自動保持されない。誤って `subscriptions.json` を空配列で上書きすると元に戻せない。
- **共有フィードは再取得可能だが過去ログは消える**: `feeds/{feedHash}/articles/p{N}.json` にカスケードされた過去ページは外部 RSS に残っていない場合が多く、一度消すと復元不能。
- **AI キャッシュの再計算は Workers AI コスト**: `ai-cache/` は運用コスト最適化の観点でバックアップ対象。

## R2 ストレージ構造 (バックアップ対象)

詳細は [README.md の「データ構造 (R2)」](../README.md#データ構造-r2) を参照。バックアップ観点での分類:

| プレフィックス      | 復旧優先度 | 理由                                                                          |
| ------------------- | ---------- | ----------------------------------------------------------------------------- |
| `users/{userId}/`   | **最高**   | ユーザー固有データ。喪失すると復元不能。毎日バックアップ推奨                  |
| `feeds/{feedHash}/` | 中         | 共有フィードメタ・記事ページ。cron が数十分で再生成可能だが過去記事は失われる |
| `ai-cache/`         | 低         | 要約・翻訳。失っても Workers AI で再計算可能（コスト発生のみ）                |

> **備考**: `userId` は JWT の `sub` クレームそのもの。セッション発行時に `^[A-Za-z0-9_\-@.]{1,128}$` でバリデーションされているため (`src/lib/server-auth.ts`)、R2 キー上で `/` を含まないことが保証される。バックアップスクリプトで `userId` にワイルドカードを使う際に安全。

## バックアップ方法

### 方法 1: `rclone` でフルスナップショット（推奨）

最も安定した方法。差分同期により再実行時の転送量を抑えられる。

#### 初回セットアップ

1. Cloudflare R2 の API トークンを発行 (`R2 > Manage R2 API Tokens > Create API Token`、権限は `Admin Read & Write`)。発行される **Access Key ID** / **Secret Access Key** / **Account ID** を控える。
2. `rclone config` で R2 用リモートを登録:

   ```
   type           = s3
   provider       = Cloudflare
   access_key_id  = <控えた Access Key ID>
   secret_access_key = <控えた Secret Access Key>
   endpoint       = https://<account_id>.r2.cloudflarestorage.com
   acl            = private
   ```

   リモート名は例として `r2` とする。

#### 日次スナップショット

```bash
DATE=$(date +%Y%m%d)
rclone sync r2:rss-reader-data ./backups/${DATE} \
  --transfers 8 \
  --checksum \
  --log-file ./backups/${DATE}.log
```

- `--checksum`: サイズではなく SHA-256 比較で差分検出。R2 → ローカルの整合性担保。
- `--transfers 8`: 並列転送数。R2 のレートリミットに注意しつつ運用環境に合わせて調整。
- ローカル側は日付ディレクトリにフル同期する想定（世代管理を兼ねる）。

#### S3 互換ストレージへのクロスクラウド複製

AWS S3 にリモート `s3:` を登録すれば、R2 → S3 の直接コピーも可能:

```bash
rclone sync r2:rss-reader-data s3:rss-reader-backup-$(date +%Y%m%d) \
  --transfers 8 --checksum
```

### 方法 2: `aws s3` CLI（S3 互換 API 経由）

R2 は S3 API 互換なので、AWS CLI でも同等の操作が可能。

```bash
export AWS_ACCESS_KEY_ID=<R2 Access Key ID>
export AWS_SECRET_ACCESS_KEY=<R2 Secret Access Key>
export R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com

aws s3 sync s3://rss-reader-data ./backups/$(date +%Y%m%d) \
  --endpoint-url $R2_ENDPOINT \
  --no-progress
```

> **注意**: `--delete` フラグはバックアップ側には付けないこと。R2 側で削除されたキーを追従するとバックアップが弱体化する。世代管理は日付ディレクトリ分離で実現する。

### 方法 3: `wrangler` CLI（少量オブジェクトの確認用）

単一オブジェクトの確認・緊急時のピンポイント取得に使う。大量同期には不向き。

```bash
# 特定キーの取得
npx wrangler r2 object get rss-reader-data/users/<userId>/read-state.json \
  --file ./read-state.json

# 特定キーの書き込み（復旧時）
npx wrangler r2 object put rss-reader-data/users/<userId>/read-state.json \
  --file ./read-state.json \
  --content-type "application/json"

# キーの一覧（プレフィックス指定）
npx wrangler r2 object list rss-reader-data --prefix "users/<userId>/"
```

## 選択的バックアップ

### ユーザー別バックアップ

特定ユーザー（例: 移行対象ユーザー・苦情対応・削除前の記録）のデータだけを抜き出す:

```bash
USER_ID="<ユーザーの sub>"
OUT=./backups/users/${USER_ID}/$(date +%Y%m%d)

rclone copy r2:rss-reader-data/users/${USER_ID} ${OUT} --checksum
```

ユーザー別にバックアップされる主要キー（`src/lib/r2.ts` / `src/lib/feed-groups.ts` / `src/lib/recommendation.ts` 由来）:

| キー                                          | 内容                                           |
| --------------------------------------------- | ---------------------------------------------- |
| `users/{userId}/profile.json`                 | OAuth プロファイル                             |
| `users/{userId}/subscriptions.json`           | 購読フィード一覧                               |
| `users/{userId}/feed-groups.json`             | フィードグループ定義                           |
| `users/{userId}/read-state.json`              | 既読・ブックマーク・後で読む・スヌーズ・ノート |
| `users/{userId}/engagement.json`              | エンゲージメント記録                           |
| `users/{userId}/recommendations.json`         | 推薦キャッシュ                                 |
| `users/{userId}/push.json`                    | Web Push サブスクリプション                    |
| `users/{userId}/saved.json`                   | 手動保存記事                                   |
| `users/{userId}/last-full-refresh.json`       | 全フィード手動更新のクールダウン（復旧不要）   |
| `users/{userId}/ai-cooldown.json`             | AI エンドポイントのクールダウン（復旧不要）    |
| `users/{userId}/feed-refresh-{feedHash}.json` | 単体フィード更新のクールダウン（復旧不要）     |
| `users/{userId}/feed-reinfer-{feedHash}.json` | LLM 再推論のクールダウン（復旧不要）           |
| `users/{userId}/recommendations-refresh.json` | 推薦リフレッシュのクールダウン（復旧不要）     |
| `users/{userId}/recommendations-gen.json`     | 推薦生成のクールダウン（復旧不要）             |

> クールダウン系キー (`*-cooldown*` / `last-full-refresh*` / `*-refresh.json` / `*-gen.json`) は `{ ts: number }` のみを保持しており、欠損してもクールダウンが即解除されるだけで実害はない。世代バックアップから除外してもよい。

### フィード別バックアップ

特定フィード（例: 過去記事を保持したいメディア、LLM 推論セレクタをチューニング中のフィード）のデータだけを抜き出す。`feedHash` は `sha256(feedUrl).slice(0, 16)`（`src/lib/shared-feed.ts` の `computeFeedHash`）で算出される:

```bash
# feedHash を手元で計算する例
node -e "const c = require('crypto'); console.log(c.createHash('sha256').update('https://example.com/feed.xml').digest('hex').slice(0,16))"
# → 例: 9a87c0b1e2d3f4a5

FEED_HASH="9a87c0b1e2d3f4a5"
rclone copy r2:rss-reader-data/feeds/${FEED_HASH} \
  ./backups/feeds/${FEED_HASH}/$(date +%Y%m%d) --checksum
```

## 復旧手順

### ケース 1: バケット全体の復元

R2 バケット全体が破損した場合、最新のスナップショットから書き戻す。

```bash
# 最新のバックアップディレクトリを特定
LATEST=$(ls -1 ./backups | grep -E '^[0-9]{8}$' | sort | tail -1)

# バケットへ復元（既存キーは上書き）
rclone copy ./backups/${LATEST} r2:rss-reader-data \
  --transfers 8 --checksum
```

> **注意**: 復元前に Cloudflare Workers の cron を一時停止することを推奨。`wrangler.toml` から `[triggers].crons` をコメントアウトして再デプロイするか、Cloudflare ダッシュボードで cron トリガーを無効化する。復元中に cron が `feeds/{feedHash}/meta.json` を上書きすると不整合が生じる。

### ケース 2: 特定ユーザーのデータ復元

ユーザーが「昨日までの既読状態を戻したい」と連絡してきた場合:

```bash
USER_ID="<該当ユーザーの sub>"
BACKUP_DATE="20260418"   # 戻したい日付

rclone copy ./backups/${BACKUP_DATE}/users/${USER_ID} \
  r2:rss-reader-data/users/${USER_ID} --checksum
```

個別ファイル（例: `read-state.json` だけ戻す）の場合:

```bash
npx wrangler r2 object put rss-reader-data/users/${USER_ID}/read-state.json \
  --file ./backups/${BACKUP_DATE}/users/${USER_ID}/read-state.json \
  --content-type "application/json"
```

> **クライアントキャッシュとの整合性**: `read-state.json` の復元は「ローカル ∪ サーバー」マージ戦略のため (`src/hooks/useReadState.ts`)、復元直後もクライアント側 `localStorage` に残る既読 ID が再同期で R2 に再書き込みされる。完全に「サーバー側の値まで戻す」には、該当ユーザーに `localStorage.removeItem('rss-read-state')` 相当の手順（ブラウザ DevTools 経由）をアナウンスする必要がある。
>
> **例外**: スヌーズ期限は「より遅い方を採用」、ノート (`notes`) は「サーバー優先」のため、サーバー復元のみで即座に反映される。

### ケース 3: 特定フィードの記事ログ復元

カスケードされた過去ページ (`feeds/{feedHash}/articles/p2.json` など) の復元:

```bash
FEED_HASH="<対象フィードの hash>"
BACKUP_DATE="20260418"

rclone copy ./backups/${BACKUP_DATE}/feeds/${FEED_HASH}/articles \
  r2:rss-reader-data/feeds/${FEED_HASH}/articles --checksum
```

`meta.json` の `articleCount` / `pageCount` / `knownIds` がページ実態と整合しなくなった場合は、`meta.json` も合わせて復元するのが安全。

## 推奨バックアップ頻度と保持期間

| 対象                               | 頻度    | 保持期間 | 実行タイミング                                          |
| ---------------------------------- | ------- | -------- | ------------------------------------------------------- |
| `users/*` (全ユーザー)             | 毎日    | 30 日    | 深夜（トラフィックの少ない時間帯、cron と被らない時刻） |
| `feeds/*` (共有フィード)           | 週 1 回 | 8 週間   | 週末                                                    |
| `ai-cache/*`                       | 月 1 回 | 2 ヶ月   | 月初                                                    |
| バケット全体のフルスナップショット | 月 1 回 | 12 ヶ月  | 月初                                                    |

> 日次バックアップは世代数 30 で保持（`./backups/YYYYMMDD/` で管理）。30 日経過した世代は `find ./backups -maxdepth 1 -type d -name '2*' -mtime +30 -exec rm -rf {} +` で定期削除する運用を推奨。

## 復旧テスト（DR リハーサル）

年 1 回以上、以下のリハーサルを行うこと:

1. 新規 R2 バケット `rss-reader-data-restore-test` を作成
2. 最新バックアップを `rclone copy ./backups/<latest> r2:rss-reader-data-restore-test` で書き込み
3. `wrangler.toml` の `bucket_name` を一時的に restore-test に向け、`npx wrangler dev` でローカル起動
4. 復元したバケットにログインして購読・既読・ブックマークが元通りに表示されることを確認
5. 確認後は restore-test バケットを削除

## 監視

- **バックアップ失敗の検知**: cron で rclone を回す運用であれば、exit code != 0 のとき Slack / Discord 等に通知する。
- **オブジェクト数の急減検知**: Cloudflare ダッシュボードの R2 メトリクスから `Class A Operations` の日次増加が途絶えていないか、バケット内オブジェクト数が急減していないかを定期確認する。
- **バックアップサイズの推移**: バケット全体のサイズが突然半分以下になった場合、誤削除・バグの可能性が高い。アラート対象にする。

## 参考

- [Cloudflare R2: S3 API 互換性](https://developers.cloudflare.com/r2/api/s3/api/)
- [rclone: S3 プロバイダ設定](https://rclone.org/s3/#cloudflare-r2)
- 本プロジェクトのキー構造実装: [`src/lib/r2.ts`](../src/lib/r2.ts), [`src/lib/shared-feed.ts`](../src/lib/shared-feed.ts), [`src/lib/feed-groups.ts`](../src/lib/feed-groups.ts)
