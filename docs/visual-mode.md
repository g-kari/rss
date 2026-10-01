# Optional visual reader

The authenticated reader has a site-wide visual presentation, separate from its existing light/dark theme, article layout, filters, and reading settings. Normal mode is the default. The top bar switches between modes without replacing the reader subtree, so selection, scroll position, open settings, and unread/save state are retained. Standard settings dialogs and article focus/detail overlays include a visual-mode exit switch within their own focus trap. The separate immersive view has an always-visible Back control and preserves the underlying reader skin. Public landing pages are unchanged.

## Presentation

- Layered violet/mint surfaces, dimensional article cards, stronger editorial headings, and optional small hover/arrival movements
- Both light and dark palettes retain opaque reading surfaces and non-color selection indicators
- The explicitly opened immersive view is full-viewport in both normal and visual reader modes, with edge-to-edge image/video, large 24–58 px caption cards and overlaid controls
- Entry starts silent functional playback unless reduced motion or an explicit motion-off preference requires an initial pause. The Resume control remains usable and can run captions/article timing without decorative movement. The current item advances once after its media endpoint and any opt-in narration finish. Pause/resume and 0.75×/1×/1.5×/2× speed controls remain at the top, with save/dismiss/read actions on the right and previous/next controls at the bottom
- Image stories use verbatim title/feed-excerpt cards, bounded to 44 Unicode code points each. An independent functional clock runs for at least 20 seconds and at least five seconds per card at 1×; neither device hints nor failure to load the decorative animation freeze that clock. No AI generation is requested
- Existing native `<video>` / `<source>` content or direct MP4/WebM/MOV links use the existing validated video proxy, start muted, and advance at the actual video endpoint. Unsupported or rejected playback falls back to the image story. YouTube/other iframe players remain in the full article; they are not automatically embedded here
- Ten-item batches always stop at an explicit continuation screen. Advancing never marks an article read or records an engagement signal. Pause and speed persist across manual navigation; dismissal pauses to keep Undo usable
- The full title and excerpt remain available to screen readers. Decorative caption changes are not repeatedly announced
- Only current/adjacent imagery is mounted, with at most one native-video player. Both portrait and landscape use safe-area padding and separate caption/action lanes

## Motion and resource policy

`rss-visual-mode` stores `normal` or `cinema` locally; invalid values fall back to normal. `rss-visual-motion` stores the optional motion switch separately. Storage failures do not prevent switching. Tabs follow local preference changes via the storage event.

Decorative movement and functional playback have separate policies. The system reduced-motion preference, Save-Data, reported device memory of 4 GB or less, or hardware concurrency of 2 or less disable image zoom and native-video decoration; missing device hints are treated as unknown. Save-Data and lightweight device hints do not disable the finite caption/article clock. Reduced motion and an explicit motion-off preference initially pause the immersive session, but an explicit Resume starts functional timing without enabling those decorations. A new reduced-motion/motion-off restriction pauses playback; clearing a restriction never overrides a user pause. Hidden tabs pause the clock, native video and narration, excluding hidden time, and only an already-playing session resumes on visibility return.

Narration is off on entry and starts only through the explicit Read-aloud action. It uses device-local voices only, prefers Japanese, clearly identifies a non-Japanese fallback, and reports unavailable voices without sending article text to a remote voice provider. Stop cancels the owned utterance; navigation and closing reject stale callbacks. Opening the inline full-body reader temporarily pauses media, timing and narration and restores the prior pause state on close. These functional controls do not change the reader's persistent visual preference.

Anime.js **4.5.0**, MIT, remains pinned and lazy. Its `animejs/timeline` subpath is imported only for an active, motion-enabled image story after the user opens immersive mode. Ordinary reading and neighboring cards never start a timeline. Closing, navigating, source invalidation or unmounting reverts the decorative timeline. Its completion is not the article-advance clock; late imports or animation failure cannot freeze functional timing. Duplicate/stale functional media or narration callbacks cannot advance another card. Native videos pause on cleanup, policy restriction and document hiding; failed playback retains the thumbnail and controls.

Anime.js was selected for finite, coordinated image choreography and its reversible timeline API. Three.js/WebGL is unnecessary for a single article image, and CSS handles the surrounding surfaces/hover effects without a renderer, textures, or WebGL context. Motion's React layout machinery would not simplify this bounded image shot enough to justify another integration layer.

Official references:

- https://animejs.com/documentation/getting-started/using-with-react/
- https://animejs.com/documentation/timeline/
- https://motion.dev/docs/react-lazy-motion

## Verification

Unit tests cover preference validation/errors, subtree/scroll/theme preservation, cross-tab sync, device-policy changes, listener cleanup, lazy playback, import races, finite completion, pause/replay, session autoplay/speed, duplicate/stale endpoints, native-video source validation/fallback, hidden tabs, cancellation, accessible static text, and active-card behavior. Existing immersive, recommendation, scroll, and read-navigation regressions remain applicable.

`e2e/visual-mode.spec.ts` renders production components with local fixture data and tests 1280×800, 390×844, 320×568, and 844×390 layouts, switch persistence, settings input/focus, unchanged list position, reduced motion, finite navigation, and normal-motion automatic advance, viewport coverage, minimum caption size, and non-overlapping controls. No account or AI service is required. Browser execution is separate from unit/type/lint success; see the change's validation report for environment blockers.
