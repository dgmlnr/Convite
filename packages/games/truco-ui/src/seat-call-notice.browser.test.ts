import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createHeadToHeadMatch, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Action, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * A call is marked on the seat that made it.
 *
 * WHAT WAS REPORTED, from real 2v2 play against bots: "los cantos de los bots
 * son descontrolados". Three seats can speak and the centre banner names a
 * TEAM ("Cantó: Ellos"), so nothing on the table ever said WHICH of them had
 * called — and consecutive calls replaced each other in that one banner
 * faster than anyone could read them.
 *
 * The side panel already keeps the full record with speakers attached. What
 * was missing was the moment: a mark on the seat that just spoke, held long
 * enough to read. Two seconds, and that number is the report's own.
 *
 * WHAT THIS FILE PINS THAT NOTHING ELSE DOES. That the chip lands on the
 * CALLER, in a 2v2 where landing it one seat over would be worse than not
 * showing it at all; that it fires on the transition and not on the state, so
 * a re-render mid-hand does not re-announce an old call; and that it costs
 * the felt no height — which it did, briefly and instructively, the first
 * time it was wired up.
 */

const SELF = "call-self" as PlayerId;
const OPPONENT = "call-opponent" as PlayerId;
const TEAMMATE = "call-teammate" as PlayerId;
const OPPONENT_2 = "call-opponent-2" as PlayerId;

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

const NOTICE_MS = 40;

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

function mounted(width = 1280): HTMLElement {
  container = document.createElement("div");
  container.style.width = `${String(width)}px`;
  document.body.appendChild(container);
  return container;
}

function dispatch(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`fence setup: engine rejected ${action.type} — ${result.violation}`);
  return result.state;
}

type Render = ReturnType<typeof createMatchTableRenderer>;

function renderer(): Render {
  return createMatchTableRenderer({ seatCallNoticeMs: NOTICE_MS });
}

function paint(render: Render, el: HTMLElement, state: MatchState): void {
  render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
}

const chip = (el: HTMLElement): HTMLElement | null => el.querySelector<HTMLElement>(".hexdev-truco-seat-call-chip");
const chipAnchor = (el: HTMLElement): string | undefined =>
  chip(el)?.closest<HTMLElement>(".hexdev-truco-anchor")?.dataset.position;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * OPPONENT (seat 1) is the mano, and that is this fixture's whole job:
 * opening a call is taking the floor and the floor starts with the mano
 * (truco-chain.ts), so a table where a rival's call is WAITING ON the local
 * player has to seat that rival as mano.
 */
function dealt2v2(): MatchState {
  return startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 0 }), DEAL_2V2);
}

/** The mirror, for the handful of cases about the LOCAL player's OWN call:
 * those need the floor to be theirs. */
function dealt2v2SelfMano(): MatchState {
  return startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);
}

/**
 * SELF holding an envido to open, which the mano fixture above cannot give:
 * only a PIE opens an envido and a pie is never the mano. dealerSeat 1 seats
 * the mano at 2, making SELF (seat 0) a pie, and the two seats ahead of them
 * play their first card on the way — which is what every 2v2 envido looks
 * like, not a fixture convenience.
 */
function dealt2v2SelfOpensEnvido(): MatchState {
  let state: MatchState = startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 1 }), DEAL_2V2);
  for (let guard = 0; guard <= state.players.length; guard += 1) {
    if (getLegalActions(state, SELF).some((action) => action.type === "call-envido")) return state;
    const onTheClock = state.players.find((player) => player.seat === state.hand?.turnSeat);
    const card = onTheClock === undefined ? undefined : getLegalActions(state, onTheClock.id).find((action) => action.type === "play-card");
    if (card === undefined) break;
    state = dispatch(state, card);
  }
  throw new Error("fence setup: the floor never reached SELF with an envido to open");
}

describe("the chip lands on whoever spoke", () => {
  it("2v2: an opponent's truco marks that opponent's own seat, not the team's half of the table", () => {
    const el = mounted();
    const render = renderer();
    const state = dealt2v2();
    paint(render, el, state);
    expect(chip(el), "nothing is marked before anyone has spoken").toBeNull();

    // OPPONENT is seat 1, which `resolveSeatPositions` puts at the RIGHT
    // anchor for a local player in seat 0 — the seat this call must mark, and
    // the one that makes this test worth writing: the other opponent is
    // sitting at `left`, on the same team, and would be just as wrong.
    paint(render, el, dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "truco" }));

    expect(chip(el), "the call is marked somewhere").not.toBeNull();
    expect(chipAnchor(el), "on the seat that called it").toBe("right");
  });

  it("2v2: the local player's own call marks the local player's own seat", () => {
    const el = mounted();
    const render = renderer();
    const state = dealt2v2SelfMano();
    paint(render, el, state);
    paint(render, el, dispatch(state, { type: "call-truco", playerId: SELF, level: "truco" }));

    expect(chipAnchor(el)).toBe("bottom");
  });

  it("says the same words the record says — one source of Spanish, not two", () => {
    const el = mounted();
    const render = renderer();
    const state = dealt2v2SelfOpensEnvido();
    paint(render, el, state);
    // SELF opens, because this fixture is the one that seats SELF as a pie
    // with the floor. This test compares the WORDS on the chip against the
    // words in the record, so which seat says them is incidental.
    paint(render, el, dispatch(state, { type: "call-envido", playerId: SELF, level: "envido" }));

    const spoken = chip(el)?.textContent ?? "";
    const logged = [...el.querySelectorAll(".hexdev-truco-call-log-text")].map((node) => node.textContent ?? "");
    expect(spoken).not.toBe("");
    expect(logged, `the log records "${logged.join(", ")}" and the chip shows "${spoken}"`).toContain(spoken);
  });
});

/**
 * TWO LIFETIMES, and which one applies is decided by the table, not by a
 * clock. A call still waiting for its answer is the STATE of the table, and
 * it is exactly while it stands that a player needs to know which of three
 * other seats said it — reported from real play as a pending TRUCO on screen
 * with nothing anywhere naming the caller, because the chip had come and gone
 * half a minute earlier and the banner only ever says a TEAM ("Cantó:
 * Ellos"). Everything else — a response, an escalation being accepted — is a
 * moment, and gets its two seconds.
 */
describe("a standing call keeps its mark; a settled one gets two seconds", () => {
  it("a call still waiting for an answer stays marked long past the moment", async () => {
    const el = mounted();
    const render = renderer();
    const state = dealt2v2();
    paint(render, el, state);
    paint(render, el, dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "truco" }));

    await sleep(NOTICE_MS + 40);

    expect(chip(el), "the call is still unanswered, so who made it is still the question").not.toBeNull();
    expect(chipAnchor(el)).toBe("right");
  });

  it("a settled call clears itself once it has been up long enough to read", async () => {
    const el = mounted();
    const render = renderer();
    const state = dealt2v2();
    paint(render, el, state);
    const called = dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "truco" });
    paint(render, el, called);
    const answered = dispatch(called, { type: "respond-truco", playerId: SELF, response: "quiero" });
    paint(render, el, answered);
    expect(chipAnchor(el), "the answer is the newest thing said, on the seat that said it").toBe("bottom");

    await sleep(NOTICE_MS + 40);
    expect(chip(el), "nothing is open any more, so the mark is a moment and the moment is over").toBeNull();
  });

  it("the mark leaves the caller the instant the call is answered", () => {
    const el = mounted();
    const render = renderer();
    const state = dealt2v2();
    paint(render, el, state);
    const called = dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "truco" });
    paint(render, el, called);
    expect(chipAnchor(el)).toBe("right");

    paint(render, el, dispatch(called, { type: "respond-truco", playerId: SELF, response: "quiero" }));
    expect(chipAnchor(el), "it belongs to whoever spoke last, not to whoever spoke first").toBe("bottom");
  });

  it("does not come back once a settled call's moment has passed", async () => {
    const el = mounted();
    const render = renderer();
    const state = dealt2v2();
    paint(render, el, state);
    const called = dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "truco" });
    paint(render, el, called);
    const answered = dispatch(called, { type: "respond-truco", playerId: SELF, response: "quiero" });
    paint(render, el, answered);

    await sleep(NOTICE_MS + 40);
    paint(render, el, answered);
    expect(chip(el), "views keep arriving all hand; none of them is a new call").toBeNull();
  });
});

describe("a fresh renderer reads the table, it does not invent history", () => {
  it("shows the mark for a call that is STILL OPEN, even though it did not see it happen", () => {
    // A reconnect mounts a fresh renderer into a hand in progress. The
    // pending call is not a transition it missed — it is the table as it
    // stands, and the player needs it as much as anyone who was here.
    const el = mounted();
    const render = renderer();
    paint(render, el, dispatch(dealt2v2(), { type: "call-truco", playerId: OPPONENT, level: "truco" }));

    expect(chipAnchor(el), "state is readable from a cold start; a moment is not").toBe("right");
  });

  it("shows nothing for a call that was already settled before it existed", () => {
    const el = mounted();
    const render = renderer();
    let state = dispatch(dealt2v2(), { type: "call-truco", playerId: OPPONENT, level: "truco" });
    state = dispatch(state, { type: "respond-truco", playerId: SELF, response: "quiero" });
    paint(render, el, state);

    expect(chip(el), "marking a settled call as JUST said would be a lie about when").toBeNull();
  });
});

describe("what it must not disturb", () => {
  it.each([375, 700, 960, 1280] as const)("%ipx 1v1: costs the felt not one pixel of height", (width) => {
    // THE REGRESSION THIS PINS. The first wiring gave every anchor a host so
    // the chip could land on any of them. In a 1v1 the two side anchors hold
    // nothing and `.hexdev-truco-anchor:empty` is what hides them — so an
    // empty child was enough to make them real boxes again, and the felt grew
    // by one seat gutter per tier (16px at 375, 24 at 700, 32 at 960).
    const withoutEl = mounted(width);
    const withoutRender = renderer();
    const state = startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 0 }), DEAL_1V1);
    paint(withoutRender, withoutEl, state);
    const baseline = withoutEl.querySelector(".hexdev-truco-table")!.getBoundingClientRect().height;
    withoutEl.remove();
    document.getElementById("hexdev-truco-table-styles")?.remove();

    const withEl = mounted(width);
    const withRender = renderer();
    paint(withRender, withEl, state);
    paint(withRender, withEl, dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "truco" }));

    expect(withEl.querySelector(".hexdev-truco-table")!.getBoundingClientRect().height, `felt height at ${String(width)}px while a seat is marked`).toBe(baseline);
  });

  it("1v1: the empty side anchors stay hidden while a call is marked", () => {
    const el = mounted();
    const render = renderer();
    const state = startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 0 }), DEAL_1V1);
    paint(render, el, state);
    paint(render, el, dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "truco" }));

    for (const side of ["left", "right"] as const) {
      const anchor = el.querySelector<HTMLElement>(`.hexdev-truco-anchor[data-position="${side}"]`);
      if (anchor === null) continue;
      expect(anchor.getBoundingClientRect().height, `the ${side} anchor seats nobody in 1v1 and must stay out of the layout`).toBe(0);
    }
  });

  it("never eats a click meant for a card underneath it", () => {
    const el = mounted();
    const render = renderer();
    const state = dealt2v2SelfMano();
    paint(render, el, state);
    paint(render, el, dispatch(state, { type: "call-truco", playerId: SELF, level: "truco" }));

    const host = el.querySelector<HTMLElement>(".hexdev-truco-seat-call");
    expect(host, "fence setup: the local seat really is marked here").not.toBeNull();
    expect(getComputedStyle(host!).pointerEvents, "it sits over the player's own hand for two seconds").toBe("none");
  });
});

/**
 * TWO CALLS CAN STAND AT ONCE, and both belong on the table.
 *
 * Envido is legal ON TOP of an unanswered truco — that is what "el envido
 * está primero" means — and the engine freezes the truco chain until the
 * envido resolves rather than cancelling it. So a hand really can hold two
 * open claims at once.
 *
 * They always come from OPPOSITE TEAMS, and that is a rule rather than a
 * coincidence: interposing an envido is a way of replying to the truco, so
 * only the team that owes the reply may do it. One seat can therefore never
 * hold both.
 *
 * Marking only the newest meant the envido silently replaced the truco, which
 * is how it was reported from real 2v2 play: "se pisan entre ellos los
 * cantos".
 */
describe("every open call is marked, not just the newest", () => {
  it("a truco and an envido open together are both on the table", () => {
    const el = mounted();
    const render = renderer();
    const state = dealt2v2();
    paint(render, el, state);

    let called = dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "truco" });
    paint(render, el, called);
    // The answering team's PIE interposes — the only way two calls can be
    // open, and only a pie may put the envido up.
    called = dispatch(called, { type: "call-envido", playerId: SELF, level: "envido" });
    paint(render, el, called);

    const chips = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-seat-call-chip")].map((node) => (node.textContent ?? "").trim());
    expect(chips.length, `only "${chips.join(", ")}" reached the table`).toBe(2);
    expect(chips.join(" ").toLowerCase()).toContain("truco");
    expect(chips.join(" ").toLowerCase()).toContain("envido");
  });

  it("each lands on the seat that made it, on opposite sides of the table", () => {
    const el = mounted();
    const render = renderer();
    const state = dealt2v2();
    paint(render, el, state);

    let called = dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "truco" });
    paint(render, el, called);
    called = dispatch(called, { type: "call-envido", playerId: SELF, level: "envido" });
    paint(render, el, called);

    const seats = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-seat-call-chip")].map(
      (node) => node.closest<HTMLElement>(".hexdev-truco-anchor")?.dataset.position,
    );
    // OPPONENT is seat 1 (right); SELF is seat 0 (bottom), and is the pie of
    // the team that owes the answer — the only seat allowed to put the envido
    // up. Attribution is the whole point of the mark, and putting either on
    // the wrong seat would be worse than showing neither.
    expect([...seats].sort()).toEqual(["bottom", "right"]);
  });

  it("one seat is never asked to hold both — the rules do not allow it", () => {
    // Interposing an envido replies to the truco, so it belongs to the team
    // that owes the reply. A seat holding both would mean it had called truco
    // and then answered its own call. Asserted through the ENGINE rather than
    // the render, because it is a rule and not a drawing decision.
    const called = dispatch(dealt2v2(), { type: "call-truco", playerId: OPPONENT, level: "truco" });
    const callerActions = getLegalActions(called, OPPONENT).map((action) => action.type);

    expect(callerActions, `the caller was still offered: ${callerActions.join(", ") || "nothing"}`).not.toContain("call-envido");
  });

  it("marking one of them again does not drop the other", () => {
    // The truco is frozen behind the envido, so it produces no further
    // events. A derivation that only ever read the newest event would lose it
    // on the next render even if it caught it on the first.
    const el = mounted();
    const render = renderer();
    const state = dealt2v2();
    paint(render, el, state);

    let called = dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "truco" });
    paint(render, el, called);
    called = dispatch(called, { type: "call-envido", playerId: SELF, level: "envido" });
    paint(render, el, called);
    paint(render, el, called);
    paint(render, el, called);

    expect(el.querySelectorAll(".hexdev-truco-seat-call-chip").length).toBe(2);
  });
});

/**
 * AN ANSWER IS ONLY EVER A MOMENT, so a standing call must not swallow it.
 *
 * A quiero or a no-quiero never becomes a standing mark of its own — it
 * settles a chain and is gone. The first version of this surface let the
 * standing marks REPLACE the passing one whenever anything was still open,
 * which meant that any answer given while another call survived was never
 * drawn at all. That is not a corner: an envido declined over a truco still
 * waiting is an ordinary sequence.
 *
 * Reported from real 2v2 play as losing track of who replied and what they
 * said. The honest reading is that it was never on screen to be lost — and
 * the whole suite was green through the entire defect, which is why these
 * exist.
 */
describe("a reply is drawn even while another call is still standing", () => {
  /** Rival calls truco; the local team interposes an envido (the only side
   * that may); the rival declines it. The truco is left standing, frozen,
   * with no further events of its own. */
  function envidoDeclinedOverPendingTruco(): MatchState {
    let state = dispatch(dealt2v2(), { type: "call-truco", playerId: OPPONENT, level: "truco" });
    state = dispatch(state, { type: "call-envido", playerId: SELF, level: "envido" });
    return dispatch(state, { type: "respond-envido", playerId: OPPONENT, response: "no-quiero" });
  }

  it("shows the answer AND the call that outlived it", () => {
    const el = mounted();
    const render = renderer();
    let state = dispatch(dealt2v2(), { type: "call-truco", playerId: OPPONENT, level: "truco" });
    paint(render, el, state);
    state = dispatch(state, { type: "call-envido", playerId: SELF, level: "envido" });
    paint(render, el, state);
    paint(render, el, dispatch(state, { type: "respond-envido", playerId: OPPONENT, response: "no-quiero" }));

    const chips = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-seat-call-chip")].map((node) => (node.textContent ?? "").trim().toLowerCase());
    expect(chips.join(" | "), "the reply is the thing a player was losing").toContain("no quiero");
    expect(chips.join(" | "), "and the truco is still waiting on them").toContain("truco");
  });

  it("both land on the seat that said them", () => {
    const el = mounted();
    const render = renderer();
    let state = dispatch(dealt2v2(), { type: "call-truco", playerId: OPPONENT, level: "truco" });
    paint(render, el, state);
    state = dispatch(state, { type: "call-envido", playerId: SELF, level: "envido" });
    paint(render, el, state);
    paint(render, el, dispatch(state, { type: "respond-envido", playerId: OPPONENT, response: "no-quiero" }));

    // OPPONENT called the truco and declined the envido, so one seat holds
    // both — stacked rather than superimposed, which is what the by-seat
    // grouping is for.
    const chips = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-seat-call-chip")];
    expect(chips.length).toBe(2);
    for (const chip of chips) {
      expect(chip.closest<HTMLElement>(".hexdev-truco-anchor")?.dataset.position).toBe("right");
    }
    const [first, second] = chips.map((chip) => chip.getBoundingClientRect());
    expect(first!.bottom, "stacked, not one on top of the other").toBeLessThanOrEqual(second!.top + 1);
  });

  it("the reply goes when its moment is up; the standing call stays", async () => {
    const el = mounted();
    const render = renderer();
    let state = dispatch(dealt2v2(), { type: "call-truco", playerId: OPPONENT, level: "truco" });
    paint(render, el, state);
    state = dispatch(state, { type: "call-envido", playerId: SELF, level: "envido" });
    paint(render, el, state);
    paint(render, el, envidoDeclinedOverPendingTruco());

    await sleep(NOTICE_MS + 40);

    const chips = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-seat-call-chip")].map((node) => (node.textContent ?? "").trim().toLowerCase());
    expect(chips.join(" | "), "the answer was a moment and the moment passed").not.toContain("no quiero");
    expect(chips.join(" | "), "the truco is still unanswered, so it is still marked").toContain("truco");
  });

  it("a fresh call is not drawn twice — it is the moment AND the standing mark", () => {
    const el = mounted();
    const render = renderer();
    const state = dealt2v2();
    paint(render, el, state);
    paint(render, el, dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "truco" }));

    expect(el.querySelectorAll(".hexdev-truco-seat-call-chip").length, "one call, one chip").toBe(1);
  });
});
