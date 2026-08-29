import { describe, expect, it } from "vitest";
import { getViewFor } from "@hexdev/escoba-engine";
import type { PlayCardAction } from "@hexdev/escoba-engine";
import { createBotStrategy } from "./index.js";
import { card, fixtureMatch } from "./fixtures.js";

/**
 * K.2 (design §D8): the tier's real decision is WHICH CARD TO PLAY, since
 * capturing is forced once a forming card is chosen (art. 21.2). This
 * fixture is exactly the tactical case the design names: the only capture
 * available (caballo de espada, value 9, capturing the lone 6-basto for
 * 15) leaves the table at {4-oro, 5-espada} = 9, so ANY unseen 6 (three
 * remain — one was just captured, the fourth suit's is still unseen) lets
 * the opponent sweep next turn for an escoba. The 1-copa in hand forms no
 * 15 at all against the ORIGINAL table (15-1=14, no subset of {4,5,6}
 * reaches it) and leaves the table at {4,5,6,1}=16, needing a nonexistent
 * value-(-1) card — safe. easy and normal both grab the capture; hard
 * plays the dead card instead.
 */
describe("createBotStrategy — the three tiers genuinely diverge (K.2, mutation row 19)", () => {
  const CAPTURING_CARD = card(11, "espada"); // caballo, value 9
  const DEAD_CARD = card(1, "copa"); // value 1
  const { state, player0 } = fixtureMatch({
    table: [card(4, "oro"), card(5, "espada"), card(6, "basto")],
    hand0: [CAPTURING_CARD, DEAD_CARD],
    hand1: [],
  });
  const view = getViewFor(state, player0);
  const legalActions: readonly PlayCardAction[] = [
    { type: "play-card", playerId: player0, card: CAPTURING_CARD, captured: [card(6, "basto")] },
    { type: "play-card", playerId: player0, card: DEAD_CARD, captured: [] },
  ];
  const fixedRng = () => 0; // never consulted for a clear winner — determinism, not chance

  it("easy captures (first legal action in canonical order)", () => {
    const chosen = createBotStrategy("easy", fixedRng).chooseAction(view, legalActions, 1000);
    expect(chosen).toEqual(legalActions[0]);
  });

  it("normal captures (one-ply value: any capture beats a 0-value stay)", () => {
    const chosen = createBotStrategy("normal", fixedRng).chooseAction(view, legalActions, 1000);
    expect(chosen).toEqual(legalActions[0]);
  });

  it("hard plays the dead card instead — it prices the escoba it would hand the opponent", () => {
    const chosen = createBotStrategy("hard", fixedRng).chooseAction(view, legalActions, 1000);
    expect(chosen).toEqual(legalActions[1]);
  });
});

describe("createBotStrategy — every tier throws rather than silently pick nothing", () => {
  const { state, player0 } = fixtureMatch({ table: [], hand0: [], hand1: [] });
  const view = getViewFor(state, player0);
  const rng = () => 0.5;

  for (const tier of ["easy", "normal", "hard"] as const) {
    it(`${tier} throws on an empty legal-action list`, () => {
      expect(() => createBotStrategy(tier, rng).chooseAction(view, [], 1000)).toThrow();
    });
  }
});
