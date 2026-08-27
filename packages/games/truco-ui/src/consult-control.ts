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
/**
 * The wire's own answer domain (design D10), extracted from the ENGINE
 * rather than retyped — `truco-engine` inlines this exact union in four
 * places and exports no name for it (truco-chain.ts:23, envido-chain.ts:32,
 * match.ts:159/161). Tying it to the engine's own declaration is what makes
 * a third response a COMPILE error in both label maps below at once, rather
 * than a silent gap either could drift into unnoticed.
 */
export type ConsultAnswer = Extract<Action, { type: "respond-truco" }>["response"];

/**
 * TWO LABEL MAPS OVER ONE WIRE DOMAIN, DELIBERATELY (design D10) — two
 * grammatical persons for two roles. The BUTTON is the partner's own voice,
 * imperative, first person: "Dale"/"No". The REPORT is a third-person
 * description of their position: "Quiere"/"No quiere", UNCHANGED. A report
 * describes; a button speaks. Only the button ever sat beside a clickable,
 * identically-worded engine action, so only the button needed new words.
 * Both keyed by the SAME `ConsultAnswer`, so a reader editing one sees the
 * other right beside it.
 */
const CONSULT_ANSWER_LABELS: Record<ConsultAnswer, string> = { quiero: TABLE_STRINGS.consultAnswerYes, "no-quiero": TABLE_STRINGS.consultAnswerNo };
const CONSULT_REPORT_LABELS: Record<ConsultAnswer, string> = { quiero: TABLE_STRINGS.consultQuiero, "no-quiero": TABLE_STRINGS.consultNoQuiero };

export interface ConsultControlProps {
  /** The partner's answer, once it has arrived. `null` before asking and
   * after the answer has had its time. */
  readonly advice: ConsultAnswer | null;
  /** True between the click and the answer landing. */
  readonly asking: boolean;
  /** Honest (the partner's own seat, human or bot) vs a fallback substitute
   * for a silent or departed human (spec: "Provenance Is Disclosed to the
   * Asker") — never presented as the partner's own answer. Optional and
   * additive: every caller that predates Slice 4b omits it and keeps
   * reading the honest report unchanged. */
  readonly from?: "partner" | "fallback" | null;
}

function adviceText(advice: ConsultAnswer): string {
  return CONSULT_REPORT_LABELS[advice];
}

/**
 * The OFFER — one item inside the partner picker, beside the six señas.
 *
 * It sits in there rather than beside it because the picker's own toggle is
 * the allowance: one button, one number, and the ways to spend it revealed
 * together. Two controls counting the same budget were tried twice and read
 * as two budgets both times.
 */
/**
 * WHAT this question is about, read off the same list that makes it legal.
 *
 * The button is offered in two unrelated situations -- owing an answer to a
 * pending call, or being the pie who may open an envido -- and it used to say
 * the same thing in both. Reported from real play: "soy pie de ronda pongo
 * consultar al compañero pero no se si le estoy consultando para cantar el
 * envido o el truco".
 *
 * DERIVED, not passed in. `legalActions` is what the engine already decided,
 * so a label built from it cannot drift from what is actually pending -- and
 * the order below is the order the game cares about: an unanswered call is
 * owed NOW, an envido you could open is merely available.
 */
export function consultLabelFor(legalActions: readonly Action[], about?: string): string {
  if (about === "envido") return TABLE_STRINGS.consultAboutOpeningEnvido;
  if (legalActions.some((action) => action.type === "respond-truco")) return TABLE_STRINGS.consultAboutTruco;
  if (legalActions.some((action) => action.type === "respond-envido")) return TABLE_STRINGS.consultAboutEnvido;
  if (legalActions.some((action) => action.type === "call-envido")) return TABLE_STRINGS.consultAboutOpeningEnvido;
  return TABLE_STRINGS.consultToggle;
}

export function renderConsultOffer(
  container: HTMLElement,
  legalActions: readonly Action[],
  dispatch: (action: Action) => void,
  props: ConsultControlProps,
): void {
  // ONE BUTTON PER QUESTION. Both windows can be open at the same instant --
  // a call on the table you owe an answer to, and an envido you could put on
  // it first -- and a single button could only ever ask one of them. Reported
  // from real play: "me canta truco la mano, pero en las consultas no puedo
  // consultar para saber si canto el envido esta primero o doy respuesta
  // directa al truco". Each costs its own seña, because each is a question.
  const offers = legalActions.filter((action) => action.type === "consult-partner");
  if (offers.length === 0) return;

  for (const offer of offers) {
    const button = container.appendChild(document.createElement("button"));
    button.type = "button";
    button.className = "hexdev-truco-consult-toggle";
    button.dataset.action = "consult-partner";
    button.dataset.about = (offer as { readonly about?: string }).about ?? "";
    button.textContent = props.asking ? TABLE_STRINGS.consultAsking : consultLabelFor(legalActions, (offer as { readonly about?: string }).about);
    button.disabled = props.asking;
    button.addEventListener("click", () => {
      dispatch(offer);
    });
  }
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
  // `data-from`, not only the prefix in the text: the same distinction two
  // ways, matching this package's own "text alone is not enough" discipline.
  const from = props.from ?? "partner";
  said.dataset.from = from;
  const prefix = from === "fallback" ? TABLE_STRINGS.consultAdviceFallbackPrefix : TABLE_STRINGS.consultAdvicePrefix;
  said.textContent = `${prefix} ${adviceText(props.advice)}`;
}

/**
 * THE ASK, on the PARTNER'S OWN SCREEN (design D9's third role) — the
 * surface the button vocabulary above exists for.
 *
 * ISOLATED IN ITS OWN GROUP, `data-role="consult-ask"`, whose buttons carry
 * `data-answer` and NEVER `data-action` — the structural half of the
 * spec's own belt-and-braces mitigation. `onAnswer` is a callback of its
 * own, never the action bar's `dispatch`: even a caller that mis-wired
 * everything else could not make a click in this group read as a real,
 * binding action, because nothing here speaks that vocabulary at all.
 *
 * NO COUNTDOWN of its own (design D9: "the asker's badge already carries
 * the only clock") — a question and two buttons, nothing else.
 */
export interface ConsultAskProps {
  readonly about: string | undefined;
  readonly options: readonly ConsultAnswer[];
}

export function renderConsultAsk(
  container: HTMLElement,
  legalActions: readonly Action[],
  props: ConsultAskProps,
  onAnswer: (answer: ConsultAnswer) => void,
): void {
  const group = container.appendChild(document.createElement("div"));
  group.className = "hexdev-truco-consult-ask";
  group.dataset.role = "consult-ask";

  const question = group.appendChild(document.createElement("p"));
  question.className = "hexdev-truco-consult-ask-question";
  question.textContent = consultLabelFor(legalActions, props.about);

  for (const option of props.options) {
    const button = group.appendChild(document.createElement("button"));
    button.type = "button";
    button.className = "hexdev-truco-consult-answer";
    button.dataset.answer = option;
    button.textContent = CONSULT_ANSWER_LABELS[option];
    button.addEventListener("click", () => {
      onAnswer(option);
    });
  }
}
