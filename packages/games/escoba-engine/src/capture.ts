import { cardId } from "./card.js";
import type { Card } from "./card.js";
import { cardValue } from "./values.js";
import type { PlayerId } from "./ids.js";
import type { HandState, MatchState, Player } from "./state.js";

/**
 * design §D4. The action carries the captured subset — the player CHOOSES
 * it (settled product decision 4, `escoba/decisiones-de-producto`), this
 * engine only VALIDATES it. `captured: []` means "the played card stays
 * face up"; it is legal ONLY when the played card forms no 15 at all —
 * see the rejection table below.
 */
export interface PlayCardAction {
  readonly type: "play-card";
  readonly playerId: PlayerId;
  readonly card: Card;
  readonly captured: readonly Card[];
}

/**
 * Re-declared locally, same shape as `platform-contract`'s `RuleViolation`/
 * `ApplyResult` (`contract.ts:42-49`) but NOT imported — escoba-engine is
 * L0, mirrors `truco-engine/src/card-play.ts`'s own local `ApplyCardPlayResult`.
 * `code` is a closed union (not a bare string) so a caller can switch on it
 * without parsing `message`.
 */
export interface RuleViolation {
  readonly code: "not-on-turn" | "not-in-hand" | "not-on-table" | "not-fifteen" | "capture-declined";
  readonly message: string;
}

export type ApplyResult =
  | { readonly ok: true; readonly state: MatchState }
  | { readonly ok: false; readonly violation: RuleViolation };

const FIFTEEN = 15;

function findPlayer(state: MatchState, playerId: PlayerId): Player | undefined {
  return state.players.find((player) => player.id === playerId);
}

/**
 * True iff SOME subset of `table` has a capture-value sum of exactly
 * `target`. A small forward DP over reachable sums in `[0, target]` —
 * bounded by `target <= 14` regardless of how large the table gets (design
 * §M1's own 20-card ceiling), so this stays cheap even at the table's
 * structural maximum. This is an EXISTENCE check only, not an enumeration:
 * listing every such subset is `getLegalActions`'s job (Unit F), not this
 * validator's.
 */
function someSubsetSumsTo(table: readonly Card[], target: number): boolean {
  if (target < 0) return false;
  let reachable = new Set<number>([0]);
  for (const tableCard of table) {
    const value = cardValue(tableCard);
    const next = new Set(reachable);
    for (const sum of reachable) {
      const candidate = sum + value;
      if (candidate <= target) next.add(candidate);
    }
    reachable = next;
  }
  return reachable.has(target);
}

function sumValues(cards: readonly Card[]): number {
  return cards.reduce((total, next) => total + cardValue(next), 0);
}

/** Every `captured` card must be present on the table, each at most once
 * (no capturing the same physical card twice in one action). */
function isSubsetOfTable(captured: readonly Card[], table: readonly Card[]): boolean {
  const tableIds = new Set(table.map(cardId));
  const seen = new Set<string>();
  for (const capturedCard of captured) {
    const id = cardId(capturedCard);
    if (!tableIds.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

function reject(code: RuleViolation["code"], message: string): ApplyResult {
  return { ok: false, violation: { code, message } };
}

/**
 * Pure reducer for a played card (design §D4). VALIDATES the declared
 * `captured` subset; never chooses one. Under art. 21.2 / pagat, capture and
 * stay-on-table are MUTUALLY EXCLUSIVE per played card:
 *
 *   captured forms 15 with the played card       -> ACCEPT, capture
 *   captured is [] and SOME subset forms 15       -> REJECT capture-declined
 *   captured is [] and NO subset forms 15          -> ACCEPT, stays face up
 *   captured is non-empty but not on the table     -> REJECT not-on-table
 *   captured is non-empty but sums wrong           -> REJECT not-fifteen
 *
 * A player MAY legally hold a capturing card and play a different,
 * non-forming one instead — that is tactics (`escoba/reglas-verificadas`),
 * not a foul; nothing here inspects the REST of the hand, only the played
 * card and the declared subset.
 *
 * Turn advancement, mid-hand re-deal (design §D3), escoba detection
 * (Unit G) and scoring (Unit I) are deliberately OUT of this slice's scope
 * — `hand.turn`/`hand.escobas` are carried through unchanged.
 */
export function applyAction(state: MatchState, action: PlayCardAction): ApplyResult {
  const hand: HandState | null = state.hand;
  if (hand === null) {
    return reject("not-on-turn", "no hand is in progress");
  }
  if (hand.turn !== action.playerId) {
    return reject("not-on-turn", `it is not ${action.playerId}'s turn`);
  }
  const player = findPlayer(state, action.playerId);
  const inHand = player !== undefined && player.hand.some((handCard) => cardId(handCard) === cardId(action.card));
  if (player === undefined || !inHand) {
    return reject("not-in-hand", `${cardId(action.card)} is not in ${action.playerId}'s hand`);
  }

  if (action.captured.length > 0) {
    if (!isSubsetOfTable(action.captured, hand.table)) {
      return reject("not-on-table", "every captured card must be present on the table, each at most once");
    }
    if (sumValues(action.captured) + cardValue(action.card) !== FIFTEEN) {
      return reject("not-fifteen", "the captured subset plus the played card must sum to exactly 15 (art. 22.1)");
    }
  } else if (someSubsetSumsTo(hand.table, FIFTEEN - cardValue(action.card))) {
    // art. 21.2: "El que pudiendo levantar quince con la carta jugada y no
    // lo hace, faculta de hecho al adversario para recoger dicha baza." —
    // the played card COULD capture; declining is not a legal option.
    return reject("capture-declined", "this card forms 15 with the table — it must capture, it cannot stay face up");
  }

  const players = state.players.map((candidate) =>
    candidate.id === player.id ? { ...candidate, hand: candidate.hand.filter((c) => cardId(c) !== cardId(action.card)) } : candidate,
  );

  if (action.captured.length === 0) {
    // no subset forms 15 with this card: it joins the table, face up.
    return {
      ok: true,
      state: { ...state, players, hand: { ...hand, table: [...hand.table, action.card] } },
    };
  }

  const capturedIds = new Set(action.captured.map(cardId));
  const table = hand.table.filter((tableCard) => !capturedIds.has(cardId(tableCard)));
  const piles = { ...hand.piles, [player.teamId]: [...hand.piles[player.teamId], ...action.captured, action.card] };
  // art. 14.1: a capture that empties the table entirely is an in-play
  // escoba, worth one point — DISTINCT from escoba de muestra (16.1/16.2,
  // `escoba.ts`), which fires on the opening table before any card is played.
  const escobas = table.length === 0 ? { ...hand.escobas, [player.teamId]: hand.escobas[player.teamId] + 1 } : hand.escobas;

  return {
    ok: true,
    state: { ...state, players, hand: { ...hand, table, piles, escobas, lastCapturer: player.teamId } },
  };
}
