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

/**
 * Resolves a trick from any non-empty set of plays. 1v1 supplies exactly one
 * play per team (the original 2-tuple shape); 2v2 supplies up to two per
 * team. A team's "strength" in the trick is its OWN best play — the highest
 * card any of its members contributed — so a team wins outright as soon as
 * its best play out-powers the other team's best play, regardless of what a
 * teammate played. A parda occurs precisely when the two teams' best plays
 * tie in power, which is a strict generalization of the 1v1 rule (there,
 * "team's best play" and "the single card played" are the same thing).
 */
export function resolveTrick(plays: readonly PlayedCard[]): TrickOutcome {
  const bestPowerByTeam = new Map<TeamId, number>();
  for (const play of plays) {
    const power = cardPower(play.card);
    const current = bestPowerByTeam.get(play.teamId);
    if (current === undefined || power > current) {
      bestPowerByTeam.set(play.teamId, power);
    }
  }

  const maxPower = Math.max(...bestPowerByTeam.values());
  const leadingTeams = [...bestPowerByTeam.entries()].filter(([, power]) => power === maxPower).map(([teamId]) => teamId);

  return { winnerTeamId: leadingTeams.length === 1 ? leadingTeams[0]! : null };
}
