# Reading slides

Article detail and swipe reading support the following public slide links with a lazy player, page controls supplied by the provider, an expanded dialog, and an original-page link. Expansion keeps the same iframe alive, preserving its current page; switching decks closes it.

| Provider      | Accepted source URLs                                                                                                                                  | Public text fallback                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Docswell      | `/s/{user}/{six-character-id}-{slug}`, `/slide/{id}/embed`                                                                                            | Each-page text section                                     |
| Speaker Deck  | `/player/{hex-id}`; `/{user}/{deck}` resolved from published HTML                                                                                     | Public transcript and description                          |
| SlideShare    | `/slideshow/{slug}/{numeric-id}`, legacy `/{user}/{deck}` resolved from HTML, `/slideshow/embed_code/{numeric-id}`, `/slideshow/embed_code/key/{key}` | Public transcript and description                          |
| Google Slides | `https://docs.google.com/presentation/d/e/2PACX-…/pub`, `/embed`, `/pubembed`                                                                         | Published description if present; no transcript is assumed |

Speaker Deck pages may need “全文取得” to discover the player ID. SlideShare HTML metadata takes priority over its legacy numeric player URL. Existing inline blog embeds remain responsive; the expanded reader is for articles whose source URL is a supported deck.

Google Slides must already be published to the web. Ordinary `/edit`, `/view`, `/present`, private file IDs, organizational access, and authentication are not converted or bypassed. Automatic advancing and looping are disabled in the generated published player. The reader never publishes a deck or changes sharing permissions.

Provider restrictions still apply. An owner can disable embedding, withdraw publication, delete a deck, or require access. In those cases use the original-page link. No publisher script is executed in the parent page. Players are HTTPS-only and sandboxed; unrelated paths, credentials, non-default ports, and lookalike hosts are rejected. Public transcripts use escaped text, bounded to 500 pages / 200,000 characters, with a 20,000-character per-page limit.

## Provider contracts checked on 2026-09-30

- [Speaker Deck oEmbed help](https://help.speakerdeck.com/help/how-do-i-use-oembed-to-display-a-deck-on-my-site) and its [public Atom example](https://speakerdeck.com/jnunemaker/atom): current HTML exposes a `.speakerdeck-embed[data-id]` player and `#transcript .slide-transcript` text
- [Speaker Deck embedding restrictions](https://speakerdeck.com/features/restrict-embedding): embedding permissions remain authoritative
- [SlideShare official embedding help](https://support.scribd.com/hc/en-us/articles/360055666911-Embedding-content-from-Slideshare) and a [public 3Play Media deck](https://www.slideshare.net/slideshow/impact-of-captions-transcripts-on-student-learning-comprehension/152193732): `twitter:player` exposes the current key URL, with a public `.transcript` section
- [Google's publishing/embedding help](https://support.google.com/docs/answer/183965?hl=en-GB): only already published presentations are supported; a public published example and its `/pubembed` response were fetched successfully

## Verification limits

Unit tests cover URL validation, public metadata/text extraction, cache namespaces, player identity across expansion/close, source-link safety, and article navigation. Live public HTML extraction was checked for Speaker Deck (43 transcript entries), SlideShare (47), and a published Google sample. Tests do not authenticate to providers or bypass denied embedding. The full reader's mobile visual behavior still needs browser QA in an available environment.
