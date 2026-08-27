import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createHeadToHeadMatch, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Action, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * Asking your partner, from the table's side.
 *
 * THE ONE RULE A PLAYER HAS TO UNDERSTAND is that asking costs a seña — the
 * engine charges the question to the same per-hand allowance signalling
 * spends. Two ways of saying that failed before this one: a "(3)" on each of
 * two buttons read as two separate threes, and a lone counter between them
 * read as a stray digit. So there is ONE control now, its toggle carries the
 * count, and both ways to spend it are revealed inside it — which is why
 * every test here opens the picker before looking for the offer.
 *
 * THE ANSWER OUTLIVES THE OFFER, and that is the case worth writing down:
 * asking is frequently what spends the LAST of the allowance, so by the time
 * the partner replies the button is already gone. A control that rendered the
 * reply only alongside its own button would eat the seña and show nothing.
 */

const SELF = "consult-self" as PlayerId;
const OPPONENT = "consult-opponent" as PlayerId;
const TEAMMATE = "consult-teammate" as PlayerId;
const OPPONENT_2 = "consult-opponent-2" as PlayerId;

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

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

function dispatchOrThrow(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`fence setup: engine rejected ${action.type} — ${result.violation}`);
  return result.state;
}

type Consult = {
  readonly advice: "quiero" | "no-quiero" | null;
  readonly asking: boolean;
  /** Slice 4b: optional, additive — every pre-existing call in this file
   * omits it and keeps reading the honest "partner" report unchanged. */
  readonly from?: "partner" | "fallback" | null;
};

function paint(state: MatchState, consult?: Consult): { sent: Action[] } {
  container = document.createElement("div");
  container.style.width = "1280px";
  document.body.appendChild(container);

  const sent: Action[] = [];
  createMatchTableRenderer()(
    container,
    getViewFor(state, SELF),
    getLegalActions(state, SELF),
    (action) => sent.push(action),
    undefined,
    null,
    undefined,
    consult,
  );
  return { sent };
}

/** Opens the partner picker, the way a player does. The offer lives inside
 * it, so a test that skipped this would be asserting about a closed drawer. */
function open(): void {
  container.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')?.click();
}

const button = (): HTMLButtonElement | null => container.querySelector<HTMLButtonElement>(".hexdev-truco-consult-toggle");
const advice = (): HTMLElement | null => container.querySelector<HTMLElement>(".hexdev-truco-consult-advice");

/** dealerSeat 0 seats OPPONENT (seat 1) as the mano in both shapes, and
 * OPPONENT is who calls: opening is taking the floor, and the floor starts
 * with the mano (truco-chain.ts). A fixture that wants a call waiting ON the
 * local player has to seat the caller as mano. */
function pendingTruco(): MatchState {
  const dealt = startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 0 }), DEAL_2V2);
  return dispatchOrThrow(dealt, { type: "call-truco", playerId: OPPONENT, level: "truco" });
}

describe("when the question is on offer", () => {
  it("offers it while a call is waiting on your team", () => {
    paint(pendingTruco());
    open();
    expect(button(), "there is a decision to ask about").not.toBeNull();
  });

  it("does not offer it before anybody has called", () => {
    paint(startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 0 }), DEAL_2V2));
    open();
    expect(button(), "a question with no subject is a licence to read your partner's hand").toBeNull();
  });

  it("never in a heads-up match — there is nobody to ask", () => {
    const dealt = startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 0 }), DEAL_1V1);
    paint(dispatchOrThrow(dealt, { type: "call-truco", playerId: OPPONENT, level: "truco" }));
    open();
    expect(button(), "a heads-up felt has no picker to open, let alone a partner to ask").toBeNull();
  });

  it("carries no count of its own — the allowance belongs to the control that holds it", () => {
    // An earlier version of this test compared the DIGITS in two button
    // labels. When both labels lost their numbers it went on passing by
    // comparing "" to "" — a test that could no longer fail for the reason it
    // existed. So it asks where the number IS, not whether two agree.
    paint(pendingTruco());
    const toggle = container.querySelector<HTMLElement>('button[data-action="senas-toggle"]');
    expect(toggle?.textContent ?? "", "the one control that spends it says how much is left").toMatch(/\d/);

    open();
    expect(button()?.textContent ?? "", "a second number in here would read as a second budget").not.toMatch(/\d/);
  });
});

describe("asking, and being answered", () => {
  it("clicking dispatches the engine's own consult action, not an invented one", () => {
    const { sent } = paint(pendingTruco());
    open();
    button()!.click();

    expect(sent.map((action) => action.type), "the button hands back exactly what the engine offered").toEqual(["consult-partner"]);
  });

  it("says it is asking, and cannot be asked twice while it waits", () => {
    paint(pendingTruco(), { advice: null, asking: true });
    open();
    expect(button()!.disabled, "a second question would spend a second seña for the same answer").toBe(true);
  });

  it("reports the answer when it lands", () => {
    paint(pendingTruco(), { advice: "no-quiero", asking: false });
    expect(advice()?.textContent ?? "").toContain("No quiere");
    expect(advice()?.dataset.advice, "colour is never the only signal — the text says it too").toBe("no-quiero");
  });

  it("still reports it once the allowance is spent and the button is gone", () => {
    // Asking is often what spends the LAST seña, so the offer disappears in
    // the same breath as the answer arrives. Losing the reply there would
    // charge a player for nothing.
    let state = pendingTruco();
    for (let asked = 0; asked < 3; asked += 1) state = dispatchOrThrow(state, { type: "consult-partner", playerId: SELF, about: "pending-call" });
    paint(state, { advice: "quiero", asking: false });
    open();

    expect(button(), "fence setup: the allowance really is spent").toBeNull();
    expect(advice()?.textContent ?? "", "the answer is still owed to the player who paid for it").toContain("Quiere");
  });

  it("shows nothing at all when there is no offer and no answer", () => {
    let state = pendingTruco();
    for (let asked = 0; asked < 3; asked += 1) state = dispatchOrThrow(state, { type: "consult-partner", playerId: SELF, about: "pending-call" });
    paint(state);
    open();

    expect(button(), "nothing left to spend, so nothing to offer").toBeNull();
    expect(advice(), "and no answer outstanding either").toBeNull();
  });
});

/**
 * THE WINDOW THE PIE RULE OPENED.
 *
 * Only a pie may open an envido, which took the call away from two of the
 * four seats — possibly the one holding the points. Señas name CARDS, never
 * tantos, so a non-pie partner with 33 cannot say so and the team loses
 * envidos it should win. The pie may ask instead, and this is the half the
 * player actually touches: the control is driven purely by legality
 * (`consult-control.ts` looks for the offer in `legalActions`), so what this
 * fences is that the window really reaches the button rather than stopping at
 * the engine.
 */
describe("asking before you open an envido", () => {
  /** dealerSeat 0 seats the mano at 1, making SELF (seat 0) a pie — and the
   * LAST to speak, so the other three play on the way to the floor. */
  function floorAtSelf(): MatchState {
    let state: MatchState = startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 0 }), DEAL_2V2);
    for (const seat of [OPPONENT, TEAMMATE, OPPONENT_2]) {
      const card = getLegalActions(state, seat).find((action) => action.type === "play-card")!;
      state = dispatchOrThrow(state, card);
    }
    return state;
  }

  it("offers it to the pie holding an uncalled envido, with nothing on the table", () => {
    const state = floorAtSelf();
    expect(state.hand?.truco.status, "fence setup: nothing is pending").toBe("none");
    expect(state.hand?.envido.status, "fence setup: no envido either").toBe("none");

    paint(state);
    open();
    expect(button(), "the pie has a real decision to ask about — whether to open it at all").not.toBeNull();
  });

  it("stops offering it once the pie plays its own card", () => {
    const state = floorAtSelf();
    const played = dispatchOrThrow(state, getLegalActions(state, SELF).find((action) => action.type === "play-card")!);

    paint(played);
    open();
    expect(button(), "playing is how you give the call up, and the question goes with it").toBeNull();
  });
});

/**
 * Slice 4b — THE ASK, on the PARTNER'S OWN SCREEN. Design D10: two
 * grammatical persons for two roles — the button is the partner's OWN
 * voice, "Dale"/"No", never the report's "Quiere"/"No quiere" above. It is
 * ALSO structurally isolated (spec's own belt-and-braces): its own group,
 * `data-answer` never `data-action`, and a click inside it must never reach
 * the same `dispatch` the real action bar uses.
 */
describe("the ask, on the partner's own screen (Slice 4b)", () => {
  function paintAsPartner(
    state: MatchState,
    consultAsk: { about: string | undefined; options: readonly ("quiero" | "no-quiero")[] } | null,
  ): { sent: Action[]; answered: { answer: "quiero" | "no-quiero"; about: string | undefined }[] } {
    container = document.createElement("div");
    container.style.width = "1280px";
    document.body.appendChild(container);

    const sent: Action[] = [];
    const answered: { answer: "quiero" | "no-quiero"; about: string | undefined }[] = [];
    createMatchTableRenderer()(
      container,
      getViewFor(state, TEAMMATE),
      getLegalActions(state, TEAMMATE),
      (action) => sent.push(action),
      undefined,
      null,
      undefined,
      undefined,
      undefined,
      consultAsk,
      (answer, about) => answered.push({ answer, about }),
    );
    return { sent, answered };
  }

  const askButtons = (): HTMLButtonElement[] => [...container.querySelectorAll<HTMLButtonElement>('[data-role="consult-ask"] button')];

  it.each(["pending-call", "envido"] as const)('reads exactly "Dale"/"No" for %s — never the report\'s own words', (about) => {
    paintAsPartner(pendingTruco(), { about, options: ["quiero", "no-quiero"] });

    const buttons = askButtons();
    expect(buttons.map((b) => b.textContent)).toEqual(["Dale", "No"]);
    expect(
      buttons.every((b) => b.dataset.action === undefined),
      "never data-action — that vocabulary belongs to the action bar's real, binding calls",
    ).toBe(true);
  });

  it("never reaches dispatch — a click inside the group is not a move", () => {
    const { sent, answered } = paintAsPartner(pendingTruco(), { about: "pending-call", options: ["quiero", "no-quiero"] });

    askButtons()[0]!.click();

    expect(sent, "the engine's own dispatch never saw this click").toEqual([]);
    expect(answered, "it went out the answer's own channel instead").toEqual([{ answer: "quiero", about: "pending-call" }]);
  });

  it("renders nothing when there is no open ask", () => {
    paintAsPartner(pendingTruco(), null);
    expect(container.querySelector('[data-role="consult-ask"]'), "no question, no group").toBeNull();
  });
});

/**
 * Slice 4b — PROVENANCE (spec: "Provenance Is Disclosed to the Asker"). The
 * REPORT itself does not change (lines 168/182 above stay untouched); this
 * is the NEW `from` marking layered on top of it.
 */
describe("provenance — honest vs fallback, marked and worded differently (Slice 4b)", () => {
  it("marks a partner's own honest answer — human or bot-controlled read identically", () => {
    paint(pendingTruco(), { advice: "quiero", asking: false, from: "partner" });
    expect(advice()?.dataset.from).toBe("partner");
    expect(advice()?.textContent).toBe("Tu compañero: Quiere");
  });

  it("marks the fallback the same whether the 30s cap or a partner takeover produced it", () => {
    paint(pendingTruco(), { advice: "quiero", asking: false, from: "fallback" });
    expect(advice()?.dataset.from).toBe("fallback");
    expect(advice()?.textContent).toBe("Tu compañero no contestó. Sugerencia: Quiere");
  });
});
