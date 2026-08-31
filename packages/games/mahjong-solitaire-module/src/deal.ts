import { LAYOUT, isFree } from "@hexdev/mahjong-solitaire-engine";
import type { MatchKey, TileId } from "@hexdev/mahjong-solitaire-engine";
import type { PlayerId, RandomSource } from "@hexdev/platform-contract";
import { idsByMatchKey, pairKeys } from "./wall.js";

/** No human actor submits this — mirrors `escoba-module/src/deal.ts`'s own
 * sentinel, which mirrors `truco-module`'s. */
export const SYSTEM_ACTOR_ID = "__system__" as PlayerId;

/**
 * The finished board, as DATA. `placements[i]` is the tile at `LAYOUT[i]`.
 *
 * The engine stays pure and free of randomness (its own eslint glob forbids
 * `Math.random` outright); this module owns the entropy, because `RandomSource`
 * arrives from the host. Exactly the split `escoba-module`'s `start-hand`
 * already has with `escoba-engine`, and design D7 asks for by name: the deal
 * travels as an ordinary action, and the engine only materializes it.
 */
export interface DealBoardAction {
  readonly type: "deal-board";
  readonly playerId: PlayerId;
  readonly placements: readonly TileId[];
}

/**
 * One pair of positions, in the order the generator's own solution takes them
 * off the board. `a` and `b` are indices into `LAYOUT`, and `a` is ALWAYS the
 * lower one — which is not decoration: `RemovePairAction`'s own docblock in the
 * engine promises the same thing, and `getLegalActions` only ever emits pairs
 * that way, so a step recorded in the other order names a move the engine will
 * refuse. Found by replaying a solution through the module rather than by
 * reading either file (`module.test.ts`).
 */
export interface SolutionStep {
  readonly a: number;
  readonly b: number;
}

/**
 * What the generator produced AND how it got there. Only `placements` ever
 * leaves this module — see `dealBoard` below.
 */
export interface GeneratedDeal {
  readonly placements: readonly TileId[];
  readonly solution: readonly SolutionStep[];
}

/**
 * DIFFICULTY IS THIS FUNCTION, and that is why it has a name and a docblock
 * instead of being a `Math.floor(rng() * free.length)` buried inside the loop
 * below.
 *
 * Every board this generator can produce is solvable; what varies between an
 * easy board and a cruel one is WHICH free position the generator reaches for
 * at each step. Uniformly at random — what ships — spreads matching pairs
 * across the whole board and across the stack. A policy biased towards the
 * deepest free position would bury pairs under each other and make the same
 * layout much harder; one biased towards the outside would make it much
 * easier. Nobody has chosen a difficulty for this game yet, so the policy that
 * ships is the neutral one, WRITTEN DOWN — an unnamed expression inside the
 * loop is how difficulty becomes an accident instead of a decision. No lobby
 * selector exists (out of scope); the day one does, this is a function swap.
 *
 * IT ALWAYS DRAWS, EVEN WHEN THERE IS NOTHING TO CHOOSE. A one-element list
 * still costs one value. That is what makes the deal's entropy budget a
 * property of the ALGORITHM rather than of the layout's shape or of the seed,
 * and the budget is the fence that isolates a search (`deal.test.ts`).
 */
export function chooseFreePosition(free: readonly number[], rng: RandomSource): number {
  const chosen = free[Math.floor(rng() * free.length)];
  if (chosen === undefined) {
    throw new Error("mahjong-solitaire deal: no free position to choose from — the generator painted itself into a corner");
  }
  return chosen;
}

/** Fisher-Yates, the same shape `escoba-module/src/deal.ts:22-29` uses. Draws
 * exactly one value per element after the first: 71 for the 72 pair keys. */
function shuffledPairKeys(rng: RandomSource): MatchKey[] {
  const keys = pairKeys();
  for (let i = keys.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [keys[i], keys[j]] = [keys[j]!, keys[i]!];
  }
  return keys;
}

/**
 * Two positions that can be taken off `remaining` TOGETHER.
 *
 * Any two distinct positions that are both free with respect to the same
 * occupancy can be removed as one move, so the only thing that has to be
 * guaranteed is that two of them exist at every step. This is where that is
 * guaranteed, and it is the reason the generator peels from the TOP:
 *
 *   - Let Z be the highest layer still occupied. Nothing can cover a tile on
 *     Z, so a tile there is free as soon as one of its side columns is clear.
 *     Take the one with the smallest x: its left column can only be blocked by
 *     a tile on Z at `x-2` or `x-1`, and there is none, so it is free. Take the
 *     one with the largest x: symmetrically, its right column is clear. Two
 *     distinct tiles whenever Z holds two, and if every tile on Z shares one x
 *     then all of them have both columns clear and all of them are free. So
 *     `|free on the top layer| >= 2` whenever the top layer holds two tiles.
 *   - When the top layer is down to a SINGLE tile, that tile is free (nothing
 *     above it, no neighbour on its own layer) and its partner has to come
 *     from below. That case has no proof behind it — it is measured in
 *     `deal.test.ts` over sixty boards — and `chooseFreePosition` throws
 *     loudly rather than quietly dealing a broken board.
 *
 * Because a step always empties the top layer or shrinks it by two, the layers
 * come off in order and the endgame is always a single uncovered layer, where
 * the smallest-x and largest-x argument above applies unconditionally.
 */
function takeSolvablePair(remaining: ReadonlySet<number>, rng: RandomSource): readonly [number, number] {
  let topLayer = -1;
  for (const index of remaining) {
    if (LAYOUT[index].z > topLayer) topLayer = LAYOUT[index].z;
  }

  const freeOnTop: number[] = [];
  const freeAnywhere: number[] = [];
  for (const index of remaining) {
    if (!isFree(index, remaining)) continue;
    freeAnywhere.push(index);
    if (LAYOUT[index].z === topLayer) freeOnTop.push(index);
  }

  const first = chooseFreePosition(freeOnTop, rng);
  const partners = (freeOnTop.length >= 2 ? freeOnTop : freeAnywhere).filter((index) => index !== first);
  return [first, chooseFreePosition(partners, rng)];
}

/**
 * A board built backwards out of a solution, so that it has one BY
 * CONSTRUCTION.
 *
 * NOTHING HERE SEARCHES, and that is the whole point. Deciding whether an
 * arbitrary mahjong-solitaire board can be finished is NP-complete (de Bondt,
 * arXiv:1203.6559), so a generator that deals at random and then checks is
 * either wrong or expensive, and one that deals-checks-redeals is unbounded.
 * This asks the question the other way round: it walks a legal solution over
 * ANONYMOUS positions — at every step taking two positions that are free
 * together — and only then decides which pair of faces goes where. The
 * sequence it walked is a solution to the board it hands back, by definition,
 * so solvability is never computed at all.
 *
 * There is no recursion below, no backtracking, no retry and no rejection
 * loop. Every step consumes exactly two random values and the shuffle consumes
 * exactly 71, which is what `deal.test.ts`'s entropy budget pins.
 */
export function generateDeal(rng: RandomSource): GeneratedDeal {
  const keys = shuffledPairKeys(rng);
  const pools = idsByMatchKey();
  const placements: TileId[] = new Array<TileId>(LAYOUT.length);
  const solution: SolutionStep[] = [];

  const remaining = new Set<number>(LAYOUT.map((_position, index) => index));
  for (const key of keys) {
    const [a, b] = takeSolvablePair(remaining, rng);
    const pool = pools.get(key);
    if (pool === undefined || pool.length < 2) {
      throw new Error(`mahjong-solitaire deal: match key "${key}" ran out of faces`);
    }
    placements[a] = pool.pop()!;
    placements[b] = pool.pop()!;
    solution.push(a < b ? { a, b } : { a: b, b: a });
    remaining.delete(a);
    remaining.delete(b);
  }
  return { placements, solution };
}

/**
 * The deal as the transport receives it: the finished placement and nothing
 * else.
 *
 * THE SOLUTION NEVER ENTERS STATE. The order `generateDeal` walked is what
 * proves the board solvable, and it is dropped here — so no `applyAction` can
 * store it, no `getViewFor` can leak it, and no serialized match can carry it.
 * A hint feature would have to re-derive one, which is exactly the cost the
 * spec wants it to have.
 */
export function dealBoard(rng: RandomSource): DealBoardAction {
  return { type: "deal-board", playerId: SYSTEM_ACTOR_ID, placements: generateDeal(rng).placements };
}
