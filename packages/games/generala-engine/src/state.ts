import type { DieFace, Dice } from "./dice.js";
import type { PlayerId } from "./ids.js";

/**
 * The eleven boxes of the scorecard, in the order a printed one lists them:
 * the six upper boxes, then the four juegos mayores, then the doble.
 *
 * Eleven, not ten, is the structural consequence of the chosen ruleset
 * (`convite/generala/reglas-decididas`, the popular set): generala doble exists
 * as its own box. The upper section is named in English because those boxes are
 * just the numbers; the lower ones keep their Spanish names because that is what
 * they are CALLED — the same call `escoba-engine` makes for `setenta` and
 * `escoba`.
 */
export type CategoryId =
  | "ones"
  | "twos"
  | "threes"
  | "fours"
  | "fives"
  | "sixes"
  | "escalera"
  | "full"
  | "poker"
  | "generala"
  | "generala-doble";

/**
 * The same eleven, as a value.
 *
 * A union cannot be iterated, and several things downstream must iterate the
 * boxes in a fixed order: enumerating the legal `score` actions, building an
 * empty card, rendering a scorecard's rows. Declared once here so those never
 * disagree, and so a twelfth box is one edit rather than four.
 */
export const CATEGORY_IDS: readonly CategoryId[] = [
  "ones",
  "twos",
  "threes",
  "fours",
  "fives",
  "sixes",
  "escalera",
  "full",
  "poker",
  "generala",
  "generala-doble",
];

/**
 * One seat's card. `null` is an OPEN box; a number is a filled one, and a filled
 * box never reopens — including a box filled at 0, which is what crossing out
 * IS. That is why the open marker is `null` and not `0`: "nobody has written
 * here yet" and "written here, worth nothing" are different facts, and a game
 * that conflated them would let a crossed-out box be scored again.
 */
export type Scorecard = Readonly<Record<CategoryId, number | null>>;

/**
 * Where the turn is, and it is the phase that says what may happen next.
 *
 * `awaiting-roll` carries POSITIONAL SLOTS rather than kept indices (D1). A
 * `null` slot is a die that will be re-rolled, so `5 - kept.length` is
 * structurally the null count and the entropy budget is a property OF the state
 * instead of an arithmetic claim ABOUT it. Indices alone cannot be spliced: this
 * arm would also have to carry the previous dice, and the two fields could then
 * disagree about which face survived.
 *
 * `servida-win` is the one derived-looking fact that legitimately IS a field
 * (D2): a generala on the opening roll wins outright, before anything is written
 * to any scorecard, so it leaves no other trace to derive it from. Folding it
 * into this union rather than parking a `servidaWinnerSeat` beside `turn` is the
 * `mahjong-solitaire-engine/src/board.ts:126-127` argument: two fields can
 * disagree — "deciding" AND "already won" would be representable — while a union
 * arm makes that state unconstructible.
 */
export type Turn =
  | {
      readonly phase: "awaiting-roll";
      readonly seat: number;
      readonly rollsUsed: number;
      readonly slots: readonly (DieFace | null)[];
    }
  | {
      readonly phase: "deciding";
      readonly seat: number;
      readonly rollsUsed: number;
      readonly dice: Dice;
    }
  | { readonly phase: "servida-win"; readonly seat: number };

/**
 * A whole match, and what is deliberately NOT in it.
 *
 * `players` and `cards` are PARALLEL ARRAYS of the same length: a seat index IS
 * a position in both, and no rule in this engine indexes a literal 0 or 1 (D11).
 * That is the whole of what makes the engine N-seat — turn advance is
 * `(seat + 1) % players.length`, and a three- or four-seat table is an additive
 * registration needing zero change here.
 *
 * THERE IS NO `total`, NO `matchOver`, NO `winner`, NO `servida` AND NO
 * `dobleUnlocked` FIELD, and there is not going to be one. Every one of them is
 * derivable — a total sums the filled boxes, "over" is every card full, the
 * winner is the argmax, servida is `rollsUsed === 1` read at scoring time, and
 * the doble's unlock is read off `card.generala`. `mahjong-solitaire-engine`
 * makes the same call for `won`/`lost`/`deadlocked` and for the same reason: a
 * stored copy is a second source of truth that can drift from the first, and
 * every producer of a state then has to remember to maintain it.
 * `state.test.ts`'s key round trip is what holds this — it asserts the whole key
 * set over a state `createMatch` built, so a field naming a derived fact is
 * caught by its PRESENCE rather than by somebody noticing it went stale.
 */
export interface MatchState {
  readonly players: readonly PlayerId[];
  readonly cards: readonly Scorecard[];
  readonly turn: Turn;
}

/** A fresh card: every box open, and a distinct object every time. */
function emptyScorecard(): Scorecard {
  const card: Partial<Record<CategoryId, number | null>> = {};
  for (const category of CATEGORY_IDS) card[category] = null;
  return card as Scorecard;
}

/**
 * Open a match for these seats, in this order.
 *
 * Seat order is the argument's order and is fixed for the whole match. The
 * opening turn is `awaiting-roll`, which is what makes the first roll arrive
 * without anybody asking for it: no seat has a legal action in that phase, the
 * transport's `anySeatCanAct` therefore reads false, and it requests the system
 * action that rolls the cup — the same shape `mahjong-solitaire-module` uses to
 * lay its board.
 *
 * The empty-seat check is the reason this is a function rather than an object
 * literal at the call site, the same reason `layBoard` gives for its own length
 * check: the opening turn names seat 0, so a table with nobody at it would be
 * structurally invalid the instant it was built. The seat list is copied for
 * that function's other stated reason — a caller keeping its array and writing
 * to it later would be writing into a `readonly` state.
 */
export function createMatch(playerIds: readonly PlayerId[]): MatchState {
  if (playerIds.length === 0) throw new Error("a Generala match needs at least one seat: the opening turn names seat 0");
  return {
    players: [...playerIds],
    cards: playerIds.map(() => emptyScorecard()),
    turn: { phase: "awaiting-roll", seat: 0, rollsUsed: 0, slots: [null, null, null, null, null] },
  };
}
