# Optional visual reader

The authenticated reader has a site-wide visual presentation, separate from its existing light/dark theme, article layout, filters, and reading settings. Normal mode is the default. The top bar switches between modes without replacing the reader subtree, so selection, scroll position, open settings, and unread/save state are retained. Standard settings dialogs, article focus/detail overlays, and the immersive dialog include an exit switch within their own focus trap. Public landing pages are unchanged.

## Presentation

- Layered violet/mint surfaces, dimensional article cards, stronger editorial headings, and optional small hover/arrival movements
- Both light and dark palettes retain opaque reading surfaces and non-color selection indicators
- Inside the existing finite, ten-item immersive view, a manual Play control starts a single 20-second slow image shot with verbatim chunks of the existing feed excerpt
- Pause, resume, and replay are explicit. Finishing never advances to another article, marks it read, records engagement, plays sound, or requests generated content
- The full feed excerpt remains available as normal text. Captions are decorative and are not repeatedly announced by screen readers
- Only the current card is interactive; current/adjacent imagery retains the existing loading budget. Broken or missing images use the existing thumbnail fallback

## Motion and resource policy

`rss-visual-mode` stores `normal` or `cinema` locally; invalid values fall back to normal. `rss-visual-motion` stores the optional motion switch separately. Storage failures do not prevent switching. Tabs follow local preference changes via the storage event.

The system reduced-motion preference, Save-Data, reported device memory of 4 GB or less, or hardware concurrency of 2 or less selects the static presentation. Missing optional device hints are treated as unknown. A changed policy cancels the current shot; clearing the restriction never automatically starts one. Hidden tabs pause both image progression and captions, preserving the current position until visible again. There is no always-running background animation loop.

Anime.js **4.5.0**, MIT, is pinned. Only its `animejs/timeline` subpath is dynamically imported, and only after explicit Play on a motion-enabled current article. The normal reader and static visual mode do not import the animation runtime. Closing, switching OFF, navigating, source invalidation, or unmounting reverts the timeline; an import that resolves after cancellation cannot start a detached animation. Import failure keeps static content and existing actions available.

Anime.js was selected for finite, coordinated image choreography and its reversible timeline API. Three.js/WebGL is unnecessary for a single article image, and CSS handles the surrounding surfaces/hover effects without a renderer, textures, or WebGL context. Motion's React layout machinery would not simplify this bounded image shot enough to justify another integration layer.

Official references:

- https://animejs.com/documentation/getting-started/using-with-react/
- https://animejs.com/documentation/timeline/
- https://motion.dev/docs/react-lazy-motion

## Verification

Unit tests cover preference validation/errors, subtree/scroll/theme preservation, cross-tab sync, device-policy changes, listener cleanup, lazy playback, import races, 20-second completion, pause/replay, hidden tabs, cancellation, accessible static text, and active-card behavior. Existing immersive, recommendation, scroll, and read-navigation regressions remain applicable.

`e2e/visual-mode.spec.ts` renders production components with local fixture data and tests 1280×800, 390×844, 320×568, and 844×390 layouts, switch persistence, settings input/focus, unchanged list position, reduced motion, finite navigation, and normal-motion completion. No account or AI service is required. Browser execution is separate from unit/type/lint success; see the change's validation report for environment blockers.
