import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createHeadToHeadMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Action, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * The reveal has TWO channels, and they are not the same channel twice.
 *
 * HISTORY, because this file's shape only makes sense with it. The reveal
 * originally announced itself by quietly adding a row to a side panel, which
 * is not how anyone notices the payoff of an envido — so it got a banner in
 * the middle of the felt listing every declaration. That banner was then
 * reported from real 2v2 play as the thing to remove: "esa card yo la
 * sacaría, teniendo el log y los cantos bien marcados sobre cada jugador en
 * mini cards ya es suficiente". By then the record panel had been rebuilt and
 * every call was being marked on the seat that made it, so the middle of the
 * table no longer had to carry it.
 *
 * WHAT SURVIVES, and why it is not simply "less".
 *
 *   - THE RECORD: the declarations hang off the reveal's own log entry, in
 *     their place in time. That is a sighted player's channel now.
 *   - THE ANNOUNCEMENT: a screen-reader user has no side panel to glance at,
 *     so the live region is not a duplicate of the record for them — it is
 *     the reveal's only real-time channel. Removing it because a sighted
 *     player found the visual redundant would trade one audience's clutter
 *     for another audience's silence.
 *
 * So this file fences the announcement and the record, and it fences the
 * ABSENCE of the banner — because "we took it out" is a decision that a
 * later change could quietly undo, and nothing else here would notice.
 */

const SELF = "reveal-self" as PlayerId;
const OPPONENT = "reveal-opponent" as PlayerId;

/** SELF holds 7+1 of espada — 28, the maximum. The opponent's hand has no
 * two cards of a suit, so they are "son buenas": one fixture exercises both
 * declaration shapes at once, which is the pairing that matters here. */
const DEAL: DealInput = [
  [
    { suit: "espada", rank: 1 },
    { suit: "espada", rank: 7 },
    { suit: "basto", rank: 4 },
  ],
  [
    { suit: "oro", rank: 4 },
    { suit: "copa", rank: 5 },
    { suit: "basto", rank: 6 },
  ],
];

const NOTICE_MS = 40;

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

function mounted(width = 960): HTMLElement {
  container = document.createElement("div");
  container.style.width = `${String(width)}px`;
  document.body.appendChild(container);
  return container;
}

function apply(state: MatchState, action: Action): MatchState {
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
  // The MANO says her number and the loser concedes — the ordinary shape of a
  // heads-up round, and the one this file needs: it exists to check that BOTH
  // kinds of declaration are spoken aloud, numbers and withholdings alike.
  // A concession ends the round (in pairs it ends it for the whole team), so
  // there is nothing to declare after it.
  const manoSeat = state.hand!.manoSeat;
  const mano = state.players.find((player) => player.seat === manoSeat)!;
  const other = state.players.find((player) => player.seat !== manoSeat)!;
  const said = apply(state, { type: "declare-envido", playerId: mano.id, declaration: "points" });
  return apply(said, { type: "declare-envido", playerId: other.id, declaration: "sonBuenas" });
}


function dealt(): MatchState {
  return startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }), DEAL);
}

/** The real chain, not a hand-made state, so a change to the engine's own
 * reveal path fails this file. */
function revealed(from: MatchState): MatchState {
  let state = apply(from, { type: "call-envido", playerId: SELF, level: "envido" });
  state = apply(state, { type: "respond-envido", playerId: OPPONENT, response: "quiero" });
  return declareAll(state);
}

type Render = ReturnType<typeof createMatchTableRenderer>;

function renderer(): Render {
  return createMatchTableRenderer({ envidoRevealNoticeMs: NOTICE_MS });
}

function paint(render: Render, el: HTMLElement, state: MatchState): void {
  render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
}

const announcer = (el: HTMLElement): HTMLElement | null => el.querySelector<HTMLElement>('[data-announces="envido-reveal"]');
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("the reveal is spoken once, for the audience that cannot read the panel", () => {
  it("says every declaration out loud, numbers and withholdings alike", () => {
    const el = mounted();
    const render = renderer();
    const state = dealt();
    paint(render, el, state);
    expect(announcer(el)?.textContent ?? "", "nothing is said before the envido is shown").toBe("");

    paint(render, el, revealed(state));

    const spoken = announcer(el)?.textContent ?? "";
    expect(spoken).toContain("28");
    expect(spoken, "a withheld declaration says so, and carries no number").toContain("Son buenas");
  });

  it("goes quiet again — a live region that never clears re-reads itself", async () => {
    const el = mounted();
    const render = renderer();
    const state = dealt();
    paint(render, el, state);
    const shown = revealed(state);
    paint(render, el, shown);

    await sleep(NOTICE_MS + 30);
    paint(render, el, shown);

    expect(announcer(el)?.textContent ?? "").toBe("");
  });

  it("fires on the MOMENT, never on the state", async () => {
    const el = mounted();
    const render = renderer();
    const state = dealt();
    paint(render, el, state);
    const shown = revealed(state);
    paint(render, el, shown);

    await sleep(NOTICE_MS + 30);
    paint(render, el, shown);
    paint(render, el, shown);

    expect(announcer(el)?.textContent ?? "", "the reveal already happened; re-announcing it is noise").toBe("");
  });

  it("does not announce a reveal that happened before this renderer existed", () => {
    // A reconnect mounts a fresh renderer into a hand already in progress.
    // Saying "the envido was just shown" would be a lie about when.
    const el = mounted();
    const render = renderer();
    paint(render, el, revealed(dealt()));

    expect(announcer(el)?.textContent ?? "", "no previous snapshot means no transition to report").toBe("");
  });
});

describe("the record keeps what was said, in its place in time", () => {
  it("the declarations hang off the reveal's own log entry", () => {
    const el = mounted();
    const render = renderer();
    const state = dealt();
    paint(render, el, state);
    paint(render, el, revealed(state));

    // One entry per declaration now, in the order they were said — the log is
    // a chronology and the round happened at a moment in it.
    const entries = [...el.querySelectorAll(".hexdev-truco-call-log-entry")].map((entry) => entry.textContent ?? "");
    expect(entries.join(" | "), "the log keeps what was said, where it happened").toContain("28");
    expect(entries.join(" | ")).toContain("Son buenas");
  });

  it("and survives the announcement clearing — the record is not transient", async () => {
    const el = mounted();
    const render = renderer();
    const state = dealt();
    paint(render, el, state);
    const shown = revealed(state);
    paint(render, el, shown);

    await sleep(NOTICE_MS + 30);
    paint(render, el, shown);

    const kept = [...el.querySelectorAll(".hexdev-truco-call-log-entry")].map((entry) => entry.textContent ?? "").join(" | ");
    expect(kept, "the record outlives the announcement that reported it").toContain("28");
  });
});

describe("the banner stays gone", () => {
  it.each([375, 700, 960, 1280] as const)("%ipx: the reveal paints nothing over the felt", (width) => {
    // The removal is a DECISION, not an accident of the current wiring, and
    // a decision nothing else on this table would notice being undone. If a
    // future change reintroduces a reveal banner, it should have to come past
    // this test and the docblock above it.
    const el = mounted(width);
    const render = renderer();
    const state = dealt();
    paint(render, el, state);
    paint(render, el, revealed(state));

    expect(el.querySelector(".hexdev-truco-envido-reveal-notice"), "the reveal has no banner of its own any more").toBeNull();
  });
});
