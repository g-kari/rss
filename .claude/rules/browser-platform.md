---
description: ブラウザ API ラッパー / silent fallback 禁止 / バージョン定数 / 永続化 TTL / 本番デバッグなどブラウザ環境固有の運用パターン集
paths: "src/lib/**/*.ts,src/hooks/**/*.ts"
---

# ブラウザプラットフォーム運用パターン

`coding-conventions.md` から分割した「ブラウザ環境固有の運用パターン」集。
silent fallback / バージョン要件 / 永続化 TTL / プロキシヘッダ補完 / 本番 localStorage デバッグ等、
**ブラウザネイティブ API を扱う際の判断軸** を集約しています。

## 上流 API プロキシのヘッダ欠落補完

`/api/content` のように上流 HTTP レスポンスを中継する route で、上流が必須ヘッダ（`Retry-After`, `Content-Type` 等）を欠落させた場合に備えて、デフォルト値を補完する。

```typescript
// アンチパターン: 上流に Retry-After がないと undefined になる
const retryAfterHeader = res.headers.get("Retry-After");
if (retryAfterHeader) headers["Retry-After"] = retryAfterHeader;

// 修正パターン: デフォルト値を補完
const retryAfterHeader = res.headers.get("Retry-After") ?? "60";
headers["Retry-After"] = retryAfterHeader;
```

**How to apply**: 外部 HTTP レスポンスを中継する Route Handler で、クライアント側 (retry-after.ts 等) が依存しているヘッダがあれば補完を必ず入れる (一部上流サイトは 429 を `Retry-After` なしで返し、補完がないと即時リトライ → 再 429 の連鎖になる)。

### 派生ケース: 上流 API プロキシのエラー観測性は server-side log + response header の二段で構造化する

上流 fetch をプロキシする Route Handler (`/api/image-proxy` / `/api/content` / `/api/ogp` 等) でエラー応答を返すとき、**「なぜ失敗したか」を server-side (`console.error`) + response header (`X-{Service}-*`) の両方で出力する**。`devError` (ブラウザ側 dev-only) と違い、本番 wrangler tail でサーバー側ログを見られ、かつブラウザ DevTools Network タブで response header から失敗理由を読める二段構えにする。silent fallback (理由なしの汎用 SVG / 空応答) は同じ症状の Issue が再発しても切り分けに本番再現が必要で調査コストが膨らむ。

```typescript
// アンチパターン: 同じ "unavailable" reason に 5 つの異なる失敗経路が集約され、
// ユーザー側にも運用側にも切り分け手段がない
if (!res.ok) return errorImageSvg("unavailable");
if (!ALLOWED.has(ct)) return errorImageSvg("unavailable");
if (!res.body) return errorImageSvg("unavailable");
if (!detectMimeType(bytes)) return errorImageSvg("unavailable");
if (!isContentTypeConsistent(ct, mime)) return errorImageSvg("unavailable");

// 修正パターン: reason 細分化 + console.error + X-Header で詳細返却
if (!res.ok) {
  console.error(
    `[image-proxy] upstream not ok: url=${url} status=${res.status} content-type="${ct}"`,
  );
  const reason =
    res.status === 404 ? "not_found" : res.status === 403 ? "bot_blocked" : "unavailable";
  return errorImageSvg(reason, { upstreamStatus: res.status, upstreamContentType: ct });
}
// errorImageSvg は X-Image-Proxy-Error / -Upstream-Status / -Upstream-Type 等を返す

// レスポンス例 (DevTools Network):
//   Status: 200 (SVG プレースホルダー描画は壊さない)
//   X-Image-Proxy-Error: bot_blocked
//   X-Image-Proxy-Upstream-Status: 403
//   X-Image-Proxy-Upstream-Type: text/html
```

**How to apply**: 上流 fetch のプロキシ系 Route Handler を実装するとき:

1. **エラー reason を `union type` で細分化**: `"not_found" | "bot_blocked" | "mime_rejected" | "content_type_mismatch" | "size_unknown" | "too_large" | "unavailable" | "network"` のように、**失敗経路ごとに独立した reason** を持たせる (同じ `unavailable` に集約しない)
2. **各 return 箇所で `console.error("[label] <reason>: key1=v1 key2=v2")`**: label にはエンドポイント名 (`image-proxy` / `content` / `ogp`)、key には URL / status / content-type / body-size 等の判別材料
3. **`X-{Service}-Error: <reason>`** を必ず返す (常時出力)。詳細は `X-{Service}-*` で optional (`upstreamStatus` / `upstreamContentType` / `detectedMime` / `bodySize` 等)
4. **詳細パラメータは `Details` interface でまとめる** (`ImageErrorDetails` 等) → caller が型安全に渡せて drift しない
5. **新規 reason 追加時のラベル**: SVG / message リソースは既存アイコン再利用で OK (semantic 的に近いものを選ぶ)。実装コストを最小化して reason 細分化を優先
6. **本番調査フロー** (Issue クローズコメントにも明記): ユーザーが DevTools Network で `X-{Service}-Error` を見る → 必要なら `npx wrangler tail` で server-side ログを見る → 真因確定

**反例 (細分化しないケース)**:

- エラー reason が **本質的に 1 種類しかない** (例: `/api/health` の DB 接続失敗のみ) → 単一 reason で OK
- プロキシせず自社データを返すだけの endpoint → server-side log のみで十分 (`X-Header` 不要)
- 上流が **エラー詳細を一切返さない** (`fetch` の throw のみ) → `network` reason + `console.error("[label] fetch error:", formatError(err))` で完結

主な使用箇所: `app/api/image-proxy/route.ts` + `src/lib/image-error-placeholder.ts` (`errorImageSvg(reason, details?)` で 8 種類の reason × `X-Image-Proxy-*` ヘッダー × `console.error` 詳細ログの 3 軸観測性)

## 特定ドメインの content fallback は「ドメイン × content pattern」の AND 判定 + scan 範囲限定で false positive を防ぐ

`x.com` / `twitter.com` のように **JavaScript 必須のサイトは JS 無効な fetch クライアント (Cloudflare Workers の `fetch`) からアクセスすると「JS を有効にしてください」エラーページ HTML** を返す。それをそのまま記事本文として処理すると TTS が無価値な文字列を読み上げたり AI 要約の入力に使われたりする。

このパターンの defensive fallback は **「特定ドメイン × content pattern」の 2 軸 AND 判定** + **scan 範囲限定** が原則:

```typescript
// アンチパターン: ドメインだけで判定 → 通常 tweet が取れても fallback してしまう
function needsFallback(link: string): boolean {
  return new URL(link).hostname === "x.com"; // ← 正常に取れた tweet も fallback 対象に
}

// アンチパターン: pattern だけで判定 → 長文記事の本文中に偶然含まれる文字列で誤検知
function needsFallback(content: string): boolean {
  return /JavaScript is not available/.test(content);
  //  ↑ どこかの記事本文に「JS 用語解説」で出現したら誤検知
}

// 修正パターン: ドメイン × pattern の AND + scan 範囲を先頭 N 文字に限定
const TARGET_HOSTS = new Set(["x.com", "www.x.com", "mobile.x.com", "twitter.com", ...]);
const JS_ERROR_PATTERNS: readonly RegExp[] = [
  /JavaScript is not available/i,
  /Please enable JavaScript/i,
  // ...
];

export function isTargetHost(link: string | null | undefined): boolean {
  if (!link) return false;
  try {
    return TARGET_HOSTS.has(new URL(link).hostname.toLowerCase());
  } catch { return false; }
}

export function isErrorContent(content: string | null | undefined): boolean {
  if (!content) return false;
  // 先頭 500 文字のみチェック (長文記事の本文中に偶然含まれる場合の false positive を防ぐ)
  return JS_ERROR_PATTERNS.some((p) => p.test(content.slice(0, 500)));
}

export function needsFallback(link, content): boolean {
  return isTargetHost(link) && isErrorContent(content);
  //  ↑ AND 判定: 両方 true でのみ fallback 発動
}
```

**How to apply**: 特定ドメインで外部 fetch の content quality が信頼できないケースを発見したとき (例: TTS が無価値な文字列を読み上げる / AI 要約に JS エラーが入る / 一覧サムネが broken image になる) (1 軸判定だと「ドメイン全体 fallback でユーザーの正常 tweet 体験を壊す」or「pattern 誤検知で関係ない記事を壊す」リスク発生、AND + scan 限定で両方回避):

1. **3 純粋関数に分割**: `isTargetHost(link)` / `isErrorContent(content)` / `needsFallback(link, content)` (テストしやすさ + 再利用性)
2. **host 集合は Set で表現** + サブドメイン (www / mobile) のバリエーションを網羅
3. **content pattern は配列で readonly RegExp[]** + case-insensitive `i` flag
4. **scan 範囲は `content.slice(0, N)` で先頭 N 文字に限定** (N = 500 程度が典型値)
5. **TDD で網羅**: host 判定 (対象 / 別サービス / 不正 URL / 大文字小文字) + content 判定 (各 pattern × 通常 content × 長文末尾 / scan 範囲外) + 統合判定 (host × content の 4 組合せ)
6. **consumer 側 (例: `buildTtsText`)** で `needsFallback(...) ? null : content` のパターンで content を skip → 別 source (`article.summary` 等 OGP description) に切替

主な使用箇所: `src/lib/x-com-fallback.ts` — x.com / twitter.com 系で JS 無効エラー HTML を検出して TTS は OGP description (`article.summary`) を読み上げる (#718)。`buildTtsText` で processedContent を skip して `article.summary` fallback に切替

## silent fallback の禁止 — `try/catch → null` には必ず `devError` を添える

外部依存 (Web API・ブラウザネイティブ AI・サードパーティ fetch) のラッパーで「失敗時はサーバー fallback」をしたいとき、`try/catch` で例外を `null` に変換するパターンが頻出する。これ自体は正しいが、**catch ブロックでログを出さないとユーザーから「動かないけど何も表示されない」「ブラウザ DevTools にも何も出ない」状態が生まれ、原因特定不可になる**。

```typescript
// アンチパターン: 失敗の理由が一切表に出ない
export async function summarizeInBrowser(text: string): Promise<string | null> {
  try {
    const summarizer = await globalThis.Summarizer.create({
      /* ... */
    });
    return await summarizer.summarize(text);
  } catch {
    return null; // ← 何が起きたか開発者にもユーザーにも分からない
  }
}

// 修正パターン: devError で開発時に DevTools に出す
import { devError } from "./dev-log";

export async function summarizeInBrowser(text: string): Promise<string | null> {
  try {
    // 前提条件チェックも個別に warn する
    if (availability === "downloadable" && !hasUserActivation()) {
      devError("[browser-summarizer] requires user activation — falling back");
      return null;
    }
    return await summarizer.summarize(text);
  } catch (err) {
    devError("[browser-summarizer] summarize failed", err);
    return null;
  }
}
```

**How to apply**: 外部依存ラッパーで `catch { return null }` を書きたくなったら、必ず `devError` を併記する (silent fallback はユーザー・開発者の両方にとってブラックボックスで、「仕様通り動作」「仕様変更で破損」を区別する唯一の手段が devError ログ)。前提条件 (user activation, secure context, hardware requirement, API バージョン) のガード節も同様に reason を `devError` で出す。`null` 返却の経路が複数あるなら全箇所で出す。

主な使用箇所: `src/lib/browser-summarizer.ts` / `src/lib/browser-translator.ts`（Chrome 組み込み AI ラッパー）

### 派生ケース: イベントハンドラ (`onerror` / `onclose` 等) の silent fail は **monotonic counter + consumer 側 toast** で表面化する

`utterance.onerror` (Web Speech API) / `ws.onerror` (WebSocket) / `audio.onerror` (HTMLMediaElement) のような **engine 由来の非同期エラーイベント** は、callback 内で `resetState()` だけ呼んでも consumer (UI 層) が「何が起きたか」を知る手段がないと silent fail になる。`devError` ログだけでは本番ユーザーが「ボタンが反応しない」状態で気付かない。

`react-patterns.md` の monotonic counter パターン (手動 cancel と自然完了の区別) と同じ実装基盤を使って、**`errorCount` カウンタを expose** → consumer が `prev → current` 差分検知で toast 表示。

```typescript
// engine 側 hook (例: useSpeechSynthesis):
const [errorCount, setErrorCount] = useState(0);
utterance.onerror = (e) => {
  if (utteranceRef.current === utterance) {
    devError("[useSpeechSynthesis] utterance.onerror", { error: e.error, voice: ..., ... });
    setErrorCount((c) => c + 1); // ← monotonic increment
    resetState();
  }
};
return { ..., errorCount };

// consumer 側 hook (例: useArticleViewTts):
const prevErrorCountRef = useRef(errorCount);
useEffect(() => {
  if (errorCount > prevErrorCountRef.current) {
    prevErrorCountRef.current = errorCount;
    toast.error("読み上げに失敗しました (voice 互換性または engine エラー)");
  }
}, [errorCount, toast]);
```

**How to apply**: ブラウザ API ラッパー hook で **engine 由来エラーイベントを catch する箇所** を実装するとき (silent reset では本番でユーザーが「動かない理由が分からない」状態が永続化する、devError ログだけでは本番調査がブラックボックス):

1. **`xxxCount: number` の monotonic counter** を hook の戻り値に追加 (interface 型にも追加 → 全 caller に追従義務発生 = ドリフト防止)
2. **エラーイベント発火時に setXxxCount((c) => c + 1)** + `devError` で context (input args / state) も出力
3. **consumer 側で `prevXxxCountRef` + useEffect** で差分検知 → toast / banner / 専用 UI で表面化
4. **空入力 silent skip も同様に表面化** — `if (!text.trim()) return;` を見つけたら `toast.info` で「入力が空です」を表示
5. interface 拡張時は **全 dummy 実装 (e2e の minimal adapter test 等)** も同期更新 (typecheck で漏れ検出)

主な使用箇所: `TtsAdapter.errorCount` (`useSpeechSynthesis` の `utterance.onerror` → `useArticleViewTts` で toast 表示 + 空テキスト silent skip も同時対応)

### 派生ケース: monotonic counter に加えて **「silent skip set」+「abstract error code」+「format function」の 3 点セット** で error 種別ごとの処理を分離する

`errorCount` 単独だと「全ての error で同じ toast 文言」になり、ユーザー視点では:

- **silent skip すべき error** (`canceled` / `interrupted` / `audio-busy` 等の正常終了 / 中断系) で誤発火 → 「何もしてないのに toast が出る」UX 劣化
- **action 可能な error** (`voice-unavailable` / `language-unavailable` / `not-allowed` 等) で汎用文言 → ユーザーが対処できない

この問題を解決する **3 点セットパターン** (#756 で確立):

```typescript
// 1. abstract error code (engine 横断の union 型)
export type TtsErrorCode =
  | "canceled"
  | "interrupted"
  | "audio-busy" // silent skip 対象
  | "not-allowed"
  | "language-unavailable"
  | "voice-unavailable"
  | "synthesis-failed"
  | "audio-hardware"
  | "network"
  | "model-error"
  | "unknown";

// 2. silent skip set (errorCount を increment しない対象)
export const TTS_SILENT_SKIP_ERRORS: ReadonlySet<TtsErrorCode> = new Set([
  "canceled",
  "interrupted",
  "audio-busy",
]);

// 3. format function (null 戻り値 = toast 不要)
export function formatTtsErrorMessage(code: TtsErrorCode | null): string | null {
  if (code === null || TTS_SILENT_SKIP_ERRORS.has(code)) return null;
  switch (code) {
    case "language-unavailable":
      return "端末でこの言語の voice が利用できません。設定 → Voice で別の voice を選んでください";
    case "voice-unavailable":
      return "選択中の voice が利用できなくなりました。自動選択に戻します";
    // ... 種別別文言
  }
}

// engine 側で normalize + silent skip 判定:
const code = normalizeWebSpeechError(e.error);
setLastError(code);
if (!TTS_SILENT_SKIP_ERRORS.has(code)) {
  setErrorCount((c) => c + 1); // silent skip では increment しない
}
// voice-unavailable で auto reset 等の副作用も engine 側で完結

// consumer 側 (errorCount 差分検知 + formatXxxMessage で文言切替):
useEffect(() => {
  if (errorCount > prevErrorCountRef.current) {
    prevErrorCountRef.current = errorCount;
    const message = formatTtsErrorMessage(lastError);
    if (message) toast.error(message); // null なら silent
  }
}, [errorCount, lastError, toast]);
```

**How to apply**: ブラウザ API ラッパー hook で error 種別が **3 つ以上** に分かれる場合に採用 (種別が 1-2 なら monotonic counter 単独で十分):

1. **abstract error code union 型** を `<feature>-adapter.ts` 等に定義 — engine ごとの raw error を normalize 関数 (`normalizeWebSpeechError` / `normalizePiperError` 等) で統一
2. **silent skip set** をモジュールレベル `Set<XxxErrorCode>` で定義 — 「正常終了 / 中断 / 環境一時障害」を含める
3. **`xxxLastError: XxxErrorCode | null` を interface に追加** — engine 側で setLastError + errorCount 増加を組み合わせる
4. **format function** で `null` 戻り値 = silent / 文言 = toast を表現 — consumer は `if (message) toast.error(message)` の 1 行ガード
5. **engine 側で error 種別ごとの副作用も完結** — 例: `voice-unavailable` で `setVoiceUri(null)` + localStorage クリア (consumer はそれを意識しない)

**該当する典型 API** (error 種別が多い):

| API                                | 主要 error 種別                                          | silent skip 対象                          |
| ---------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| Web Speech API `utterance.onerror` | 9 種類 (`SpeechSynthesisErrorCode`)                      | `canceled` / `interrupted` / `audio-busy` |
| WebSocket `onclose`                | code (1000-4999)                                         | 1000 (normal closure) / 1001 (going away) |
| `<video>` / `<audio>` `onerror`    | `MediaError.code` (1-4)                                  | (基本全て通知すべき)                      |
| `fetch` reject                     | `AbortError` / `TypeError` (network) / `TimeoutError`    | `AbortError` (明示 cancel)                |
| Geolocation `onerror`              | `PERMISSION_DENIED` / `POSITION_UNAVAILABLE` / `TIMEOUT` | (種別別に文言切替)                        |

**反例 (3 点セットが overkill なケース)**:

- error 種別が **1-2 種類だけ** で文言切替不要 → monotonic counter + 単一 toast 文言で十分
- error が **連続発火しない 1 回限り** の操作 → state 1 つで十分、counter 不要
- consumer 側で **silent skip 判定を engine 側で済ませる必要がない** (consumer 側で `if (xxx) toast` する方が文脈情報を持つ場合) → 各箇所で個別判定

主な使用箇所: `src/lib/tts-adapter.ts` の `TtsErrorCode` / `TTS_SILENT_SKIP_ERRORS` / `normalizeWebSpeechError` / `formatTtsErrorMessage` (#756) — useSpeechSynthesis / usePiperTts 両 engine の error を統合、silent skip + 文言細分化 + voice 自動 reset を engine 側で完結

### 派生ケース: `availability()` が `unavailable` を返したら **入力引数も一緒にログに出す**

外部 API の `availability()` / `validate()` 系判定関数が **「使えない」結果** を返したとき、結果値だけログに出すと「ハードウェア要件不足」と誤診しがち。実際は **渡している引数値が API 仕様と乖離している** 可能性が常にある。`devError` で **入力引数も一緒に** 出力する設計にすれば、仕様乖離を最初の調査で検出できる。

```typescript
// アンチパターン: 結果値だけログ → 「unavailable = 環境問題」と誤診
const availability = await api.availability({ type: "tl;dr", length: "medium" });
if (!isUsable(availability)) {
  devError("[wrapper] availability not usable:", availability);
  // ↑ "unavailable" としか出ない → "tl;dr" が無効値だったことに気づかない
  return null;
}

// 修正パターン: 入力引数も一緒にログ
const options = { type: "tldr", length: "medium" } as const;
const availability = await api.availability(options);
if (!isUsable(availability)) {
  devError("[wrapper] availability not usable:", { availability, options });
  // ↑ 渡した引数も見えるので、API 仕様変更 / typo を即座に切り分けできる
  return null;
}
```

**How to apply**: 外部 API の `availability()` / `validate()` / `canX()` 系判定関数を呼ぶラッパーで (`availability()` 系は無効な引数値を渡されても明示的な型エラーを投げず `"unavailable"` を返すケースが頻発するため、結果値だけ見ると「環境問題」と誤診する):

1. **オプション値は const オブジェクトに集約** (`SUMMARIZER_OPTIONS` / `TRANSLATOR_OPTIONS` 等) して 1 箇所参照
2. **TDD で「渡している enum 値が公式仕様と一致するか」を assert** (例: `expect(SUMMARIZER_OPTIONS.type).toBe("tldr")`)
3. **判定が下りた場合の `devError` は `{ result, options }` の形式** で入力引数も含める
4. ユーザーから「環境要件は満たしているのに使えない」報告が来たら、**最初に渡している引数値を公式仕様と照合** する (環境調査より先)

### 派生ケース: 規範対象判定軸 — 外部依存ラッパー vs 内部 URL パーサー / boolean validator

silent fallback 規範 (`catch { return null }` に `devError` 必須) は **全ての null 返却 catch に画一適用するのでなく、source の信頼度で対象判定を分ける**。`grep -rEn "^\s*\}\s*catch.*\{$" src/lib/` 等で機械検出した hit 全件を規範対象とすると、毎リクエスト fail し得る validator / parser で diagnostic ログを大量出力する逆効果を招く。

**判定軸**:

| カテゴリ                                | 例                                                                                    | devError 必須? | 理由                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| **外部依存ラッパー**                    | Web API / ブラウザネイティブ AI / サードパーティ fetch / 外部 OAuth                   | **必須**       | silent fail で本番ブラックボックス化、ユーザー視点で「ボタンが効かない」状態が永続 |
| **内部 URL パーサー / parser fallback** | `new URL(...).origin` パース失敗 / RSS XML パース失敗 / config 読込失敗               | **不要**       | 毎リクエスト発生し得る、毎回 diagnostic 出すとログ汚染で真因が埋もれる             |
| **boolean validator**                   | `isValidUrl(s): boolean` / `isValidSessionId(s): boolean` / `isInPrivateNetwork()` 等 | **不要**       | 検証 false が正常動作、validator は silent が canonical                            |

**判別パターン**:

- **外部依存ラッパー** = ライブラリ / Web API / 外部 fetch を **ユーザー操作トリガーで 1 リクエスト 1 回呼ぶ** (silent fail → 本番調査不能)
- **内部 URL パーサー / parser fallback** = **毎レコード / 毎処理単位で呼ばれる** (silent fail は別経路に進むだけで UX 影響なし)
- **boolean validator** = **戻り値が boolean / null** で別経路への分岐入力 (silent fail = false / null 返却が canonical)

**How to apply**: silent `catch { return null }` を見つけたら以下を判定 (devError 併記必須は本番調査性のため必要だが、毎リクエスト fail し得る箇所に併記すると本番ログがノイズで埋まり真の異常を見落とす逆効果):

1. その関数が **何をラップしているか** を確認 (signature + コメント + 呼び出し元 grep)
2. **「外部依存ラッパー」なら devError 併記必須** (canonical: `browser-summarizer.ts` / `browser-translator.ts`)
3. **「内部 URL パーサー / boolean validator」なら silent OK** (devError 併記は逆効果)
4. **判定迷うケース** = 外部 fetch を間接的に経由する helper (例: `fetchFollowSafeRedirects` 内部の URL.origin パース) → 「呼び出し元 (上位 fetch) で devError 済か」を確認、上位で済なら本関数は silent OK

**反例 (規範対象 = devError 必須なケース)**:

- 一見「parser」に見えるが **実は外部 fetch wrapper** (例: `fetchAndParseOpml(url)` で内部 fetch + XML parse 両方を持つ) → 外部依存扱いで devError 必須
- validator が **実装ロジックが複雑で fail 原因の切り分けに value を持つ** (例: `isValidJwt(s)` で署名検証 + claim 検証 + 期限検証) → 規範対象 (signature 検証失敗等の原因特定が重要)

主な使用箇所:

- 外部依存ラッパー canonical: `browser-summarizer.ts` / `browser-translator.ts` (`catch (err) { devError("[browser-summarizer] summarize failed", err); return null; }`)
- 内部 URL パーサー canonical: `csrf.ts toOrigin` / `url.ts isValidUrl` / `feed-discovery.ts probeCommonFeedPaths` (silent fallback、devError なし)

## ブラウザ仕様の最低バージョン定数を 1 箇所に集約する

Chrome / Safari の Web API には「Chrome 138+」「Safari 17+」のような最低バージョン要件がある。これを `getChromeVersion() < 131` のようにマジックナンバーで散らすと、API の stable リリース後に bump し忘れて誤診断 (`flag-disabled` 等) を起こす。

```typescript
// アンチパターン: マジックナンバー
if (chromeVersion !== null && chromeVersion < 131) {
  return { available: false, reason: "chrome-too-old" };
}

// 修正パターン: export const で 1 箇所定義 + UI からも参照可能に
export const MIN_SUMMARIZER_CHROME_VERSION = 138;

if (chromeVersion !== null && chromeVersion < MIN_SUMMARIZER_CHROME_VERSION) {
  return { available: false, reason: "chrome-too-old" };
}
```

**How to apply**: ブラウザ API のバージョン要件は `MIN_XXX_CHROME_VERSION` 形式で export const 化する。ファイル先頭の jsdoc コメントが「Chrome N+」と述べているなら、その N が定数として実装にも現れているか確認する。UI メッセージの数字もハードコードせず定数を文字列補間する（i18n しない場合でも保守性のため）。

主な使用箇所: `src/lib/browser-summarizer.ts#MIN_SUMMARIZER_CHROME_VERSION` / `src/lib/browser-translator.ts#MIN_TRANSLATOR_CHROME_VERSION`

## 本番環境のデバッグは「localStorage gate + 専用 debug ヘルパー」で出す

ユーザー報告のバグが「本番でしか再現しない」「DevTools 開いても何も出ない」状態のとき、原因究明には本番環境での詳細ログが必要だが、**全ユーザーの DevTools を恒常的に汚す** のは UX 上 NG。

```typescript
// 推奨パターン: localStorage gate + xxxDebug
const DEBUG_KEY = "rss-debug-autoread"; // 機能ごとに専用 key
let cachedEnabled: boolean | null = null;

export function evaluateXxxDebugEnabled(value: string | null): boolean {
  return value === "1"; // 厳密一致 (テスタブル純粋関数)
}

export function isXxxDebugEnabled(): boolean {
  if (cachedEnabled !== null) return cachedEnabled;
  if (typeof window === "undefined") return false;
  cachedEnabled = evaluateXxxDebugEnabled(window.localStorage.getItem(DEBUG_KEY));
  return cachedEnabled;
}

export function xxxDebug(label: string, data: Record<string, unknown>): void {
  if (!isXxxDebugEnabled()) return;
  console.info(`[Feature] ${label}`, data);
}

// 状態遷移の入口・分岐ごとに散在配置
xxxDebug("effect-fetch-trigger", { articleId, canFetch, fetching, willTrigger });
```

ユーザー側の操作:

```js
// DevTools Console
localStorage.setItem("rss-debug-autoread", "1");
location.reload();
// → 再現操作 → ログを Issue にペースト
localStorage.removeItem("rss-debug-autoread"); // OFF
```

**devError との使い分け**: `devError` (`NODE_ENV !== "production"` ガード) は dev のみ。本番再現困難なバグはこちらの localStorage gate を使う。

**How to apply**:

1. 「本番でしか再現しないバグ」の調査を要する機能で、`src/lib/<feature>-debug.ts` ヘルパーを作る
2. **3 関数セット**: 純粋判定 / 設定取得 (キャッシュ付き) / ログ出力ガード
3. **専用 STORAGE KEY**: 機能別に独立 key (`rss-debug-autoread` / `rss-debug-content-fetch` 等)
4. **対象 effect / 関数に散在配置**: 状態遷移の入口・出口・分岐ごとに `xxxDebug("label", { 関連 state })` を埋める
5. **Issue コメントに使い方明記**: ユーザーが localStorage コマンド + 再現手順 + ログ提出までできるよう導線を示す
6. **機密情報を含めない**: 記事本文・トークン・メールアドレスは data に入れない。ID とフラグ・数値のみに留める

主な使用箇所: `auto-read-debug.ts` — 本番でのオートモード再現診断

### 派生ケース: AbortController / Ref ベースの状態遷移バグは「ref の差分」をログに出す

`AbortController.abort()` / `useRef` の値変化が原因の連鎖バグ (記事切替時の fetch abort / 画像キャッシュの上書き / hook 識別子のドリフト) は、**「どの瞬間にどの ref がどの値だったか」** が分かるログがないと解析不能になる。エージェントを派遣しても複数仮説が出て断定できないことが多い。本番環境で再現できるなら、**ref の状態スナップショット** を各遷移ポイントで出力する設計に切り替える。

```typescript
// アンチパターン: イベント名のみログ
useEffect(() => {
  abortRef.current?.abort();
  abortRef.current = null;
  debug("articleId-changed");
}, [articleId]);

// 修正パターン: ref の状態 (差分・null 性) を一緒に出力
useEffect(() => {
  const hadController = abortRef.current !== null;
  debug("articleId-effect-fired", { articleId, hadController });
  // ↑ hadController:true = 進行中 fetch を abort することになる証拠
  abortRef.current?.abort();
  abortRef.current = null;
}, [articleId]);

// catch 側: どの controller が abort 元かを出力
catch (err) {
  if (isAbortError(err)) {
    debug("fetch-aborted", {
      articleId,
      currentControllerIsThis: abortRef.current === controller,
      currentControllerIsNull: abortRef.current === null,
      // ↑ null = useEffect[articleId] が abort した
      //   別 controller = fetchFullContent 再呼出による abort
      //   this = 自分が abort された (外部要因)
    });
    return;
  }
}
```

**How to apply**: AbortController / useRef ベースの「複雑な遷移バグ」を調査するとき (`AbortController.abort()` の呼び出し元はスタックトレースに残らず非同期境界を跨ぐので、「abort された」だけのログは観測点として不足。ref の状態スナップショットを散在配置すれば 1 回のログ提出で経路特定可能):

1. **ref の値変化を起こす全箇所** を grep で列挙 (例: `abortRef.current = ` / `abortRef.current?.abort()`)
2. 各箇所の **ref の前後状態** (`hadX` / `currentXIsNull` / `currentXIsThis`) を debug ログに含める
3. catch / cleanup 側でも **「自分の controller か / null か / 別 controller か」** を 3 値判定で出す
4. ユーザー Issue コメントに **判定表** (どのログ列がどの真因か) を明記して再現協力を依頼
5. 真因確定後、追加ログは残すか削除するか判断 (再発リスクが高ければ残す)

主な使用箇所: `useArticleContent.ts` の `fetchAbortControllerRef` 状態スナップショット (fetch-start / articleId-effect-fired / fetch-aborted の 3 点で hadController / currentControllerIsX を出力)

## 永続化された state を「リロード時に自動復元」するときは TTL と防御チェックを必ず入れる

`localStorage` に状態を保存して **リロード後に復元** する設計 (例: オートモード継続) では、復元無条件 = 永続的に ON 状態が固定されるリスクがある。**TTL 期限と防御的バリデーション** を必ず入れる。

```typescript
// アンチパターン: 無条件復元
const initial = JSON.parse(localStorage.getItem("autoMode") ?? "false");
const [autoMode, setAutoMode] = useState(initial);
// → ユーザーが 1 度 ON にしたら永遠に ON で起動してしまう

// 推奨パターン: TTL + 防御チェック
export const RESUME_TTL_MS = 60 * 60 * 1000; // 1 時間

export function shouldRestore(state, now, ttlMs = RESUME_TTL_MS) {
  if (!state) return false;
  if (!state.enabled) return false;
  const elapsed = now - state.savedAt;
  if (elapsed < 0) return false; // ← 時計戻り防止
  if (elapsed >= ttlMs) return false; // ← 期限超過
  return true;
}

// 純粋関数で復元判定 → React state 初期値
const [enabled, setEnabled] = useState(() => shouldRestore(parsePersisted(raw), Date.now()));
```

**How to apply** (時計戻りチェック `elapsed < 0` は OS 時計が NTP 同期 / 手動変更で過去に戻ったときの永久復元バグを防ぐので必須):

1. 永続化対象 state は `{ value, savedAt: number }` 形式で保存 (タイムスタンプ必須)
2. `parsePersistedXxx(raw)` 純粋関数で安全パース (型ガード含む)
3. `shouldRestoreXxx(state, now, ttlMs)` 純粋関数で復元可否判定
4. 復元判定を `useState(() => loadInitial())` の初期化関数で 1 回だけ実行
5. TTL は機能ごとに「ユーザーが意図的に再開する間隔」を考える:
   - オートモード: 1 時間 (デプロイリロード対応)
   - フォーカスモード: 24 時間 (1 日内なら復元)
   - 検索クエリ: 1 週間 (頻繁に変えるもの) 等
6. TDD は `now` を引数化することで簡単に書ける (時計依存をテスト不能にしない)
7. 防御チェック (時計戻り / 期限超過 / 不正データ) は **全てのケースに対して spec を書く**

主な使用箇所: `auto-read-persist.ts` — autoMode の 1 時間期限付き永続化
