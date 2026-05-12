---
description: useEffect 副作用パターン集 — ResizeObserver / AbortController 伝播 / モード OFF 停止 / 時刻境界 hook / ブラウザ API 遅延通知購読
paths: "src/hooks/**/*.ts,src/**/*.tsx"
---

# React useEffect 副作用パターン

`react-patterns.md` から `#733` Step (effect 系 5 セクション抽出) で分割した、useEffect の副作用ライフサイクル管理に関するパターン集。

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

### 派生ケース: IntersectionObserver は `isIntersecting: true` 維持時に新規 callback を発火させない罠

`IntersectionObserver` は **`isIntersecting: false → true` の遷移時にのみ** callback を発火させる。一度 `true` になった後、要素 size 変化や parent scroll で **再評価が走っても、`isIntersecting: true` のままなら新規 callback は来ない**。

無限スクロール (sentinel-based loadMore) で以下のシナリオが詰まる典型:

```
1. visible 10 件 → sentinel が viewport 内 (intersect=true) → loadMore 発火 → visible 20 件
2. visible 20 件でも viewport 高さに満たない (pageSize 小 / フィルター済 / 単一フィード等)
   → sentinel 依然 viewport 内 (intersect=true 維持)
3. IntersectionObserver は intersect=true のままで新規 callback を発火させない
   → 次の loadMore が永久に発火しない → ユーザーから見るとスクロールしても記事が読み込まれない
```

```typescript
// アンチパターン: IntersectionObserver 単独 + loadMore 後の sentinel 詰まりに無策
useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMoreRef.current) {
        loadMoreRef.current();
      }
    },
    { rootMargin: "600px" },
  );
  observer.observe(sentinelRef.current!);
  return () => observer.disconnect();
}, []);
// → コンテンツが少なくて sentinel が viewport 内に留まる場合、初回 1 回 loadMore で詰まる

// 修正パターン: visible.length 変化を deps にした「再 viewport チェック」useEffect 追加
useEffect(() => {
  if (!hasMore) return;
  const el = sentinelRef.current;
  if (!el) return;
  const id = setTimeout(() => {
    if (!hasMoreRef.current) return;
    const rect = el.getBoundingClientRect();
    const rootMargin = 600;
    const inViewport = rect.top < window.innerHeight + rootMargin && rect.bottom > -rootMargin;
    if (inViewport) {
      loadMoreRef.current();
    }
  }, 0);
  return () => clearTimeout(id);
}, [visible.length, hasMore]);
```

**動作**:

- visible.length 変化 (= loadMore 後) のたびに 1 tick 待ち
- sentinel の `getBoundingClientRect()` で viewport 内 (rootMargin 含む) かを判定
- 内なら `loadMore()` をもう 1 回発火 → 連鎖的にロード継続を担保
- `hasMore: false` になった瞬間に停止 → 無限ループは発生しない

**How to apply**: IntersectionObserver で「intersect=true → 何か処理 → DOM 変化」する設計を書くとき (IO は遷移 trigger のみで、`isIntersecting: true` 維持時の新規 callback は仕様で発火しない、観察対象の DOM size 変化や追加要素 push で再評価しても callback は来ない):

1. **「観察対象 (sentinel / lazy target / sticky 切替判定要素) が DOM 変化後も `isIntersecting: true` のまま残る可能性があるか**」を判定
2. 可能性ありなら、**DOM 変化を deps にした「再 viewport 内チェック」useEffect** を追加:
   - deps に `visible.length` / `items.length` / `state` 等の DOM 変化 trigger を含める
   - `setTimeout(0)` で 1 tick 待ち (intersection 通常 callback と区別 + DOM レイアウト確定後)
   - `getBoundingClientRect()` で viewport 判定 (IO の rootMargin と同等の判定式)
   - 停止条件 (`hasMore: false` 等) を明示して無限ループ防止
3. **eager-load を撤廃するときは IO 仕様限界を再考慮** — eager-load 削除で IO 単独に絞ったら、本派生ケースが必須になる可能性高い

**反例 (本派生ケースが不要なケース)**:

- 観察対象が DOM 変化後に必ず viewport 外に出る (例: sticky header の切替判定で、スクロール位置が一意に決まる)
- DOM 変化が発生しない one-shot 観察 (例: lazy image load で intersect=true 1 回で `unobserve()` する)
- IO の `threshold` を多段に設定して partial intersection でも callback 発火させる設計 (高度、本罠を別軸で回避)

主な使用箇所: `useArticlePagination.ts` (#772) — pageSize 10 + フィルター済 + 単一フィードで sentinel が viewport 内に留まり次 loadMore が永久に発火しない問題、`visible.length` を deps にした追加 useEffect で「viewport 内なら 1 回追加発火」を実装。`68a37daf` で eager-load 撤廃した際に IO 仕様限界を再考慮しないと本罠が再発するため codify

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

**How to apply**: `AbortController` を共有する設計を採るときは、abort のスコープを明示する:

- **コンポーネントアンマウント / effect cleanup での中断** → 1 つの controller で OK（全部止めるのが正しい）
- **個別エラー時の中断** → 各 fetch ごとに別 controller、または `controller.abort()` ではなくフラグで自然停止
- **どちらも必要** → cleanup 用 controller と個別 controller を分ける

判定基準: 「この abort で止まる対象は、止めるべき対象と一致しているか？」。一致しないなら controller 共有は誤り。

### 派生ケース: useEffect で「articleId 変更時に in-flight fetch を abort」する設計は **child → parent の effect 発火順** で破綻する

「データ取得 hook」(useArticleContent / useFeedContent 等) の `useEffect[targetId]` で「対象が変わったら進行中の fetch を abort」する設計はよくあるが、**同じ親コンポーネントが render する子コンポーネント (AutoXxxController など) が effect(1) で同 hook の `fetchFullContent` を呼ぶと、effect 発火順 (子 → 親) のせいで子が起動した新 fetch を親の cleanup effect が abort する**。

```typescript
// アンチパターン: 親の cleanup が子の起動した新 fetch を abort
function useArticleContent(articleId) {
  const fetchAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchAbortControllerRef.current?.abort(); // ← 子が直前に set した V_new を abort!
    fetchAbortControllerRef.current = null;
  }, [articleId]);

  const fetchFullContent = useCallback(async () => {
    fetchAbortControllerRef.current?.abort();
    const controller = new AbortController();
    fetchAbortControllerRef.current = controller;
    await apiFetch(url, { signal: controller.signal });
  }, [articleId]);
}

// 子コンポーネント (AutoReadController) で effect(1) が onFetch を呼ぶ
useEffect(() => {
  if (shouldFetch) onFetch(); // ← この effect は子のため先に発火
}, [articleId, ...]);

// 発火順:
//  1. 子 effect: onFetch → fetchFullContent → V_new set, await yield
//  2. 親 useEffect[articleId]: V_new.abort()  ← 即 abort!
```

修正パターン: **controller に articleId を併記して、stale (古い articleId 用) のときのみ abort**:

```typescript
const fetchAbortControllerRef = useRef<{
  controller: AbortController;
  articleId: string | undefined;
} | null>(null);

useEffect(() => {
  const ref = fetchAbortControllerRef.current;
  // 自身と同じ articleId 用 (= 子が直前に set した新 fetch) はスキップ
  if (ref && ref.articleId !== articleId) {
    ref.controller.abort();
    fetchAbortControllerRef.current = null;
  }
}, [articleId]);

const fetchFullContent = useCallback(async () => {
  fetchAbortControllerRef.current?.controller.abort();
  const controller = new AbortController();
  fetchAbortControllerRef.current = { controller, articleId }; // ← articleId 記録
  await apiFetch(url, { signal: controller.signal });
}, [articleId]);
```

**How to apply**: `useRef<AbortController>` + `useEffect[targetId]` で abort + cleanup する hook を書くとき (useEffect 発火順は子→親 depth-first なので、子 effect が新 fetch を set した後で親 cleanup がそれを abort する逆転が発生する):

1. **その hook が公開する関数 (fetch / subscribe / start) を、子コンポーネントが effect で呼んでいないか** を確認
2. 呼んでいる場合、**子の effect は親の cleanup より先に発火する** ことを意識
3. ref の値に **「対象 ID」を併記** (`{ controller, articleId }`) して、cleanup では **stale 判定** してから abort
4. ID が一致するときの abort をスキップしても、`fetchFullContent` 内の `ref.current?.controller.abort()` (新 fetch 起動時) で旧 fetch は確実に abort されるので問題ない
5. **本番ログで abort 発火元を切り分ける必要があるとき** は、`articleId-effect-fired { hadController, isStaleController }` のように **ref の状態 + 判定結果** をログに出す

主な使用箇所: `useArticleContent.ts` の `fetchAbortControllerRef = { controller, articleId }` 構造

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

**How to apply**: 依存配列キーを文字列ハッシュで作るときは:

1. **何の変化を検知したいか** を明確にする（先頭固定 N 件 / 全件 / フィルタ後の集合 etc.）
2. **slice / take / 先頭 N 件**を入れたら、N+1 件目以降の変化が **意図的に無視される設計** か再確認
3. 「処理対象の上限」と「変化検知の対象」は **別概念** として分離する。上限は effect 内の `targets.slice(0, lim)` で、検知は `articlesKey` で全件。
4. 全件キーが長くなりすぎる懸念があれば、**ハッシュ関数** (`SHA-1` 短縮など) で短縮するのも一手。ただし `join("\0")` の単純文字列でも数千件までは実用上問題なし

## 起動コストの重いブラウザ API resource は `useRef` で component lifetime に保持し、active 変化は suspend/resume で切替える

`AudioContext` / `Worker` / `EventSource` / `WebSocket` / `IntersectionObserver` のような **起動コストが重いブラウザ API resource** を、active=true/false の度に new/close すると以下の問題が起きる:

1. **OS audio session 切替コスト** (`AudioContext`: 数十 ms ブロック)
2. **ブラウザの同時インスタンス上限** (Chrome の AudioContext: 6 個)
3. **wasm runtime 再 init** (`Worker` + OffscreenCanvas / onnxruntime-web 等で数百 ms)
4. **接続再確立コスト** (`WebSocket` の handshake / `EventSource` の reconnect)

これを避けるため、resource は **`useRef` で component lifetime 中 1 個だけ保持** し、active 変化では **resource の suspend/resume + 子オブジェクト (oscillator / observer など) の start/stop** だけ切り替える設計が canonical。

```typescript
// アンチパターン: active 切替の度に new/close → 起動コストが毎回発生
export function useBackgroundAudio(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const ctx = new AudioContext(); // 新規生成
    const osc = ctx.createOscillator();
    osc.start();
    return () => {
      osc.stop();
      void ctx.close(); // close → 次の active=true で再生成 (OS audio session 切替)
    };
  }, [active]);
}

// 修正パターン: ctx は lifetime 中 1 個、active 変化で suspend/resume + osc start/stop
export function useBackgroundAudio(active: boolean): void {
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!active) {
      // oscillator stop + ctx suspend (close せず保持)
      if (oscRef.current) {
        try {
          oscRef.current.stop();
        } catch {
          /* already stopped */
        }
        oscRef.current = null;
      }
      void ctxRef.current?.suspend().catch(() => {
        /* silent */
      });
      return;
    }

    // active=true: lazy 生成 (初回のみ)
    if (!ctxRef.current) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      try {
        ctxRef.current = new Ctx();
      } catch {
        return;
      }
    }

    // suspended なら resume
    void ctxRef.current.resume().catch(() => {
      /* silent */
    });

    // oscillator が無ければ起動 (前回 stop で null 化されている)
    if (!oscRef.current) {
      const osc = ctxRef.current.createOscillator();
      const gain = ctxRef.current.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctxRef.current.destination);
      osc.start();
      oscRef.current = osc;
    }
  }, [active]);

  // unmount で確実に close + stop
  useEffect(() => {
    return () => {
      if (oscRef.current) {
        try {
          oscRef.current.stop();
        } catch {
          /* */
        }
        oscRef.current = null;
      }
      if (ctxRef.current) {
        void ctxRef.current.close().catch(() => {
          /* */
        });
        ctxRef.current = null;
      }
    };
  }, []);
}
```

**How to apply**: ブラウザ API resource を hook で扱うときは (active 切替の度に new/close すると OS audio session 切替コスト + ブラウザの同時インスタンス上限抵触 + wasm 再 init 等のコストが累積する、useRef で lifetime 持続 + suspend/resume なら 1 回コストで済む):

1. **resource の起動コスト** を MDN / 実測で確認 — 数十 ms 以上 or ブラウザ上限ありなら lifetime 保持対象
2. **resource に `suspend()` / `pause()` / `disconnect()` 等の一時停止 API があるか** を確認 — あれば lifetime 保持が canonical
3. **active 変化用の useEffect** で:
   - `!active` → 子オブジェクト (oscillator / message handler / observer target) を stop + resource を suspend (close せず)
   - `active` → resource が `null` なら lazy 生成 + resume + 子オブジェクトを start
4. **unmount 用の別 useEffect (`[]` deps)** で確実に close + stop (memory leak 防止)
5. **resource 生成失敗 (AudioContext の hardware 不在 / Permissions Policy 拒否 等)** は try/catch で silent fail + 影響を機能 OFF に限定

**該当する典型 API**:

| API                                   | 起動コスト                          | 一時停止 API                | lifetime 保持の効用     |
| ------------------------------------- | ----------------------------------- | --------------------------- | ----------------------- |
| `AudioContext` / `webkitAudioContext` | OS audio session 切替 (数十 ms)     | `suspend()` / `resume()`    | Chrome 6 個上限抵触回避 |
| `Worker` / `SharedWorker`             | wasm load + init (数百 ms)          | message 停止 (handler 解除) | wasm 再 init コスト削減 |
| `WebSocket` / `EventSource`           | handshake / reconnect (数百 ms)     | (close / reconnect のみ)    | reconnect 嵐回避        |
| `IntersectionObserver`                | observe target 走査 (target 数比例) | `unobserve()` + `observe()` | target 再走査コスト削減 |
| `ResizeObserver`                      | observe target 走査                 | `unobserve()` + `observe()` | 同上                    |
| `MutationObserver`                    | DOM 走査                            | `disconnect()` + 再接続     | DOM 再走査コスト削減    |
| `MediaQueryList`                      | (低い)                              | (event listener 解除)       | lifetime 保持の効用は小 |

**反例 (lifetime 保持が overkill なケース)**:

- 起動コストが軽い API (`MediaQueryList` / `localStorage`) — 毎回 new でも実用上問題なし
- 一時停止 API がない resource (`fetch` の Response / `crypto.subtle.digest` の Promise) — そもそも保持できない
- active 切替が **数時間〜数日に 1 度** のような低頻度 — 起動コストが UX に表れない
- resource が **active=true の間だけ存在すべき意味的制約** (例: 認証 token のような時間制限あり resource) — 期限切れで再生成が正しい

主な使用箇所: `useBackgroundAudio` — TTS バックグラウンド継続用の無音 `AudioContext` を component lifetime 中 1 個保持、active 切替で `suspend()`/`resume()` + oscillator start/stop だけ切替 (OS audio session 切替の数十 ms コスト + Chrome 6 個上限を回避)

### 派生ケース: ライブラリの内部 resource が外部から制御不能なときは「低レベル API + 自前再生」で奪い返す

外部ライブラリ (例: `piper-plus@0.6.0` の `AudioResult.play()`) が **内部で `AudioBufferSourceNode` / `Worker` / `EventSource` 等の resource を生成して closure 内に握ったまま外部に expose しない** ケースがある。この場合、ライブラリ提供の高レベル再生 API (`audio.play()` / `worker.run()`) を呼ぶと **後から `stop()` / `terminate()` できず**、ユーザー操作 (停止ボタン) で止まらない silent failure を生む。

```typescript
// アンチパターン: library 高レベル API を呼ぶ → source ref を取れず止められない
async function speak() {
  const audio = await piperLib.synthesize(text);
  await audio.play(); // ← 内部 BufferSourceNode は外から見えない
}
const stop = () => {
  playTokenRef.current += 1; // token 進めても、既に start した再生は止まらない
};

// 修正パターン: library から低レベル data (samples / sampleRate) を取り出して自前再生
async function speak() {
  const audio = await piperLib.synthesize(text);
  const ctx = getAudioContext(); // module-level singleton
  const buffer = ctx.createBuffer(1, audio.samples.length, audio.sampleRate);
  buffer.copyToChannel(new Float32Array(audio.samples), 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = volumeRef.current;
  source.connect(gain);
  gain.connect(ctx.destination);
  audioSourceRef.current = source; // ← ref で source 保持
  await new Promise<void>((resolve) => {
    source.onended = () => resolve();
    source.start();
  });
}
const stop = () => {
  playTokenRef.current += 1;
  const source = audioSourceRef.current;
  if (source) {
    audioSourceRef.current = null;
    source.onended = null; // natural-end の偽発火を防止
    source.stop();
    source.disconnect();
  }
};
```

**How to apply**: 外部ライブラリの高レベル API を hook で使うとき、以下を判定 (ライブラリの「便利な高レベル API」が外部 stop 不能なら、低レベル data を取り出して自前 resource 制御に切り替えた方が UX 保全に直結する):

1. **library API の戻り値で内部 resource (source / worker / observer) にアクセスできるか** を確認 (MDN / library docs / type definitions)
2. アクセス不可なら **library に低レベル data 取得 API があるか** (例: `audio.samples` / `audio.sampleRate` / `worker.getCurrentMessage()`) — あれば自前再生に切替
3. **自前 resource は `useRef` で hook lifetime 中保持** + 専用 `releaseXxx()` helper で stop + disconnect を 1 箇所集約
4. **natural-end 経路と手動 stop 経路を区別**: stop 時は `onended = null` セット → natural-end 偽発火を防ぐ + monotonic counter (`endedCount`) は手動 cancel では increment させない (`react-state-ref.md` 派生ケース「monotonic counter で手動 cancel と自然完了の区別」と整合)
5. test では library mock の高レベル API (`play()`) でなく **低レベル data (samples) を返す mock + class 形式 `MockAudioContext`** で BufferSourceNode 経由を verify (`react-state-ref.md`「`new Ctor()` API は class 形式 mock」規範)

**反例 (library 高レベル API のままで OK なケース)**:

- library が **`AbortSignal` / cancel callback / external stop API** を expose している (例: `fetch(url, { signal })` / `audio.cancel()`) → library API で停止可能、自前再生不要
- 再生が **数秒以内に確実に終わる短い任意のメディア** (例: 効果音 click sfx) → 停止 UX が不要、library 高レベル API で OK
- library 内部 resource が **library lifecycle で自動破棄** される (例: lazy load 完了で `URL.revokeObjectURL` される画像) → 外部制御不要

主な使用箇所: `usePiperTts` (#766) — `piper-plus@0.6.0` の `AudioResult.play()` が内部 BufferSourceNode を closure に握って外部 stop 不能 → `audio.samples` / `audio.sampleRate` を取り出して自前 BufferSourceNode 再生に切替、`audioSourceRef` で source 保持、`releaseAudioSource()` で stop + disconnect 集約

### 派生ケース: ライブラリの fundamental 制限 (integer overflow / max length 等) は上流入力を分割して逐次処理で回避する

ライブラリ内部の数値型上限 (ONNX SafeInt int32 overflow / WebGL max texture size / WebAssembly memory 上限 等) は **ライブラリ側で解決不能** な fundamental 制限。ライブラリの戻り値や API 設計を変えても回避できない場合、**hook 側で input を分割して逐次処理** することで制限を構造的に回避する。

```typescript
// アンチパターン: 一括 input でライブラリの制限に当たる
async function speak(text: string) {
  const audio = await piperLib.synthesize(text); // ← 長文で SafeInt overflow
  await playAudio(audio);
}

// 修正パターン: splitter で input を分割 → 逐次処理
async function speak(text: string, onBoundary?: (idx: number) => void) {
  const chunks = splitIntoSentences(text); // 既存純粋関数を流用
  if (chunks.length === 0) {
    setEndedCount((c) => c + 1); // 空入力 silent skip + auto-advance 継続
    return;
  }
  const token = ++playTokenRef.current;
  for (let i = 0; i < chunks.length; i++) {
    if (token !== playTokenRef.current) return; // stop で chain 中断
    const chunk = chunks[i]!;
    const audio = await piperLib.synthesize(chunk.text);
    if (token !== playTokenRef.current) return;
    // boundary は chunk.start 累積 offset で全体 charIndex を計算
    startBoundaryTimer(chunk.start);
    await playAudio(audio);
  }
  // 全 chunks 完了で 1 回だけ natural-end 発火
  setEndedCount((c) => c + 1);
  resetPlaybackState();
}
```

**How to apply**: ライブラリの fundamental 制限 (integer overflow / max length / memory cap 等) を回避したいとき (ライブラリ作者で解決不能な制限は、入力分割という consumer 側の制御で回避する以外に方法がない):

1. **既存の純粋関数 splitter があるか grep** (`splitIntoSentences` / `chunkArray` / `paginate` 等) → あれば流用、無ければ新規切り出し
2. **空配列ガード**: splitter が空配列を返すケース (空入力 / 空白のみ) は **silent skip + natural-end 発火** で caller の auto-advance を継続させる
3. **token check で chunk chain 中断**: stop() / 別 speak 介入時に `if (token !== playTokenRef.current) return;` を chunk loop の境界 (loop 先頭 / synthesize 後 / playback 後) で実行
4. **boundary callback の累積 offset**: chunk 内の local charIndex に `chunk.start` を加算して全体 charIndex で発火 (`splitIntoSentences` の `Sentence.start` のような offset 情報を活用)
5. **完了通知は最終 chunk のみ**: 各 chunk で発火させると caller の auto-advance が中間で誤起動。loop 抜けた後で 1 回だけ `endedCount++`
6. **エラー時は残 chunks 中止**: synthesize / playback fail で `lastError` set + `resetPlaybackState()` + early return

**反例 (上流分割が不要なケース)**:

- ライブラリが **streaming API を提供** している (`synthesizeStreaming` / `fetch with stream` 等) → library 側 chunk 化を使う
- 制限が **稀にしか発生しない** (例: 10 万文字超のみ) + UX 影響軽微 → 入力 truncate + warning toast で十分
- 制限が **library 側で fix される予定** (next release で対応予告) → 暫定 truncate で待つ判断もあり

主な使用箇所: `usePiperTts` (#767) — piper-plus の `tts.synthesize(text)` で長文記事で ONNX SafeInt int32 overflow → `splitIntoSentences` で text を sentence chunks に分割 → 各 chunk を順次 synthesize + 自前 BufferSource 再生、boundary は `chunk.start` 累積 offset で全体 charIndex、最終 chunk 完了で endedCount++

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

**How to apply**: 機能が「ON / OFF」のフラグで動く場合、OFF 遷移時のクリーンアップが副作用を 100% 止めているか必ず確認する。fetch / timer / 音声 / WebSocket / IntersectionObserver などすべて。

## 時刻境界 (midnight / 月跨ぎ等) で再 render する hook pattern

`new Date()` を `useMemo` 内で呼ぶと **memo 作成時の日付/時刻がキャプチャ** されて、後続 render で古い値を使い続けるバグが起きる。tab を開きっぱなしで日付跨ぎ / 月跨ぎ / 年跨ぎが起きたとき、UI 表示が前日基準のまま腐る。

```typescript
// アンチパターン: useMemo 内で new Date() — memo 再実行されない限り stale
const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
const todayCount = articles.filter((a) => a.publishedAt?.startsWith(today)).length;
// → 日付跨ぎで「今日の記事 0 件」表示が一日中続く

// 修正パターン: midnight setTimeout で state を更新する hook
function useUtcDate(): string {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
    );
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();
    const id = setTimeout(
      () => setDate(new Date().toISOString().slice(0, 10)),
      msUntilMidnight + 1000,
    );
    return () => clearTimeout(id);
  }, [date]);
  return date;
}

// consumer 側
const today = useUtcDate();
const todayCount = articles.filter((a) => a.publishedAt?.startsWith(today)).length;
```

**通常の render 負荷はほぼゼロ**: 境界到達時に 1 回だけ state 変化 → 関連 useMemo / useEffect が再評価されるだけ。`setInterval(1000ms)` のような頻繁な polling は不要 (時刻には変化通知イベントが無いので「次の境界まで `setTimeout` → 境界到達で setState → state 変化で再 schedule」の自己再帰パターン、+1000ms はクロックずれの安全マージン)。

**How to apply**: 「**時刻境界をキー** にした表示 / 集計」を書くときは hook 化を検討:

| 用途                          | hook 名                       | 境界                   | 適用例                        |
| ----------------------------- | ----------------------------- | ---------------------- | ----------------------------- |
| 「今日」の件数 / バッジ       | `useUtcDate` / `useLocalDate` | midnight (UTC / local) | `readTodayCount` / 既読バッジ |
| 「今月」の集計 / グラフ       | `useCurrentMonth`             | 月初 0:00              | 月間統計 / heatmap 区切り     |
| 「今週」の集計                | `useCurrentWeek`              | 週初 (月曜 0:00 等)    | 週間目標 / streak 計算        |
| 「シフト中か」(7-19 時)       | `useShiftWindow`              | shift 開始 / 終了時刻  | 業務時間限定 UI               |
| cron 風タイマー (毎時 0 分等) | `useCronTick`                 | 任意の cron expression | データ自動更新トリガー        |

**TDD**: `now` を引数化して純粋に判定:

```typescript
export function nextMidnightDelay(now: Date): number {
  const nextMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return nextMidnight.getTime() - now.getTime();
}
```

これを spec で「now=23:59:59 → 1000ms」「now=00:00:01 → 約 24h」等を assert 可能に。

**反例 (時刻境界 hook が不要なケース)**:

- 表示する時刻自体がリアルタイムで動く必要がある (例: 時計 UI) → `setInterval(1000)` で full polling が正解
- ユーザーアクションで再 render される頻度が「日付境界より高い」 (例: 自動ポーリング 5 分) → useMemo 再評価で副作用的に最新化されるので hook 不要
- SSR で時刻を確定させる必要があるとき (本プロジェクトは CSR 'use client' のため非該当)

主な使用箇所: `useUtcDate` (`useArticleUnreadStats.ts`) — `readTodayCount` の midnight stale バグ修正

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

**How to apply**: ブラウザネイティブ API を呼ぶ useEffect を書くとき (`voiceschanged` / `MutationObserver` / `navigator.mediaDevices.devicechange` / `screen.orientation.change` 等、初期化が非同期で完了する API は初期取得 + イベント購読のペア必須):

1. **「初回呼び出しで完全な値が取れるか？」を必ず確認** (MDN ドキュメント or 動作確認)
2. 取れない場合、**変更通知イベントが提供されているか確認** (`xxxchanged` / `change` 系)
3. 提供されているなら **初期取得 + イベント購読 + cleanup の 3 点セット** を必ず書く
4. 提供されていない (古い API) なら polling / setInterval を最小頻度で

主な使用箇所:

- `useSpeechSynthesis` の `voiceschanged` 購読
- `useResizeObserver` 系 (`ResizeObserver` の初回コールバック)
- `useOnlineStatus` の `online` / `offline` イベント購読
