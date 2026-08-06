import type { TeamId } from "./ids.js";
import type { TrickOutcome } from "./trick.js";

export type HandOutcome =
  | { readonly decided: true; readonly winnerTeamId: TeamId }
  | { readonly decided: false };

/**
 * Resolves the winner of a hand from its trick outcomes, per the Truco
 * Argentino parda rule (obs #2918): the hand is won by the team that won
 * the first non-tied trick; if all three tricks tie, the mano team wins.
 *
 * The one nuance the "first non-tied trick" phrasing glosses over: if
 * tricks 1 and 2 are split between the two teams (each wins one, neither
 * tied), the first trick's winner does NOT automatically win — trick 3
 * decides. A parda in trick 2 after a decided trick 1, by contrast,
 * already hands the win to trick 1's winner without needing trick 3.
 *
 * The split-then-tied-third combination (trick 1 and 2 split, trick 3 also
 * a parda) is not one of the six canonical scenarios; it falls back to the
 * documented Truco tie-break of awarding the hand to trick 1's winner.
 */
export function resolveHandWinner(
  tricks: readonly TrickOutcome[],
  manoTeamId: TeamId,
): HandOutcome {
  const [trick1, trick2, trick3] = tricks;

  if (trick1 === undefined || trick2 === undefined) {
    return { decided: false };
  }

  if (trick1.winnerTeamId === null) {
    // Trick 1 was a parda.
    if (trick2.winnerTeamId !== null) {
      return { decided: true, winnerTeamId: trick2.winnerTeamId }; // cases 1, 6
    }
    if (trick3 === undefined) {
      return { decided: false };
    }
    return { decided: true, winnerTeamId: trick3.winnerTeamId ?? manoTeamId }; // cases 2, 3
  }

  if (trick2.winnerTeamId === null || trick2.winnerTeamId === trick1.winnerTeamId) {
    // Trick 2 tied, or the same team won both — already decided, trick 3 not needed.
    return { decided: true, winnerTeamId: trick1.winnerTeamId }; // case 4
  }

  // Tricks 1 and 2 were split between the two teams — trick 3 decides.
  if (trick3 === undefined) {
    return { decided: false };
  }
  return { decided: true, winnerTeamId: trick3.winnerTeamId ?? trick1.winnerTeamId }; // case 5
}
