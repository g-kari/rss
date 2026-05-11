---
description: ブラウザ API ラッパー / silent fallback 禁止 / バージョン定数 / 永続化 TTL / 本番デバッグなどブラウザ環境固有の運用パターン集
paths: "src/**/*.ts,src/**/*.tsx,src/lib/**/*.ts,src/hooks/**/*.ts"
---

# ブラウザプラットフォーム運用パターン

`coding-conventions.md` から #694 Step 5 で分割した「ブラウザ環境固有の運用パターン」集。
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

主な使用箇所: `useArticleContent.ts` の `fetchAbortControllerRef` 状態スナップショット (#678 — fetch-start / articleId-effect-fired / fetch-aborted の 3 点で hadController / currentControllerIsX を出力)

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
