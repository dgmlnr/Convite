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
