/**
 * mentiroso-engine — pure L0 domain (design D1-D7): no workspace imports, no
 * wall clock, no direct randomness — every random draw enters through
 * `requestMentirosoSystemAction` in `mentiroso-module`, never here (the same
 * boundary `l0-game-engine-no-workspace-deps` in `.dependency-cruiser.cjs`
 * enforces by glob for every `packages/games/*-engine`).
 *
 * COMPLETED in SDD `mentiroso` work unit 2.1 (`sdd/mentiroso/tasks`): `Phase`,
 * `MatchState`, and `createMatch` land here, adopting `seating.ts` (unit A2)
 * and `dice.ts`/`bids.ts` (unit A3).
 *
 * `Bid` MOVES here from `bids.ts` in this same commit — `Phase`'s
 * `bidding`/`showdown` arms need it, and `bids.ts` importing `Bid` back FROM
 * `state.ts` while `state.ts` imported it FROM `bids.ts` would be a two-file
 * import cycle. `bids.ts` keeps every `Bid`-shaped FUNCTION (`totalDice`,
 * `ceilingFor`, `raisesFrom`); this file keeps every `Bid`-shaped TYPE —
 * exactly the split `sdd/mentiroso/design`'s own Interfaces section already
 * draws: `Bid` sits beside `Player`/`Phase` in that section's single type
 * block, ahead of the function signatures.
 */

/**
 * Branded locally, not imported from `@hexdev/platform-contract`: this
 * package is L0 and must not know the platform exists — the identical
 * reasoning `truco-engine/src/ids.ts` and `escoba-engine/src/ids.ts` already
 * state for their own copies of this exact brand shape.
 */
export type PlayerId = string & { readonly __brand: "PlayerId" };

/**
 * A standard six-sided die's face, as the RULES see it — never a picture;
 * that is `dice-ui`'s own separately-declared `DieFace`, the same
 * duplication `generala-engine/src/dice.ts` already argues for. `DIE_FACES`
 * and the derived dice count live in `dice.ts` (work unit A3); this skeleton
 * only needs the type itself, since `Player.dice` must be typed now.
 */
export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * One seat at the table.
 *
 * Seats NEVER shrink and are never removed from a `players` array (design
 * D1): "eliminated" is `dice.length === 0`, derived from this same field,
 * never a separate stored flag — the same no-stored-derivable-field
 * convention `generala-engine` and `mahjong-solitaire-engine` both already
 * follow. `seat` is the stable index `MatchRoom.freeSeat`/`takeOverSeat`,
 * `mentiroso-ui`'s table layout, and the registry's own seat sizing all key
 * off — compacting this array on elimination would break every one of those
 * (design D1's own rejected alternative).
 */
export interface Player {
  readonly id: PlayerId;
  readonly seat: number;
  readonly dice: readonly DieFace[];
}

/**
 * A bid over the table's dice (design D2): "at least `quantity` dice on the
 * table show `face`". Ordering, never a scored quantity — comparisons
 * between two bids are LEXICOGRAPHIC over `(quantity, face)`, never a sum of
 * the two fields (see `bids.ts`'s own `raisesFrom`).
 *
 * MOVED here from `bids.ts` in work unit 2.1 (see this file's own top
 * docblock for why) — no behavior change; `bids.ts` imports it back.
 */
export interface Bid {
  readonly quantity: number;
  readonly face: DieFace;
}

/**
 * Where a match currently stands, and what may legally happen next — design's
 * own Interfaces section, brought into code by this work unit rather than
 * redesigned by it.
 *
 * Each arm is a UNION MEMBER, not one shared object with optional fields —
 * the same argument this package's own `Player` docblock (above) already
 * makes for keeping "eliminated" out of a separate stored flag, and the one
 * `generala-engine/src/state.ts`'s own `Turn` union states directly: two
 * loose fields can disagree (a `bid` present during `opening-draw`, a
 * `contenders` list during `showdown`) while a union arm makes that state
 * unconstructible.
 */
export type Phase =
  | { readonly kind: "opening-draw"; readonly contenders: readonly number[]; readonly lastFaces: readonly DieFace[] }
  | { readonly kind: "awaiting-roll"; readonly openerSeat: number }
  | { readonly kind: "bidding"; readonly turnSeat: number; readonly bid: Bid | null }
  | { readonly kind: "showdown"; readonly bid: Bid; readonly doubterSeat: number; readonly matched: number; readonly loserSeat: number };

/**
 * A whole match. `players` is index-aligned with `Player.seat` exactly like
 * every sibling engine's own `MatchState` (`generala-engine`, `escoba-engine`,
 * `truco-engine`) — turn advance (`seating.ts`) and the ceiling (`bids.ts`)
 * both read seat/dice facts off this ONE array, never a second copy.
 *
 * No `config` field: nothing in `sdd/mentiroso/design` or
 * `convite/mentiroso/reglas-decididas` names a tunable option this ENGINE
 * itself must carry — matches `generala-engine`'s own config-free
 * `MatchState`, whose empty `GeneralaMatchConfig` lives one layer up, at the
 * module (Phase 3 of `sdd/mentiroso/tasks`, not this unit).
 */
export interface MatchState {
  readonly players: readonly Player[];
  readonly phase: Phase;
}

/**
 * How many dice every seat holds when a match opens — the ruleset's own
 * worked example ("6 jugadores × 5 dados",
 * `convite/mentiroso/reglas-decididas`), generalized: EVERY seat count opens
 * with this many, never derived from `seatCount` itself. Named once so "five
 * dice each" is stated in exactly one place — the same discipline
 * `generala-engine/src/state.ts`'s own `ROLLS_PER_TURN` documents for its own
 * magic number.
 */
export const STARTING_DICE_PER_SEAT = 5;

/**
 * The ruleset's own stated range (`convite/mentiroso/reglas-decididas`: "el
 * motor debe soportar 2 a 6 igual") — a RULE, not a platform default:
 * mentiroso is not a game for one player, and not one for seven either.
 */
export const MIN_SEAT_COUNT = 2;
export const MAX_SEAT_COUNT = 6;

/**
 * Open a fresh match for these seats, in this order (work unit 2.1).
 *
 * Takes `playerIds`, not a bare seat COUNT, deliberately — the same shape
 * `generala-engine/src/state.ts`'s own `createMatch(playerIds)` already uses,
 * and the one every module in this repo already calls INTO
 * (`truco-module`'s `createHeadToHeadMatch`, `truco-module`'s
 * `createTeamMatch`): the module layer (`mentiroso-module`, Phase 3) is what
 * knows the REAL `PlayerId` assigned to every seat, off the platform's own
 * `SeatAssignment[]`. Inventing placeholder ids here instead would just be a
 * second, throwaway identity scheme this engine would have to reconcile with
 * the real one later, for no benefit — `sdd/mentiroso/tasks`' own
 * "`createMatch(seatCount) for 2-6`" phrasing describes the supported RANGE,
 * not a literal parameter name; `sdd/mentiroso/design`'s own Interfaces
 * section never fixed this signature at all, unlike `nextActiveSeat`,
 * `ceilingFor`, and `raisesFrom`, which it names exactly.
 *
 * `seatCount` below is simply `playerIds.length` — the range check is what
 * enforces "2 to 6", never the parameter's own name.
 *
 * The opening phase is `opening-draw` with EVERY seat listed as a contender
 * (design D3: "carries `contenders: readonly number[]` (all seats
 * initially)") and `lastFaces` empty — nobody has drawn yet. Every seat opens
 * holding `STARTING_DICE_PER_SEAT` dice, their face values PLACEHOLDERS:
 * never examined, since `opening-draw` declares no secrets (design D4) but
 * nothing reads a seat's dice VALUES until the `bidding` phase, which only
 * exists after the first `awaiting-roll` system action overwrites them
 * (work unit 2.3's job, not this one's).
 */
export function createMatch(playerIds: readonly PlayerId[]): MatchState {
  const seatCount = playerIds.length;
  if (seatCount < MIN_SEAT_COUNT || seatCount > MAX_SEAT_COUNT) {
    throw new Error(`mentiroso requires between ${String(MIN_SEAT_COUNT)} and ${String(MAX_SEAT_COUNT)} seats, got ${String(seatCount)}`);
  }
  const placeholderFace: DieFace = 1;
  return {
    players: playerIds.map((id, seat) => ({
      id,
      seat,
      dice: Array.from({ length: STARTING_DICE_PER_SEAT }, () => placeholderFace),
    })),
    phase: {
      kind: "opening-draw",
      contenders: playerIds.map((_playerId, seat) => seat),
      lastFaces: [],
    },
  };
}
