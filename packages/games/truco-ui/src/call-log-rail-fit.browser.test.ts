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

/** The height the panel may never exceed. It used to be the panel's own
 * `max-height` — two cards tall, a number that measured how much of the PLAY
 * the panel was allowed to cover. The panel does not sit on the play any
 * more: it shares a rail with the tantos, and the rail is what bounds it. */
function boundOf(rail: HTMLElement): number {
  return rail.getBoundingClientRect().height;
}

describe("at 1280px the panel is a rail: it sizes to its content, and the cap owns only the long case", () => {
  it("one entry gets a panel the size of one entry, not the size of the rail", async () => {
    const { panel, rail, entries } = await panelAt(1280, "one");
    expect(entries, "fence setup: exactly one call is on the record").toBe(1);

    const height = panel.getBoundingClientRect().height;
    const bound = boundOf(rail);
    expect(bound, "fence setup: the rail is a real number of pixels tall").toBeGreaterThan(0);

    // The bug, stated as the measurement that would catch it again: a
    // stretched panel fills its whole column no matter how little it holds.
    // It is worth restating for the rail, because the rail is a flex column
    // and a flex item's default is to stretch across it — the same trap the
    // grid version fell into, with a different property name on it.
    expect(height, `a single entry must not fill the ${String(Math.round(bound))}px rail`).toBeLessThan(bound * 0.6);
    // And "sizes to content" is stronger than "is small": no slack inside.
    expect(Math.abs(height - panel.scrollHeight), "the panel is exactly as tall as what it holds").toBeLessThanOrEqual(1);
  });

  it("more entries make it taller, and it still never passes the cap", async () => {
    const one = (await panelAt(1280, "one")).panel.getBoundingClientRect().height;
    container.remove();
    document.getElementById("hexdev-truco-table-styles")?.remove();

    const { panel, rail, entries } = await panelAt(1280, "many");
    expect(entries, "fence setup: the longer chain really does record more").toBeGreaterThan(1);

    const many = panel.getBoundingClientRect().height;
    expect(many, "a longer record needs a taller panel").toBeGreaterThan(one);
    // The tantos live under this panel now, so overflowing the rail does not
    // merely look wrong — it pushes the score out of the rail entirely.
    expect(many, "but never taller than the rail that also has to hold the tantos").toBeLessThanOrEqual(boundOf(rail) + 1);
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
