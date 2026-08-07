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
  font-family: var(--gx-font-family, system-ui, sans-serif);
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

.hexdev-truco-anchor { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 0; }
[data-position="top"] { grid-area: top; align-items: flex-start; }
[data-position="bottom"] { grid-area: bottom; flex-direction: column; }
[data-position="left"] { grid-area: left; flex-direction: column; }
[data-position="right"] { grid-area: right; flex-direction: column; }
.hexdev-truco-anchor:empty { display: none; }
.hexdev-truco-anchor--active {
  box-shadow: inset 0 0 0 2px var(--gx-color-accent, #ffd166);
  border-radius: var(--gx-radius, 12px);
}

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
.hexdev-truco-card--locked {
  opacity: 0.55;
  filter: grayscale(40%);
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

.hexdev-truco-score-row { display: flex; gap: 16px; align-items: flex-start; justify-content: center; flex-wrap: wrap; }
.hexdev-truco-team-label { display: block; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--gx-color-accent, #ffd166); text-align: center; }
.hexdev-truco-score-group { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.hexdev-truco-score-label { font-size: 0.65rem; opacity: 0.8; }
.hexdev-truco-score-sticks { display: flex; flex-wrap: wrap; gap: 2px; justify-content: center; }

.hexdev-truco-trick-feedback, .hexdev-truco-turn-indicator {
  margin: 0;
  min-height: 1.2em;
  text-align: center;
  font-size: 0.85rem;
}
.hexdev-truco-turn-indicator { font-weight: 700; color: var(--gx-color-accent, #ffd166); }

.hexdev-truco-calls-row, [data-position="bottom"] > div:first-child {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  min-height: 0;
}
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
}
.hexdev-truco-call:hover, .hexdev-truco-call:focus-visible { filter: brightness(1.1); }
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
