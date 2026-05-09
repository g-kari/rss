# コーディング規約

## TypeScript

- `strict: true` 前提。`any` は使わない
- 型は `interface` で定義 (`src/types.ts` に集約)
- Cloudflare バインディングは `src/cloudflare-env.d.ts` の `CloudflareEnv` インターフェースで拡張
  ```typescript
  // src/cloudflare-env.d.ts
  interface CloudflareEnv {
    RSS_DATA: R2Bucket;
    AI: Ai;
  }
  ```
- `tsconfig.json` の `types` に `"@cloudflare/workers-types"` を含める
- `tsconfig.json` の `lib` に `"DOM"` と `"DOM.Iterable"` を含める (Workers + React 共存)

## Next.js App Router

- Route Handlers は `app/api/**/{route}.ts` に配置
- `export const dynamic = 'force-dynamic'` を SSR ページに付ける (localStorage 使用のため)
- Server Components でブラウザ API (`localStorage` 等) は使わない
- クライアントコンポーネントには `'use client'` ディレクティブを先頭に付ける

### Route Handler パターン

`withSession` を使うのが推奨パターン。認証・env 取得・トークンリフレッシュを一括処理する。

```typescript
// app/api/example/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withSession, withJsonBody } from "@/lib/server-auth";
import { r2Get, r2Put, readStateKey } from "@/lib/r2";

// GET: データ取得（既読状態などユーザー別データは r2Get を直接使う）
export async function GET(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const data = await r2Get<ReadState>(env.RSS_DATA, readStateKey(session.userId), {
      readIds: [],
      bookmarkIds: [],
      readingListIds: [],
      likeIds: [],
    });
    return NextResponse.json(data);
  });
}

// POST: JSON ボディありの更新（withJsonBody = withSession + parseJsonBody）
export async function POST(req: NextRequest) {
  return withJsonBody<{ url?: unknown }>(req, async ({ body, session, env }) => {
    const { url } = body;
    // ...
    return NextResponse.json({ ok: true });
  });
}
```

- `withSession` が `requireSession()` + `getCloudflareContext()` + `applyRefreshedTokens()` を内包する
- `withJsonBody<T>` が `withSession` + `parseJsonBody<T>` を合成し、`body: T` をハンドラに渡す
- `session.userId` = 0g0 ユーザーID（R2 キーに使用）、`session.sub` = JWT sub（JWT 検証用）
- 成功: `NextResponse.json(data)`
- エラー: `NextResponse.json({ error: msg }, { status: N })`

### 環境変数アクセス

```typescript
// 文字列 vars / シークレット → process.env
const AUTH_BASE_URL = process.env.AUTH_BASE_URL!;

// Cloudflare バインディング (R2, AI) → getCloudflareContext()
const { env } = await getCloudflareContext({ async: true });
env.RSS_DATA.get("key");
```

## React

- 関数コンポーネントのみ。クラスコンポーネントは使わない
- `export default function ComponentName(...)` 形式
- Props は `interface Props { ... }` で定義し、同ファイル内に書く
- `useState` / `useEffect` / `useMemo` / `useCallback` のみ。複雑な状態管理ライブラリは使わない
- データ取得ロジックは custom hooks (`src/hooks/`) に分離
- コンポーネントは API を呼ばない (FeedSidebar の add/delete は例外)

### データ取得パターン (hooks)

```typescript
// src/hooks/useFeeds.ts
useEffect(() => {
  if (!user) return;
  fetch("/api/feeds")
    .then((r) => r.json() as Promise<Feed[]>)
    .then(setFeeds)
    .catch(console.error);
}, [user]);
```

**注意**: `r.json<T>()` は Hono 固有。Next.js では `r.json() as Promise<T>` を使う。

### クライアントサイドフィルタリング

```typescript
const filtered = useMemo(() => {
  let list = feedId ? articles.filter((a) => a.feedId === feedId) : articles;
  if (unreadOnly) list = list.filter((a) => !readIds.has(a.id));
  return list;
}, [articles, feedId, readIds, unreadOnly]);
```

## React Context パターン (`src/contexts/`)

コンポーネントツリーの深い階層に props を渡す（prop drilling）代わりに、React Context を使用する。
Context ファイルは `src/contexts/` に配置し、`createContext` + Provider + `useXxx` カスタムフックをセットで提供する。

```typescript
// src/contexts/ToastContext.tsx
const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ value, children }: ProviderProps) {
  return <ToastContext value={value}>{children}</ToastContext>;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
```

主な使用箇所:

- `SelectedArticleContext` — 選択記事 ID（ArticleItem の不要な re-render 回避）
- `ArticleFilterContext` — 記事フィルター状態の共有
- `ReaderSettingsContext` — リーダー表示設定（フォントサイズ・行間・テーマ等）
- `ToastContext` — トースト通知 API のグローバル提供

## 認証ヘルパー (`src/lib/server-auth.ts`)

```typescript
// セッション取得 (cookie から JWT 検証 + 自動リフレッシュ)
const result = await requireSession();
if ("error" in result) return result.error; // 401 NextResponse
const { session } = result;

// リフレッシュされたトークンをレスポンスに付与
return applyRefreshedTokens(NextResponse.json(data), session);

// ベータアクセス確認 (process.env.BETA_ALLOWED_SUBS)
if (!isBetaAllowed(session.sub)) return NextResponse.redirect("/");
```

## R2 ヘルパー (`src/lib/r2.ts`)

```typescript
// 読み込み（fallback: キーが存在しない場合のデフォルト値）
const state = await r2Get<ReadState>(env.RSS_DATA, readStateKey(session.userId), {
  readIds: [],
  bookmarkIds: [],
  readingListIds: [],
  likeIds: [],
});

// 書き込み
await r2Put(env.RSS_DATA, readStateKey(session.userId), state);

// SHA-256 ハッシュ（キャッシュキー生成用）
const hash = await sha256Hex(url);
```

> **フィードデータへのアクセス**: フィード一覧・記事データは共有フィード構造で管理されるため、
> `r2Get` を直接呼ばず `src/lib/shared-feed.ts` のヘルパー (`getUserFeeds`, `readUserSubscriptions` 等) を使うこと。

## RSS パーサー (`src/lib/xml-parser.ts`)

- `fast-xml-parser` のみ使用 (Workers 互換、pure JS)
- RSS 2.0 + Atom 両対応
- `toArray()` ヘルパーで配列正規化 (単一要素が object になる挙動を吸収)
- **summary には `stripHtmlWithBreaks()` を使う**: `stripHtml()` は `<br>` を空文字列に置換するため `foo<br>bar` → `foobar` の単語連結を起こす。プレビュー用の summary では `<br>` / `<p>` を改行に変換する `stripHtmlWithBreaks()` が正解
- `stripHtml()` は title など改行が不要な単一行テキストにのみ使う

## Cron (`src/cron/fetch.ts`)

- `FetchEnv = Pick<CloudflareEnv, 'RSS_DATA' | 'FINDME_RSS' | 'RATE_LIMIT'>` 型を使う (AI 不要)
- `fetchAllUsers(env: FetchEnv)` → R2 のユーザー一覧を列挙して全員分取得
- `fetchArticles(userId: string, env: FetchEnv)` → 特定ユーザーの RSS 取得

## 命名規則

| 対象                   | 規則                      | 例                                 |
| ---------------------- | ------------------------- | ---------------------------------- |
| 型・インターフェース   | PascalCase                | `Feed`, `Article`, `AuthSession`   |
| React コンポーネント   | PascalCase                | `FeedSidebar`, `ArticleList`       |
| 関数・変数             | camelCase                 | `markRead`, `selectedFeedId`       |
| JSON フィールド        | camelCase                 | `feedId`, `publishedAt`, `siteUrl` |
| Route Handler ファイル | `route.ts` (Next.js 規約) | `app/api/feeds/route.ts`           |

**注意**: DB (D1) を使っていた時代の snake_case (`published_at`, `feed_id`) は完全に廃止済み。
JSON データは全て camelCase。

## stale closure 回避パターン (`useSyncedRef`)

`useEffect` / `useCallback` のクロージャが古い値を参照する問題を `useSyncedRef` で回避する。
レンダーごとに `ref.current` を自動更新するため、常に最新値を参照できる。

```typescript
// Before: useRef + 手動更新（ミスしやすい）
const callbackRef = useRef(onUpdate);
callbackRef.current = onUpdate;
useEffect(() => {
  socket.on("data", (v) => callbackRef.current(v));
}, []);

// After: useSyncedRef（レンダーごとに自動更新）
const callbackRef = useSyncedRef(onUpdate);
useEffect(() => {
  socket.on("data", (v) => callbackRef.current(v));
}, []);
```

主な使用箇所: `useReadState`, `useFilteredArticles`, `useKeyboardNav`

## hook の循環依存を ref で解消する

Hook A の出力 (state) を Hook B の入力に渡し、かつ Hook B の出力 (callback) を Hook A の内部処理 (例: `speak` 内の boundary handler) に注入したいとき、宣言順だけでは解決できない循環が発生する。**callback 用の ref を「Hook A 呼び出し前」に作って両方に渡す** と解決する。

```typescript
// アンチパターン: useTts の handleTtsToggle が useHighlight.handleBoundary を呼びたいが
// useHighlight は useTts の isPlaying を必要とするので宣言順を入れ替えられない
const tts = useTts(article); // ← speak 内で onBoundary を呼びたい
const highlight = useHighlight(sentences, tts.isPlaying); // ← isPlaying が必要
// tts.handleTtsToggle が highlight.handleBoundary を呼びたいが、ここでは tts は既に確定済み

// 修正パターン: ref を 1 つ前で作って両方に渡す
const onBoundaryRef = useRef<((idx: number) => void) | null>(null);
const tts = useTts(article, onBoundaryRef); // 内部で onBoundaryRef.current?.(idx) を呼ぶ
const highlight = useHighlight(sentences, tts.isPlaying);
onBoundaryRef.current = highlight.handleBoundary; // 後付けで assign
```

**Why**: `useState` ベースで宣言順を変えるのは難しく、`useState`/`setState` を hoist すると役割が混ざる。`useRef` はレンダー位置に依存しない安定参照なので、「Hook A 作成時点では callback がまだ無いが、Hook A が `ref.current?.(...)` を **遅延呼び出し** する形で耐える」設計が成立する。

**How to apply**: hook 同士で「片方の output が他方の input、その output 先が更にもう片方の internal 処理を呼ぶ」三角関係を見つけたら、callback 用 ref を 1 つ前に作って両 hook に渡す。Hook A 内部では `ref.current?.(...)` で安全に呼び出し (null チェック必須)、Hook B から取得した callback を効果的に **後付け assign** する。assign は render 中で OK (ref はマウント前から不変)。

主な使用箇所: `useArticleViewTts` ↔ `useTtsHighlight` の boundary 配線 (#672)

## URL 比較は decodeURI で正規化してから

URL の `pathname` を文字列で直接比較すると、**percent-encoding の大文字小文字差異**で意図しない不一致を引き起こす。`%E5` と `%e5` は同じ文字を表すが、ブラウザは仕様上正規化しない。

```typescript
// NG: 大文字 %E5 と小文字 %e5 で不一致になる
if (curUrl.pathname === nextUrl.pathname) { ... }

// OK: decodeURI で正規化してから比較
function normalizePathname(p: string): string {
  try {
    return decodeURI(p);
  } catch {
    return p.toLowerCase(); // 不正シーケンスは lowercase fallback
  }
}
const curPath = normalizePathname(curUrl.pathname);
const nextPath = normalizePathname(nextUrl.pathname);
if (curPath === nextPath) { ... }
```

**いつ発生するか**: WordPress / canonical URL / RSSHub などで動的生成されたリンクは、入力時点の URL とは異なる percent-encoding 形式を持つことがある。ユーザーがブラウザに直接入力した URL は大文字、HTML 内のリンクは小文字、のような不一致が頻発。

**主な使用箇所**: `src/lib/content.ts#isPaginatedVariant`（everia.club 等のページング検出）

## デバッグ: 生 HTML を見る必要があるとき

`WebFetch` は markdown 化された結果を返すため、`<a>` タグの正確な構造や percent-encoding 形式が見えない。**ブラウザを介さず生 HTML を取得**するには：

```bash
node -e "
fetch('URL_HERE', { headers: { 'User-Agent': 'Mozilla/5.0' } })
  .then(r => r.text())
  .then(html => {
    const i = html.indexOf('Pages:');
    if (i >= 0) console.log(html.slice(i, i + 1500));
  });
"
```

特定の HTML フラグメントを `indexOf` で位置探索して周辺を出力する手法が、巨大ページの分析で有効。

## 大きいコンポーネントの機能別分割パターン

500 行を超えるコンポーネントは機能別にサブコンポーネントへ分離する。プロジェクトに繰り返し現れるパターン：

```
（分割前）大きいファイル
  Component.tsx (648 行: 10 機能集約 + Props 73 行)

（分割後）機能別ファイル
  Component.tsx              # オーケストレーター（薄い親、250 行）
  ComponentMeta.tsx          # メタ情報
  ComponentActionsA.tsx      # 機能 A
  ComponentActionsB.tsx      # 機能 B
  ComponentActionsC.tsx      # 機能 C
```

### 分割の指針

- **親（オーケストレーター）の責務**: Props 型定義、Context subscribe (`useToast` / `useReaderSettings` 等)、サブコンポーネントの合成
- **子（サブコンポーネント）の責務**: 受け取った props だけでレンダリング。Context は直接呼ばず、親からコールバック (`(msg) => toast.info(msg)` 等) を受け取る
- **既存 import パスを維持**: `Component.tsx` を空ファイルにせず、オーケストレーターとして残すことで呼び出し側の変更ゼロ
- **型の引き継ぎ**: `KeywordFilter | null` のような共有型はサブ Props でも正しく宣言する。`{ include: string[]; ... }` のような構造型に置き換えると親との互換性が壊れる

### プロジェクトでの使用箇所

- `ArticleListHeader` → `article-list-header/`（オーケストレーター + LayoutSwitcher / FilterPills 等）
- `useUIState` → 9 サブフック分割
- `useArticleViewState` → useArticleViewContent / useArticleViewTts / useArticleViewShortcuts / useArticleViewProgress に内部分離
- `ArticleHeader` → `ArticleHeaderMeta` / `ArticleHeaderAiTts` / `ArticleHeaderShare` / `ArticleHeaderEngagement`

### いつ分割しないか

- 共有 state（local useState）が密結合してサブで取り回しが面倒になるケースは、まず純粋関数化の余地を検討してから分割を進める
- 1 機能だけ抽出して残りが 400 行以下になるなら、分割するメリット < 移動コスト

### Step 内のさらなる最小スコープ化

大規模リファクタを Step 1 / Step 2 / Step 3 に分けても、各 Step 自体が大きい場合がある。**Step 内をさらに細分化して 1 PR を確実に通すパターン**:

```
Step 1: render 分岐の関数化
  ├─ 1-a: compact / list レイアウトのみ関数化 ← 最初の PR
  ├─ 1-b: card レイアウトを関数化            ← 次の PR
  ├─ 1-c: magazine レイアウトを関数化        ← 次の PR
  └─ 1-d: gallery レイアウトを関数化         ← 次の PR
```

**Why**: 一度に全レイアウトを関数化すると差分が大きく、レビュー困難・回帰リスク高。1 レイアウトずつ抽出すれば typecheck + e2e で確実に検証でき、問題があれば局所的にロールバック可能。

**How to apply**: Step を着手する前に「この Step で扱う対象を 1 つに絞れるか」を判断する。1〜3 個に絞れる場合は最も独立性が高い 1 個から開始し、別 PR に分けて進める。

### 派生ケース: 巨大コンポーネントの hook 抽出は 1 hook ずつ別 commit で進める

App.tsx / 巨大ページコンポーネントから複数の `useEffect` / `useState` / `useCallback` を切り出すリファクタは、**1 hook ずつ別 commit** で進める。8 個まとめて抽出して 1 commit にまとめると、回帰の切り分け不能 + レビュー困難になる。

```
リファクタ: App.tsx 段階分割
  ├─ Step 1a: useArticleSelection 抽出   ← typecheck + e2e 通過 → commit
  ├─ Step 1b: useSaveArticleUrl 抽出     ← typecheck + e2e 通過 → commit
  ├─ Step 1c: useSnoozeHandler 抽出      ← typecheck + e2e 通過 → commit
  └─ ... (1 hook ごとに小 commit を積む)
```

抽出候補の優先順位:

1. **State + Effect が 1 セット** で外部依存が少ないもの (例: `document.title` 更新 effect) — 純粋にコピペで切り出せる
2. **既存 hook で完結する handler** (例: トースト表示・URL POST) — Props 経由で依存注入すれば切り離せる
3. **早期 return パス** (loading / unauthenticated) — コンポーネント or 関数として抽出。ただし「TypeScript narrowing が失われる」罠 (本ファイル別節) に注意
4. **関連する複数の useState を集約した hook** (例: `useAppModalState` で 3 つのモーダル state + キーボードショートカット) — まとめて抽出した方がカプセル化が綺麗

**Why**: 1 hook ずつ commit すれば、後で `git bisect` でバグ commit を 1 hook 単位に絞り込める。8 hook 一括 commit だと「どの抽出で挙動が変わったか」を再調査する手間が爆発する。各 commit で typecheck + e2e を通すと「この hook 抽出時点では動いていた」が確定するため、心理的負担も減る。

**How to apply**: 巨大コンポーネントから抽出する hook を最初に箇条書きで列挙 (4〜10 個程度) → 上記優先順位で 1 個ずつ抽出 → 各 commit で `pnpm run typecheck` 通過を確認 → 8 個程度溜まったら master へ no-ff merge して 1 ブランチを完了させる。

### 派生ケース: 新機能は「Phase 1: 純粋関数 + TDD」「Phase 2: UI 統合」で分離する

`splitIntoSentences` / `selectActiveCharIndex` / `findSentenceAtCharIndex` のような **データ変換・状態判定ロジック** を含む機能は、UI 統合と切り離して **Phase 1 で純粋関数 + TDD だけ commit** する。Phase 2 で React hook + DOM 操作 + CSS を統合する。

```
新機能: TTS 読み上げハイライト
  ├─ Phase 1: 純粋関数 + TDD 全分岐網羅 + speak() callback 拡張    ← 1 PR (testable / shippable)
  └─ Phase 2: useTtsHighlight hook + DOM span ラップ + scroll 追従 + 設定 UI ← 別 Issue / 別 PR
```

**Why**: 純粋関数だけなら TDD で全分岐網羅できて高信頼で commit 可能。UI 統合は React state / DOM 副作用が絡んで複雑なので別フェーズに分けると、Phase 1 のロジックを既に検証済みの土台として Phase 2 を組み立てられる。「Phase 1 が動かない」という不確実性を最初に潰せる。

**How to apply**: 大きな新機能 Issue を見たとき、まず実装計画を「データ変換層 (純粋関数)」と「副作用層 (UI / DOM / async)」に分ける:

1. データ変換層を `src/lib/<feature>.ts` に切り出し可能か判断
2. 可能なら Phase 1 として純粋関数 + TDD を 1 PR で完結
3. Phase 2 として UI 統合を **別 Issue 起票** (Phase 1 の commit hash を参照ピン)
4. 元 Issue には「Phase 1 完了」コメント + Phase 2 Issue 番号を記載

実例:

- `selectGalleryImages` (#671) — Phase 単独で UI 統合まで含めた小規模ケース
- `splitIntoSentences` / `selectActiveCharIndex` (#659 Phase 1 / #672 Phase 2) — Phase 分離の典型

## dev / e2e 限定エンドポイントの二重ガード

`/api/test/seed` のようなテスト inject 系エンドポイントを本番に絶対漏らさないために、Route Handler の冒頭で **二重ガード** を行う。

```typescript
// app/api/test/seed/route.ts
import { getDevBypassUserId } from "@/lib/dev-auth-bypass";

function notFound() {
  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  // ガード 1: production ビルドでは Next.js が NODE_ENV を inline するため
  // この比較式が `false` 固定となり、以降のコードは tree-shaking で dead code 化される
  if (process.env.NODE_ENV === "production") return notFound();

  // ガード 2: dev でも DEV_AUTH_BYPASS_USER_ID が未設定なら 404
  const userId = getDevBypassUserId();
  if (!userId) return notFound();

  // ... seed ロジック
}
```

**なぜ二重ガード**: ガード 1（NODE_ENV）は production ビルドで dead code 化を保証する。ガード 2（getDevBypassUserId）は staging などの非 production 環境でも誤って公開しないための実行時安全網。

主な使用箇所: `app/api/test/seed/route.ts`（e2e テスト用 R2 シード）

## ref vs state の使い分け（同期チェック vs useEffect 再実行）

「外部からの一時的中断 → 自動回復」シナリオ（429 クールダウン後の再開、スリープからの復帰など）では **ref だけでは不十分**。`useRef` は React 再レンダーをトリガーしないため、ref に「期限値」を書き込んでも `useEffect` は再実行されない。

- **ref**: 同期 fetch ループ内の高頻度チェック用（`if (Date.now() < ref.current) return;`）
- **state**: `useEffect` 再実行のトリガー用（依存配列に含める）

両方を併用するパターン:

```typescript
const rateLimitUntilRef = useRef<number>(0);
const [rateLimitedUntil, setRateLimitedUntil] = useState<number>(0);

// クールダウン期限到達 → state リセット → メイン useEffect 再実行
useEffect(() => {
  if (rateLimitedUntil <= 0) return;
  const remaining = rateLimitedUntil - Date.now();
  if (remaining <= 0) {
    setRateLimitedUntil(0);
    return;
  }
  const id = setTimeout(() => setRateLimitedUntil(0), remaining);
  return () => clearTimeout(id);
}, [rateLimitedUntil]);

// メイン useEffect: rateLimitedUntil を依存に入れることで再開がトリガーされる
useEffect(() => {
  if (Date.now() < rateLimitUntilRef.current) return; // ref で同期チェック
  // ... fetch loop
  // 429 受信時:
  // const until = Date.now() + retryAfterMs;
  // rateLimitUntilRef.current = until;
  // setRateLimitedUntil(until);  // ← state にも反映して useEffect 再実行を予約
}, [, /* ... */ rateLimitedUntil]);
```

主な使用箇所: `usePrefetchGalleryContents`（429 クールダウン後の自動リトライ）

## ref の論理リセットポイントを忘れない

「前 tick の値を保持する ref」（例: `prevPlayingRef`, `prevSelectedRef`, `lastFiredAtRef`）は、状態の **論理的なリセットポイント**で同期的にリセットしないと、次の cycle で誤判定の連鎖を起こす。

リセットポイントの典型:

- 選択対象（記事 / フィード / セッション）の切替
- モード（オートモード / フォーカスモード）の ON / OFF
- ユーザーログアウト

```typescript
// アンチパターン: ref はそのまま残るので、新記事で「前は再生中だった」と誤判定
useEffect(() => {
  // ... ttsPlaying の遷移を見て次記事へ進む
  prevPlayingRef.current = ttsPlaying;
}, [ttsPlaying, articleId]);

// 修正パターン: 切替時に ref をリセットする独立 effect を置く
useEffect(() => {
  prevPlayingRef.current = false;
}, [articleId]);
```

**Why**: ref をリセットしないと「前は再生中だった」が次記事に持ち越され、新記事 TTS 開始前の `ttsPlaying = false` で「完了」と誤判定 → 即次記事への連鎖遷移ループになる。

### 派生ケース: effect の二重発火を防ぐ「実行済み ID」ref

「現在対象 (articleId / sessionId) で副作用を **1 回だけ** 実行したい」effect は、依存配列の変動値（テキスト・派生 state など）で再発火しないように **実行済み ID** を ref で覚える。

```typescript
// アンチパターン: ttsText / processedContent が変化するたびに onSpeak が再呼ばれる
useEffect(() => {
  if (start) onSpeak(ttsText);
}, [ttsText, ttsPlaying /* ... */]);

// 修正パターン: 同 articleId で speak 済みなら早期 return + 切替時にリセット
const speakTriggeredRef = useRef<string | null>(null);
useEffect(() => {
  if (speakTriggeredRef.current === articleId) return;
  if (!start) return;
  speakTriggeredRef.current = articleId;
  onSpeak(ttsText);
}, [articleId, ttsText /* ... */]);

// articleId 切替時の独立 reset effect で speakTriggeredRef.current = null
```

**Why**: 二重防止 ref がないと TTS 完了で `ttsPlaying=false` に戻った瞬間に effect が再発火し、同記事を無限に再 speak するループが発生する。

**How to apply**: 「副作用が一度だけ走るべき」effect の依存配列に変動値が入っているなら、必ず ID ベースの `triggeredRef` で防護する。`fetchTriggeredRef` / `speakTriggeredRef` のように **「何 ID で何を実行したか」** を ref に持たせて、同 ID で再実行しないようにガードする。

## 同一プロパティ名で意味の異なる派生値を使い分けない

UI 用と判定ロジック用で意味が違う「派生 boolean」は、**別名で分離する**。同名で意味だけ変えると、片方の意味で正しくても他方では誤判定になる。

```typescript
// アンチパターン: hasContent がサマリ含むかフル本文かで意味がブレる
const hasContent = !!(processedContent || article?.summary);
//   ↑ AI/TTS ボタン表示用には正しい
//   ↑ オートモードの「fetch 不要か」判定には誤り — サマリ fallback で fetch スキップ

// 修正パターン: 用途別に派生値を分ける
const hasContent = !!(processedContent || article?.summary); // UI 用
const hasFullContent = !!processedContent; // 全文取得 gate 用
```

**Why**: 同名の派生 boolean が UI 用と判定用で意味がブレると、片方の用途で「既に十分」と判定されて他方の処理（fetch トリガーなど）がスキップされる連鎖バグが起きる。

**How to apply**: 派生 boolean / 派生 state を作るときは「どの判定に使うか」を 1 つに絞る。複数の判定で使うなら **判定別に派生値を分ける**。`hasContent` のような汎用名は曖昧なので、`hasFullContent` / `hasSummaryOnly` / `canRender` のように **意図が読み取れる名前** を付ける。

## fallback ロジックの伝播範囲を意識する

`processedContent ?? article.summary ?? ""` のような fallback は、UI 描画では合理的でも、**そのまま判定ロジックに伝播させると意味が変わる**。fallback 結果を渡す境界で「fallback 適用後の値か / 元の値か」を明確に区別する。

```typescript
// アンチパターン: buildTtsText の fallback 結果がそのまま speak gate に伝播
function buildTtsText(article, processedContent) {
  return preprocessTtsText(toPlainText(processedContent ?? article.summary ?? ""));
}
// ↑ ttsText は常にサマリ fallback 込みで非空になる → shouldStartAutoSpeak の hasText 条件が常に true に

// 修正パターン: 判定側で「フル本文有無」を別途渡してゲートする
shouldStartAutoSpeak({
  hasText: !!ttsText.trim(),
  canFetch,
  hasFullContent, // ← fallback 適用前の事実
});
```

**Why**: 描画用の fallback 結果（サマリ等）がそのまま判定関数に伝播すると、「本来 fetch されるべきタイミング」がバイパスされて本文未取得のまま下流処理（TTS / 既読判定など）が走ってしまう。

**How to apply**: fallback を含む文字列・配列を判定関数に渡すときは、判定側で「fallback されたかどうか」を別 boolean で受け取る。`hasText` のような fallback 後の事実だけでなく、`hasOriginal` のような fallback 前の事実も渡せるよう設計する。

### 派生ケース: 派生 boolean は fallback 混入後の値ではなく、fallback **前の origin** から導出する

派生 boolean を「正しい用途名」で分離した (例: `hasContent` → `hasFullContent`) としても、**その派生元が fallback 込みの値**だと依然として誤判定が起きる。

```typescript
// アンチパターン: hasFullContent は名前は正しいが、processedContent が fallback 込み
const rawContent = storedContent ?? article?.content ?? null;
//                              ↑ ここで fallback が混入
const processedContent = rawContent ? processContent(rawContent) : null;
const hasFullContent = !!processedContent;
//                     ↑ article.content (RSS 本文) があれば fetch 前でも true → speak 早期発火

// 修正パターン: fallback 前の origin (storedContent) から直接導出
const hasFullContent = !!storedContent || !canFetch;
//                     ↑ fetch 完了済 OR fetch 不要のときだけ true
```

**Why**: 派生 boolean の「名前」を正しくしても、その派生元が fallback 込みの中間値だと、fallback がトリガーされた瞬間に boolean が誤って true になる。`processedContent` のような **「複数ソースを ?? で混ぜた値」を経由した派生 boolean は、必ず origin (storedContent / article.content) のどちらから来たかを区別する**。

**How to apply**: 派生 boolean を作るとき:

1. **派生元を辿る**: `derived = !!middleValue` と書きたくなったら、`middleValue` の定義を見て fallback (`A ?? B ?? C`) が含まれていないか確認
2. **fallback 込みなら origin から再構築**: 「fetch 済か」を判定したいなら `!!storedContent`、「fetch 不要か」を判定したいなら `!canFetch`。両方なら `!!storedContent || !canFetch`
3. **テストで検証**: 「fallback 元 (article.content) があるが fetch 前」のケースで boolean が false になるか、ユニットテストで明示

## 既存設定 UI を流用して新要件を満たす（新規 UI を増やさない判断軸）

ユーザーから「設定可能化したい」要望が来たとき、**意味的に重なる既存 UI があれば、それを流用して内部ロジックだけ拡張**する選択肢を最初に検討する。

```typescript
// アンチパターン: 同じ「N 日」値を 2 箇所で設定させる
// UI: 記事保持期間 (30/60/180 日) ← 既存
// UI: 既読自動削除 N 日 (30/60/180 日) ← 新規 ← ユーザーが両方設定して齟齬発生

// 修正パターン: 既存 UI の値を内部で複数の用途に再利用
// UI: 記事保持期間 (30/60/180 日) ← そのまま
// 内部: ttlDays から effective cutoff を算出して prune にも適用
```

**Why**: 同じ値（例: 30/60/180 日）を意味重複する 2 箇所で設定させると、ユーザーが両方設定して齟齬が発生する / 片方しか設定せず期待と動作がズレる、などの混乱を招く。

**How to apply**: 「設定可能化」要望には次の順で検討:

1. **意味が重なる既存設定があるか** → あれば流用（純粋関数で複数用途に値を変換）
2. 流用すると挙動が予期しない方向に変わるユーザーがいるか → RELEASE_NOTES で告知
3. 完全に独立した概念なら新規 UI を追加

新規追加した場合、必ず「既存設定との優先順位」を明示する（max / min / 最後の更新優先など）。

## ResizeObserver で絶対座標仮想化レイアウトの末端高さを監視する

masonic / react-virtual のような **絶対座標で要素を配置する仮想化ライブラリ** を使うと、コンテナの `scrollHeight` はレイアウト確定後に動的に書き換わる。「コンテンツが viewport を埋めているか」を判定する必要がある場合、static な useEffect だけでは初回レイアウト確定タイミングを捉えられない。

```typescript
// アンチパターン: visible.length 依存だけだと masonic のレイアウト確定後の高さ変化を捕捉できない
useEffect(() => {
  const isShort = scrollEl.scrollHeight <= scrollEl.clientHeight;
  // ↑ 初回レンダー時はまだ masonry 配置前で scrollHeight が 0
}, [visible.length]);

// 修正パターン: ResizeObserver で scrollContainer のサイズ変化も監視
useEffect(() => {
  const observer = new ResizeObserver(() => {
    const isShort = scrollEl.scrollHeight <= scrollEl.clientHeight + 1;
    if (isShort && hasMore) loadMore();
  });
  observer.observe(scrollEl);
  return () => observer.disconnect();
}, []);
```

**注意点**: `ResizeObserver` は要素自身のリサイズを検知する。子要素が追加されてコンテナが拡張する場合は通常検知されるが、絶対座標配置で **親コンテナ自身の clientHeight が変わらない** ケースでは発火しない。その場合は `MutationObserver` (subtree childList 監視) との併用や、`requestAnimationFrame` を 2 段で待ってからチェックする手法を組み合わせる。

**Why**: masonic / react-virtual の絶対座標配置では、`scrollHeight` がレイアウト確定後に動的に書き換わるため、IntersectionObserver の sentinel に依存するだけでは「列偏在で sentinel に届かない」状態を検知できず無限スクロールが止まる。`ResizeObserver` + rAF 2 段待機の併用で解消する。

## AbortController.abort() の伝播範囲を限定する

**1 つの `AbortController` を複数の並列 fetch で共有しないこと**。共有してしまうと、1 件の fetch を止めるための `controller.abort()` が **他の進行中の fetch も全て中断** してしまう。

```typescript
// アンチパターン: 全 worker が同じ controller を共有
const controller = new AbortController();
async function worker() {
  while (!cancelled) {
    await fetchOne({ signal: controller.signal });
    // 1 件で 429 → onRateLimit が controller.abort() を呼ぶ
    // → 進行中の他 worker の fetch も全て中断 → 残り未処理記事は処理されない
  }
}

// 修正パターン A: フラグだけ立てて while 条件で自然停止
const controller = new AbortController();
let rateLimited = false;
async function worker() {
  while (!cancelled && !rateLimited) {
    await fetchOne({
      signal: controller.signal,
      onRateLimit: () => {
        rateLimited = true;
        // controller.abort() は呼ばない — 進行中の fetch は完走させる
      },
    });
  }
}

// 修正パターン B: 各 fetch で個別の controller を作る
async function fetchOne(article) {
  const localController = new AbortController();
  return fetch(url, { signal: localController.signal });
}
```

**Why**: 共有 controller を 1 件のエラーで abort すると、進行中の他記事の fetch も全て中断され、それらは `failedIds` にも入らず UI 上にリトライボタンも出ない「空カードで停止」状態になる。

**How to apply**: `AbortController` を共有する設計を採るときは、abort のスコープを明示する:

- **コンポーネントアンマウント / effect cleanup での中断** → 1 つの controller で OK（全部止めるのが正しい）
- **個別エラー時の中断** → 各 fetch ごとに別 controller、または `controller.abort()` ではなくフラグで自然停止
- **どちらも必要** → cleanup 用 controller と個別 controller を分ける

判定基準: 「この abort で止まる対象は、止めるべき対象と一致しているか？」。一致しないなら controller 共有は誤り。

## UI 描画分岐の入れ子三項は「ソース選択」純粋関数で平坦化する

複数の props (prefetched / fallback / error 等) の組み合わせで「何を描画するか」を決める入れ子三項は、**条件の組み合わせの抜けに気付きにくい**。組み合わせの判定を `select<X>(args): { value, source }` 形式の純粋関数に切り出して UI と分離する。

```tsx
// アンチパターン: 入れ子三項で組み合わせが暗黙
{
  hasMultipleImages ? (
    <BodyImages images={prefetched} minPx={minPx} />
  ) : isFetchFailed ? (
    <FailedUI thumb={thumb} />
  ) : thumb ? (
    <ThumbFallback thumb={thumb} />
  ) : (
    <NoImagePlaceholder />
  );
}
// ↑ prefetched=[] (空) と prefetched=undefined (未取得) の挙動差が暗黙
// ↑ thumb と prefetched の優先順位がコードから読み取りにくい
// ↑ 「prefetched=空 + thumb=set」の組み合わせがどこで処理されるか追跡が必要

// 修正パターン: ソース選択を純粋関数化
export function selectGalleryImages(
  prefetched: string[] | undefined,
  thumb: string | undefined,
): { images: string[]; source: "prefetched" | "thumb" | "none" } {
  if (prefetched && prefetched.length > 0) return { images: prefetched, source: "prefetched" };
  if (thumb) return { images: [thumb], source: "thumb" };
  return { images: [], source: "none" };
}

// UI: source の値で 1 段の switch にする
const { images, source } = selectGalleryImages(prefetched, thumb);
{
  isFetchFailed ? (
    <FailedUI thumb={thumb} />
  ) : source !== "none" ? (
    <ImageList images={images} useFilter={source === "prefetched"} />
  ) : (
    <NoImagePlaceholder />
  );
}
```

**Why**: 入れ子三項は「フォールバックの順序」と「組み合わせの網羅」が暗黙のまま蓄積する。新しい状態 (例: `prefetched=[]` で「明示的に空」を表現) を追加したとき、既存ブランチで意図しない動作になる確率が高い。純粋関数で「何が選ばれたか」(`source`) と「何を描画するか」(`images`) を **明示的に分離** すれば、TDD で全組み合わせをテスト可能。

**How to apply**: 3 段以上の入れ子三項を書きそうになったら、まず「どの値を選ぶか」を `select<X>` 純粋関数に切り出す:

1. **入力**: 描画判定に使う props 全部 (boolean / 配列 / null 含む)
2. **出力**: `{ value, source }` 形式 — `source` は `"a" | "b" | "none"` のような **判別可能な enum**
3. **テスト**: 全分岐 + edge case (空配列 / null / 空文字列) を spec で網羅
4. **UI**: `source` で switch (1 段の三項 or `match`) — 入れ子は最大 1 段に抑える

純粋関数化のメリット: ① 全組み合わせの spec カバレッジ、② UI 側のロジックが 1 行で読める、③ 後で「動画 fallback も追加」のような拡張で `source` enum を増やすだけで済む。

主な使用箇所: `src/lib/gallery-display.ts#selectGalleryImages` / `src/lib/auto-read.ts#shouldStartAutoSpeak`

## UI 表示条件の「N 件以上」マジックナンバーを慎重に扱う

「複数件あるときだけ UI を出す」のような条件 (`length >= 2` / `> 1` 等) は、**「1 件しかない場合のユーザーニーズ」を見落としやすい**。設計時は「複数のとき集約 UI を出す」意図でも、ユーザー視点では「1 件でもその UI が欲しい」ケースがほとんど。

```tsx
// アンチパターン: 「複数枚あるときだけ一括保存ボタン」
{
  images.length >= 2 && <button>一括保存 ({images.length}枚)</button>;
}
// → 1 枚しかない記事では「保存」できなくなる

// 修正パターン: 1 件でも表示してラベルを動的化
{
  images.length >= 1 && (
    <button>{images.length === 1 ? "保存" : `一括保存 (${images.length}枚)`}</button>
  );
}
```

**Why**: 「複数枚向けの集約 UI」を `>= 2` で隠すと、1 枚しかない記事でその UI が利用できず、ユーザーは関連機能（保存・選択など）を実行できなくなる。内部処理（`downloadAllImages` 等）は 1 件配列でも正常動作することがほとんど。

**How to apply**: UI 条件で「N 件以上」を書くときは:

1. **0 件と 1 件以上で分ければ十分か** を最初に検討（`> 0` / `>= 1`）
2. **本当に「複数件」を要求する根拠**（DL ファイル名衝突回避など）があるかチェック。なければ `>= 1` に緩和
3. ラベルや動作が件数で変わるなら **動的に切り替える**（「保存」 vs 「一括保存 (N 枚)」）
4. 「集約系 UI」と「単発 UI」が冗長に併存する場合 (例: thumb の「保存」と本文の「一括保存」) は問題ない。両方選べる方がユーザー親切

## 自動生成ファイルは全実行パスで生成フックを設置する

`.gitignore` 対象の自動生成ファイル（`scripts/sync-*.mjs` で生成されるなど）は、**ビルドだけでなく lint / typecheck / e2e のすべての実行パス** で生成されるよう pre-script を設置する。

```json
// アンチパターン: prebuild だけ。CI の typecheck で生成漏れ
{
  "scripts": {
    "prebuild": "node scripts/sync-release-notes.mjs",
    "build": "next build",
    "typecheck": "tsc --noEmit",
    "check": "vp check"
  }
}

// 修正パターン: 全 entry に pre-script 設置
{
  "scripts": {
    "prebuild": "node scripts/sync-release-notes.mjs",
    "build": "next build",
    "pretypecheck": "node scripts/sync-release-notes.mjs",
    "typecheck": "tsc --noEmit",
    "precheck": "node scripts/sync-release-notes.mjs",
    "check": "vp check",
    "precheck:fix": "node scripts/sync-release-notes.mjs",
    "check:fix": "vp check --fix"
  }
}
```

**Why**: CI は `pnpm install` 直後に lint / typecheck を実行するため `prebuild` が起動しない。ローカル開発では `predev` / `prebuild` で生成されるため気付きにくく、CI だけで TS2307 エラーになる。

**How to apply**: 自動生成ファイルを参照するスクリプトを追加するときは、想定される実行コマンド (`build` / `dev` / `typecheck` / `check` / `test:e2e` 等) **すべてに pre-script を設置** する。スクリプトが軽量 (数十 ms 以下) なら頻繁に走っても性能影響なし。重いなら以下を検討:

- 出力ファイルの存在チェックでスキップする idempotent な実装にする
- CI でのみ明示的に実行するステップを追加する

代替策: 自動生成ファイルを `.gitignore` から外して commit する（trade-off: PR diff が増える、人間が手で編集してしまうリスク）。

## useEffect 依存キーの slice() は「N+1 件目以降の変化を検知不能」にする罠

`articles` のような **配列全体を対象に処理したい** useEffect で、依存配列キーを `articles.slice(0, N).map(a => a.id).join(...)` のように作ると、**N+1 件目以降の追加・削除を検知できなくなる**。

```typescript
// アンチパターン: 先頭 N 件 ID だけのキーで「visible 拡張」を検知できない
const articlesKey = articles
  .slice(0, 20) // ← 21 件目以降の変化が無視される
  .map((a) => a.id)
  .join("\0");

useEffect(() => {
  // 21 件目以降の処理がこの effect で行われるべきだが、再実行されない
  void prefetch(articlesRef.current);
}, [articlesKey]);

// 修正パターン: 全件 ID でキーを作る (visible 拡張を確実に検知)
const articlesKey = articles
  .filter((a) => Boolean(a.link))
  .map((a) => a.id)
  .join("\0");
```

**Why**: 先頭 N 件 ID だけのキーでは、ユーザーがスクロールして visible が拡張されてもキー不変 → effect 再実行されず → N+1 件目以降が永遠に未処理のまま放置される症状になる。

**How to apply**: 依存配列キーを文字列ハッシュで作るときは:

1. **何の変化を検知したいか** を明確にする（先頭固定 N 件 / 全件 / フィルタ後の集合 etc.）
2. **slice / take / 先頭 N 件**を入れたら、N+1 件目以降の変化が **意図的に無視される設計** か再確認
3. 「処理対象の上限」と「変化検知の対象」は **別概念** として分離する。上限は effect 内の `targets.slice(0, lim)` で、検知は `articlesKey` で全件。
4. 全件キーが長くなりすぎる懸念があれば、**ハッシュ関数** (`SHA-1` 短縮など) で短縮するのも一手。ただし `join("\0")` の単純文字列でも数千件までは実用上問題なし

## 同症状でも別経路の可能性を疑う

「ギャラリーが止まる」「TTS が止まる」のような **同じ症状の連続バグ報告** は、修正後も別経路で再発する可能性が高い。1 つ修正しただけで「同症状の Issue は全部解決」と思い込まないこと。

**Why**: 同症状で別経路のバグは「前の修正で直したつもり」が認知バイアスとして働き、新規調査を怠りがち。実例として「ギャラリー停止」系で「全 worker abort」と「先頭 N 件キー固定」の 2 経路が連続発生したケースがある。

**How to apply**:

- 「同症状の Issue を再起票された」ら、**前回修正のコミット diff** を読み直して「自分が直したのは本当に唯一の原因か」を疑う
- 「修正したのに直らない」「修正したのにまた起きた」のキーワードがコメントに出たら、必ず別経路を疑って再調査
- バグ修正のコミットメッセージには **「真因 = 〇〇」** を明記して、別経路調査時の参照点にする

## モード OFF 時に進行中の副作用を停止する

state を OFF にしただけでは、すでに実行中の副作用（TTS 発話・進行中の fetch・タイマー）は止まらない。**モード変化を監視する useEffect で明示的に停止コールを行う**。

```typescript
// アンチパターン: enabled = false でも TTS は鳴り続ける
function AutoReadController({ enabled /* ... */ }) {
  // 停止ハンドラなし
}

// 修正パターン: enabled の変化で副作用を止める
useEffect(() => {
  if (enabled) return;
  onTtsStop();
  // または: abortRef.current?.abort();
}, [enabled]);
```

**Why**: state を OFF にしただけだと、ユーザー目線では「停止ボタンが効かない」体感になる。フラグの変化を監視する独立 effect で副作用を明示停止させる必要がある。

**How to apply**: 機能が「ON / OFF」のフラグで動く場合、OFF 遷移時のクリーンアップが副作用を 100% 止めているか必ず確認する。fetch / timer / 音声 / WebSocket / IntersectionObserver などすべて。

## ブラウザ API の遅延通知に備えて初期取得 + イベント購読をペアで書く

`speechSynthesis.getVoices()` のように **初回呼び出しでは空配列を返し、後から `voiceschanged` イベントで利用可能になる** ブラウザ API がある。useEffect で初期取得だけしても永遠に空のままなので、必ずイベント購読とペアで実装する。

```typescript
// アンチパターン: 初期取得のみで遅延通知を捕捉できない
useEffect(() => {
  setVoices(window.speechSynthesis.getVoices()); // Chrome では空配列
}, []);

// 修正パターン: 初期取得 + voiceschanged 購読をペア
useEffect(() => {
  const update = () => setVoices(window.speechSynthesis.getVoices());
  update(); // Safari など初期取得で取れる環境用
  window.speechSynthesis.addEventListener("voiceschanged", update);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
}, []);
```

**Why**: ブラウザ API には「初期化が非同期で完了する」ものが多く、初期取得だけだと一部環境で永遠に空/旧値のままになる。Chrome の `voiceschanged` / DOM の `MutationObserver` / `navigator.mediaDevices.devicechange` / `screen.orientation.change` などはすべて同じパターン。

**How to apply**: ブラウザネイティブ API を呼ぶ useEffect を書くとき:

1. **「初回呼び出しで完全な値が取れるか？」を必ず確認** (MDN ドキュメント or 動作確認)
2. 取れない場合、**変更通知イベントが提供されているか確認** (`xxxchanged` / `change` 系)
3. 提供されているなら **初期取得 + イベント購読 + cleanup の 3 点セット** を必ず書く
4. 提供されていない (古い API) なら polling / setInterval を最小頻度で

主な使用箇所:

- `useSpeechSynthesis` の `voiceschanged` 購読 (#654)
- `useResizeObserver` 系 (`ResizeObserver` の初回コールバック)
- `useOnlineStatus` の `online` / `offline` イベント購読

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

**Why**: 一部の上流サイト (wallhaven.cc 等) は 429 を `Retry-After` なしで返してくる。クライアント側の retry-after.ts が遅延時間を判定できず即時リトライ → 再 429 の連鎖になるため、プロキシ層で必ず補完する。

**How to apply**: 外部 HTTP レスポンスを中継する Route Handler で、クライアント側 (retry-after.ts 等) が依存しているヘッダがあれば補完を必ず入れる。

## 読み取り状態のマージ戦略 (`useReadState`)

R2 サーバーデータとローカル `localStorage` のマージは **ローカル優先 (local ∪ server)**。
一度クライアントで既読にした記事はサーバーに未読状態が残っていても既読扱いになる。

```typescript
// ローカル ∪ サーバー（ローカル優先）
const merged = new Set([...serverSet, ...localSet]);
```

例外:

- **スヌーズ期限はより遅い方を採用**（サーバーの期限が未来の場合を優先）。
- **ノート（notes）は同一キーではサーバー優先**（`{ ...prev, ...serverNotes }`）。ノートはテキスト編集コンテンツのため、クロスデバイス同期で別デバイスで書いた最新版をサーバーから上書きするのが正しい挙動。

## テスト (TDD)

- **テスト駆動開発**: 新機能・バグ修正は **Red → Green → Refactor** の順で実装する
  1. テストを書く → `npx playwright test e2e/{name}.spec.ts` で **失敗 (Red)** を確認
  2. 実装する → テストが **通る (Green)** ことを確認
  3. リファクタ → テストが **Green のまま** なことを確認
- テストファイルは `e2e/` に `*.spec.ts` として配置（Playwright テストランナー使用）
- 純粋関数（パーサー・変換・バリデーション）はファイルを直接 import してユニットテスト
- Cloudflare バインディングに依存するコードは E2E テスト（dev サーバー起動が必要）でカバー
- テスト名は日本語可: `test('空のHTMLをMarkdown変換すると空文字を返す', ...)`
- **テスト名・コメントは実装の意図と用語を整合させる**: 例えば `crypto.randomUUID()` で生成される値の検証で「UUID v4」と書くと v4 固有のバリアントビット制約まで含意してしまう。実際の正規表現が UUID 一般形式なら「UUID 形式」と書く。テスト名と実装の用語齟齬は、後続の開発者が仕様を読み誤る原因になる
- 共通ファクトリは `e2e/helpers/` に配置（例: `makeArticle()`, `makeFeed()`）

```typescript
// ユニットテストの例（Cloudflare バインディングなし）
import { test, expect } from "@playwright/test";
import { myPureFunction } from "../src/lib/my-module";

test("正常ケース", () => {
  expect(myPureFunction("input")).toBe("expected");
});
```

## 依存管理 — Dependabot / pnpm.overrides

### Dependabot alerts の確認タイミング

- `gh api repos/.../dependabot/alerts` の結果は **キャッシュ遅延**があるため、push 前のチェックでは新規脆弱性を見逃すことがある
- **master push 後の `git push` レスポンスメッセージ**（"GitHub found N vulnerabilities ..."）も必ず確認する
- 検出された場合は `--severity high` から優先対応

### transitive dependency の強制更新（`pnpm.overrides`）

直接依存していない transitive dep に脆弱性が出た場合、`package.json` の `pnpm.overrides` で強制更新する：

```json
{
  "pnpm": {
    "overrides": {
      "fast-xml-builder": ">=1.1.7"
    }
  }
}
```

`pnpm install` 実行で resolved version が更新される。`pnpm-lock.yaml` の変更を確認後、関連 e2e テストで動作確認してからコミット。

主な使用箇所: `fast-xml-parser` の依存である `fast-xml-builder`（GHSA-2025-attribute-bypass / comment-regex）

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

**Why**: silent fallback は「ユーザー: 最新 Chrome なのに使えない」「開発者: DevTools にも出ない」のダブルブラックボックスを生む。`devError` で出した情報は `process.env.NODE_ENV !== 'production'` でだけ console.error されるため、本番ノイズにならず開発時の調査だけ可能になる。フォールバックが**意図通り動作している**のか**仕様変更で壊れている**のかを区別する唯一の手段。

**How to apply**: 外部依存ラッパーで `catch { return null }` を書きたくなったら、必ず `devError` を併記する。前提条件 (user activation, secure context, hardware requirement, API バージョン) のガード節も同様に reason を `devError` で出す。`null` 返却の経路が複数あるなら全箇所で出す。

主な使用箇所: `src/lib/browser-summarizer.ts` / `src/lib/browser-translator.ts`（Chrome 組み込み AI ラッパー）

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

**Why**: バージョン bump 忘れは「ファイル先頭コメントに `Chrome 138+` と書いてあるのに実装は 131 のまま」のような腐敗を起こす。export const 1 箇所にすれば TDD で `MIN_SUMMARIZER_CHROME_VERSION` の整合性を assert できるし、設定 UI のメッセージ (`Chrome 138 以上にアップデートすると…`) も同じ定数から参照できる。

**How to apply**: ブラウザ API のバージョン要件は `MIN_XXX_CHROME_VERSION` 形式で export const 化する。ファイル先頭の jsdoc コメントが「Chrome N+」と述べているなら、その N が定数として実装にも現れているか確認する。UI メッセージの数字もハードコードせず定数を文字列補間する（i18n しない場合でも保守性のため）。

主な使用箇所: `src/lib/browser-summarizer.ts#MIN_SUMMARIZER_CHROME_VERSION` / `src/lib/browser-translator.ts#MIN_TRANSLATOR_CHROME_VERSION`

## 早期 return をコンポーネント / 関数に切り出すと TypeScript narrowing が失われる

巨大コンポーネントの「ロード中 / エラー / 未認証」のような **早期 return パス** をサブコンポーネントや関数に切り出すと、後続のコードで TypeScript narrowing が失われる。呼び出し側で `null` 戻り値を early-return する形に書き換えても、TS の制御フロー解析は呼び出し先関数の戻り値を追跡できないため。

```tsx
// アンチパターン: 切り出し後 TS が user の non-null narrowing を失う
function AppLandingState({ user, betaRestricted }: Props) {
  if (user === undefined) return <Loading />;
  if (betaRestricted) return <BetaPage />;
  if (!user) return <LandingPage />;
  return null;
}

function App() {
  const { user, betaRestricted } = useAuth();
  const landingNode = AppLandingState({ user, betaRestricted });
  if (landingNode) return landingNode;
  // ↓ ここで user は依然 UserProfile | null | undefined のまま
  return <MainUI userId={user.id} />; // TS2322: undefined / null を assign できない
}

// 修正パターン: landingNode 後に narrowing を再現する明示的なガードを置く
function App() {
  const { user, betaRestricted } = useAuth();
  const landingNode = AppLandingState({ user, betaRestricted });
  if (landingNode) return landingNode;
  if (!user) return null; // ← TS narrowing を再導入 (実行時に到達しないが型のために必要)
  return <MainUI userId={user.id} />; // OK: user は UserProfile に絞り込まれた
}
```

**Why**: TypeScript の制御フロー解析は呼び出した関数の **戻り値が non-null かどうか** で呼び出し元の変数を絞り込めない。早期 return を関数に切り出した場合、呼び出し元では「landingNode が null でなければ既に return している」だけしか TS には伝わらず、元の `if (user === undefined) return ...` で得られていた `user: UserProfile` への narrowing は復元されない。

**How to apply**: 早期 return パスをコンポーネント / 関数に切り出すときは、

1. 切り出し前に「**この early-return が narrow していた変数は何か**」を確認する (例: `user`)
2. 切り出し後、呼び出し元に `if (!targetVar) return null;` のような **TS narrowing 用の明示ガード** を追加する (実行時には早期 return パスで既に弾かれているため到達しないが、型のためだけに残す)
3. ガード行には `// TS narrowing 用` のような短いコメントを添えて、実行時には冗長に見える理由を明示する

主な使用箇所: `src/components/AppLandingState.tsx` (オーケストレーター呼び出し側で `if (!user) return null;` ガードを併記)

## 禁止事項

- D1 / DO の追加 (シンプルさを保つ。KV は `RATE_LIMIT` で導入済み)
- 外部 CSS ライブラリ (Tailwind のみ)
- 外部アイコンライブラリ (インライン SVG のみ)
- `any` 型の使用
- 16進数カラーのハードコード
- Hono の `c.json<T>()` パターン (Next.js Route Handlers では使えない)
- `r.json<T>()` (ブラウザ fetch には型引数なし。`r.json() as Promise<T>` を使う)
- モジュールレベルのキャッシュ変数 (Edge Runtime では各リクエストで再実行される)
