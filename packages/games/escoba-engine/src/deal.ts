import type { Card } from "./card.js";
import type { HandState, MatchState, Team } from "./state.js";
import { applyOpeningEscoba } from "./escoba.js";

const CARDS_PER_PLAYER = 3;
const TABLE_OPENING_SIZE = 4;

/**
 * Deals `cardsPerSeat` cards to each of `seatCount` seats ONE AT A TIME,
 * round-robin — art. 6.1's own words: "tres a cada uno, DE A UNA".
 *
 * THE DECISION: for the SAME shuffled permutation, round-robin dealing
 * (card 1 -> seat 0, card 2 -> seat 1, ..., card N -> seat 0 again)
 * produces a DIFFERENT hand than dealing three CONSECUTIVE cards per seat
 * (`truco-module/src/deal.ts:53`'s `deck.slice(seat*3, seat*3+3)`). Both
 * are uniform draws over a uniform shuffle — neither is "wrong" — but they
 * are not the same function, and a replay's hands depend on which one runs.
 * Truco's regulation is silent on dealing order, so its consecutive-block
 * convention was an arbitrary, equally valid choice. Escoba's is NOT
 * silent — "de a una" — so this engine follows the literal text instead.
 */
function dealHandsRoundRobin(source: readonly Card[], seatCount: number, cardsPerSeat: number): { hands: Card[][]; rest: readonly Card[] } {
  const hands: Card[][] = Array.from({ length: seatCount }, () => []);
  for (let round = 0; round < cardsPerSeat; round += 1) {
    for (let seat = 0; seat < seatCount; seat += 1) {
      hands[seat]!.push(source[round * seatCount + seat]!);
    }
  }
  return { hands, rest: source.slice(seatCount * cardsPerSeat) };
}

function emptyPiles(teams: readonly [Team, Team]): HandState["piles"] {
  return { [teams[0].id]: [], [teams[1].id]: [] };
}

function emptyEscobas(teams: readonly [Team, Team]): HandState["escobas"] {
  return { [teams[0].id]: 0, [teams[1].id]: 0 };
}

/**
 * The opening deal (art. 6.1): 3 cards per player round-robin from an
 * already-shuffled `deck`, 4 face up on the table, remainder to stock —
 * design §D3's "one shuffle per hand ... a pure function of one
 * permutation". Shuffling is NOT this engine's job: the caller owns the
 * entropy (`RandomSource` comes from the host, per platform-contract) and
 * design §D3 wants the whole 40-card permutation carried as replayable DATA
 * on the `start-hand` action — so `deal` only materializes a deck the
 * caller already shuffled, it never shuffles one itself.
 */
export function deal(state: MatchState, deck: readonly Card[]): MatchState {
  const seatCount = state.players.length;
  const { hands, rest } = dealHandsRoundRobin(deck, seatCount, CARDS_PER_PLAYER);
  const players = state.players.map((player, seat) => ({ ...player, hand: hands[seat]! }));
  const table = rest.slice(0, TABLE_OPENING_SIZE);
  const stock = rest.slice(TABLE_OPENING_SIZE);

  const hand: HandState = {
    table,
    stock,
    piles: emptyPiles(state.teams),
    escobas: emptyEscobas(state.teams),
    // Art. 6.1: the seat to the dealer's right acts first. Same rightward
    // rotation `capture.ts`'s `nextTurnPlayerId` continues turn by turn
    // once play begins (`escoba/el-turno-no-avanzaba`).
    turn: players[(state.dealerSeat + 1) % seatCount]!.id,
    lastCapturer: null,
    outcome: null,
  };

  // art. 16.1/16.2 (Unit G, `escoba.ts`): the opening table may already be
  // an escoba de muestra (single 15, dealer sweeps) or a void double escoba
  // (15+15 partition, no sweep, no score) before a single card is played.
  return applyOpeningEscoba({ ...state, players, hand });
}

/**
 * The mid-hand re-deal (art. 6.1: "guardando el sobrante para los repartos
 * sucesivos" — same stock, NO reshuffle): 3 cards per player, round-robin,
 * and NEVER more to the table. Everything else in `hand` carries over
 * unchanged; only `stock` shrinks and the players' hands refill.
 */
export function redeal(state: MatchState): MatchState {
  const hand = state.hand;
  if (hand === null) {
    throw new Error("redeal: no hand in progress to re-deal into");
  }
  const seatCount = state.players.length;
  const { hands, rest } = dealHandsRoundRobin(hand.stock, seatCount, CARDS_PER_PLAYER);
  const players = state.players.map((player, seat) => ({ ...player, hand: hands[seat]! }));

  return { ...state, players, hand: { ...hand, stock: rest } };
}
