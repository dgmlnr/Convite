import type { Action, PlayerView } from "@hexdev/truco-engine";
import { renderCalls } from "./calls.js";
import { renderHand } from "./hand.js";
import { renderOpponentHand } from "./opponent-hand.js";
import { renderPlayedCards } from "./played-cards.js";
import { ensureMatchstickDefs, renderScoreboard } from "./scoreboard.js";
import { ANCHOR_ORDER, resolveSeatPositions } from "./seat-position.js";
import type { TableAnchor } from "./seat-position.js";
import { TABLE_STRINGS } from "./strings.js";
import { ensureTableStyles } from "./table-styles.js";
import { describeTrickOutcome } from "./trick-feedback.js";
import { describeTurn, isMyTurn } from "./turn.js";

function anchorShell(position: TableAnchor): HTMLElement {
  const el = document.createElement("div");
  el.className = "hexdev-truco-anchor";
  el.dataset.position = position;
  return el;
}

/**
 * Builds a fresh renderer with its own ephemeral, per-mount state — closed
 * over rather than stored on the DOM, the same shape `join-flow.ts`'s
 * `createDepartureGate` already established in this codebase. The one thing
 * this state tracks that a single view snapshot cannot: whether the LATEST
 * `trickOutcomes` entry is new since the previous render, which is what
 * makes "obvious who won the trick" (spec) possible even though a resolved
 * trick's `currentTrickPlays` is already empty by the time its view arrives
 * (the engine resolves a trick's second card and clears the trick in the
 * same atomic transition — there is no in-between snapshot to observe).
 */
export function createMatchTableRenderer(): (container: HTMLElement, view: PlayerView, legalActions: readonly Action[], dispatch: (action: Action) => void) => void {
  let previousTrickCount = 0;
  let trickFeedback = "";

  return function render(container: HTMLElement, view: PlayerView, legalActions: readonly Action[], dispatch: (action: Action) => void): void {
    ensureMatchstickDefs(container.ownerDocument);
    ensureTableStyles(container.ownerDocument);

    const others = [...view.teammates, ...view.opponents];
    const seatCount = 1 + others.length;
    const positions = resolveSeatPositions({ mySeat: view.self.seat, seatCount });
    const turnSeat = view.hand?.turnSeat ?? null;

    const trickCount = view.hand?.trickOutcomes.length ?? 0;
    if (trickCount > previousTrickCount) {
      const latest = view.hand!.trickOutcomes[trickCount - 1]!;
      trickFeedback = describeTrickOutcome(view.self.teamId, latest.winnerTeamId);
    } else if ((view.hand?.currentTrickPlays.length ?? 0) > 0) {
      trickFeedback = ""; // a new trick started — the previous banner is stale
    }
    previousTrickCount = trickCount;

    container.replaceChildren();
    container.className = "hexdev-truco-table";
    container.dataset.seatCount = String(seatCount);

    const anchors = new Map<TableAnchor, HTMLElement>();
    for (const anchor of ANCHOR_ORDER) anchors.set(anchor, anchorShell(anchor));

    for (const other of others) {
      const anchor = anchors.get(positions.get(other.seat) ?? "top")!;
      renderOpponentHand(anchor.appendChild(document.createElement("div")), other.cardsRemaining);
      if (turnSeat !== null && turnSeat === other.seat) anchor.classList.add("hexdev-truco-anchor--active");
    }

    const bottom = anchors.get("bottom")!;
    if (turnSeat !== null && isMyTurn(view.self.seat, turnSeat)) bottom.classList.add("hexdev-truco-anchor--active");
    const callsRow = bottom.appendChild(document.createElement("div"));
    callsRow.className = "hexdev-truco-calls-row";
    renderCalls(callsRow, legalActions, dispatch);
    const handRow = bottom.appendChild(document.createElement("div"));
    renderHand(handRow, view.self.hand, legalActions, { onPlayCard: (card) => dispatch({ type: "play-card", playerId: view.self.playerId, card }) });

    const center = document.createElement("div");
    center.className = "hexdev-truco-center";

    const scoreRow = document.createElement("div");
    scoreRow.className = "hexdev-truco-score-row";
    const target = view.config.pointsToWin;
    for (const team of view.teams) {
      const board = scoreRow.appendChild(document.createElement("div"));
      const label = document.createElement("span");
      label.className = "hexdev-truco-team-label";
      label.textContent = team.id === view.self.teamId ? TABLE_STRINGS.us : TABLE_STRINGS.them;
      board.appendChild(label);
      renderScoreboard(board.appendChild(document.createElement("div")), { score: team.score, target });
    }
    center.appendChild(scoreRow);

    const trickArea = center.appendChild(document.createElement("div"));
    renderPlayedCards(trickArea, view.hand?.currentTrickPlays ?? [], positions);

    const feedback = document.createElement("p");
    feedback.className = "hexdev-truco-trick-feedback";
    feedback.textContent = trickFeedback;
    center.appendChild(feedback);

    const turnIndicator = document.createElement("p");
    turnIndicator.className = "hexdev-truco-turn-indicator";
    turnIndicator.textContent = describeTurn(view.self.seat, turnSeat);
    center.appendChild(turnIndicator);

    for (const anchor of ANCHOR_ORDER) container.appendChild(anchors.get(anchor)!);
    container.appendChild(center);
  };
}
