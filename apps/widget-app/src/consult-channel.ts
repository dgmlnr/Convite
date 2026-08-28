import type { ConsultAskMessage } from "@hexdev/transport-colyseus-client";

/**
 * THE CONSULT'S CLIENT-SIDE STATE, extracted out of `main.ts` so it can be
 * fenced.
 *
 * `main.ts` carries a docblock calling itself thin and saying "there is no
 * production LOGIC here that isn't already covered where it lives". That was
 * true when it was written and stopped being true when the consult landed:
 * the routing below decides WHICH CHANNEL a player's press travels on, and
 * the transitions decide when an opinion stops being worth showing. Neither
 * fact exists anywhere else — the renderer is a pure function of what it is
 * handed and knows nothing about channels; the transport moves messages and
 * knows nothing about action types. A composition root is allowed to be
 * untested when it only composes. This had stopped only composing.
 *
 * Extracted rather than tested in place, following this repo's own precedent:
 * `apps/server/src/registry.ts` was split out of `index.ts` for exactly the
 * same reason. Every function here is pure, so the fence never needs a live
 * connection, an iframe, or a socket.
 */

export type ConsultAdvice = "quiero" | "no-quiero";

export interface ConsultState {
  readonly advice: ConsultAdvice | null;
  readonly asking: boolean;
  readonly from: "partner" | "fallback" | null;
}

/** No question in flight and no opinion worth showing. */
export const CONSULT_IDLE: ConsultState = { advice: null, asking: false, from: null };

export type ActionRoute = "consult" | "consult-answer" | "action";

/**
 * WHICH CHANNEL A PRESS TRAVELS ON, and this is the only layer that can
 * decide it: the renderer hands back whatever the player pressed, and only
 * the layer holding the connection knows that a question travels separately
 * from a move.
 *
 * Reads the `type` defensively because the renderer's callback is typed
 * `unknown` — anything that is not one of the two questions is a move, which
 * is the safe default: an unroutable value reaches the engine, which rejects
 * what it does not recognise, rather than being silently swallowed here.
 */
export function routeAction(action: unknown): ActionRoute {
  const type = (action as { readonly type?: unknown } | null | undefined)?.type;
  if (type === "consult-partner") return "consult";
  if (type === "consult-answer") return "consult-answer";
  return "action";
}

/** The question went out; the answer has not come back. */
export function consultOnAsk(): ConsultState {
  return { advice: null, asking: true, from: null };
}

/**
 * The answer came back. `advice` is validated rather than trusted: it arrives
 * off the wire, and anything that is not one of the two legal words becomes
 * `null` — an absent opinion, never a rendered one nobody can act on.
 */
export function consultOnAdvice(advice: unknown, from: "partner" | "fallback"): ConsultState {
  return { advice: advice === "quiero" || advice === "no-quiero" ? advice : null, asking: false, from };
}

/**
 * A NEW VIEW ENDS THE CONVERSATION. Any view means the table moved — the call
 * was answered, or the hand went on — and an opinion about a decision that is
 * no longer open is worse than none.
 *
 * The exception is the view the consult ITSELF produces: opening one spends a
 * seña, so it broadcasts, and that view arrives while the question is still in
 * flight. Clearing on it would drop the answer before it landed. `asking` is
 * exactly that "still in flight" flag, which is why this returns the state
 * untouched while it is set.
 */
export function consultOnView(current: ConsultState): ConsultState {
  return current.asking ? current : CONSULT_IDLE;
}

/**
 * The partner's own outstanding question, cleared on the SERVER's word rather
 * than on a local flag: `pendingConsult` going away is the one authoritative
 * fact that no consult is open for any seat. Loose `== null` on purpose —
 * absent and explicitly-null both mean closed.
 */
export function askOnView(current: ConsultAskMessage | null, pendingConsult: unknown): ConsultAskMessage | null {
  return pendingConsult == null ? null : current;
}
