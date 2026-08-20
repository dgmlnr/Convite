import { TABLE_STRINGS } from "./strings.js";

/**
 * The matchstick scoreboard — ported geometry from the user-approved
 * prototype (`fosforos-aprobado.html`, two iterations of user feedback:
 * "más finitos y con aire", then "un toque más gorditos"). Every constant
 * below is copied from that file verbatim; this is a port, not a redesign.
 */
const STICK_THICKNESS = 3.05;
const HEAD_RX = 3.9;
const HEAD_RY = 3.3;
/** Deliberate gap so no two matchsticks in the "casita" square ever touch —
 * the square "breathes" rather than forming a sealed frame. */
const AIR = 3.2;

export const MATCHSTICK_THEME_DEFAULTS = {
  "--truco-match-wood-1": "#8a5f24",
  "--truco-match-wood-2": "#ffeecb",
  "--truco-match-wood-3": "#e6c48a",
  "--truco-match-wood-4": "#a97a35",
  "--truco-match-wood-5": "#6b4715",
  "--truco-match-head-1": "#fff0d0",
  "--truco-match-head-2": "#ff7a55",
  "--truco-match-head-3": "#c62a17",
  "--truco-match-head-4": "#5a0e06",
  /** A literal, fixed muted tone for the zero-score "ghost" casita — NOT the
   * CSS `opacity` property, which would blend with whatever sits behind the
   * shape instead of just reading as muted (the exact card-dimming trap this
   * project already hit once; see table-styles.ts's own note on `filter`
   * vs. `opacity`). */
  "--truco-match-ghost-wood": "rgba(255, 255, 255, 0.085)",
  "--truco-match-ghost-head": "rgba(255, 255, 255, 0.11)",
} as const;

const DEFS_ID = "hexdev-truco-matchstick-defs";

/**
 * Injects the shared gradient/shadow `<defs>` exactly once (idempotent —
 * `renderScoreboard` may be called many times across many re-renders, this
 * must never accumulate duplicate defs). Referenced by every `casita` via
 * `url(#hexdev-truco-...)`; SVG `url()` references resolve document-wide,
 * so separate inline `<svg>` elements can all share this one block.
 */
export function ensureMatchstickDefs(doc: Document): void {
  if (doc.getElementById(DEFS_ID) !== null) return;
  const wrapper = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  wrapper.setAttribute("id", DEFS_ID);
  wrapper.setAttribute("width", "0");
  wrapper.setAttribute("height", "0");
  wrapper.setAttribute("style", "position:absolute");
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.innerHTML = `<defs>
    <linearGradient id="hexdev-truco-wood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   style="stop-color:var(--truco-match-wood-1)"/>
      <stop offset="20%"  style="stop-color:var(--truco-match-wood-2)"/>
      <stop offset="46%"  style="stop-color:var(--truco-match-wood-3)"/>
      <stop offset="78%"  style="stop-color:var(--truco-match-wood-4)"/>
      <stop offset="100%" style="stop-color:var(--truco-match-wood-5)"/>
    </linearGradient>
    <radialGradient id="hexdev-truco-head" cx="32%" cy="26%" r="70%">
      <stop offset="0%"   style="stop-color:var(--truco-match-head-1)"/>
      <stop offset="16%"  style="stop-color:var(--truco-match-head-2)"/>
      <stop offset="52%"  style="stop-color:var(--truco-match-head-3)"/>
      <stop offset="100%" style="stop-color:var(--truco-match-head-4)"/>
    </radialGradient>
    <filter id="hexdev-truco-stick-shadow" x="-40%" y="-40%" width="190%" height="190%">
      <feDropShadow dx="0.5" dy="1" stdDeviation="0.7" flood-color="#000" flood-opacity="0.34"/>
    </filter>
  </defs>`;
  doc.body.appendChild(wrapper);
}

/** A single matchstick: the stick (`rect`) stretches with `length`, the head
 * (`ellipse`) NEVER scales — `HEAD_RX`/`HEAD_RY` are fixed constants,
 * independent of `length`. Scaling the whole matchstick uniformly would
 * deform the head into an egg shape at large sizes; this is exactly the bug
 * the approved prototype's own comment calls out. */
function matchstick(x: number, y: number, length: number, rotationDeg: number): string {
  const stickLength = length - HEAD_RX;
  return `<g transform="translate(${x} ${y}) rotate(${rotationDeg})">
    <rect x="0" y="${-STICK_THICKNESS / 2}" width="${stickLength}" height="${STICK_THICKNESS}" rx="${STICK_THICKNESS / 2}" fill="url(#hexdev-truco-wood)"/>
    <rect x="1.2" y="${-STICK_THICKNESS / 2 + 0.42}" width="${Math.max(0, stickLength - 2.6)}" height="0.6" rx="0.3" fill="#fff" opacity="0.44"/>
    <ellipse cx="${stickLength}" cy="0" rx="${HEAD_RX}" ry="${HEAD_RY}" fill="url(#hexdev-truco-head)"/>
    <ellipse cx="${stickLength - 1}" cy="-0.95" rx="1.15" ry="0.75" fill="#fff" opacity="0.55"/>
  </g>`;
}

/**
 * The "casita": 4 matchsticks form a square (one point each), a 5th crosses
 * corner to corner (the 5th point) — the standard Truco tally mark. `points`
 * is how many of the 5 pieces to draw (0-5); each piece is shortened by
 * `AIR` on the ends it would otherwise share with its neighbor, so the
 * square never fully seals shut.
 */
export function renderCasita(points: 0 | 1 | 2 | 3 | 4 | 5, size: number): string {
  const margin = HEAD_RX + 4;
  const box = size + margin * 2;
  const side = size - AIR * 2;
  const diagonalFull = size * Math.SQRT2;
  const diagonal = diagonalFull - AIR * 2;
  const diagonalOffset = AIR / Math.SQRT2;

  const pieces = [
    () => matchstick(margin + AIR, margin, side, 0),
    () => matchstick(margin + size, margin + AIR, side, 90),
    () => matchstick(margin + size - AIR, margin + size, side, 180),
    () => matchstick(margin, margin + size - AIR, side, 270),
    () => matchstick(margin + diagonalOffset, margin + diagonalOffset, diagonal, 45),
  ];

  const drawn = pieces.slice(0, points).map((piece) => piece()).join("");
  return `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}"><g filter="url(#hexdev-truco-stick-shadow)">${drawn}</g></svg>`;
}

/** A single ghost matchstick: same geometry as `matchstick`, but filled with
 * a flat, fixed muted tone instead of the wood/head gradients — never the
 * `opacity` property, so it never blends toward whatever sits behind it. */
function ghostMatchstick(x: number, y: number, length: number, rotationDeg: number): string {
  const stickLength = length - HEAD_RX;
  return `<g transform="translate(${x} ${y}) rotate(${rotationDeg})">
    <rect x="0" y="${-STICK_THICKNESS / 2}" width="${stickLength}" height="${STICK_THICKNESS}" rx="${STICK_THICKNESS / 2}" fill="var(--truco-match-ghost-wood)"/>
    <ellipse cx="${stickLength}" cy="0" rx="${HEAD_RX}" ry="${HEAD_RY}" fill="var(--truco-match-ghost-head)"/>
  </g>`;
}

/**
 * A full, un-lit "casita" — all 5 pieces drawn in the muted ghost tone,
 * never omitted entirely. Rendered exactly when a score group has ZERO
 * points, so zero reads as an intentionally empty tally slot rather than
 * missing content (spec: "zero-zero has to look intentional, not empty").
 * `data-ghost-casita` marks it distinctly from a scored (solid,
 * wood/head-gradient) casita.
 */
export function renderGhostCasita(size: number): string {
  const margin = HEAD_RX + 4;
  const box = size + margin * 2;
  const side = size - AIR * 2;
  const diagonalFull = size * Math.SQRT2;
  const diagonal = diagonalFull - AIR * 2;
  const diagonalOffset = AIR / Math.SQRT2;

  const pieces = [
    ghostMatchstick(margin + AIR, margin, side, 0),
    ghostMatchstick(margin + size, margin + AIR, side, 90),
    ghostMatchstick(margin + size - AIR, margin + size, side, 180),
    ghostMatchstick(margin, margin + size - AIR, side, 270),
    ghostMatchstick(margin + diagonalOffset, margin + diagonalOffset, diagonal, 45),
  ].join("");

  return `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" data-ghost-casita="true"><g>${pieces}</g></svg>`;
}

/** A run of casitas representing `count` points, 5 per casita — mirrors the
 * approved prototype's own `tanteador()`. Falls back to a single ghost
 * casita for a zero-point group instead of rendering nothing at all. */
function renderMatchstickRun(count: number, size: number): string {
  if (count === 0) return renderGhostCasita(size);
  const casitaCount = Math.ceil(count / 5);
  let remaining = count;
  let html = "";
  for (let i = 0; i < casitaCount; i += 1) {
    const points = Math.max(0, Math.min(5, remaining)) as 0 | 1 | 2 | 3 | 4 | 5;
    html += renderCasita(points, size);
    remaining -= 5;
  }
  return html;
}

/** Presentational-only grouping of an already-known score into "malas"
 * (first half of the target) and "buenas" (the rest) — the score itself
 * comes straight from `Team.score`, never re-derived or re-judged here. */
export function splitMalasBuenas(score: number, target: 15 | 30): { readonly malas: number; readonly buenas: number } {
  const half = Math.floor(target / 2);
  const malas = Math.min(score, half);
  const buenas = Math.max(0, score - half);
  return { malas, buenas };
}

export interface ScoreboardOptions {
  readonly score: number;
  readonly target: 15 | 30;
  readonly size?: number;
}

const DEFAULT_MATCHSTICK_SIZE = 32;

/** Renders one team's score, split into a labeled "Malas" run and a labeled
 * "Buenas" run of casitas (spec: "Split into malas and buenas"). */
export function renderScoreboard(container: HTMLElement, options: ScoreboardOptions): void {
  ensureMatchstickDefs(container.ownerDocument);
  const { malas, buenas } = splitMalasBuenas(options.score, options.target);
  const size = options.size ?? DEFAULT_MATCHSTICK_SIZE;

  container.replaceChildren();
  container.className = "hexdev-truco-scoreboard";

  // The score as TEXT (WCAG 1.1.1): the casitas are a picture of a number,
  // and a picture-only score reads as nothing at all. Clip-rect hidden (the
  // shared class, table-styles.ts), so it costs the panel's fixed height
  // budget zero pixels and no visual baseline a single byte; first child, so
  // a reader meets the number before the "Malas"/"Buenas" run labels.
  // `data-score-total` carries the raw number for tests and debugging humans.
  const total = document.createElement("span");
  total.className = "hexdev-truco-visually-hidden";
  total.dataset.scoreTotal = String(options.score);
  total.textContent = TABLE_STRINGS.scoreTotal(options.score);
  container.appendChild(total);

  for (const [key, count, label] of [
    ["malas", malas, TABLE_STRINGS.malas],
    ["buenas", buenas, TABLE_STRINGS.buenas],
  ] as const) {
    const group = document.createElement("div");
    group.className = "hexdev-truco-score-group";
    group.dataset.scoreGroup = key;

    // The caption is only HALF a sentence to a reader: the value it labels is
    // drawn by the aria-hidden sticks below, so "Malas" arrived followed by
    // nothing. Hidden from the accessibility tree and re-said whole by the
    // line beneath it — appending a count beside an exposed caption would have
    // read "Malas Malas: 4". Same trade the sticks themselves already make.
    const caption = document.createElement("span");
    caption.className = "hexdev-truco-score-label";
    caption.textContent = label;
    caption.setAttribute("aria-hidden", "true");
    group.appendChild(caption);

    // Clip-rect hidden, like the total above: out of flow, so it costs the
    // panel's fixed height budget zero pixels and no visual baseline a byte.
    // AFTER the total and before nothing — a reader meets the number first,
    // then how it splits.
    const spoken = document.createElement("span");
    spoken.className = "hexdev-truco-visually-hidden";
    spoken.dataset.scoreRun = key;
    spoken.textContent = TABLE_STRINGS.scoreRun(label, count);
    group.appendChild(spoken);

    const sticks = document.createElement("div");
    sticks.className = "hexdev-truco-score-sticks";
    // Decorative: the number these sticks draw is already said, in digits, by
    // the hidden total above — left exposed, a reader would wade through raw
    // SVG geometry that says nothing (the exact 1.1.1 failure being fixed).
    sticks.setAttribute("aria-hidden", "true");
    sticks.innerHTML = renderMatchstickRun(count, size);
    group.appendChild(sticks);

    container.appendChild(group);
  }
}
