import type { PlayerId, TeamId } from "@hexdev/escoba-engine";
import type { TeamScore } from "./scoreboard.js";

/**
 * Structurally identical to `platform-contract`'s `MatchOutcome`
 * (`{winnerIds: readonly PlayerId[]}`) — `escoba-ui` is L1 and does not
 * depend on `platform-contract` (design §D1). Mirrors `truco-ui`'s own
 * `match-outcome.ts` in SHAPE only, deliberately not imported from it:
 * escoba must not know truco exists.
 */
export interface MatchOutcomeInfo {
  readonly winnerIds: readonly PlayerId[];
}

export interface MatchOverProps {
  readonly outcome: MatchOutcomeInfo;
  readonly selfPlayerId: PlayerId;
  readonly teams: readonly TeamScore[];
  readonly selfTeamId: TeamId;
  readonly onPlayAgain: () => void;
  /** A rematch and a return to the lobby are deliberately NOT the same
   * callback. Omitted: no leave button, no Escape handler. */
  readonly onLeaveMatch?: () => void;
  /** True only on the render that OPENS the overlay (mirrors `truco-ui`'s
   * `focusOnOpen` convention) — the caller tracks that transition. */
  readonly focusOnOpen?: boolean;
}

/** Drives both the visible score line and the spoken sentence below, so the
 * two can never diverge. */
function finalScoreLine(props: MatchOverProps): string {
  return `Resultado final: ${props.teams.map((team) => `${team.id === props.selfTeamId ? "Nosotros" : "Rival"} ${team.score}`).join(" — ")}`;
}

function headlineFor(props: MatchOverProps): string {
  if (props.outcome.winnerIds.length === 0) return "Partida finalizada";
  return props.outcome.winnerIds.includes(props.selfPlayerId) ? "¡Ganaste la partida!" : "Perdiste la partida";
}

/**
 * The end-of-match overlay (slice R2): who won, the final score, and the way
 * out — "the most disruptive thing this UI does" (design), so it gets real
 * modal semantics. Focus moves here on the render that opens it; Escape IS
 * the way out (there is nothing left to cancel back to), calling the same
 * `onLeaveMatch` the button does. Both are skipped without a leave target.
 * `outcome === null` clears the overlay (`:empty { display: none }`); the
 * table beneath it stays visible, never a blank replace.
 */
export function renderMatchOverOverlay(container: HTMLElement, props: MatchOverProps | null): void {
  container.replaceChildren();
  container.className = "hexdev-escoba-match-over";
  container.onkeydown = null;
  if (props === null) {
    delete container.dataset.result;
    container.removeAttribute("tabindex");
    return;
  }

  const isDraw = props.outcome.winnerIds.length === 0;
  const won = props.outcome.winnerIds.includes(props.selfPlayerId);
  container.dataset.result = isDraw ? "unknown" : won ? "won" : "lost";
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-modal", "true");
  container.tabIndex = -1;

  const headline = document.createElement("h2");
  headline.className = "hexdev-escoba-match-over-headline";
  headline.textContent = headlineFor(props);
  container.appendChild(headline);

  const score = document.createElement("p");
  score.className = "hexdev-escoba-match-over-score";
  score.textContent = finalScoreLine(props);
  container.appendChild(score);

  const actions = document.createElement("div");
  actions.className = "hexdev-escoba-match-over-actions";
  const playAgain = document.createElement("button");
  playAgain.type = "button";
  playAgain.dataset.action = "play-again";
  playAgain.textContent = "Jugar de nuevo";
  playAgain.addEventListener("click", props.onPlayAgain);
  actions.appendChild(playAgain);

  if (props.onLeaveMatch !== undefined) {
    const leave = document.createElement("button");
    leave.type = "button";
    leave.dataset.action = "leave-match";
    leave.textContent = "Volver al lobby";
    leave.addEventListener("click", props.onLeaveMatch);
    actions.appendChild(leave);

    container.onkeydown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      props.onLeaveMatch!();
    };
  }
  container.appendChild(actions);

  if (props.focusOnOpen === true) container.focus();
}

/** The same ending as ONE spoken sentence, for a caller-mounted `aria-live`
 * region (mirrors `scoreboard.ts`'s own `describeHandBreakdown`). Same
 * headline/score text the overlay paints — the two can never disagree. */
export function describeMatchOutcome(props: MatchOverProps): string {
  return `${headlineFor(props)}, ${finalScoreLine(props)}`;
}
