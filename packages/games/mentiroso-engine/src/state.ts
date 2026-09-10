/**
 * mentiroso-engine — pure L0 domain (design D1-D7): no workspace imports, no
 * wall clock, no direct randomness — every random draw enters through
 * `requestMentirosoSystemAction` in `mentiroso-module`, never here (the same
 * boundary `l0-game-engine-no-workspace-deps` in `.dependency-cruiser.cjs`
 * enforces by glob for every `packages/games/*-engine`).
 *
 * THIS FILE IS A TYPE SKELETON (SDD `mentiroso`, work unit A2): `Player` and
 * `DieFace` are exported and consumed by nothing yet — `seating.ts`'s
 * `nextActiveSeat` is this unit's only executable code, and it needs exactly
 * this much of `Player` to compile against. `Bid`, `Phase`, `MatchState`, and
 * the reducers over them (see `sdd/mentiroso/design`'s Interfaces section)
 * land in later work units once `dice.ts`/`bids.ts` exist (unit A3 onward).
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
