# Reading workspace audit

Date: 2026-10-09. Baseline UI tree: `0fd6874e7d1dde0c6c7c9d3f472c7bb63c31740f`.

## Evidence and priority

The unchanged UI was rendered in cloud Chromium by existing CI run [37963705678](https://github.com/g-kari/rss/actions/runs/37963705678), merge SHA `9a510861ee9a7c4faeccb787d5f95bf1bf5ca324`. All 324 existing component scenarios passed. Artifact `11632099466` SHA-256: `e7b40bd8b049b04c3759fcd5506fd7b780dc42cb567e4187bde46eaa117544dc`.

Passing functional tests did not establish good visual hierarchy. The 320px list pixels show five layout choices occupying the toolbar while filters are outside the visible strip. A 574px list still clips advanced conditions. The 320/390px reader and 1280/1600px desktop pixels show mixed small actions; desktop Japanese labels wrap vertically. The old selected scope is only labeled "記事". Settings pixels show useful purpose categories and search; preserve those instead of duplicating them.

Priority means user impact, not a security finding: P1 interrupts a core reading task; P2 adds discovery or interpretation friction. Source-only or unrendered states are explicitly pending until final-head Chromium evidence is inspected.

| Journey / state                          | Evidence / finding                                                                     | Priority                    | Coherent change or acceptance                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Find the reading destination             | Sidebar source places statistics and suggestions before subscriptions                  | P1, render pending full App | Reading, library, subscriptions; auxiliary discovery after feeds                                           |
| Know the current scope                   | Rendered list says "記事" even for selected feeds                                      | P1                          | Named feed/group/tag/collection/saved-view heading; truthful zero count                                    |
| See and clear conditions                 | 320/390/574px rendered list clips filters after layout icons                           | P1                          | Visible unread/filter/display tasks; labeled advanced dialog and external condition summary                |
| Change reading layout                    | Five equal-weight icons displace routine work                                          | P2                          | Display dialog retains all five layouts and list focus                                                     |
| Search and recover zero results          | Existing query/empty paths remain functional                                           | P1 regression gate          | Preserve combobox, IME, saved search, keyboard; render empty and reset                                     |
| Sort and mark a list read                | Filter strip mixes collection-wide actions                                             | P2                          | Separate list actions; retain two-step confirmation and undo                                               |
| Read title and content                   | Reader title remains responsive with retained layout reserve                           | Regression gate             | Preserve typography, long titles, content DOM and scroll position                                          |
| Save, annotate, organize                 | Mobile reader mixes icon-only saves with read aids                                     | P1                          | Visible later/bookmark/note labels; group state remains truthful                                           |
| Read aids and sharing                    | 1280px Japanese AI labels wrap in a crowded row                                        | P2                          | Separate inline disclosures; preserve AI/TTS/download/share states and 44px targets                        |
| Mobile forward/back                      | Existing focused-pane tests pass, isolated list is not full-mobile proof               | P1 regression gate          | Full App sidebar → list → article → list → sidebar at 320/390px                                            |
| Settings discovery                       | Rendered 320/390px purpose tabs/search are usable but dense                            | P2 observation              | Preserve purpose navigation; full-App entry, Escape and return focus; existing category/voice/import tests |
| Subscription setup and failure           | Existing add-paste/retry/offline fixtures pass                                         | P1 regression gate          | Preserve modal input, retry dates, offline explanations, drag/group behavior                               |
| Library and collections                  | Saved article state must survive navigation and filters                                | P1 regression gate          | Scope labels and all original persistence callbacks; tags/collections retained                             |
| Images, video and social                 | Existing gallery, cinematic and native-video fixtures cover real production components | P1 regression gate          | Keep media modes and playback semantics; no new autoplay or networking                                     |
| Visual / immersive / focus modes         | Existing mode continuity and keyboard scenarios pass                                   | P1 regression gate          | Keep DOM/playback state, popup ownership, Escape and focus destinations                                    |
| Loading, error/retry, sync recovery      | Existing synthetic fixture suite covers those states                                   | P1 regression gate          | Run unchanged assertions at final head; inspect scope-relevant screenshots                                 |
| Light/dark and narrow panes              | Existing before pixels inspected; full App comparison pending                          | P1                          | 1440/1024/390/320px, 360/420px list panes, 150px sidebar; avoid horizontal control overflow                |
| Keyboard / enlarged text / forced colors | Existing tests cover IME, focus, long titles and doubled root text                     | P1 regression gate          | Add modal Enter/Escape/return-focus; do not claim screen-reader hardware verification                      |

## Rendering contract

`reading-workspace.spec.ts` bundles the actual full App and immutable PR-base App with the same synthetic demo data. No Next server, signed-in account, production bindings, persistent browser storage or external API access is used. All unexpected network requests fail the test. Before CSS scans the actual old source tree. Images are local deterministic placeholders. Next self-hosted font assets are not supplied in this fixture; screenshots use an explicit system fallback, so font-pipeline validation is separate and is not claimed by these PNGs.

Before/after navigation, list and reader screenshots are native Chromium viewport captures. Additional filter, display, empty-search and settings captures contain product UI only. Source provenance is attached to each case. Existing aggregate CI and all relevant component interactions remain required at the final head. Draft publication is not completion; final screenshots, CI and independent review must be inspected before merge eligibility is reported.

## Scope and rollback

Only reading navigation, task grouping, labels and their tests change. Authentication, APIs, data structures, notification permissions, model choices and production settings remain untouched. Serena removal and Codex/README modernization have separate PRs. Revert the UI commit to restore the old presentation without a data migration. Existing production holds remain in force.
