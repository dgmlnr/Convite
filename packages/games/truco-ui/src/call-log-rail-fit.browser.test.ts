import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createHeadToHeadMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Action, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * The call-log panel is a RAIL from 900px up, and a rail sizes to what it
 * holds.
 *
 * WHAT WAS REPORTED, from real play: the panel read as "un desorden" — a
 * black box parked in the top-left corner with a single line of text in it
 * and a couple of hundred pixels of nothing underneath.
 *
 * WHAT IT ACTUALLY WAS, measured at a 1550px shell rather than reasoned from
 * the CSS: the panel came out 141x333 holding ONE entry, and 141x333 holding
 * five. Always exactly 333. Two caps in the base rule did that, and both were
 * written for a log that FLOATED over the felt, where covering as little of
 * the table as possible was the entire point:
 *
 *   - it is a grid item, so it defaulted to align-self: stretch and filled
 *     the whole 837px row; `max-height` (two card heights) then cut it off at
 *     333 — a floor and a ceiling at once, for any amount of content.
 *   - `max-width: 58%` was 58% of the CENTRE back when the log overlaid it.
 *     Against its own 242.8px rail it left 101px of that rail empty and
 *     squeezed the entries into 125px, narrow enough that they had started
 *     wrapping.
 *
 * WHY NO EXISTING FENCE SAW IT. `call-log.browser.test.ts` renders the log
 * into a bare host, where there is no grid column to stretch into, so the
 * defect is invisible to it by construction — the panel only misbehaves once
 * it is a real child of the felt's own grid. Everything else that mounts the
 * whole table measures the FELT's height, which never moved: the panel was
 * always inside the cap.
 *
 * So this fence mounts the real table and measures the panel itself.
 */

const SELF = "rail-self" as PlayerId;
const OPPONENT = "rail-opponent" as PlayerId;

const DEAL: DealInput = [
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

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

function dispatch(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`fence setup: engine rejected ${action.type} — ${result.violation}`);
  return result.state;
}
/**
 * The whole declaration round, everybody saying their number.
 *
 * A reveal used to be ONE action that settled the envido for every seat. It
 * is a round now — one `declare-envido` per player, from the mano around the
 * table. Declaring for everybody reproduces the old outcome exactly (the
 * highest number wins either way), which is what keeps these fixtures
 * measuring what they always measured. Conceding is left out on purpose:
 * "son buenas" ends the round for the conceding TEAM, which is a different
 * scenario and belongs to the engine's own tests.
 */
function declareAll(state: MatchState): MatchState {
  let next = state;
  for (let i = 0; i < next.players.length; i += 1) {
    const seat = (next.hand!.manoSeat + i) % next.players.length;
    const who = next.players.find((player) => player.seat === seat)!;
    next = dispatch(next, { type: "declare-envido", playerId: who.id, declaration: "points" });
  }
  return next;
}


/** One entry, then the same chain `table-height-stability` drives for its own
 * 1v1 case — a real engine path, so a change to what the log records shows up
 * here rather than being papered over by a hand-written event array. */
function withCalls(count: "one" | "many"): MatchState {
  let state = startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }), DEAL);
  state = dispatch(state, { type: "call-envido", playerId: SELF, level: "envido" });
  if (count === "one") return state;
  state = dispatch(state, { type: "respond-envido", playerId: OPPONENT, response: "quiero" });
  state = declareAll(state);
  state = dispatch(state, { type: "call-truco", playerId: SELF, level: "truco" });
  return dispatch(state, { type: "respond-truco", playerId: OPPONENT, response: "quiero" });
}

async function panelAt(width: number, count: "one" | "many"): Promise<{ panel: HTMLElement; felt: HTMLElement; rail: HTMLElement; entries: number }> {
  container = document.createElement("div");
  container.style.width = `${String(width)}px`;
  document.body.appendChild(container);

  const state = withCalls(count);
  createMatchTableRenderer()(container, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
  await Promise.all([...container.querySelectorAll("img")].map((img) => img.decode()));

  const panel = container.querySelector<HTMLElement>(".hexdev-truco-call-log");
  const felt = container.querySelector<HTMLElement>(".hexdev-truco-table");
  const rail = container.querySelector<HTMLElement>(".hexdev-truco-side-rail");
  if (panel === null || felt === null || rail === null) throw new Error("fence setup: the table renders a felt, a side rail and a call-log panel");
  return { panel, felt, rail, entries: container.querySelectorAll(".hexdev-truco-call-log-entry").length };
}


describe("at 1280px the panel is a fixed box: the same size whatever it holds", () => {
  // THE REPLACED CONTRACT, and why. This block used to assert the opposite --
  // that the panel sized itself to its content, so one entry got a
  // one-entry-tall box. That was right while the panel held only the hand
  // being played and hid itself between hands: a full-height box with one
  // line in it looked like a floating slab.
  //
  // The panel is the record of the whole match now, and it never hides. Both
  // of those make a box that resizes itself the problem rather than the fix:
  // it grew every time somebody called, which moved the tantos underneath it,
  // and it vanished between hands, which moved the whole rail. Asked for
  // directly, looking at it: "puede mantener el alto siempre que podamos".
  //
  // It also stopped being only a matter of taste. In a flex ROW the line's
  // cross size is the tallest item's own content height, so a rail that grew
  // with its content made the whole TABLE taller -- measured at 65px of
  // difference between two probe fonts at 700px, against a table whose height
  // is locked per tier on purpose.
  it("one entry gets the same box as a long chain", async () => {
    const one = (await panelAt(1280, "one")).panel.getBoundingClientRect().height;
    container.remove();
    document.getElementById("hexdev-truco-table-styles")?.remove();

    const { panel, entries } = await panelAt(1280, "many");
    expect(entries, "fence setup: the longer chain really does record more").toBeGreaterThan(1);

    expect(panel.getBoundingClientRect().height, `a one-entry panel was ${one}px and a full one is a different size`).toBeCloseTo(one, 0);
  });

  it("a long chain scrolls inside that box instead of growing it", async () => {
    // Which is what makes the fixed height honest rather than a way of
    // hiding half the record.
    const { panel } = await panelAt(1280, "many");
    const list = panel.querySelector<HTMLElement>(".hexdev-truco-call-log-list");
    if (list === null) throw new Error("fence setup: the panel rendered no list");

    expect(getComputedStyle(list).overflowY, "the list cannot be read back past its own bottom edge").toMatch(/auto|scroll/);
  });

  it("the panel fills the rail it was given, instead of 58% of it", async () => {
    const { panel, rail } = await panelAt(1280, "many");

    // Measured off the rail element itself rather than off a grid track: the
    // rail is the felt's SIBLING now, not a column inside it, so the felt's
    // grid has nothing left to say about how wide the log is.
    const width = rail.getBoundingClientRect().width;
    expect(width, "fence setup: the rail really is a column at this tier").toBeGreaterThan(100);
    expect(panel.getBoundingClientRect().width, `the panel spans its ${String(Math.round(width))}px rail`).toBeGreaterThan(width * 0.95);
  });
});

describe("the log stopped floating over the felt at every tier, not just the widest", () => {
  it("700px: the panel is in flow in the rail, and covers no part of the felt", async () => {
    // This fence used to assert the opposite — that below 900px the log was
    // still `position: absolute`, floating over the centre of the cloth. That
    // was true, and it was the thing worth removing: on the narrower tiers
    // the felt is smallest, so a panel laid over its centre covered the most.
    // The log lives in the rail at every tier now, which is what lets this
    // assertion be about the cards instead of about a CSS property.
    const { panel, felt } = await panelAt(700, "many");
    expect(getComputedStyle(panel).position, "the log is placed by the rail, not laid over the cloth").toBe("static");

    const log = panel.getBoundingClientRect();
    const cloth = felt.getBoundingClientRect();
    expect(log.width, "fence setup: an empty log is display: none, which would make this vacuous").toBeGreaterThan(0);
    // Same 0.5px epsilon the zone-overlap suite uses.
    expect(log.left, `log left ${log.left}px vs the felt's own right edge ${cloth.right}px`).toBeGreaterThanOrEqual(cloth.right - 0.5);
  });
});
