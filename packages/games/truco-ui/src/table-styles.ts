import { DECK_THEME_DEFAULTS } from "@hexdev/spanish-deck-ui";
import { MATCHSTICK_THEME_DEFAULTS } from "./scoreboard.js";

export const TABLE_STYLE_ID = "hexdev-truco-table-styles";

function cssDeclarations(defaults: Readonly<Record<string, string>>): string {
  return Object.entries(defaults)
    .map(([token, value]) => `${token}: ${value};`)
    .join(" ");
}

/**
 * The whole "linda y cómoda" table stylesheet, generated as a string rather
 * than a `.css` file: this package builds via plain `tsc -b` (no bundler,
 * design §3), so a `.css` import has nowhere to resolve to at that step —
 * the same reason `card-back.ts`/`embed-shell.ts` already generate their own
 * markup as strings instead. Injected once via `ensureTableStyles`.
 *
 * DESIGN §10 — hybrid theming by zone, mechanically enforced here, not just
 * described: every rule below either (a) reads a `--gx-*` token (chrome,
 * calls, score labels, turn text — the tenant's brand), or (b) reads a
 * `--truco-*`/`--deck-*` token that is NEVER part of the tenant's
 * postMessage-sanitized vocabulary (`THEME_TOKEN_NAMES` in
 * `widget-protocol`) — the table cloth, the matchstick wood/head, and the
 * card back keep their own fixed identity regardless of what a tenant sends.
 */
export function buildTableStylesheet(): string {
  return `
/* Declared on :root, NOT .hexdev-truco-table: the shared matchstick <defs>
 * block (ensureMatchstickDefs) is appended directly to <body>, a SIBLING of
 * .hexdev-truco-table, not a descendant of it — a custom property scoped
 * only to .hexdev-truco-table would never inherit into that sibling, and an
 * SVG gradient stop's var() reference that resolves to nothing falls back to
 * plain black (Chromium's initial value for 'fill') instead of the intended
 * wood/head colours. Root-scoped avoids that regardless of where any given
 * caller mounts the defs or the table relative to each other. */
:root {
  ${cssDeclarations(DECK_THEME_DEFAULTS)}
  ${cssDeclarations(MATCHSTICK_THEME_DEFAULTS)}
  --truco-table-cloth: #1e5c43;
}
/* The outer shell owns the shell-level layout (felt beside/above its own
 * chrome scoreboard panel — Change 2), and establishes an inline-size
 * containment context so the panel/felt split can be tested against a REAL
 * geometry breakpoint independent of the actual browser viewport: an
 * embedded widget's available width is its OWN container's width, which can
 * legitimately differ from the top-level page's viewport (it sits inside a
 * host page's layout, not full-bleed). A container query answers "is MY box
 * narrow or wide", which is the honest question here — an ordinary viewport
 * media query can only answer "is the whole browser window narrow or wide". */
/* A size container cannot itself be styled by its OWN container query rules
 * — only its descendants (a real, documented CSS Containment limitation, not
 * a typo: verified live, a self-targeting rule on the shell class itself is
 * silently ignored). The container therefore stays a plain, unstyled box;
 * the inner shell-layout element beneath it is the actual flex row/column
 * that the container query below switches. */
.hexdev-truco-table-shell {
  container-type: inline-size;
  container-name: hexdev-truco-shell;
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  font-family: var(--gx-font-family, system-ui, sans-serif);
}
.hexdev-truco-shell-layout {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}
.hexdev-truco-shell-layout > .hexdev-truco-table { flex: 1 1 auto; min-height: 0; }

.hexdev-truco-table {
  --truco-card-width: 60px;
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas: "top" "center" "bottom";
  gap: 8px;
  padding: 8px;
  background: var(--truco-table-cloth);
  color: var(--gx-color-on-surface, #f2f2f2);
  overflow: hidden;
}
.hexdev-truco-table * { box-sizing: border-box; }

/* The hard case (spec): four seats on a phone. Two seats (v1) never touch
 * the side gutters at all — a columnless top/center/bottom stack makes the
 * best use of a narrow screen instead of reserving empty side space for
 * anchors nobody occupies yet. Four seats (v2/2v2) trades some of that width
 * for real side gutters; on a genuinely narrow phone those gutters stay
 * tight (opponent backs stack vertically, shrunk) — a disclosed tradeoff,
 * not a hidden one: 2-seat truco is the common case and stays uncompromised. */
.hexdev-truco-table[data-seat-count="4"] {
  grid-template-columns: minmax(34px, 15vw) 1fr minmax(34px, 15vw);
  grid-template-areas: "top top top" "left center right" "bottom bottom bottom";
}
@media (min-width: 640px) {
  .hexdev-truco-table { gap: 14px; padding: 16px; --truco-card-width: 84px; }
  .hexdev-truco-table[data-seat-count="4"] { grid-template-columns: minmax(72px, 16vw) 1fr minmax(72px, 16vw); }
}
@media (min-width: 960px) {
  .hexdev-truco-table { --truco-card-width: 100px; }
}

/* Change 2: a side panel that works wide does not fit narrow, so the two
 * widths get genuinely different treatments rather than one compromise.
 * Narrow (< 640 CONTAINER px, e.g. 320/375 phones): the panel is a slim
 * chrome strip stacked ABOVE the felt — no room for a real side column, but
 * still clearly its own boxed space, never inside the play area. Wide: the
 * panel becomes a real side column, beside the felt, matching a real
 * table's tanteador sitting off to one side. */
@container hexdev-truco-shell (min-width: 640px) {
  .hexdev-truco-shell-layout { flex-direction: row; align-items: stretch; }
  .hexdev-truco-scoreboard-panel {
    order: 0;
    flex: 0 0 auto;
    width: 168px;
    flex-direction: column;
    justify-content: flex-start;
  }
}

.hexdev-truco-anchor { position: relative; display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 0; }
[data-position="top"] { grid-area: top; align-items: flex-start; }
[data-position="bottom"] { grid-area: bottom; flex-direction: column; }
[data-position="left"] { grid-area: left; flex-direction: column; }
[data-position="right"] { grid-area: right; flex-direction: column; }
.hexdev-truco-anchor:empty { display: none; }
/* Change 3: whose turn it is must be unmistakable at a glance, not just
 * readable in text. A stronger, fully OPAQUE ring (box-shadow paints on top,
 * it never blends the felt through the anchor's own content the way the
 * opacity property would) plus a real, solid-background badge chip
 * pointing at the exact active seat — the piece that keeps meaning "a
 * specific seat" once a fourth anchor exists. */
.hexdev-truco-anchor--active {
  box-shadow: inset 0 0 0 3px var(--gx-color-accent, #ffd166), 0 0 0 6px rgba(255, 209, 102, 0.28);
  border-radius: var(--gx-radius, 12px);
}
.hexdev-truco-turn-badge {
  position: absolute;
  top: -11px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--gx-color-accent, #ffd166);
  color: #1a1a1a;
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 3px 10px;
  border-radius: 999px;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  z-index: 1;
}
[data-position="top"] .hexdev-truco-turn-badge { top: auto; bottom: -11px; }
[data-position="left"] .hexdev-truco-turn-badge,
[data-position="right"] .hexdev-truco-turn-badge {
  top: 50%;
  left: auto;
  right: -6px;
  transform: translate(50%, -50%);
}
[data-position="left"] .hexdev-truco-turn-badge { right: auto; left: -6px; transform: translate(-50%, -50%); }

.hexdev-truco-center {
  grid-area: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
}

.hexdev-truco-hand, .hexdev-truco-opponent-hand {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
[data-position="left"] .hexdev-truco-opponent-hand,
[data-position="right"] .hexdev-truco-opponent-hand {
  flex-direction: column;
}

.hexdev-truco-card {
  width: var(--truco-card-width);
  aspect-ratio: 220 / 336;
  border-radius: 6px;
  overflow: hidden;
  padding: 0;
  border: none;
  background: none;
  display: block;
}
.hexdev-truco-card img, .hexdev-truco-card svg { width: 100%; height: 100%; object-fit: contain; display: block; }
.hexdev-truco-card--playable {
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.hexdev-truco-card--playable:hover, .hexdev-truco-card--playable:focus-visible {
  transform: translateY(-10%);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.45);
}
/* A card you cannot play right now must read as waiting, not as broken.
 *
 * Deliberately NOT opacity: this sits on green cloth, and opacity lets the
 * cloth through, so the card comes out tinted green rather than dimmed — it
 * reads as a colour problem with the artwork, which is exactly how it was
 * first reported. brightness and saturate dim the card's own pixels and
 * never blend the surface behind it.
 *
 * The previous values (0.55 opacity plus 40% grayscale) also went far past
 * "not now" into "this card is disabled forever". The point is only to make
 * the playable ones stand out. */
.hexdev-truco-card--locked {
  filter: brightness(0.86) saturate(0.9);
  cursor: default;
}

/* A single view snapshot never carries more than ONE in-progress-trick play
 * (the engine resolves a trick's second card and clears it atomically — see
 * table.ts's own docstring), so absolute positioning per play is safe: there
 * is never a second card to collide with. The extra height (vs. exactly one
 * card) is what gives the top/bottom offset room to actually read as "closer
 * to that seat" instead of sitting dead-centre regardless of who played it. */
.hexdev-truco-trick { position: relative; display: flex; align-items: center; justify-content: center; min-height: calc(var(--truco-card-width) * 336 / 220 * 1.7); width: 100%; }
.hexdev-truco-played { position: absolute; }
.hexdev-truco-played--top { top: 0; }
.hexdev-truco-played--bottom { bottom: 0; }
.hexdev-truco-played--left { left: 15%; }
.hexdev-truco-played--right { right: 15%; }

/* Change 2: the tanteador's own home — chrome, not felt. Its own solid
 * background (a real box, distinct from the play surface) is what makes a
 * 0-0 score read as "an intentional, present scoreboard" rather than loose
 * text floating on cloth; hybrid theming by zone (design §10) means this
 * background/label take the tenant's --gx- tokens, while the matchsticks
 * drawn inside keep their own fixed identity. */
.hexdev-truco-scoreboard-panel {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: center;
  flex-wrap: wrap;
  background: var(--gx-color-surface, #26433a);
  color: var(--gx-color-on-surface, #f2f2f2);
  border-radius: var(--gx-radius, 12px);
  padding: 8px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.hexdev-truco-scoreboard-group { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.hexdev-truco-team-label { display: block; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--gx-color-accent, #ffd166); text-align: center; }
.hexdev-truco-score-group { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.hexdev-truco-score-label { font-size: 0.65rem; opacity: 0.8; }
.hexdev-truco-score-sticks { display: flex; flex-wrap: wrap; gap: 2px; justify-content: center; }

/* Change 1: the pending call is the single most important thing on screen
 * while it is open — an opaque, solid-background block in normal document
 * flow (never a modal-style overlay, never anything translucent over the
 * cloth behind it). The data-turn attribute gives "waiting on me" a visibly
 * stronger treatment than "waiting on the opponent", never relying on text alone. */
.hexdev-truco-pending-call:empty { display: none; }
.hexdev-truco-pending-call {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 22px;
  border-radius: var(--gx-radius, 12px);
  background: var(--gx-color-primary, #2f6f4f);
  color: var(--gx-color-on-primary, #ffffff);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  text-align: center;
}
.hexdev-truco-pending-call[data-turn="mine"] {
  background: var(--gx-color-accent, #ffd166);
  color: #1a1a1a;
  box-shadow: 0 0 0 3px rgba(255, 209, 102, 0.5), 0 4px 14px rgba(0, 0, 0, 0.4);
}
.hexdev-truco-pending-call-level { font-size: 1.1rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; }
.hexdev-truco-pending-call-caller { font-size: 0.75rem; }
.hexdev-truco-pending-call-turn { font-size: 0.8rem; font-weight: 700; }

.hexdev-truco-trick-feedback {
  margin: 0;
  min-height: 1.2em;
  text-align: center;
  font-size: 0.85rem;
}
/* Visually hidden, still announced. The per-anchor badge is what a sighted
 * player reads — it says the state and points at the seat — so this line is
 * removed from the visual layout instead of repeating it. Screen readers
 * still get it, and its aria-live means a turn change is spoken rather than
 * silently swapping a badge somewhere on the table. */
.hexdev-truco-turn-indicator {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
  min-height: 0;
}

.hexdev-truco-calls-row, [data-position="bottom"] > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  min-height: 0;
}
/* Change 4: answering a pending call reads as a different decision from
 * opening or escalating one — response buttons take the accent treatment
 * (matches the pending-call banner's own "mine" state), opening/escalation
 * buttons stay on the table's primary colour, and the two groups never
 * interleave in one undifferentiated row. */
.hexdev-truco-calls-group { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.hexdev-truco-call {
  min-height: 40px;
  padding: 6px 16px;
  border: none;
  border-radius: var(--gx-radius, 999px);
  background: var(--gx-color-primary, #2f6f4f);
  color: var(--gx-color-on-primary, #ffffff);
  font-family: inherit;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.hexdev-truco-call:hover, .hexdev-truco-call:focus-visible { filter: brightness(1.1); }
.hexdev-truco-calls-group--response .hexdev-truco-call {
  background: var(--gx-color-accent, #ffd166);
  color: #1a1a1a;
}
.hexdev-truco-calls-group--opening .hexdev-truco-call {
  background: transparent;
  border: 2px solid var(--gx-color-primary, #2f6f4f);
  color: var(--gx-color-on-surface, #f2f2f2);
}

/* Change: a hand ending gets a clear, transient acknowledgement — who won it
 * and how many points, before play moves on (spec). A real, SOLID-background
 * chip, same anti-opacity discipline as everything else that sits on the
 * cloth: opacity here would tint toward the felt instead of standing out.
 * table.ts owns the timed clear; this stylesheet only owns how it looks
 * while present. The :empty selector hides it, matching the pending-call
 * banner's own convention. */
.hexdev-truco-hand-outcome:empty { display: none; }
.hexdev-truco-hand-outcome {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 16px;
  border-radius: var(--gx-radius, 999px);
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.hexdev-truco-hand-outcome[data-result="won"] {
  background: var(--gx-color-accent, #ffd166);
  color: #1a1a1a;
}
.hexdev-truco-hand-outcome[data-result="lost"] {
  background: #3a3a3a;
  color: #f2f2f2;
}
.hexdev-truco-hand-outcome-headline { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.02em; }
.hexdev-truco-hand-outcome-points { font-size: 0.85rem; opacity: 0.85; }

/* Change: a real ending, not a blank error state (spec: "losing should feel
 * like a loss, not like an error message"). A full, SOLID-background overlay
 * over the whole shell — never translucent over the cloth (the exact trap
 * that already caught this project once) — showing who won, the final
 * score, and the play-again path right where the player is looking. */
.hexdev-truco-match-over:empty { display: none; }
.hexdev-truco-match-over {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  text-align: center;
  background: var(--gx-color-surface, #1c1c1c);
  color: var(--gx-color-on-surface, #f2f2f2);
}
.hexdev-truco-match-over[data-result="won"] {
  background: var(--gx-color-primary, #1e5c43);
  color: var(--gx-color-on-primary, #ffffff);
}
.hexdev-truco-match-over-headline { margin: 0; font-size: 1.6rem; font-weight: 800; }
.hexdev-truco-match-over-score { margin: 0; font-size: 1.1rem; font-weight: 600; }
.hexdev-truco-match-over button[data-action="play-again"] {
  min-height: 46px;
  padding: 10px 28px;
  border: none;
  border-radius: var(--gx-radius, 999px);
  background: var(--gx-color-accent, #ffd166);
  color: #1a1a1a;
  font-family: inherit;
  font-weight: 800;
  font-size: 1rem;
  cursor: pointer;
}
.hexdev-truco-match-over button[data-action="play-again"]:hover,
.hexdev-truco-match-over button[data-action="play-again"]:focus-visible {
  filter: brightness(1.08);
}

/* 2v2 ONLY -- every selector below is scoped under
 * .hexdev-truco-table[data-seat-count="4"] so the 1v1 (2-seat) felt is
 * BYTE-IDENTICAL to before this block existed, even though every anchor now
 * carries a data-relation attribute regardless of seat count (table.ts's own
 * doc comment): an attribute with no matching selector changes nothing
 * paintable. "Obvious at a glance who you are helping" (spec): a colored
 * left-edge accent on top of the shared anchor treatment, distinct enough
 * between partner and opponent that color alone is not the only signal --
 * the real text label (TABLE_STRINGS.partner/opponent, rendered by a
 * caller of this stylesheet, not by CSS content) carries the rest. */
.hexdev-truco-table[data-seat-count="4"] .hexdev-truco-anchor[data-relation="partner"] {
  box-shadow: inset 4px 0 0 0 var(--gx-color-accent, #ffd166);
}
.hexdev-truco-table[data-seat-count="4"] .hexdev-truco-anchor[data-relation="opponent"] {
  box-shadow: inset 4px 0 0 0 rgba(255, 255, 255, 0.35);
}
.hexdev-truco-table[data-seat-count="4"] [data-position="top"].hexdev-truco-anchor[data-relation="partner"] {
  box-shadow: inset 0 -4px 0 0 var(--gx-color-accent, #ffd166);
}
.hexdev-truco-table[data-seat-count="4"] [data-position="top"].hexdev-truco-anchor[data-relation="opponent"] {
  box-shadow: inset 0 -4px 0 0 rgba(255, 255, 255, 0.35);
}
/* Static flow, NOT absolutely positioned: the top anchor's own box only
 * wraps tightly around its card-back row (min-height: 0), so an absolutely
 * positioned label risked sitting outside that box and clipping against
 * the felt's own overflow:hidden edge (found rendering the actual 2v2
 * baseline, not assumed). A normal block element, ordered FIRST in the
 * anchor via table.ts, is what a reviewer sees intact regardless of anchor
 * height. */
.hexdev-truco-relation-label {
  display: block;
  order: -1;
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 1px 6px;
  border-radius: var(--gx-radius, 999px);
  background: rgba(0, 0, 0, 0.4);
  color: var(--gx-color-on-surface, #f2f2f2);
}

/* Señas: discoverable without being noisy (spec). The toggle stays small
 * and secondary -- never styled like a primary call button, so a player
 * who does not care about señas is not visually nagged into opening it. */
.hexdev-truco-senas-toggle {
  min-height: 32px;
  padding: 4px 12px;
  border: 1px solid var(--gx-color-on-surface, #f2f2f2);
  border-radius: var(--gx-radius, 999px);
  background: transparent;
  color: var(--gx-color-on-surface, #f2f2f2);
  font-family: inherit;
  font-size: 0.75rem;
  opacity: 0.8;
  cursor: pointer;
}
.hexdev-truco-senas-toggle:hover, .hexdev-truco-senas-toggle:focus-visible { opacity: 1; }
.hexdev-truco-senas-row { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-top: 4px; }
.hexdev-truco-sena {
  min-height: 32px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--gx-radius, 999px);
  background: var(--gx-color-accent, #ffd166);
  color: #1a1a1a;
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

/* The partner's claimed signal -- small, secondary chrome on their own
 * anchor, never on an opponent's (senas.ts's own structural guarantee). */
.hexdev-truco-partner-sena {
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: var(--gx-radius, 999px);
  background: rgba(0, 0, 0, 0.35);
  color: var(--gx-color-on-surface, #f2f2f2);
}
`.trim();
}

/** Idempotent injection into `<head>` — safe to call on every render. */
export function ensureTableStyles(doc: Document): void {
  if (doc.getElementById(TABLE_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = TABLE_STYLE_ID;
  style.textContent = buildTableStylesheet();
  doc.head.appendChild(style);
}
