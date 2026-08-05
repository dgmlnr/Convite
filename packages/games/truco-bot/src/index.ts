import type { Action, PlayerView } from "@hexdev/truco-engine";

/**
 * PLACEHOLDER for Phase 6 (PR11): a single, tier-agnostic strategy that
 * always picks the first legal action. Real easy/normal/hard heuristics and
 * ISMCTS search land in that slice; this exists only so `truco-module`'s
 * `createBot` has something legitimate to return today, satisfying
 * `platform-contract`'s conformance suite ("a bot always chooses one of the
 * legal actions it is offered") without pretending tiers are implemented.
 */
export function chooseFirstLegalAction(_view: PlayerView, legalActions: readonly Action[]): Action {
  const [first] = legalActions;
  if (first === undefined) {
    throw new Error("chooseFirstLegalAction called with no legal actions to choose from");
  }
  return first;
}
