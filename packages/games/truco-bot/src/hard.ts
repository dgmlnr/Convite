import { cardPower } from "@hexdev/truco-engine";
import type { Action, Card, PlayerView } from "@hexdev/truco-engine";
import type { BotStrategy, RandomSource } from "@hexdev/platform-contract";
import { sampleOpponentHand } from "./determinize.js";
import { envidoPoints, handPower, scoreFollowingCardPlay } from "./heuristics.js";

/** Number of determinizations sampled per decision — a tunable search
 * budget, same spirit as `budgetMs` on `BotStrategy.chooseAction`. Kept
 * small enough that even the seeded tournament (hundreds of hands) runs
 * comfortably inside the suite. */
const DEFAULT_SAMPLES = 24;

type RespondTruco = Extract<Action, { type: "respond-truco" }>;
type RespondEnvido = Extract<Action, { type: "respond-envido" }>;
type PlayCard = Extract<Action, { type: "play-card" }>;

/** Fraction of sampled opponent hands `metric(myHand) > metric(sample)` holds
 * for — the core Monte Carlo determinization primitive every "uncertain"
 * decision below is built from. */
function winRate(myHand: readonly Card[], samples: readonly (readonly Card[])[], metric: (hand: readonly Card[]) => number): number {
  const myValue = metric(myHand);
  const wins = samples.filter((sample) => myValue > metric(sample)).length;
  return wins / samples.length;
}

function respondChoice<T extends RespondTruco | RespondEnvido>(group: readonly T[], favored: boolean): Action {
  return group.find((action) => action.response === (favored ? "quiero" : "no-quiero")) ?? group[0]!;
}

/**
 * Leading the trick: no opponent card is visible yet, so — unlike the
 * normal tier's static "always play weakest" habit — determinize the
 * opponent's hand and score each candidate by how often it beats the
 * STRONGEST card in a sampled hand (pessimistic: assume the opponent
 * defends with their best available response).
 */
function leadingCardPlayChoice(group: readonly PlayCard[], samples: readonly (readonly Card[])[]): Action {
  return group.reduce((best, candidate) => {
    const score = (card: Card) => samples.filter((sample) => cardPower(card) > Math.max(...sample.map(cardPower))).length;
    return score(candidate.card) > score(best.card) ? candidate : best;
  });
}

export function createHardBot(rng: RandomSource, samples = DEFAULT_SAMPLES): BotStrategy<PlayerView, Action> {
  return {
    chooseAction(view, legalActions) {
      if (legalActions.length === 0) {
        throw new Error("createHardBot: no legal actions to choose from");
      }

      const determinizations = Array.from({ length: samples }, () => sampleOpponentHand(view, rng));

      const respondTruco = legalActions.filter((a): a is RespondTruco => a.type === "respond-truco");
      if (respondTruco.length > 0) {
        return respondChoice(respondTruco, winRate(view.self.hand, determinizations, handPower) > 0.5);
      }

      const respondEnvido = legalActions.filter((a): a is RespondEnvido => a.type === "respond-envido");
      if (respondEnvido.length > 0) {
        return respondChoice(respondEnvido, winRate(view.self.hand, determinizations, envidoPoints) > 0.5);
      }

      const reveal = legalActions.find((a) => a.type === "reveal-envido");
      if (reveal !== undefined) return reveal;

      const wantsToCallTruco = legalActions.find((a) => a.type === "call-truco");
      if (wantsToCallTruco !== undefined && winRate(view.self.hand, determinizations, handPower) > 0.5) return wantsToCallTruco;

      const wantsToCallEnvido = legalActions.find((a) => a.type === "call-envido");
      if (wantsToCallEnvido !== undefined && winRate(view.self.hand, determinizations, envidoPoints) > 0.5) return wantsToCallEnvido;

      const cardPlays = legalActions.filter((a): a is PlayCard => a.type === "play-card");
      if (cardPlays.length > 0) {
        const opponentPlay = view.hand?.currentTrickPlays[0];
        if (opponentPlay !== undefined) {
          return cardPlays.reduce((best, candidate) =>
            scoreFollowingCardPlay(candidate.card, opponentPlay.card) > scoreFollowingCardPlay(best.card, opponentPlay.card) ? candidate : best,
          );
        }
        return leadingCardPlayChoice(cardPlays, determinizations);
      }

      return legalActions[0]!;
    },
  };
}
