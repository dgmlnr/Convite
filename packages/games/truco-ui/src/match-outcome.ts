import type { PlayerId, TeamId } from "@hexdev/truco-engine";
import { TABLE_STRINGS } from "./strings.js";

/**
 * Structurally identical to `platform-contract`'s own `MatchOutcome`
 * (`{ winnerIds: readonly PlayerId[] }`) — this package deliberately does
 * NOT depend on `platform-contract` (design §1: `truco-ui` is L1, →
 * `truco-engine` types only), so this is a local, minimal shape covering
 * only the one field this UI needs. `PlayerId` is the exact same branded
 * shape across packages by design (see `platform-contract/src/ids.ts`'s own
 * docstring), so a caller's real `MatchOutcome` passes straight through
 * with no cast.
 */
export interface MatchOutcomeInfo {
  readonly winnerIds: readonly PlayerId[];
}

export interface MatchOverProps {
  readonly outcome: MatchOutcomeInfo;
  readonly selfPlayerId: PlayerId;
  readonly teams: readonly { readonly id: TeamId; readonly score: number }[];
  readonly selfTeamId: TeamId;
  readonly onPlayAgain: () => void;
}

/**
 * Renders the end-of-match overlay: who won, the final score for both
 * teams, and a play-again path right where the player is looking (spec:
 * "the moment someone most wants another match is right after finishing
 * one"). `won`/`lost` come straight from whether `selfPlayerId` is among
 * `outcome.winnerIds` — the winner itself was already decided by the
 * engine's own `getMatchWinner`/`getOutcome`, never re-derived here.
 * `winnerIds` empty (structurally allowed by `platform-contract`'s own
 * `MatchOutcome` for a draw/abandoned match) renders a neutral ending
 * rather than guessing a side.
 */
export function renderMatchOverOverlay(container: HTMLElement, props: MatchOverProps | null): void {
  container.replaceChildren();
  container.className = "hexdev-truco-match-over";
  if (props === null) {
    delete container.dataset.result;
    return;
  }

  const won = props.outcome.winnerIds.includes(props.selfPlayerId);
  const isDraw = props.outcome.winnerIds.length === 0;
  container.dataset.result = isDraw ? "unknown" : won ? "won" : "lost";

  const headline = document.createElement("h2");
  headline.className = "hexdev-truco-match-over-headline";
  headline.textContent = isDraw ? TABLE_STRINGS.matchOverNeutral : won ? TABLE_STRINGS.matchWon : TABLE_STRINGS.matchLost;
  container.appendChild(headline);

  const score = document.createElement("p");
  score.className = "hexdev-truco-match-over-score";
  score.textContent = finalScoreLine(props);
  container.appendChild(score);

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "play-again";
  button.textContent = TABLE_STRINGS.playAgain;
  button.addEventListener("click", props.onPlayAgain);
  container.appendChild(button);
}

/** The final-score line, extracted so the visible overlay and the spoken
 * sentence below draw the SAME text — the two can never diverge. */
function finalScoreLine(props: MatchOverProps): string {
  return `${TABLE_STRINGS.finalScore}: ${props.teams
    .map((team) => `${team.id === props.selfTeamId ? TABLE_STRINGS.us : TABLE_STRINGS.them} ${team.score}`)
    .join(" — ")}`;
}

/**
 * The same ending as ONE spoken sentence, for the live region `table.ts`
 * keeps mounted (see `announcer.ts`). The overlay itself is a node rebuilt
 * per render — silent by construction, exactly the shape `announcer.ts`'s own
 * docstring warns about — so the biggest moment on this table was the one
 * moment a screen reader never heard. Result and score comma-joined, same
 * discipline as `describeHandOutcome`: an atomic region reads it as one
 * statement, and the headline's own punctuation is not spoken anyway.
 * Deliberately NOT routed through the hand-outcome announcer: the final hand
 * and the match end land in nearby broadcasts, and two rapid writes to one
 * polite region let the second clobber the first before it is read.
 */
export function describeMatchOutcome(props: MatchOverProps): string {
  const won = props.outcome.winnerIds.includes(props.selfPlayerId);
  const isDraw = props.outcome.winnerIds.length === 0;
  const headline = isDraw ? TABLE_STRINGS.matchOverNeutral : won ? TABLE_STRINGS.matchWon : TABLE_STRINGS.matchLost;
  return `${headline}, ${finalScoreLine(props)}`;
}
