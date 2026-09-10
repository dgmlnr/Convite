import { ceilingFor, raisesFrom } from "./bids.js";
import type { Bid, MatchState, PlayerId } from "./state.js";

/**
 * A legal move for the seat in turn during the `bidding` phase (SDD
 * `mentiroso`, work unit B2, design D2): raise to a strictly greater bid, or
 * doubt the current one. Rolling is never on this list — like every sibling
 * engine's own system action (`generala-engine/src/legal-actions.ts`'s own
 * "rolling is not on this list and never will be"), the opening draw and the
 * per-round roll both enter through `requestMentirosoSystemAction`
 * (`mentiroso-module`, Phase 3 of `sdd/mentiroso/tasks`), never through a
 * player action offered here.
 */
export type MentirosoAction =
  | { readonly type: "raise"; readonly playerId: PlayerId; readonly bid: Bid }
  | { readonly type: "doubt"; readonly playerId: PlayerId };

/**
 * Everything the seat in turn may do right now (mentiroso-rules, design D2),
 * adopting `bids.ts`'s own fenced `ceilingFor`/`raisesFrom` (work unit A3)
 * rather than re-deriving the lattice or the ceiling a second time.
 *
 * ONLY THE SEAT IN TURN HAS ACTIONS ("sólo el asiento en turno tiene
 * acciones", `convite/mentiroso/reglas-decididas`). Every other seat gets an
 * empty list — looked up by `Player.id`, never by array position, the same
 * lookup discipline `seating.ts`'s own `nextActiveSeat` already documents for
 * this package.
 *
 * THE OPENING OF A ROUND HAS NO PRIOR BID (`state.phase.bid === null`), so
 * there is nothing yet to doubt — the ruleset never offers a doubt before a
 * first bid exists. `raisesFrom(null, ceiling)` already enumerates every
 * opening bid from quantity 1 through the ceiling; this returns exactly that,
 * with no `doubt` appended.
 *
 * THE CEILING FORCES EXACTLY ONE ACTION WITHOUT A SEPARATE CHECK HERE. Once a
 * bid exists, `raisesFrom` returns an EMPTY array the instant `bid` already
 * equals `ceilingFor(state)` (`bids.ts`'s own fenced mechanism, work unit
 * A3's own docblock: "that empty result is this unit's own fenced mechanism:
 * the ceiling forces exactly the doubt action downstream"). Appending
 * `doubt` below then yields precisely `[{ type: "doubt", ... }]` — the
 * ruleset's own "única jugada forzada del juego" — with no redundant
 * `if (raises.length === 0)` branch that could drift from `bids.ts`'s own
 * guarantee.
 *
 * ANY PHASE OTHER THAN `bidding` offers nothing here: the opening draw and
 * the per-round roll are system actions the module resolves (Phase 3), and
 * `showdown` has no player action to offer either — it resolves
 * automatically the instant the doubt that triggered it is applied (work
 * unit 2.3's job, not this one's).
 */
export function getLegalActions(state: MatchState, playerId: PlayerId): readonly MentirosoAction[] {
  if (state.phase.kind !== "bidding") return [];
  const { turnSeat, bid } = state.phase;

  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined || player.seat !== turnSeat) return [];

  const ceiling = ceilingFor(state);
  const raises: MentirosoAction[] = raisesFrom(bid, ceiling).map((raise) => ({ type: "raise", playerId, bid: raise }));

  if (bid === null) return raises; // opening a round: nothing yet to doubt
  return [...raises, { type: "doubt", playerId }];
}
