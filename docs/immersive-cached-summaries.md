# Immersive cached summaries

## Release notes

- ドパガキモードで、選択中のクラウドAIモデルの保存済み要約を確認できます
- キャッシュにある要約は次の記事のショート字幕・読み上げにも利用します。現在再生中の記事は途中で内容を変更しません
- 遅れて見つかった要約は「ショートをAI要約にする」で切り替えられます。切り替え時は一時停止します
- 保存済み要約がない場合はフィード説明や取得済み本文の抜粋を使い、要約パネルから本文表示を開けます
- 入力の打ち切り、生成情報不明、本文全体の取得状況不明、ショート表示の短縮を区別して表示します

## Responsibilities and limits

`useImmersiveSummaryCache` reads only the authenticated `/api/ai/summaries/cache` endpoint with the explicit selected model. Each visible/queued window contains at most 12 exact URLs and only one request is active at a time. Cache misses and errors remain terminal until a manual cache-only retry. Hidden pages do not schedule new requests. Responses are size-bounded and validated atomically, including URL, model and metadata identity.

Summary state is ephemeral, partitioned by account, preference ownership, authentication state, scope, provider and model. Partition changes abort pending reads and reject stale completions. At most 48 summary hits are held; evicted hits need explicit rechecking. Summaries are never written to the immersive session snapshot or browser persistence.

`resolveImmersiveText` distinguishes saved AI text from loaded body, feed body, feed description and title-only fallbacks. One frozen active presentation drives captions, transcript and narration. A late cache result can update the availability panel without replacing the playing presentation. Explicit source changes pause/reset that presentation. Account, model and scope changes remove the previous presentation immediately.

`ImmersiveSummaryReader` safely renders final saved output and applies shared reading typography. Opening it pauses playback, preserves focus, and never starts body extraction or AI generation. Only its explicit body action opens the existing inline body reader. The summary consumer does not enable or alter scheduled precomputation, browser AI, automatic translation, or automatic summarization.

## Acceptance and hold conditions

Required coverage includes prefetched-versus-displayed state, delayed hits during playback/pause/inline reading, manual source changes, miss/error/retry, malformed responses, timeout and stale account/scope/model responses, hidden scheduling, provider/auth gates, hostile text, provenance distinctions, and 23-item continuous reading without repeated consumed articles. Responsive Chromium checks use 320, 390 and 1280-pixel viewports in light/dark themes with fail-closed synthetic requests.

Hold release if any request can generate AI or crawl/extract without the body action, old-context text can persist, late hits rewrite narration, cache failures retry automatically, hidden/prefetched cards are marked read, or controls/text become unreadable. Production build, relevant type/lint/unit checks, exact-head Chromium results and independent review must pass before merging.
