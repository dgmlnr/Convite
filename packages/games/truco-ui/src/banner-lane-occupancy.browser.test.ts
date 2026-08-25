import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Action, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * The banner lane holds ONE thing at a time.
 *
 * WHAT WAS REPORTED, with a screenshot of a 2v2 against bots: an unanswered
 * ENVIDO banner and a "Seña del compañero" notice sitting side by side, at
 * the exact moment the player had a call to answer. The lane has four tenants
 * — the pending call, the hand outcome, a partner's seña and the envido
 * reveal — and each used to paint itself independently, so any two that were
 * live at once simply shared the row. The report's own words for the whole
 * pattern: "fragmentar los cantos mostrados en tiempo real para que no se
 * apilen".
 *
 * THE RULE. A moment outranks a standing state, because a moment is the only
 * one of the two that can be MISSED. Among moments the order is what a player
 * loses by not reading it — outcome (a result), seña (a hint).
 *
 * THE LANE HAS SHRUNK TWICE SINCE, and both tenants left for the same reason:
 * something better placed was already saying it. The envido reveal keeps only
 * its announcement, and the pending call is now marked on the SEAT that made
 * it — which is the one thing the banner could never say, since the engine's
 * call state carries a team and not a seat. What is left here is the two
 * transient notices, and the machinery that keeps them from stacking.
 *
 * The envido reveal used to lead that order with a banner of its own. It was
 * removed on report, once the record panel and the per-seat chips covered it;
 * it keeps only its live-region announcement, which occupies no lane at all.
 * The third test below is what holds that: a reveal must not evict whatever
 * is in the lane, because it no longer asks for it.
 *
 * THE PART THAT IS EASY TO GET WRONG, and the reason the second test here
 * exists. What expires is a TIMER, not a view: when a notice's seconds are
 * up, nothing about the match has changed and no new view is coming. A lane
 * that only cleared the expiring notice would leave the pending call — still
 * pending — gone with it, until the server happened to say something else.
 */

const SELF = "lane-self" as PlayerId;
const OPPONENT = "lane-opponent" as PlayerId;
const TEAMMATE = "lane-teammate" as PlayerId;
const OPPONENT_2 = "lane-opponent-2" as PlayerId;

const DEAL: DealInput = [
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

const NOTICE_MS = 40;

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


type Render = ReturnType<typeof createMatchTableRenderer>;

function paint(render: Render, el: HTMLElement, state: MatchState): void {
  render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Every tenant of the lane, by the class that shows it has content. */
const TENANTS = [
  { name: "hand outcome", selector: ".hexdev-truco-hand-outcome" },
  { name: "seña", selector: ".hexdev-truco-sena-notice" },
] as const;

function occupants(el: HTMLElement): string[] {
  return TENANTS.filter(({ selector }) => {
    const node = el.querySelector(selector);
    return node !== null && (node.textContent ?? "").trim() !== "";
  }).map(({ name }) => name);
}

function setup(): { el: HTMLElement; render: Render; dealt: MatchState } {
  container = document.createElement("div");
  container.style.width = "1280px";
  document.body.appendChild(container);
  return {
    el: container,
    render: createMatchTableRenderer({ senaNoticeMs: NOTICE_MS, envidoRevealNoticeMs: NOTICE_MS, handOutcomeBannerMs: NOTICE_MS, seatCallNoticeMs: NOTICE_MS }),
    // dealerSeat 0 makes OPPONENT (seat 1) the mano, and every case below
    // opens the envido with them: taking the floor starts with the mano
    // (truco-engine's `canOpenEnvido`). The seat that opens is incidental to
    // what this file measures — it is about the LANE — so the fixture names
    // a dealer rather than each test naming a different caller.
    dealt: startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 0 }), DEAL),
  };
}

describe("two things never share the lane", () => {
  it("an open call does not compete for the lane — it is marked on the seat that made it", () => {
    const { el, render, dealt } = setup();
    paint(render, el, dealt);

    const called = dispatch(dealt, { type: "call-envido", playerId: OPPONENT, level: "envido" });
    paint(render, el, called);
    expect(occupants(el), "the lane stays empty for a call; the banner that used to fill it is gone").toEqual([]);
    expect(
      el.querySelector<HTMLElement>(".hexdev-truco-seat-call-chip")?.closest<HTMLElement>(".hexdev-truco-anchor")?.dataset.position,
      "and the call is on the seat that made it, which is what the banner never could say",
    ).toBe("right");

    const signalled = dispatch(called, { type: "send-sena", playerId: TEAMMATE, signal: "asDeBasto" });
    paint(render, el, signalled);
    expect(occupants(el), "the seña takes the lane, and takes it alone").toEqual(["seña"]);
  });

  it("the seat mark survives the notice over it clearing — no view required", async () => {
    const { el, render, dealt } = setup();
    paint(render, el, dealt);
    const called = dispatch(dealt, { type: "call-envido", playerId: OPPONENT, level: "envido" });
    paint(render, el, called);
    paint(render, el, dispatch(called, { type: "send-sena", playerId: TEAMMATE, signal: "asDeBasto" }));

    // No further paint: a timer expiring is not a new view, and the call is
    // still unanswered. The lane and the seat mark are repainted by two
    // different closures, and a timer that only cleared its own element would
    // take the standing call down with the passing notice.
    await sleep(NOTICE_MS + 40);

    expect(occupants(el), "the lane empties, because the notice was all it held").toEqual([]);
    expect(el.querySelector(".hexdev-truco-seat-call-chip"), "but the call is still open, so it is still marked").not.toBeNull();
  });

  it("a reveal does not evict the lane — it does not ask for it any more", () => {
    const { el, render, dealt } = setup();
    paint(render, el, dealt);

    // OPPONENT opens and SELF answers, matching the fixture's own dealer:
    // the mano takes the floor, and the other side is who may reply.
    let state = dispatch(dealt, { type: "call-envido", playerId: OPPONENT, level: "envido" });
    state = dispatch(state, { type: "respond-envido", playerId: SELF, response: "quiero" });
    paint(render, el, state);

    const signalled = dispatch(state, { type: "send-sena", playerId: TEAMMATE, signal: "asDeBasto" });
    paint(render, el, signalled);
    expect(occupants(el), "fence setup: the seña holds the lane going in").toEqual(["seña"]);

    paint(render, el, declareAll(signalled));
    expect(occupants(el), "the seña keeps the lane; the reveal speaks and writes, it does not paint").toEqual(["seña"]);
  });
});

describe("across a whole exchange, never more than one", () => {
  it("stays single-occupant through call, seña, accept and reveal", () => {
    const { el, render, dealt } = setup();
    let state = dealt;
    paint(render, el, state);

    const steps: readonly Action[] = [
      { type: "call-envido", playerId: OPPONENT, level: "envido" },
      { type: "send-sena", playerId: TEAMMATE, signal: "asDeBasto" },
      { type: "respond-envido", playerId: SELF, response: "quiero" },
      // The declaration round, seat by seat from the mano. This fixture's
      // dealer puts the mano on seat 1 (OPPONENT), so the order around the
      // table is OPPONENT, TEAMMATE, OPPONENT_2, SELF. Walking it as steps
      // rather than through `declareAll` is the point here: the lane is
      // checked after EVERY one of them.
      { type: "declare-envido", playerId: OPPONENT, declaration: "points" },
      { type: "declare-envido", playerId: TEAMMATE, declaration: "points" },
      { type: "declare-envido", playerId: OPPONENT_2, declaration: "points" },
      { type: "declare-envido", playerId: SELF, declaration: "points" },
    ];

    for (const step of steps) {
      state = dispatch(state, step);
      paint(render, el, state);
      const live = occupants(el);
      expect(live.length, `after ${step.type} the lane holds: ${live.join(" + ")}`).toBeLessThanOrEqual(1);
    }
  });
});
