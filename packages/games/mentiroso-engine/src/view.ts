import type { DieFace, MatchState, Phase, PlayerId } from "./state.js";

/**
 * mentiroso-engine's per-seat redaction (SDD `mentiroso`, work unit B5/task
 * 2.5, design D4): `getViewFor` is the per-seat PROJECTION, and `secretsFor`
 * is the phase-dependent declaration of what that projection must never hand
 * a viewer about anyone else. The two are kept in agreement by construction —
 * `secretsFor` only ever names a value `getViewFor` already knows how to
 * withhold — the same split `escoba-engine/src/view.ts` and
 * `truco-engine/src/view.ts` already draw between their own `getViewFor` and
 * their module's own `hiddenState.secretsFor`.
 *
 * `secretsFor` HAS NO `HiddenState<TState>` TYPE ANNOTATION and imports
 * NOTHING from `@hexdev/platform-contract` — this package is L0
 * (`l0-game-engine-no-workspace-deps`) and must not know the platform exists,
 * the same reasoning `violation.ts`'s own docblock states for its local
 * `ApplyResult`. Its signature is duck-typed to match
 * `HiddenState<MatchState>["secretsFor"]` exactly (`PlayerId` here is the
 * SAME branded shape `state.ts`'s own docblock already states is shared,
 * structurally, with `truco-engine`/`escoba-engine`'s own copies), so
 * `mentiroso-module` (Phase 3, work unit C2) can hand this function straight
 * to `hiddenState: { kind: "hidden-per-seat", secretsFor }` with no adapter —
 * "shared not copied", design D4's own reason for keeping ONE `secretsFor`
 * rather than one per registered seat count.
 *
 * PHASE-DEPENDENT, per design D4's own table — and this is the requirement's
 * own non-obvious half:
 *
 * | Phase          | Secrets                                            |
 * |----------------|-----------------------------------------------------|
 * | `opening-draw` | none — the draw is public, everyone sees who rolled |
 * | `bidding`      | every OTHER active seat's dice array                 |
 * | `showdown`     | none — the reveal IS the rule                        |
 *
 * Declaring a secret at `showdown` would red the conformance scan on a
 * CORRECT reveal (design D4); declaring one at `opening-draw` would do the
 * same over placeholder dice nobody has rolled yet (`state.ts`'s own
 * `createMatch` docblock: "nothing reads a seat's dice VALUES until the
 * bidding phase").
 */
export function secretsFor(state: MatchState, viewer: PlayerId): readonly unknown[] {
  if (state.phase.kind !== "bidding") return [];
  // TWO TRAPS THIS CLOSES, both from `HiddenState`'s own "declare the
  // smallest value that is still uniquely identifying" note:
  //
  // 1. ARRAY-VALUED, NEVER A BARE SCALAR: the secret is `player.dice` itself
  //    (`[3, 3, 5]`), never one of its faces — a bare `3` would coincidentally
  //    match the viewer's own die, their own dice count, their own seat, or a
  //    bid's quantity, and a scalar-secret scan would misreport all four as
  //    leaks (mentiroso-hidden-dice's own "coincidental scalar match"
  //    scenario).
  // 2. EMPTY ARRAYS EXCLUDED: an eliminated seat's `dice` is `[]` (design D1),
  //    and `[]` deep-equals every empty array anywhere in a view — declaring
  //    it would false-positive on a correctly redacted, unrelated empty list.
  //    `dice.length > 0` is this exclusion; deleting it reintroduces exactly
  //    that false positive the instant any seat is eliminated.
  return state.players.filter((player) => player.id !== viewer && player.dice.length > 0).map((player) => player.dice);
}

/**
 * A rival's projection during `bidding` (mentiroso-hidden-dice: R-RIVAL-SHAPE)
 * — EXACTLY these three fields, under any name, and nothing else. `seat` is
 * public table geometry (the UI needs it to place a rival at the right
 * anchor), never hidden information, the same distinction
 * `truco-engine/src/view.ts`'s own `OpponentView` docblock draws for its own
 * `seat` field.
 */
export interface RivalView {
  readonly seat: number;
  readonly playerId: PlayerId;
  readonly diceCount: number;
}

/**
 * A rival's projection once `dice` has become public (showdown only) —
 * strictly wider than `RivalView`, never narrower, so the bidding-phase key
 * check (`{seat, playerId, diceCount}` exactly) still holds for the OTHER
 * arm of this union.
 */
export interface RevealedRivalView extends RivalView {
  readonly dice: readonly DieFace[];
}

export interface SelfView {
  readonly playerId: PlayerId;
  readonly seat: number;
  /** The viewer's OWN dice, always visible to themselves regardless of
   * phase — a seat's own dice are never a secret FROM that seat. */
  readonly dice: readonly DieFace[];
}

/**
 * Per-seat projection (design D4). `phase` is passed through UNREDACTED: no
 * arm of `Phase` (`state.ts`) carries a per-seat dice field, so nothing there
 * needs withholding — the same "public unless a field can structurally hold
 * hidden data" discipline `truco-engine/src/view.ts` documents for its own
 * `hand.truco`/`hand.envido`.
 */
export interface PlayerView {
  readonly self: SelfView;
  readonly rivals: readonly (RivalView | RevealedRivalView)[];
  readonly phase: Phase;
}

/**
 * Build `viewerId`'s own view of `state` (design D4).
 *
 * REVEAL IS A SINGLE BOOLEAN, GATED ON THE PHASE ALONE: `state.phase.kind ===
 * "showdown"`. Every OTHER phase (`opening-draw`, `awaiting-roll`, `bidding`)
 * withholds a rival's `dice` field entirely — never present under any name,
 * a compile-time guarantee `RivalView`'s own three-field shape gives, mirrors
 * `truco-engine/src/view.ts`'s own "a redaction bug is a COMPILE ERROR, not a
 * runtime leak" for `OpponentView`.
 */
export function getViewFor(state: MatchState, viewerId: PlayerId): PlayerView {
  const self = state.players.find((player) => player.id === viewerId);
  if (self === undefined) {
    throw new Error(`unknown player: ${viewerId}`);
  }

  const reveal = state.phase.kind === "showdown";
  const rivals: readonly (RivalView | RevealedRivalView)[] = state.players
    .filter((player) => player.id !== self.id)
    .map((player) =>
      reveal
        ? { seat: player.seat, playerId: player.id, diceCount: player.dice.length, dice: player.dice }
        : { seat: player.seat, playerId: player.id, diceCount: player.dice.length },
    );

  return {
    self: { playerId: self.id, seat: self.seat, dice: self.dice },
    rivals,
    phase: state.phase,
  };
}
