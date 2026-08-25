import type { JsonValue } from "@hexdev/platform-contract";
import type { Action } from "@hexdev/truco-engine";

/**
 * WHETHER TO ASK YOUR PARTNER ABOUT AN ENVIDO YOU WERE ABOUT TO PASS ON.
 *
 * ONE HELPER, NOT THREE, for the same reason `chooseEnvidoDeclaration` is one
 * helper: the tiers differ in how they BET, and this is not a bet. It is the
 * bookkeeping of a question — have I asked, was I answered, what did they say
 * — and three copies of that would be three places for one rule to rot rather
 * than three difficulty levels. What each tier keeps is its own opinion about
 * whether it wanted the envido in the first place; this only ever runs after
 * that opinion came out negative.
 *
 * CALLED ONLY WHEN THE TIER WOULD OTHERWISE PASS. A hand that already
 * justifies the call gets called: spending a seña to be told what you had
 * already decided is the same waste as not asking when you needed to.
 *
 * THE THREE STATES OF `answer`, and why they are three and not two:
 *
 *   undefined  never asked        -> ask, if the question is affordable
 *   "quiero"   they want it       -> open it, which is the whole point
 *   anything   they answered, no  -> let it go, and do NOT ask again
 *
 * That last row includes `null` — asked, and no answer came back. Collapsing
 * it into `undefined` is the bug this shape exists to prevent: a bot holding
 * the floor decides repeatedly, so "no answer means I never asked" spends the
 * entire per-hand budget of three on one question, and then the seat has no
 * señas left for the rest of the hand.
 *
 * NOT OFFERED TO THE EASY TIER (see `easy.ts`). Buying information and using
 * it is exactly the kind of thing that should separate a weak bot from a
 * competent one — and a difficulty level that plays the channel as well as
 * the hard tier is not a difficulty level.
 */
export function askPartnerAboutEnvido(legalActions: readonly Action[], answer: JsonValue | null | undefined): Action | undefined {
  const call = legalActions.find((action) => action.type === "call-envido");
  if (call === undefined) return undefined;
  if (answer === "quiero") return call;
  if (answer !== undefined) return undefined; // answered, and it was not yes
  return legalActions.find((action) => action.type === "consult-partner");
}
