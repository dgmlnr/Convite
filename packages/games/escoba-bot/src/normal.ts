import type { BotStrategy, RandomSource } from "@hexdev/platform-contract";
import type { PlayCardAction, PlayerView } from "@hexdev/escoba-engine";
import { evaluateAction, pickBestByValue } from "./heuristics.js";

/**
 * design §D8: "one-ply value of each legal action" — no lookahead into the
 * opponent's reply (that is the hard tier's edge). `rng` breaks ties among
 * equally-valued actions only.
 */
export function createNormalBot(rng: RandomSource): BotStrategy<PlayerView, PlayCardAction> {
  return {
    chooseAction(view, legalActions) {
      if (legalActions.length === 0) throw new Error("createNormalBot: no legal actions to choose from");
      return pickBestByValue(legalActions, (action) => evaluateAction(view, action), rng);
    },
  };
}
