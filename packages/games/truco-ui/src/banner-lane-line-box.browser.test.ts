import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHeadToHeadMatch, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { DealInput, EnvidoCallLevel, PlayerId, SenaSignal, TeamId, TrucoCallLevel } from "@hexdev/truco-engine";
import { TABLE_STYLE_ID } from "./table-styles.js";
import { createMatchTableRenderer } from "./table.js";
import { renderPendingCallBanner } from "./pending-call.js";
import { renderHandOutcomeBanner } from "./hand-outcome.js";
import { renderSenaNotice } from "./sena-notice.js";
import { CALL_LABELS, SENA_LABELS } from "./strings.js";

/**
 * `table-zone-overlap.browser.test.ts` forbids the pending-call banner
 * outgrowing its own reserved lane (`--hx-band-banner`) or painting over a
 * played card. Until this file existed that held by LUCK, and the luck was
 * whichever font the machine happened to draw with: headless at 700px the
 * banner measured 78px against a 76px lane and covered the top of a played
 * pile — a player's card obscured by the pill telling them a call is open.
 *
 * SAME ROOT CAUSE AS `trick-feedback-line-box.browser.test.ts`, one element
 * over, and worse. The lane is a hardcoded pixel constant — the same number on
 * every machine, tiered 60/76/80/84/112 — but every line of text inside it was
 * `line-height: normal`, which each font answers out of its own
 * ascent/descent/line-gap. The lane's own comment in `table-styles.ts` sizes
 * it as "worst-case 58px + ~2px headroom"; ~2px of headroom over text with no
 * fixed leading is not headroom, it is the width of one font's opinion.
 *
 * WHAT IS NOT THE SAME, and is the reason this file exists rather than one
 * more case in the sibling: the trick-feedback line is ONE line box, so
 * "filled costs what it reserved" was the whole mechanism there. This banner
 * is a COLUMN of three spans (level, caller, turn — two at compact, where the
 * turn line is visually hidden), any of which can itself wrap to two or three
 * lines inside a slot whose shrink-to-fit width is capped at half the centre
 * column. So its height is not one line box but a sum of them, and there is no
 * single reservation on the element to compare a filled measurement against.
 *
 * These tests are therefore NOT about a number and NOT about a font, exactly
 * like the sibling's: they pin the PROPERTY that makes the lane's number
 * meaningful again — this lane's occupants are the same height whichever
 * vertical metrics draw them. That survives someone later re-tuning
 * `--hx-band-banner`, adding a fourth line to the pill, or changing a
 * font-size: there is no constant here to keep in step, only one element
 * measured against itself under several fonts.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. Fixing the leading pins the HEIGHT of
 * every line box; it does not pin HOW MANY there are. Line count follows glyph
 * advance widths, so a genuinely wider font still wraps differently and still
 * lands on a different total. That axis is real and is measured directly by
 * the third test below rather than papered over — and the honest fence for it
 * is the lane-containment assertion `table-zone-overlap` already owns, not
 * this file. Forbidding the wrap outright (the `white-space: nowrap` the seña
 * notice gets away with, on a closed six-label vocabulary) was measured and
 * rejected: at 375px/2v2 the compact row-pill's own widest reachable text
 * needs ~264px against a 223px centre column, so nowrap trades a vertical
 * overflow for a horizontal one.
 *
 * MIRRORED, NOT IMPORTED, from `trick-feedback-line-box.browser.test.ts`: that
 * file exports nothing (nor should it), and importing a `.browser.test.ts`
 * module for its helpers would re-register its two suites inside this file's
 * run. The synthetic-face technique is reproduced here; the two files are
 * expected to drift only where the elements genuinely differ.
 */

const SELF = "banner-lane-self" as PlayerId;
const OPPONENT = "banner-lane-opponent" as PlayerId;
const TEAMMATE = "banner-lane-teammate" as PlayerId;
const OPPONENT_2 = "banner-lane-opponent-2" as PlayerId;

/** Same fixtures as `table-zone-overlap.browser.test.ts`'s own, duplicated
 * rather than imported for the same reason that file gives for duplicating
 * `table-height-stability`'s: no file here exports fixtures. */
const DEAL_1V1: DealInput = [
  [
    { suit: "espada", rank: 1 },
    { suit: "basto", rank: 4 },
    { suit: "espada", rank: 7 },
  ],
  [
    { suit: "espada", rank: 4 },
    { suit: "basto", rank: 1 },
    { suit: "oro", rank: 4 },
  ],
];
const DEAL_2V2: DealInput = [
  [
    { suit: "espada", rank: 1 },
    { suit: "basto", rank: 4 },
    { suit: "espada", rank: 3 },
  ],
  [
    { suit: "basto", rank: 5 },
    { suit: "oro", rank: 1 },
    { suit: "basto", rank: 6 },
  ],
  [
    { suit: "oro", rank: 4 },
    { suit: "copa", rank: 4 },
    { suit: "basto", rank: 4 },
  ],
  [
    { suit: "copa", rank: 5 },
    { suit: "basto", rank: 3 },
    { suit: "copa", rank: 6 },
  ],
];

/** Chromium lays out in 1/64px, so two boxes that agree exactly can still land
 * one unit apart after independent rounding — the same tightest-honest
 * tolerance the sibling settled on, and three orders of magnitude below the
 * spreads measured here (up to 220px). */
const ONE_LAYOUT_UNIT = 1 / 64;

type SeatMode = "1v1" | "2v2";

/**
 * Every tier, by lane value rather than by round number. The four widths this
 * suite's sibling `table-zone-overlap` already uses cover all five distinct
 * `--hx-band-banner` values between them, because the token is scoped by seat
 * count as well as width: 375 gives 60 for both modes; 700 gives 76 (1v1) and
 * 112 (2v2); 960 gives 80 and 112; 1280 gives 84 and 84. Adding 640/900 would
 * add mounts and no lane value.
 */
const WIDTHS = [375, 700, 960, 1280] as const;
const SEAT_MODES = ["1v1", "2v2"] as const;

/** Read from the engine's own unions, not retyped: a level added to either
 * chain stops this file compiling until it is measured here too. The three
 * remaining `CALL_LABELS` entries (quiero, noQuiero, revealEnvido) are answers
 * and resolutions — `derivePendingCall` can never put one in this banner. */
const TRUCO_LEVELS: readonly TrucoCallLevel[] = ["truco", "retruco", "valeCuatro"];
const ENVIDO_LEVELS: readonly EnvidoCallLevel[] = ["envido", "envidoEnvido", "realEnvido", "faltaEnvido"];

/**
 * The banner's reachable text, as pairs rather than a cross product.
 *
 * `waitingOnMe` and `callerLabel` are LOCKED TOGETHER by the engine, and a
 * cross product would measure two states no player can ever reach (and, at
 * "Cantó: Nosotros" + "Tu turno de responder", a taller worst case than the
 * real game has): `table.ts` derives `callerLabel` from `callingTeamId ===
 * view.self.teamId` and `waitingOnMe` from `isMyTurnToAnswer(legalActions)`,
 * and neither `getLegalTrucoActions` nor `getLegalEnvidoActions` ever offers
 * the CALLING team a respond action. So it is my turn to answer exactly when
 * they called it.
 */
const TURNS = [
  { callerLabel: "Ellos", waitingOnMe: true },
  { callerLabel: "Nosotros", waitingOnMe: false },
] as const;

/** Each case carries its chain's own `kind`. Rendering-inert today —
 * `renderPendingCallBanner` never reads it — but a fixture that stamped every
 * envido level `"truco"` would hand a future kind-branching renderer a matrix
 * that silently measures the wrong branch. */
const PENDING_CASES = [
  ...TRUCO_LEVELS.map((level) => ({ kind: "truco" as const, level })),
  ...ENVIDO_LEVELS.map((level) => ({ kind: "envido" as const, level })),
].flatMap(({ kind, level }) =>
  TURNS.map((turn) => ({ kind, label: `${CALL_LABELS[level]} / ${turn.callerLabel}`, levelLabel: CALL_LABELS[level], ...turn })),
);

/** The widest label the CLOSED señas vocabulary can produce — the same
 * worst-case reasoning, and the same signal, `table-zone-overlap` uses. */
const WIDEST_SENA: SenaSignal = "asDeEspada";

const containers: HTMLElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
  document.getElementById(TABLE_STYLE_ID)?.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
});

/**
 * Mounts the REAL table at one tier and seat count and hands back its banner
 * slot's three occupants.
 *
 * The whole renderer rather than a hand-built shell, because the geometry this
 * lane's occupants wrap inside is not reconstructible by hand: the slot is
 * `position: absolute; left: 50%` inside `.hexdev-truco-center`, which is
 * `position: relative`, so its shrink-to-fit width is capped at HALF the
 * centre grid area — an area whose width depends on the seat-count gutters and,
 * from 900px up, the call-log rail column. Measured directly: the same pill at
 * the same 700px container is 171px wide at 1v1 and 110px at 2v2.
 *
 * `--gx-font-family` on the container is how a tenant's own theme reaches this
 * text in production (`table-styles.ts`: `.hexdev-truco-table-shell` sets
 * `font-family: var(--gx-font-family, system-ui, sans-serif)`, and the felt
 * inherits it), so setting the custom property asks the honest question — what
 * happens to a player whose theme names THIS font — rather than a bare
 * `font-family` override that would bypass the same `var()` a real theme goes
 * through.
 *
 * Card art is deliberately not awaited. Every card box on this felt is sized
 * from `--truco-card-width` in CSS, never from an image's intrinsic size, so a
 * decoded image moves nothing this file measures — and 448 mounts each waiting
 * on `img.decode()` would buy that nothing at real cost.
 */
function mountLane(width: number, mode: SeatMode, family: string): { pendingCall: HTMLElement; handOutcome: HTMLElement; senaNotice: HTMLElement } {
  const container = document.createElement("div");
  container.style.width = `${width}px`;
  container.style.setProperty("--gx-font-family", family);
  document.body.appendChild(container);
  containers.push(container);

  const state =
    mode === "1v1"
      ? startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }), DEAL_1V1)
      : startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);
  createMatchTableRenderer()(container, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});

  const pendingCall = container.querySelector<HTMLElement>(".hexdev-truco-pending-call");
  const handOutcome = container.querySelector<HTMLElement>(".hexdev-truco-hand-outcome");
  const senaNotice = container.querySelector<HTMLElement>(".hexdev-truco-sena-notice");
  if (pendingCall === null || handOutcome === null || senaNotice === null) {
    throw new Error("test setup: the banner slot did not mount all three of its occupants");
  }
  return { pendingCall, handOutcome, senaNotice };
}

/** The lane this tier reserves, read off the felt rather than restated here —
 * so a re-tuned token is measured, never assumed. Resolved from the measured
 * occupant's OWN felt, because up to four mounted containers coexist while a
 * per-face group is read (the splice comes after the group), and a
 * document-wide query would always answer with the first of them. */
function laneHeight(el: HTMLElement): number {
  const felt = el.closest<HTMLElement>(".hexdev-truco-table");
  if (felt === null) throw new Error("test setup: the measured occupant is not inside a felt");
  return parseFloat(getComputedStyle(felt).getPropertyValue("--hx-band-banner"));
}

interface Reading {
  readonly face: string;
  /** What the occupant really costs the lane. */
  readonly height: number;
  /**
   * What THIS font's own metrics ask for — the same box re-measured with every
   * explicit `line-height` inside it stripped back to `normal`. This is the
   * quantity that differs per font, and the reason a fixed pixel lane was
   * never safe; measuring it this way keeps it reporting the font's true
   * appetite AFTER the fix instead of the fix's own constant.
   */
  readonly natural: number;
  readonly lane: number;
}

function read(el: HTMLElement, face: string): Reading {
  const height = el.getBoundingClientRect().height;
  const nodes = [el, ...el.querySelectorAll<HTMLElement>("*")];
  const saved = nodes.map((node) => node.style.lineHeight);
  for (const node of nodes) node.style.lineHeight = "normal";
  const natural = el.getBoundingClientRect().height;
  nodes.forEach((node, index) => {
    node.style.lineHeight = saved[index]!;
  });
  return { face, height, natural, lane: laneHeight(el) };
}

function describeRow(rows: readonly Reading[]): string {
  return rows.map((row) => `${row.face} ${row.height}px (its font's own line boxes want ${row.natural}px)`).join(", ");
}

function expectOneHeightWhateverTheMetrics(what: string, rows: readonly Reading[]): void {
  const heights = rows.map((row) => row.height);
  const spread = Math.max(...heights) - Math.min(...heights);
  expect(spread, `${what}: ${spread}px taller on one font than another, inside a ${rows[0]!.lane}px lane that is the same number on every machine — ${describeRow(rows)}`).toBeLessThanOrEqual(
    ONE_LAYOUT_UNIT,
  );
}

/**
 * The machine-independent half, and the same construction the sibling argues
 * at length: every metric below comes from ONE embedded font FILE — the same
 * DejaVu Sans the visual suite already vendors for the same reason
 * (`visual/setup.ts`: pin a file, never an OS font NAME) — with its vertical
 * metrics overridden per face. `ascent-override` and friends are exactly the
 * inputs `line-height: normal` is computed from, so a face built this way is
 * not a stand-in for a differently-proportioned font: it IS one, minus the
 * need for the machine to have it installed.
 *
 * One thing that construction buys here and did not have to buy there: four
 * faces off ONE file share every glyph advance width, so they wrap
 * identically. Any height difference between them is therefore vertical
 * metrics and nothing else — the exact axis under test, isolated by
 * construction rather than by asking the reader to trust it.
 */
const SYNTHETIC_FACES = [
  // Well under any lane: proves the property is "the same height", not
  // "always as tall as the font asks".
  { name: "HexDev Banner Probe Squat", ascentOverride: "50%", descentOverride: "10%", lineGapOverride: "0%" },
  // A hair over — the exact shape of the real bug, which cleared the 76px lane
  // by 2px and was invisible on the machine that shipped it.
  { name: "HexDev Banner Probe Snug", ascentOverride: "100%", descentOverride: "20%", lineGapOverride: "0%" },
  // Far over, twice, so a fix that merely re-tuned the lane upward until this
  // desktop's font fitted would still be caught here.
  { name: "HexDev Banner Probe Tall", ascentOverride: "200%", descentOverride: "100%", lineGapOverride: "0%" },
  { name: "HexDev Banner Probe Towering", ascentOverride: "400%", descentOverride: "200%", lineGapOverride: "50%" },
] as const;

const EMBEDDED_FONT_URL = new URL("../../../../visual/fonts/DejaVuSans.woff2", import.meta.url).href;

describe("the banner lane costs the same height whatever font draws it", () => {
  const loaded: FontFace[] = [];

  beforeAll(async () => {
    for (const face of SYNTHETIC_FACES) {
      // Un-caught deliberately, same discipline as `visual/setup.ts`: a probe
      // font that failed to load would quietly become whatever the machine
      // offers instead, and a fence measuring an unknown font proves nothing.
      const fontFace = new FontFace(face.name, `url(${EMBEDDED_FONT_URL})`, {
        ascentOverride: face.ascentOverride,
        descentOverride: face.descentOverride,
        lineGapOverride: face.lineGapOverride,
      });
      document.fonts.add(fontFace);
      loaded.push(fontFace);
      await fontFace.load();
    }
    await document.fonts.ready;
  });

  afterAll(() => {
    for (const fontFace of loaded) document.fonts.delete(fontFace);
  });

  it("the pending-call banner: one height per tier, seat count and call — over vertical metrics from far under the lane to far over it", () => {
    const groups: { readonly what: string; readonly rows: readonly Reading[] }[] = [];
    for (const width of WIDTHS) {
      for (const mode of SEAT_MODES) {
        for (const call of PENDING_CASES) {
          const rows = SYNTHETIC_FACES.map((face) => {
            const { pendingCall } = mountLane(width, mode, `'${face.name}'`);
            renderPendingCallBanner(pendingCall, {
              call: { kind: call.kind, levelLabel: call.levelLabel, callingTeamId: "banner-lane-caller:team" as TeamId },
              callerLabel: call.callerLabel,
              waitingOnMe: call.waitingOnMe,
            });
            return read(pendingCall, face.name);
          });
          for (const container of containers.splice(0)) container.remove();
          groups.push({ what: `${width}px ${mode} "${call.label}"`, rows });
        }
      }
    }

    // Without this the whole test could pass while proving nothing: four faces
    // that all happened to fit under the lane would agree perfectly and say
    // nothing about the case that broke. At least one measured banner has to
    // genuinely overflow the reservation on its own metrics, or there was no
    // fence here at all.
    const overflowing = groups.flatMap((group) => group.rows).filter((row) => row.natural > row.lane + ONE_LAYOUT_UNIT);
    expect(overflowing.length, `no probe font overflows its own lane, so this test cannot detect the bug it exists for — ${describeRow(groups[0]!.rows)}`).toBeGreaterThan(0);

    for (const group of groups) expectOneHeightWhateverTheMetrics(group.what, group.rows);
  });

  it("the lane's other two occupants (seña notice, hand outcome) hold the same property — the same reservation, the same mechanism", () => {
    const groups: { readonly what: string; readonly rows: readonly Reading[] }[] = [];
    for (const width of WIDTHS) {
      for (const mode of SEAT_MODES) {
        // The seña notice is the one occupant an EXISTING fence already
        // measures against this lane (`table-zone-overlap`: "seña notice
        // height N vs its own lane"), and on this desktop's font it passes
        // with room to spare — which is precisely the sibling's situation and
        // why it is measured here rather than trusted.
        const senaRows = SYNTHETIC_FACES.map((face) => {
          const { senaNotice } = mountLane(width, mode, `'${face.name}'`);
          renderSenaNotice(senaNotice, { signal: WIDEST_SENA });
          return read(senaNotice, face.name);
        });
        for (const container of containers.splice(0)) container.remove();
        groups.push({ what: `${width}px ${mode} seña notice "${SENA_LABELS[WIDEST_SENA]}"`, rows: senaRows });

        // The hand-outcome chip has no fence at all today. Both results and
        // both plural forms of the points line ("+1 tanto" / "+4 tantos"),
        // since the two differ in width and can therefore wrap differently.
        for (const outcome of [
          { wonBySelf: true, pointsDelta: 4 },
          { wonBySelf: false, pointsDelta: 1 },
        ]) {
          const rows = SYNTHETIC_FACES.map((face) => {
            const { handOutcome } = mountLane(width, mode, `'${face.name}'`);
            renderHandOutcomeBanner(handOutcome, {
              event: { winnerTeamId: "banner-lane-winner:team" as TeamId, pointsDelta: outcome.pointsDelta },
              wonBySelf: outcome.wonBySelf,
            });
            return read(handOutcome, face.name);
          });
          for (const container of containers.splice(0)) container.remove();
          groups.push({ what: `${width}px ${mode} hand outcome (won=${outcome.wonBySelf}, +${outcome.pointsDelta})`, rows });
        }
      }
    }

    const overflowing = groups.flatMap((group) => group.rows).filter((row) => row.natural > row.lane + ONE_LAYOUT_UNIT);
    expect(overflowing.length, `no probe font overflows its own lane, so this test cannot detect the bug it exists for — ${describeRow(groups[0]!.rows)}`).toBeGreaterThan(0);

    for (const group of groups) expectOneHeightWhateverTheMetrics(group.what, group.rows);
  });

  /**
   * The honest boundary of the fix above, asserted rather than described.
   *
   * A pinned leading fixes the height of each line box and nothing about how
   * many there are, so this states in one place exactly what the two tests
   * above do and do not cover: within one glyph-width family the banner's
   * total is one number, and the ONLY way it can still move is a font that
   * wraps the text differently. A future reader who breaks this test has
   * either fixed the wrap axis too (delete it) or reintroduced a per-font
   * height inside one wrap shape (the two tests above will be red as well).
   */
  it("what stays font-dependent, on purpose: only the LINE COUNT, never the line box", () => {
    const perFace = SYNTHETIC_FACES.map((face) => {
      const { pendingCall } = mountLane(700, "2v2", `'${face.name}'`);
      renderPendingCallBanner(pendingCall, {
        call: { kind: "truco", levelLabel: CALL_LABELS.valeCuatro, callingTeamId: "banner-lane-caller:team" as TeamId },
        callerLabel: "Nosotros",
        waitingOnMe: false,
      });
      const lines = [...pendingCall.children].map((child) => {
        const range = document.createRange();
        range.selectNodeContents(child);
        return range.getClientRects().length;
      });
      return { face: face.name, lines: lines.join("/"), height: pendingCall.getBoundingClientRect().height };
    });
    for (const container of containers.splice(0)) container.remove();

    // One wrap shape across all four faces, because they share one font file's
    // advance widths — the isolation this matrix depends on.
    expect(new Set(perFace.map((row) => row.lines)).size, `probe faces wrapped differently, so the matrix above is not isolating vertical metrics: ${JSON.stringify(perFace)}`).toBe(1);
    // And therefore one height. Same claim as the first test, stated once
    // against a case chosen for being the tallest reachable 2v2 pill.
    expect(new Set(perFace.map((row) => row.height)).size, `one wrap shape must mean one height: ${JSON.stringify(perFace)}`).toBe(1);
  });
});
