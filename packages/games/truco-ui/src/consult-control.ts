import type { Action } from "@hexdev/truco-engine";
import { TABLE_STRINGS } from "./strings.js";

/**
 * ASKING YOUR PARTNER WHAT THEY MAKE OF A CALL.
 *
 * WHERE IT SITS, and it is the one design decision worth arguing here: beside
 * the señas toggle, showing the SAME remaining count. Asking and signalling
 * spend one budget (truco-engine's `consult.ts` charges a seña for a
 * question), so putting them anywhere else on the table would hide the only
 * rule a player has to understand about either. Side by side, spending one
 * visibly costs the other — which teaches the rule better than a label.
 *
 * WHAT IT DOES NOT DO: answer the call. The partner's opinion is an opinion;
 * the response buttons are still there and still the player's. That is the
 * whole shape the feature was asked for in — "que el compañero responda sí o
 * no y el humano termina de definir la respuesta".
 *
 * The reply is PRIVATE and arrives out of band (`MatchRoom` sends it to the
 * asking client alone), so it is passed in rather than derived from the view:
 * nothing in a redacted view could carry it without carrying it to everyone.
 */
export interface ConsultControlProps {
  /** The partner's answer, once it has arrived. `null` before asking and
   * after the answer has had its time. */
  readonly advice: "quiero" | "no-quiero" | null;
  /** True between the click and the answer landing. */
  readonly asking: boolean;
}

function adviceText(advice: "quiero" | "no-quiero"): string {
  return advice === "quiero" ? TABLE_STRINGS.consultQuiero : TABLE_STRINGS.consultNoQuiero;
}

/**
 * The OFFER — one item inside the partner picker, beside the six señas.
 *
 * It sits in there rather than beside it because the picker's own toggle is
 * the allowance: one button, one number, and the ways to spend it revealed
 * together. Two controls counting the same budget were tried twice and read
 * as two budgets both times.
 */
export function renderConsultOffer(
  container: HTMLElement,
  legalActions: readonly Action[],
  dispatch: (action: Action) => void,
  props: ConsultControlProps,
): void {
  const offer = legalActions.find((action) => action.type === "consult-partner");
  if (offer === undefined) return;

  const button = container.appendChild(document.createElement("button"));
  button.type = "button";
  button.className = "hexdev-truco-consult-toggle";
  button.dataset.action = "consult-partner";
  button.textContent = props.asking ? TABLE_STRINGS.consultAsking : TABLE_STRINGS.consultToggle;
  button.disabled = props.asking;
  button.addEventListener("click", () => {
    dispatch(offer);
  });
}

/**
 * The ANSWER, and it lives OUTSIDE the picker on purpose.
 *
 * Asking is frequently what spends the last of the allowance, and the picker
 * closes on the click either way — so a reply rendered inside it would be a
 * reply nobody sees. It hangs beside the toggle instead, where it outlives
 * both the popover and the offer that paid for it.
 */
export function renderConsultAdvice(container: HTMLElement, props: ConsultControlProps): void {
  if (props.advice === null) return;

  const said = container.appendChild(document.createElement("span"));
  said.className = "hexdev-truco-consult-advice";
  said.dataset.advice = props.advice;
  said.textContent = `${TABLE_STRINGS.consultAdvicePrefix} ${adviceText(props.advice)}`;
}
