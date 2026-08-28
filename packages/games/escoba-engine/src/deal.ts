import { buildDeck } from "./deck.js";
import type { Card } from "./card.js";
import type { HandState, MatchState, Team } from "./state.js";
import { applyOpeningEscoba } from "./escoba.js";

/**
 * Entropy in `[0, 1)`, `Math.random`-shaped — mirrors platform-contract's
 * `RandomSource` byte-for-byte, re-declared LOCALLY because escoba-engine
 * is L0 and cannot import it (`l0-game-engine-no-workspace-deps`, Slice C).
 * Calling an INJECTED parameter is still pure: ESLint bans calling
 * `Math.random` itself, not accepting a substitute as an argument.
 */
export type Rng = () => number;

const CARDS_PER_PLAYER = 3;
const TABLE_OPENING_SIZE = 4;

/** Fisher-Yates over the real 40-card deck, driven entirely by the injected
 * `rng` — mirrors `truco-module/src/deal.ts:26-33`. This engine never calls
 * `Math.random`/`crypto` itself (ESLint-enforced); a later slice's module
 * layer supplies entropy the same way truco-module's own factory does. */
function shuffledDeck(rng: Rng): Card[] {
  const deck = [...buildDeck()];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

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
 * The opening deal (art. 6.1): ONE shuffle with the injected `rng`, 3 cards
 * per player round-robin, 4 face up on the table, remainder to stock —
 * design §D3's "one shuffle per hand ... a pure function of one
 * permutation".
 */
export function deal(state: MatchState, rng: Rng): MatchState {
  const seatCount = state.players.length;
  const shuffled = shuffledDeck(rng);
  const { hands, rest } = dealHandsRoundRobin(shuffled, seatCount, CARDS_PER_PLAYER);
  const players = state.players.map((player, seat) => ({ ...player, hand: hands[seat]! }));
  const table = rest.slice(0, TABLE_OPENING_SIZE);
  const stock = rest.slice(TABLE_OPENING_SIZE);

  const hand: HandState = {
    table,
    stock,
    piles: emptyPiles(state.teams),
    escobas: emptyEscobas(state.teams),
    // Provisional: the seat to the dealer's right acts first. Turn ADVANCE
    // is Unit E/F's concern — this slice only needs a valid starting
    // `PlayerId`; nothing in D.1-D.5 reads or asserts this value.
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
