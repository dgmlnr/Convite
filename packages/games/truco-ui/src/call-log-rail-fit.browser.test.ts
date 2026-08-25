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

async function panelAt(width: number, count: "one" | "many"): Promise<{ panel: HTMLElement; felt: HTMLElement; entries: number }> {
  container = document.createElement("div");
  container.style.width = `${String(width)}px`;
  document.body.appendChild(container);

  const state = withCalls(count);
  createMatchTableRenderer()(container, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
  await Promise.all([...container.querySelectorAll("img")].map((img) => img.decode()));

  const panel = container.querySelector<HTMLElement>(".hexdev-truco-call-log");
  const felt = container.querySelector<HTMLElement>(".hexdev-truco-table");
  if (panel === null || felt === null) throw new Error("fence setup: the table renders a felt and a call-log panel");
  return { panel, felt, entries: container.querySelectorAll(".hexdev-truco-call-log-entry").length };
}

/** The cap the panel may never exceed, read from the panel rather than
 * recomputed here — the two-card formula is the stylesheet's to own. */
function capOf(panel: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(panel).maxHeight);
}

describe("at 1280px the panel is a rail: it sizes to its content, and the cap owns only the long case", () => {
  it("one entry gets a panel the size of one entry, not the size of the cap", async () => {
    const { panel, entries } = await panelAt(1280, "one");
    expect(entries, "fence setup: exactly one call is on the record").toBe(1);

    const height = panel.getBoundingClientRect().height;
    const cap = capOf(panel);
    expect(cap, "fence setup: the cap is a real number of pixels").toBeGreaterThan(0);

    // The bug, stated as the measurement that would catch it again: a
    // stretched panel sits AT the cap no matter how little it holds.
    expect(height, `a single entry must not fill the ${String(Math.round(cap))}px cap`).toBeLessThan(cap * 0.6);
    // And "sizes to content" is stronger than "is small": no slack inside.
    expect(Math.abs(height - panel.scrollHeight), "the panel is exactly as tall as what it holds").toBeLessThanOrEqual(1);
  });

  it("more entries make it taller, and it still never passes the cap", async () => {
    const one = (await panelAt(1280, "one")).panel.getBoundingClientRect().height;
    container.remove();
    document.getElementById("hexdev-truco-table-styles")?.remove();

    const { panel, entries } = await panelAt(1280, "many");
    expect(entries, "fence setup: the longer chain really does record more").toBeGreaterThan(1);

    const many = panel.getBoundingClientRect().height;
    expect(many, "a longer record needs a taller panel").toBeGreaterThan(one);
    expect(many, "but never taller than the cap the stylesheet sets").toBeLessThanOrEqual(capOf(panel) + 1);
  });

  it("the panel fills the rail it was given, instead of 58% of it", async () => {
    const { panel, felt } = await panelAt(1280, "many");

    // The rail is the felt grid's own first track — asked for, not assumed,
    // so this keeps holding if the rail's own clamp() is ever retuned.
    const rail = Number.parseFloat(getComputedStyle(felt).gridTemplateColumns.split(" ")[0] ?? "0");
    expect(rail, "fence setup: at this tier the felt really does open a log column").toBeGreaterThan(100);
    expect(panel.getBoundingClientRect().width, `the panel spans its ${String(Math.round(rail))}px rail`).toBeGreaterThan(rail * 0.95);
  });
});

describe("below the rail tier nothing moved: the log still floats over the felt", () => {
  it("700px: the panel is still out of flow, where both inherited caps still earn their keep", async () => {
    const { panel } = await panelAt(700, "many");
    expect(getComputedStyle(panel).position, "the floating log is untouched by a rail-only fix").toBe("absolute");
  });
});
