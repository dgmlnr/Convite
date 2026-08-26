import { cardBackSvg } from "@hexdev/spanish-deck-ui";
import { TABLE_STRINGS } from "./strings.js";

/**
 * Which seat dealt this hand.
 *
 * Derived rather than carried: `PlayerView` gives the mano and nothing else,
 * and the engine's own `manoSeatFor` is the one-line rule that the mano is
 * the seat AFTER the dealer. Inverting it here keeps the view exactly as
 * wide as it is instead of adding a field the UI can work out.
 *
 * WHY THE TABLE CARES. The dealer is the last of their team to speak, which
 * makes them a pie -- and being pie decides who may open the envido
 * (envido-chain.ts). A player who cannot see who dealt cannot see why the
 * option is or is not theirs, so the deck beside a seat is not decoration:
 * it is the visible half of a rule.
 */
export function dealerSeatOf(manoSeat: number, seatCount: number): number {
  return (manoSeat - 1 + seatCount) % seatCount;
}

/**
 * The deck itself, sitting where a dealt deck sits: beside the hand that
 * dealt it. Three backs offset by a hair, so it reads as a stack rather than
 * as one more card in play.
 */
export function renderDeckMarker(host: HTMLElement): void {
  host.replaceChildren();
  host.className = "hexdev-truco-deck";

  for (let i = 0; i < 3; i += 1) {
    const back = host.appendChild(document.createElement("span"));
    back.className = "hexdev-truco-deck-card";
    back.style.setProperty("--i", String(i));
    // The stack is one object to a reader, not three: the label below says
    // what it means, and three "card back" images would say nothing three
    // times.
    back.setAttribute("aria-hidden", "true");
    back.innerHTML = cardBackSvg();
  }

  // WCAG 1.1.1: the deck is a picture of a fact -- this seat dealt, and is
  // therefore its team's pie. A picture-only mark reads as nothing at all.
  const label = host.appendChild(document.createElement("span"));
  label.className = "hexdev-truco-visually-hidden";
  label.textContent = TABLE_STRINGS.dealtHere;
}

/** How long one card takes to land, and the step between cards. Exported and
 * interpolated into the stylesheet so the code that TIMES the deal and the
 * code that DRAWS it can never disagree about when it is over -- the same
 * arrangement the lobby's own greeting uses. */
export const DEAL_CARD_MS = 260;
export const DEAL_STEP_MS = 45;

/** The seats in dealing order, starting with the mano. The dealer serves the
 * player on their left first, which is the mano, and goes round from there. */
export function dealOrderFrom(manoSeat: number, seatCount: number): readonly number[] {
  return Array.from({ length: seatCount }, (_, i) => (manoSeat + i) % seatCount);
}

/**
 * How long the whole deal takes: every seat served three cards, one step
 * apart, plus the last card's own flight.
 *
 * Deliberately SHORT. It runs before every hand, not once on arrival, and a
 * flourish you sit through forty times a match stops being a flourish. It is
 * also well under a bot's own 2400ms thinking floor (truco-bot's latency.ts),
 * which is what makes "the deal blocks the start of the hand" true in
 * practice without the client having to hold the server back.
 */
export function dealDurationMs(seatCount: number): number {
  return (seatCount * 3 - 1) * DEAL_STEP_MS + DEAL_CARD_MS;
}
