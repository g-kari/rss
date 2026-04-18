# Device-Bound Session Credentials (DBSC) 導入調査

調査日: 2026-04-19
対象 issue: [#77](https://github.com/g-kari/rss/issues/77)

## 目的

Chrome の Device-Bound Session Credentials (DBSC) を本プロジェクト (`rss.0g0.xyz`) に導入できるか、認証サーバー (`id.0g0.xyz`) との責務分担も含めて調査する。

## 仕様サマリー

DBSC は、セッション cookie をデバイスの TPM 等に生成した鍵ペアと紐付け、cookie が窃取されても別デバイスで利用できなくする W3C WebAppSec WG の仕様。refresh_token 相当の長命 cookie を短命化し、ブラウザが署名付きチャレンジ応答で定期的に更新する。

プロトコル要素:

- レスポンスヘッダー `Secure-Session-Registration: (ES256 RS256); path="/StartSession"`
- `/StartSession`（登録）: ブラウザが生成した公開鍵を受領しセッションに紐付け、短命 cookie を発行
- `/RefreshEndpoint`（更新）: `Secure-Session-Challenge` 発行 → 秘密鍵署名 → `Secure-Session-Response` で JWT proof 送信 → 検証後に短命 cookie 再発行
- リクエストヘッダー `Sec-Secure-Session-Id`, `Secure-Session-Skipped`
- 短命 cookie の推奨 Max-Age は 600 秒（10 分）程度

参考: [W3C Editor's Draft](https://w3c.github.io/webappsec-dbsc/) / [Chrome Docs (ja)](https://developer.chrome.com/docs/web-platform/device-bound-session-credentials?hl=ja)

## ブラウザ対応状況 (2026-04 時点)

| ブラウザ             | 状態                  | 詳細                                                            |
| -------------------- | --------------------- | --------------------------------------------------------------- |
| Chrome (Windows)     | Available (stable)    | Chrome 145 で一般提供開始、Chrome 146 (2026-04-09) で本格有効化 |
| Chrome (macOS/Linux) | 開発中                | ハードウェアセキュリティ差異により未対応                        |
| Edge                 | Origin Trial 実施済み | Windows で 2025 年後半に独自 OT                                 |
| Firefox              | 評価中 (未コミット)   | Mozilla Standards Positions で評価段階                          |
| Safari               | 評価中 (未コミット)   | WebKit Standards Positions で評価段階                           |

TPM 2.0 または Windows Hello 互換デバイスが要件。アクティブな Windows Chrome の約 85% が該当。

## 最新ドラフト

- 仕様名: Device Bound Session Credentials
- 策定: W3C Web Application Security WG (IETF OAuth WG ではなく W3C 一本化)
- 最新 Editor's Draft: 2026-04-17 (`w3c/webappsec-dbsc`)

## 本リポジトリの認証実装の現状

### Cookie 発行属性 (`src/lib/server-auth.ts`)

`COOKIE_OPTS`:

- `HttpOnly: true`
- `Secure: true`
- `SameSite: "lax"`
- `Path: "/"`

`setTokenCookies()` (src/lib/server-auth.ts:131-151):

- `access_token` maxAge: **900 秒 (15 分)**
- `refresh_token` maxAge: **2,592,000 秒 (30 日)**
- `token_exp` (non-HttpOnly): maxAge 900 秒

### リフレッシュフロー

- `refreshTokens()` (src/lib/auth.ts) — 認証サーバーへ refresh_token を送りトークン交換
- `deduplicatedRefresh()` — 同時多重リフレッシュを dedup
- `withSession()` / `getAuthSession()` / `/api/auth/me` — 自動リフレッシュ起点
- `applyRefreshedTokens()` — `setTokenCookies()` で cookie 再発行

### DBSC 要件との整合

既存実装は DBSC の前提（HttpOnly / Secure / SameSite=Lax）を満たしており、導入時の土台は整っている。

## DBSC 適用時に必要な改修

### 認証サーバー (`id.0g0.xyz`) 側 — 本リポジトリ管轄外

DBSC の核となる実装は認証サーバー側にある。本リポジトリからは直接改修できない。

- 短命 cookie 再発行エンドポイント (`/StartSession` / `/RefreshEndpoint`) の実装
- `Secure-Session-Registration` ヘッダーを login/refresh レスポンスに付与
- クライアント公開鍵の保存とチャレンジ発行・検証
- `Sec-Session-Clearing` ヘッダー対応（ログアウト時）

### 本リポジトリ側で必要になる改修

DBSC は設計上、認証サーバーが正しいヘッダーを返せばブラウザが自動処理するため、**SPA / BFF 側の追加実装は原則不要**。ただし以下は要確認:

- `src/lib/server-auth.ts:131-151` — `access_token` cookie の maxAge を 900 秒 (15 分) から 600 秒 (10 分) 程度に短縮
- `app/api/auth/callback/route.ts` — 認証サーバー発行の `Secure-Session-Registration` ヘッダーをそのまま通す（現状 passthrough でよいはず。NextResponse で cookie 以外を落としていないか確認）
- `app/api/auth/logout/route.ts` — `Sec-Session-Clearing` の passthrough 確認

### npm 依存の影響

DBSC は Web Platform API (`fetch`, `crypto.subtle`) のみで完結し、クライアントライブラリ不要。`min-release-age=3` (`.npmrc`) 制約にも影響しない。

## 段階的導入の可能性

DBSC 非対応ブラウザ (Firefox, Safari, Chrome macOS/Linux) では `Secure-Session-Registration` ヘッダーが無視されるだけで、既存の cookie 認証がそのまま動作する。特別な分岐コードは不要。フィーチャーフラグなしで段階導入可能。

## 結論: 現時点では待ちが妥当

1. **本リポジトリ単体で完結できる改修がない**。DBSC の主実装は認証サーバー (`id.0g0.xyz`) で、こちらは passthrough 側
2. **Chrome + Windows + TPM のみ**というカバレッジ不足。Firefox / Safari / Chrome macOS・Linux ユーザーには効果がない
3. 仕様は Editor's Draft 段階で CR/PR 未到達。ヘッダー名・フローの微調整が残る可能性
4. 本アプリは個人利用向け RSS リーダーで、refresh_token は既に HttpOnly Secure cookie。窃取リスクはエンタープライズ SaaS より相対的に低い

## 推奨アクション

- [ ] `id.0g0.xyz` オーナーへ DBSC 対応の長期ロードマップとして Chrome Docs を共有（本リポジトリ外アクション）
- [ ] Firefox / Safari の Standards Positions が positive に動き、Chrome macOS/Linux が stable 到達したタイミング（推定 2026 年後半〜2027 年）で再評価
- [x] 現時点の refresh_token 周り cookie 属性（HttpOnly / Secure / SameSite=Lax / Path=/）の確認 → すべて良好

## 参考文献

- [Device Bound Session Credentials (DBSC) | Chrome for Developers (ja)](https://developer.chrome.com/docs/web-platform/device-bound-session-credentials?hl=ja)
- [Device Bound Session Credentials now available on Windows | Chrome Blog](https://developer.chrome.com/blog/dbsc-windows-announcement)
- [Device Bound Session Credentials - W3C Editor's Draft](https://w3c.github.io/webappsec-dbsc/)
- [w3c/webappsec-dbsc - GitHub](https://github.com/w3c/webappsec-dbsc)
- [Mozilla Standards Positions](https://mozilla.github.io/standards-positions/)
- [WebKit Standards Positions](https://webkit.org/standards-positions/)
