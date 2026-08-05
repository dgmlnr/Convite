import { cardPower } from "@hexdev/truco-engine";
import type { Action, PlayerView } from "@hexdev/truco-engine";
import type { BotStrategy } from "@hexdev/platform-contract";

/**
 * Priority group for the easy tier's action choice — LOWER is preferred.
 * Deliberately weak on purpose (design: tiers must be measurably different,
 * spec: "easy: static heuristics"):
 *  - forced responses first (never leaves a pending call unanswered),
 *  - reveal-envido next (the only legal choice once envido is accepted),
 *  - a card play next, using the WORST possible habit (see `weakestCardPlay`),
 *  - a proactive truco/envido call is NEVER volunteered, only ever taken
 *    when it is the sole legal action left.
 */
function priority(action: Action): number {
  if (action.type === "respond-truco" || action.type === "respond-envido") return 0;
  if (action.type === "reveal-envido") return 1;
  if (action.type === "play-card") return 2;
  return 3; // call-truco / call-envido
}

/** Real Truco Argentino beginner mistake: burning your strongest card early
 * instead of saving it. Deliberately the OPPOSITE of `heuristics.ts`'s
 * cheapest-winning-card discipline used by the smarter tiers. */
function weakestCardPlay(legal: readonly Action[]): Action {
  const plays = legal.filter((action): action is Extract<Action, { type: "play-card" }> => action.type === "play-card");
  return plays.reduce((strongest, candidate) => (cardPower(candidate.card) > cardPower(strongest.card) ? candidate : strongest));
}

/** Blindly accepts any pending call rather than weighing hand strength —
 * exactly the naive behavior that makes the easy tier exploitable. */
function blindAccept(legal: readonly Action[], type: "respond-truco" | "respond-envido"): Action {
  const responses = legal.filter((action): action is Extract<Action, { type: typeof type }> => action.type === type);
  return responses.find((action) => action.response === "quiero") ?? responses[0]!;
}

export function createEasyBot(): BotStrategy<PlayerView, Action> {
  return {
    chooseAction(_view, legalActions) {
      if (legalActions.length === 0) {
        throw new Error("createEasyBot: no legal actions to choose from");
      }
      const best = Math.min(...legalActions.map(priority));
      const group = legalActions.filter((action) => priority(action) === best);

      if (best === 0) return blindAccept(group, group[0]!.type as "respond-truco" | "respond-envido");
      if (best === 2) return weakestCardPlay(group);
      return group[0]!;
    },
  };
}
