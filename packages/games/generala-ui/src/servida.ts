import { SERVIDA_ROLL } from "@hexdev/generala-engine";
import type { PlayerView } from "@hexdev/generala-engine";

import { ensureServidaStyles } from "./servida-styles.js";

/**
 * The sentence, and why it lists the three boxes rather than saying "los
 * juegos mayores valen más".
 *
 * "Juego mayor" is the term this ruleset uses and a player who already knows
 * the game reads it fine; a player who does not has been handed a second
 * piece of jargon to explain the first. The three names are on the planilla
 * two inches away, so naming them points AT something on the same screen.
 *
 * GENERALA AND GENERALA DOBLE ARE ABSENT ON PURPOSE, and their absence is the
 * rule rather than an omission. A generala on the opening throw wins outright
 * — `applyRoll` never reaches `deciding` with one — so its box has no servida
 * value at all (`JUEGOS_MAYORES`'s `servida: null`), and the doble is
 * reachable only armada for the same reason. Listing them here would promise
 * two numbers that cannot happen.
 */
const SERVIDA_NOTE = "Servida: en esta tirada la escalera, el full y el póker valen más.";

/**
 * SERVIDA, SAID OUT LOUD ON THE SCREEN.
 *
 * THE DEFECT THIS EXISTS FOR is that the rule is fully implemented and
 * completely unnamed. The planilla previews 25 for an escalera on the first
 * throw and 20 on the second, so the CONSEQUENCE is on screen and correct —
 * and a player who does not know the rule reads the 25 as what an escalera is
 * worth, then meets the 20 as if something had gone wrong. Worse, the rule is
 * the one that makes the opening throw a decision at all: keeping a mediocre
 * servida escalera against re-rolling for something better is a real choice,
 * and it cannot be made by somebody who does not know the 25 is about to
 * expire.
 *
 * IT IS SHOWN TO EVERY SEAT, not only to the one on turn. A rival on a
 * servida throw can take 45 for a póker, which changes what this seat leaves
 * open for them; hiding it would make this a private hint rather than a fact
 * about the table, and Generala redacts nothing (D6).
 *
 * IT READS `SERVIDA_ROLL` FROM THE ENGINE, never a `1` typed here. The
 * threshold is a rule of this game and the engine owns it — `scoreFor` reads
 * the same constant to decide 25 against 20 — so a copy in this file would be
 * a second source of truth about the rule this surface exists to NAME, and
 * the two could disagree while both looked right.
 *
 * `servida-win` DRAWS NOTHING, and that falls out of the phase rather than
 * being a case handled here: a match won off the cup is not in `deciding`, so
 * there is no throw whose boxes are worth more and nothing left to score. The
 * announcer says what happened instead.
 */
export function renderServidaCallout(container: HTMLElement, view: PlayerView): void {
  const doc = container.ownerDocument;
  ensureServidaStyles(doc);

  const turn = view.turn;
  if (turn.phase !== "deciding" || turn.rollsUsed !== SERVIDA_ROLL) {
    container.replaceChildren();
    return;
  }

  const note = doc.createElement("p");
  note.className = "hexdev-generala-servida";
  note.textContent = SERVIDA_NOTE;
  container.replaceChildren(note);
}
