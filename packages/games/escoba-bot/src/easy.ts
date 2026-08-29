import type { BotStrategy } from "@hexdev/platform-contract";
import type { PlayCardAction, PlayerView } from "@hexdev/escoba-engine";

/**
 * design §D8: "first legal action in canonical order. No evaluation." —
 * `getLegalActions` (`escoba-engine/src/legal-actions.ts`) already
 * enumerates one action per hand card in canonical table-index
 * lexicographic order, so this tier needs no ordering logic of its own; it
 * simply trusts the engine's own order, exactly like `truco-bot`'s easy
 * tier trusts its own `priority` ranking rather than evaluating hands.
 */
export function createEasyBot(): BotStrategy<PlayerView, PlayCardAction> {
  return {
    chooseAction(_view, legalActions) {
      const first = legalActions[0];
      if (first === undefined) throw new Error("createEasyBot: no legal actions to choose from");
      return first;
    },
  };
}
