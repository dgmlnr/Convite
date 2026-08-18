# Visual regression suite

`pnpm test:visual` — screenshot-based coverage for the game table and the
widget's main screens, deliberately **not** part of `pnpm test`.

## Why this exists

Two real bugs shipped in this project looked exactly like "fine" to every
other check:

- The Spanish deck cards looked washed out. The cause was `opacity: 0.55`
  plus `grayscale(0.4)` on a locked card sitting over the green table cloth —
  opacity lets the surface underneath show through, so the card tinted green
  instead of dimming. Seven ImageMagick experiments on the card IMAGES chased
  the wrong cause before the stylesheet was found (`table-styles.ts`'s own
  history, commit `6c6019a`).
- The matchstick scoreboard rendered black instead of wood/head colours
  because a shared SVG `<defs>` block sat outside the DOM subtree its CSS
  custom properties were scoped to.

E2E drives a real browser and asserts real behaviour, but it would happily
pass on a table rendered in the wrong colours, with overlapping cards, or
with the scoreboard off-screen — none of that is a *behavioural* assertion.
This suite exists to catch exactly that gap.

## Mechanism

**Vitest Browser Mode's own `toMatchScreenshot()` matcher**, driving real
Chromium via `@vitest/browser-playwright` — the SAME provider the unit
"browser" project (`vitest.config.ts`) already uses.

This was a real choice, not a default: Playwright Test's `toHaveScreenshot()`
was the other option named in the brief, but **`@playwright/test` is not
installed in this repo** — only the bare `playwright` library and
`@vitest/browser-playwright` are (`package.json`). Adding `@playwright/test`
would mean a second, parallel test runner/config surface purely for
screenshots. Vitest Browser Mode's own matcher (confirmed present by reading
`node_modules/vitest`'s own shipped types — `ToMatchScreenshotOptions`,
`toMatchScreenshot()` on `Assertion`) already provides everything this suite
needs: baseline diffing, a built-in "stable screenshot" retry (waits for two
consecutive frames to match before comparing, up to its own `timeout`), and
an `--update` workflow — with zero new dependencies, zero new tooling, and
one project config file mirroring `vitest.e2e.config.ts`/
`vitest.redis.config.ts`'s already-established pattern.

## Why its own opt-in project, not part of `pnpm test`

A screenshot test is only as trustworthy as the baseline it compares
against. A baseline must be updated **deliberately**, reviewed as a diff, and
committed with intent — never as a side effect of someone running the
everyday `pnpm test` TDD loop. `vitest.visual.config.ts` is therefore its own
project, excluded from `vitest.config.ts`'s "node" project the same way
`.redis.test.ts` files already are.

## Determinism controls

Every source of cross-run and cross-machine noise this suite could control,
it does:

| Source | Control |
|---|---|
| Animations, transitions, caret | Globally disabled via `visual/setup.ts` (`animation: none !important`, `transition: none !important`, `caret-color: transparent !important`) |
| Scrollbars | Hidden (`scrollbar-width: none`, `::-webkit-scrollbar { display: none }`); containers also sized to their content so nothing needs to scroll |
| The deal / game state | A fixed, hand-written `DealInput` run through the REAL engine (`createHeadToHeadMatch` → `startHand(state, deal)` → `applyAction`) — the engine never randomizes by design (design §4), so this is not a workaround, it is the documented API |
| Card-back SVG | Verified deterministic: `cardBackSvg()` (`spanish-deck-ui/src/card-back.ts`) is a pure function of fixed constants, no `Math.random`/`Date.now` |
| Card-front art loading | Explicitly awaited (`img.decode()` on every `<img>`) before the screenshot, rather than left to the matcher's own stability retry |
| Fonts | A single embedded font FILE (DejaVu Sans, `visual/fonts/DejaVuSans.woff2`, Bitstream Vera licence — see `visual/fonts/LICENSE`) is loaded via `FontFace` and set on `--gx-font-family` (`document.documentElement`) — every stylesheet already reads that custom property with a `system-ui, sans-serif` fallback, so this pins glyph shapes without touching either stylesheet |
| Headless vs. headed | Always headless (`vitest.visual.config.ts`), unlike the unit "browser" project, which follows `process.env.CI` — a headed Chromium can rasterize text slightly differently from headless |
| Viewport | Not overridden — Browser Mode's own default (414×896) is already mobile-first; the game table's own narrow/wide breakpoint is a CSS **container query** on the mounted element's own width (`table-styles.ts`), not a viewport media query, so each test sets its container's width explicitly instead |
| Pixel comparator tolerance | `allowedMismatchedPixelRatio: 0.01` (1%) — absorbs residual anti-aliasing noise between otherwise-identical runs, not cross-OS drift (see Portability below) |

## Coverage

| File | What it proves |
|---|---|
| `packages/games/truco-ui/src/table.visual.test.ts` | Mid-hand: cards in hand (playable + locked), a card already played, whose turn it is. A pending truco call: the banner shown, the whole hand locked. A themed tenant: chrome takes the brand, felt/cards do not. |
| `packages/games/truco-ui/src/table-2v2.visual.test.ts` | The 4-seat (2v2) table: partner/opponent obvious at a glance (mid-hand, one seña claimed), the local player's own señas picker opened, and three resolved tricks showing every seat's independent, offset pile. |
| `packages/games/truco-ui/src/table-wide.visual.test.ts` | The SAME 1v1/2v2 hands `table.visual.test.ts`/`table-2v2.visual.test.ts` already cover, re-captured at the wide (960px) and ultra (1280px) container tiers — proves the log rail sits in flow, the action bar/banner lane stay collision-free, and the scoreboard panel keeps taking the tenant's theme once it moves beside the felt instead of below it. Also the only baseline of `renderMatchOverOverlay` (the solid-fill match-over screen) at any tier. |
| `packages/games/truco-ui/src/scoreboard-panel.visual.test.ts` | The matchstick scoreboard at a non-trivial, asymmetric score (both malas and buenas casitas populated on both sides). |
| `apps/widget-app/src/game-selection.visual.test.ts` | The game-selection screen, both branches of the zero-counter UX rule side by side (real waiting count vs. the promoted bot CTA), narrow AND at the wide (1024px) grid tier. |
| `apps/widget-app/src/status-view.visual.test.ts` | The centered status card (WCR-3) at the wide (1024px) tier, and the unregistered-game fallback's own card — the same screen, once dead-end `<p>` tags, now a navigable chrome card (WCR-4). |

Each table shot captures the element under test, not the whole test container:
the mid-hand/pending/2v2 shots screenshot the felt element (dead side cloth
cropped away), while `table-themed`/`table-wide-themed`/`match-over-wide`
keep the whole shell — felt AND scoreboard panel, or felt AND the sibling
match-over overlay — in an auto-height container.

Every fixture in this suite mounts **width-only, height unset**, and that is
fidelity, not avoidance: the real widget document has no definite height
chain. The host sets `style.height` on the *iframe element*, but
`apps/server/src/embed-shell.ts` declares no height on `html`/`body`, so
`.hexdev-truco-table-shell`'s own `height: 100%` resolves against an
auto-height body and computes to auto. A width-only container is the ancestor
chain the widget actually gets. It also means nothing can clip, which keeps
the screenshot-stability hang this suite once bisected out of reach by
construction.

This paragraph used to claim instead that an explicit height made the felt's
`min-height: max(100%, …)` evict the panel below the fold — true of the
mechanism where a definite height chain existed, but never reached in
production, and the `max(100%, …)` has since been removed from
`table-styles.ts`. Panel position under a definite height is now asserted by
`packages/games/truco-ui/src/table-panel-in-frame.browser.test.ts`; no visual
fixture here is load-bearing for it.

**Wide/ultra tiers need a wider Browser Mode viewport, not just a wider
container** (real bug found and fixed writing `table-wide.visual.test.ts`):
Browser Mode's default viewport is 414×896 (see Determinism controls below);
a mounted container wider than that renders correctly per
`getBoundingClientRect()` (real CSS layout, unaffected), but Chromium never
PAINTS past the viewport edge, so the captured screenshot clips solid white
past x≈414. Every wide/ultra test explicitly widens the viewport first via
`page.viewport(width, height)` (`vitest/browser`) — the existing ≤414px-wide
narrow-tier tests never needed this, which is why it went unnoticed until
this suite's first 900px+ capture.

## Updating a baseline — deliberately, on purpose

The default command (`pnpm test:visual`) never writes a baseline silently —
a missing or mismatched reference fails the run. **There is no
`test:visual:update` script.** That is intentional: making "update" one
character longer than "run" is exactly the kind of friction that keeps
`--update` a deliberate act instead of a reflex.

To update a baseline on purpose:

1. Run the SPECIFIC file whose baseline needs to change, scoped by name —
   never the whole suite at once:
   ```
   pnpm exec vitest run --config vitest.visual.config.ts table.visual.test.ts --update
   ```
2. Open `git diff --stat` and the actual changed PNG(s) — a reviewer must be
   able to look at the new baseline and tell whether it is *right*, not just
   different. If you cannot explain in the commit message what changed and
   why, do not commit it.
3. Commit the PNG together with whatever code change caused it, in the same
   commit — a baseline update with no accompanying code change is a red
   flag, not routine maintenance.

## What this suite can and cannot catch

It catches **change**, not "ugly". A pixel-diff test has no opinion on
whether a colour palette is tasteful — only on whether it moved. Concretely:

- **Catches**: a locked card tinting the felt green again (the opacity bug,
  reintroduced and confirmed to fail this suite — see below), a theme token
  silently stopping at the wrong element, a scoreboard geometry regression, a
  CSS rule accidentally deleted, an element disappearing or shifting.
- **Does NOT catch**: a genuinely bad-looking-but-unchanged design, a colour
  choice nobody likes, anything about a screen this suite does not cover, or
  a bug whose only symptom is behavioural (wrong score, illegal move
  accepted) — that is what the unit and E2E suites are for. (Correction: an
  earlier version of this doc claimed "2v2/four-seat layout has no coverage
  yet — it does not exist". That was false when written — `table-2v2.visual.test.ts`
  already existed with 3 baselines — and it is false now; see Coverage above.)

## Proof each snapshot can actually fail

A snapshot test that has never been seen to fail is a snapshot of unknown
value. Each one below was verified by reintroducing a real bug, confirming a
RED run, then reverting:

| Snapshot | Regression reintroduced | Result |
|---|---|---|
| `table-mid-hand` | The actual historical bug: `.hexdev-truco-card--locked { opacity: 0.55; filter: grayscale(40%); }` (commit `6c6019a`'s exact "before") | FAILED |
| `table-truco-pending` | Same opacity/grayscale regression (this state locks the whole hand, so it is hit even harder) | FAILED |
| `table-themed` | Same opacity/grayscale regression, AND separately: `.hexdev-truco-scoreboard-panel`'s `background` hardcoded, ignoring `--gx-color-surface` (a "theming silently stops applying" regression) | FAILED (both) |
| `scoreboard-non-trivial-score` | Matchstick head radius (`HEAD_RX`/`HEAD_RY` in `scoreboard.ts`) changed from `3.9`/`3.3` to `11`/`9` — a pure geometry regression no existing unit test touches | FAILED |
| `game-selection-mixed-presence` | The prominent-action CSS rule (`chrome-styles.ts`, `[data-prominent="person"] ...`) disabled — the `data-prominent` attribute is still set correctly, so no behavioural test would notice | FAILED |
| `table-wide-mid-hand` | Same historical opacity/grayscale regression as `table-mid-hand` (this is the identical fixture, re-captured at 960px) | FAILED |
| `table-wide-truco-pending` | Same opacity/grayscale regression (whole hand locked, so it is hit even harder — same reasoning as `table-truco-pending`) | FAILED |
| `table-wide-themed` | Same opacity/grayscale regression | FAILED |
| `table-2v2-mid-hand` | `--truco-card-width` (compact base, shared with 1v1) bumped `60px` → `90px` — every card on all four anchors resizes | FAILED |
| `table-2v2-senas-open` | Same card-width regression | FAILED |
| `table-2v2-hand-full-piles` | Same card-width regression | FAILED |
| `table-ultra-2v2` | The 2v2-only ultra-tier `--truco-card-width` (`table-styles.ts`'s `[data-seat-count="4"]` override inside the `≥1280px` block) bumped `100px` → `140px` | FAILED |
| `match-over-wide` | `opacity: 0.6` reintroduced on `.hexdev-truco-match-over[data-result="won"]` — the exact "translucent over the cloth" trap D-8 forbids by design; the overlay's own solid-fill contract is precisely what this baseline exists to prove | FAILED |
| `lobby-wide-grid` | Same prominent-action CSS rule disabled as `game-selection-mixed-presence` above (same catalog fixture, wide tier) — confirmed to independently fail both baselines in the same run | FAILED |
| `chrome-status-wide` | `.hexdev-chrome-status`'s `background` hardcoded to an arbitrary literal (`#7c1fa2`) instead of reading `--gx-color-primary` — the same "theming silently stops applying" class as `table-themed`'s own scoreboard-panel regression. (A pure geometry regression — `max-width`/`border-radius`/`box-shadow` removed — was tried first and did NOT move enough pixels to cross the 1% tolerance for this baseline specifically; recorded here so a future reader does not re-discover the same dead end.) | FAILED |
| `chrome-unsupported-game` | Same `.hexdev-chrome-status` background regression (shared class with the status card above) | FAILED |

Every regression above was reverted immediately after confirming the FAIL,
and the suite was re-run to confirm it returned to GREEN.

## Portability — the honest statement

**This environment**: Linux (Arch-based), Chromium via Playwright
`1.62.1`, headless, run 5+ times consecutively with zero flakiness.

**What is controlled and should travel to any machine or CI runner**: the
deal/game state (pure engine output), animations/transitions/scrollbars
(CSS), and glyph SHAPE (one embedded font file, not an OS font name).

**What is NOT fully controlled, disclosed rather than hidden**: pinning the
font FILE removes which glyphs are used, but it does **not** remove
sub-pixel anti-aliasing and hinting differences between OS font rasterizers
— Linux (FreeType, what generated these baselines), macOS (CoreText), and
Windows (DirectWrite) can each rasterize the identical font file with
slightly different sub-pixel positioning. The 1% pixelmatch tolerance
absorbs SOME of this, but was tuned and tested on Linux only. **These
baselines are not guaranteed to reproduce on a different OS without
re-verification.**

What closing that gap for real would need: running this suite inside a
container with a pinned, single OS and a pinned Chromium build — e.g. the
official Playwright Docker image matching the installed `playwright` version
(`mcr.microsoft.com/playwright:v1.62.1-noble`) — for BOTH baseline
generation and every CI run, so every comparison happens on the exact same
rendering stack. That container is not set up in this change (out of scope
for this unit); until it exists, treat a CI failure on a machine other than
the one that generated these baselines as "verify by eye before assuming a
real regression", not as an automatic block.
