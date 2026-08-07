import type { PlayerView, TeamId } from "@hexdev/truco-engine";
import { TABLE_STRINGS } from "./strings.js";

/** A hand that JUST ended, between two consecutive view snapshots — the
 * point-in-time moment worth acknowledging (spec: "who won it and how many
 * points it was worth, clearly, before play moves on"). Never re-derives
 * truco's own scoring rules: `winnerTeamId` and `pointsDelta` are both read
 * straight off the engine-provided view. */
export interface HandOutcomeEvent {
  readonly winnerTeamId: TeamId;
  readonly pointsDelta: number;
}

/**
 * Compares two consecutive `PlayerView` snapshots and derives whether a hand
 * ended on THIS transition — no legality or scoring is re-judged here.
 *
 * A hand can end two ways, and only ONE of them flips `hand.outcome.decided`:
 *  - card play decides the hand (`resolveHandWinner`, engine-side) — the
 *    winner is `hand.outcome.winnerTeamId`.
 *  - a truco call is declined (spec: "Decline terminates the hand
 *    immediately") — `hand.outcome.decided` is untouched by a decline
 *    (truco-chain.ts only flips `hand.truco.status` to `"declined"`), so
 *    that transition is watched separately; the winner is
 *    `hand.truco.callingTeamId` (the team that was NOT declined against).
 *
 * `dealerSeat` unchanged is the guard against re-announcing: once the next
 * hand has already been dealt (`dealerSeat` rotates — see
 * `truco-engine/match.ts`'s `rotateDealer`), the ending moment already
 * passed and this returns `null` rather than re-deriving it from a stale
 * comparison.
 */
export function deriveHandOutcomeEvent(previous: PlayerView | null, current: PlayerView): HandOutcomeEvent | null {
  if (previous === null) return null;
  if (previous.dealerSeat !== current.dealerSeat) return null;

  const prevHand = previous.hand;
  const currHand = current.hand;
  if (prevHand === null || currHand === null) return null;

  const justDecidedByPlay = !prevHand.outcome.decided && currHand.outcome.decided;
  const justDeclined = prevHand.truco.status !== "declined" && currHand.truco.status === "declined";
  if (!justDecidedByPlay && !justDeclined) return null;

  const winnerTeamId = justDecidedByPlay
    ? (currHand.outcome as { readonly decided: true; readonly winnerTeamId: TeamId }).winnerTeamId
    : (currHand.truco as { readonly status: "declined"; readonly callingTeamId: TeamId }).callingTeamId;

  const previousScore = previous.teams.find((team) => team.id === winnerTeamId)?.score ?? 0;
  const currentScore = current.teams.find((team) => team.id === winnerTeamId)?.score ?? 0;

  return { winnerTeamId, pointsDelta: currentScore - previousScore };
}

export interface HandOutcomeBannerProps {
  readonly event: HandOutcomeEvent;
  readonly wonBySelf: boolean;
}

/**
 * Renders the transient hand-end acknowledgement — a real, solid-background
 * banner (never dimmed with `opacity` over the cloth, same lesson as the
 * card/turn-badge treatments), cleared by `table.ts`'s own timer, not by
 * this function. `null` clears it back to empty, matching
 * `renderPendingCallBanner`'s own `:empty { display: none }` convention.
 */
export function renderHandOutcomeBanner(container: HTMLElement, props: HandOutcomeBannerProps | null): void {
  container.replaceChildren();
  container.className = "hexdev-truco-hand-outcome";
  if (props === null) {
    delete container.dataset.result;
    return;
  }
  container.dataset.result = props.wonBySelf ? "won" : "lost";

  const headline = document.createElement("span");
  headline.className = "hexdev-truco-hand-outcome-headline";
  headline.textContent = props.wonBySelf ? TABLE_STRINGS.wonHand : TABLE_STRINGS.lostHand;
  container.appendChild(headline);

  const points = document.createElement("span");
  points.className = "hexdev-truco-hand-outcome-points";
  points.textContent = TABLE_STRINGS.handPoints(props.event.pointsDelta);
  container.appendChild(points);
}
