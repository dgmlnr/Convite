import { DIE_FACES } from "./dice.js";
import { getLegalActions } from "./legal-actions.js";
import type { MentirosoAction } from "./legal-actions.js";
import { nextActiveSeat } from "./seating.js";
import type { DieFace, MatchState } from "./state.js";
import { reject } from "./violation.js";
import type { ApplyResult } from "./violation.js";

/**
 * mentiroso-engine's reducers (SDD `mentiroso`, work unit B3/task 2.3):
 * `applyOpeningDrawRoll` resolves one opening-draw system action (design D3),
 * and `applyRaise` resolves one seated player's "raise" (design D2).
 *
 * ONLY THESE TWO. Both are exported and consumed by nothing outside this
 * package's own tests yet — the same "introduce, then adopt" split this
 * chain has followed since work unit A3 (`AGENTS.md`'s own "Introducir, y
 * despues adoptar"). "doubt" is a THIRD action `legal-actions.ts` already
 * offers (work unit B2), and this file deliberately does not implement it:
 * transitioning "bidding" into "showdown" needs the exact-face tally design
 * assigns to `showdown.ts` (work unit 2.4, not yet built) — `Phase`'s own
 * "showdown" arm has no partial shape to transition into, only a
 * fully-populated one (`bid`/`doubterSeat`/`matched`/`loserSeat` all at
 * once), so wiring "doubt" one field short of that would either fabricate a
 * tally this unit was never assigned to compute, or ship the half-guard
 * `AGENTS.md`'s own "Entrega" section already names as worse than no PR at
 * all ("nunca de una forma que embarque una guarda a medias"). Work unit 2.4
 * adopts this file by adding the "doubt" reducer once its own tally exists.
 *
 * Neither reducer receives `rng`, and neither can materialize a roll. Every
 * random draw is charged ONE layer up, in `mentiroso-module` (work unit C1,
 * not yet built, mirroring `generala-module/src/roll.ts`'s own
 * `requestGeneralaSystemAction`) — this file only INTERPRETS an
 * already-drawn `faces` array, the identical split
 * `generala-engine/src/roll.ts`'s own `applyRoll(state, faces)` already
 * demonstrates for its own re-thrown dice.
 */

/**
 * Resolve one opening-draw system action (design D3, mentiroso-hidden-dice's
 * own "re-roll tied seats" requirement).
 *
 * `faces` carries EXACTLY one already-drawn face per CURRENT contender, in
 * the SAME order as `state.phase.contenders` — index-aligned, never keyed by
 * seat number directly, mirroring `generala-engine/src/roll.ts`'s own
 * positional splice against `turn.slots`. The caller (`mentiroso-module`'s
 * future `requestMentirosoSystemAction`, work unit C1) is the one that calls
 * `rng()` — exactly `state.phase.contenders.length` times, per design D3 —
 * and this reducer only interprets the result; it never draws anything.
 *
 * GAIN THE HIGHEST FACE; IF TWO OR MORE TIE FOR IT, RE-ENTER THE SAME PHASE
 * WITH ONLY THE TIED SEATS AS THE NEW `contenders` (ruleset: "se vuelve a
 * tirar entre los empatados"). One survivor exits into `awaiting-roll` with
 * that seat as `openerSeat`. There is no fixed bound on how many times this
 * can be called in a row (design D3's own "no engine cap" — the ruleset
 * itself declares none, "hasta que quede uno") — what IS bounded, per call,
 * is the draw count, which is exactly what `wrong-face-count` fences. THE
 * NUMBER OF ACTIONS STAYS UNBOUNDED ON PURPOSE: this function is called once
 * per system action, never looped internally with its own retry budget —
 * looping here would collapse the per-action rng count this whole design
 * exists to keep derivable.
 *
 * `lastFaces` on a re-entered `opening-draw` phase holds the faces from THIS
 * draw, index-aligned with the INCOMING `contenders` (before narrowing) —
 * the pairing a UI needs to show "seat X rolled Y" for the draw that just
 * happened, since `contenders` itself is about to shrink to the tied subset.
 */
export function applyOpeningDrawRoll(state: MatchState, faces: readonly DieFace[]): ApplyResult {
  if (state.phase.kind !== "opening-draw") {
    return reject(
      "not-opening-draw",
      `an opening-draw roll can only be applied during the opening draw, and this match is ${state.phase.kind}`,
    );
  }

  const { contenders } = state.phase;
  if (faces.length !== contenders.length) {
    return reject(
      "wrong-face-count",
      `the opening draw has ${String(contenders.length)} contenders and the roll carried ${String(faces.length)} faces`,
    );
  }

  // Same runtime half of a compile-time promise `generala-engine/src/roll.ts`
  // already states for its own `DieFace` parameter: the union is erased at
  // runtime, so a second producer (a bot, a replay, a state migration) could
  // hand this reducer a value outside the six real faces.
  const malformed = faces.findIndex((face) => !DIE_FACES.includes(face));
  if (malformed !== -1) {
    return reject(
      "malformed-face",
      `a die shows one of ${String(DIE_FACES.length)} faces, and this roll carried ${String(faces[malformed])} at position ${String(malformed)}`,
    );
  }

  // `contenders` is non-empty by construction: `createMatch` seeds it with
  // every seat (>= MIN_SEAT_COUNT, so >= 2), and the ONLY way this phase is
  // ever re-entered is with 2+ tied survivors below — a persisted
  // `opening-draw` state can never carry zero contenders, so `faces[0]` is
  // always defined here.
  const topFace = faces.reduce((max, face) => (face > max ? face : max), faces[0]!);
  const survivors = contenders.filter((_seat, index) => faces[index] === topFace);

  if (survivors.length === 1) {
    return { ok: true, state: { ...state, phase: { kind: "awaiting-roll", openerSeat: survivors[0]! } } };
  }

  return { ok: true, state: { ...state, phase: { kind: "opening-draw", contenders: survivors, lastFaces: faces } } };
}

/** The one action `applyRaise` accepts — narrowed off `legal-actions.ts`'s
 * own `MentirosoAction` union rather than re-declared, so the two files
 * cannot drift into two different shapes for the same action. */
type RaiseAction = Extract<MentirosoAction, { readonly type: "raise" }>;

/**
 * True iff `action` is one `getLegalActions` would actually offer this seat
 * right now — RE-USES `legal-actions.ts`'s own function rather than
 * re-deriving turn gating or the lattice a second time, the identical
 * discipline `truco-engine/src/truco-chain.ts`'s own `isLegalTruco` already
 * applies against its own `getLegalTrucoActions`: two independently-written
 * gates can drift apart from each other, and reusing the one that already
 * exists cannot.
 */
function isLegalRaise(state: MatchState, action: RaiseAction): boolean {
  return getLegalActions(state, action.playerId).some(
    (legal) => legal.type === "raise" && legal.bid.quantity === action.bid.quantity && legal.bid.face === action.bid.face,
  );
}

/**
 * Resolve one seated player's "raise" (design D2, mentiroso-rules' own bid
 * lattice) — the "bid submission reducer" (work unit B3/task 2.3).
 *
 * ACCEPTS EXACTLY WHAT `getLegalActions` OFFERS AND NOTHING ELSE: validated
 * through `isLegalRaise` above, never through a hand-rolled comparison
 * against `raisesFrom`/`ceilingFor` directly — the same defence
 * `truco-chain.ts`'s own `applyTrucoAction` already takes against its own
 * `getLegalTrucoActions`, so this reducer's notion of "legal" and
 * `legal-actions.ts`'s own notion of "legal" cannot independently disagree.
 *
 * TURN ADVANCES TO THE NEXT SEAT STILL HOLDING DICE, never a bare `+1` —
 * `nextActiveSeat` (work unit A2, `seating.ts`) gets its FIRST real consumer
 * here: introduced exported and unconsumed in A2, adopted in this unit, the
 * same "introduce, then adopt" split this whole chain already follows.
 */
export function applyRaise(state: MatchState, action: RaiseAction): ApplyResult {
  if (state.phase.kind !== "bidding") {
    return reject("not-bidding", `a raise can only be applied during the bidding phase, and this match is ${state.phase.kind}`);
  }
  if (!isLegalRaise(state, action)) {
    return reject(
      "illegal-raise",
      `raise to (${String(action.bid.quantity)}, ${String(action.bid.face)}) is not a legal action for ${action.playerId} right now`,
    );
  }

  const nextTurnSeat = nextActiveSeat(state.players, state.phase.turnSeat);
  return {
    ok: true,
    state: { ...state, phase: { kind: "bidding", turnSeat: nextTurnSeat, bid: action.bid } },
  };
}
