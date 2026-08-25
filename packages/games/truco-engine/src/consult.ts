import type { PlayerId } from "./ids.js";
import { getMatchWinner } from "./match.js";
import type { HandState, MatchState, Player } from "./match.js";
import { getSenasRemaining, hasTeammate, senasSentBy } from "./senas.js";

/**
 * ASKING YOUR PARTNER WHAT THEY THINK OF A CALL.
 *
 * WHAT IT IS AND IS NOT. It is not an answer to the call — the asker still
 * answers it themselves. It is not a claim about anybody's cards either, so
 * it is not a seña. It is a REQUEST, and everything it produces travels
 * outside this engine: the recommendation depends on judgement (what a good
 * player would do with that hand), and judgement is not something a pure
 * reducer has any business inventing. What the engine owns is the only part
 * that is a RULE — whether you may ask, and what asking costs.
 *
 * IT COSTS A SEÑA. Asking and signalling are the same thing seen from two
 * sides: both spend the hand's one budget for learning about your partner's
 * cards, so they spend the SAME budget (MAX_SENAS_PER_HAND, counted per
 * player in `hand.senasSent`). A free consult would have made señas
 * decorative — a partner you can interrogate at will tells you more, more
 * reliably, than any signal ever could.
 *
 * NO STATE OF ITS OWN, deliberately. Everything a later rule could want to
 * know — how many questions this player has left — is already in the counter
 * this action increments. A `hand.consult` field would be a second place for
 * the same fact to live and drift.
 */
export interface ConsultPartnerAction {
  readonly type: "consult-partner";
  readonly playerId: PlayerId;
}

export type ApplyConsultResult =
  | { readonly ok: true; readonly state: MatchState }
  | { readonly ok: false; readonly violation: string };

function findPlayer(state: MatchState, playerId: PlayerId): Player | undefined {
  return state.players.find((player) => player.id === playerId);
}

/**
 * There has to be something to ask ABOUT: a call this player's team owes an
 * answer to. Without that gate the action would be a way to spend a seña on
 * nothing, and — worse — a standing licence to read the partner's hand at any
 * moment of the deal, which is the exact leak the quota exists to price.
 *
 * Mirrors the two chains' own pending rules rather than re-deriving them: a
 * call is answerable by the team that did NOT make it, which is the same test
 * `getLegalTrucoActions` and `getLegalEnvidoActions` apply before offering a
 * response at all.
 */
function owesAnAnswer(hand: HandState, player: Player): boolean {
  if (hand.envido.status === "pending") return player.teamId !== hand.envido.callingTeamId;
  if (hand.truco.status === "pending") return player.teamId !== hand.truco.callingTeamId;
  return false;
}

export function getLegalConsultActions(state: MatchState, playerId: PlayerId): readonly ConsultPartnerAction[] {
  const hand = state.hand;
  if (hand === null || hand.outcome.decided) return [];
  if (getMatchWinner(state) !== null) return [];
  const player = findPlayer(state, playerId);
  if (player === undefined || !hasTeammate(state, player)) return [];
  if (!owesAnAnswer(hand, player)) return [];
  // The SAME question señas ask, through the same function — not a second
  // comparison against the same cap. If the budget is ever re-tuned, or ever
  // stops being a flat per-hand number, this follows without being told.
  if (getSenasRemaining(state, playerId) <= 0) return [];
  return [{ type: "consult-partner", playerId }];
}

/**
 * Spends one of the asker's per-hand allowance. Records nothing else: the
 * recommendation is produced outside the engine (see this module's docblock)
 * and reaches only the asker.
 */
export function applyConsultAction(state: MatchState, action: ConsultPartnerAction): ApplyConsultResult {
  if (getLegalConsultActions(state, action.playerId).length === 0) {
    return { ok: false, violation: `illegal consult-partner action: ${JSON.stringify(action)}` };
  }
  const hand = state.hand!;
  const player = findPlayer(state, action.playerId)!;
  const senasSent = [
    ...hand.senasSent.filter((entry) => entry.playerId !== action.playerId),
    { playerId: player.id, count: senasSentBy(hand, player.id) + 1 },
  ];
  return { ok: true, state: { ...state, hand: { ...hand, senasSent } } };
}
