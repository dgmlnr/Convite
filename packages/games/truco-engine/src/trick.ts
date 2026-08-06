import { cardPower } from "./card-power.js";
import type { Card } from "./card.js";
import type { TeamId } from "./ids.js";

export interface PlayedCard {
  readonly teamId: TeamId;
  readonly card: Card;
}

export interface TrickOutcome {
  /** The winning team, or `null` for a parda (both cards had equal power). */
  readonly winnerTeamId: TeamId | null;
}

export function resolveTrick(plays: readonly [PlayedCard, PlayedCard]): TrickOutcome {
  const [first, second] = plays;
  const firstPower = cardPower(first.card);
  const secondPower = cardPower(second.card);

  if (firstPower === secondPower) {
    return { winnerTeamId: null };
  }

  return { winnerTeamId: firstPower > secondPower ? first.teamId : second.teamId };
}
