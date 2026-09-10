import type { PlayerId } from "./ids.js";

/**
 * WHAT THIS GAME KEEPS FROM A SEAT — the one thing the platform cannot work
 * out on its own.
 *
 * For truco another player's card is a secret; for generala the dice are
 * public ON PURPOSE (`generala-engine/src/view.ts:16`: "GENERALA REDACTS
 * NOTHING"). No generic rule separates those two, so the module declares it
 * and the platform enforces the declaration.
 *
 * THE TWO ARMS ARE NOT INTERCHANGEABLE, and that is what stops the
 * declaration from being a formality somebody satisfies with whichever arm is
 * shorter to type. Each carries its own executed proof obligation, and they
 * fail on opposite games:
 *
 * - `hidden-per-seat` promises that `secretsFor(state, viewer)` names
 *   everything that viewer may not learn, and conformance scans that viewer's
 *   whole view for every one of them. A game that declares this arm and never
 *   produces a secret in any state its fixtures reach fails too — see
 *   `HiddenStateDeclaration`'s floor note below.
 * - `nothing-is-hidden` promises there is no per-seat secret at all, and
 *   conformance asserts the OBSERVABLE CONSEQUENCE of that promise: every
 *   seat's view carries the same information. A redacting game cannot escape
 *   into this arm — truco's two hands differ per viewer, so declaring it goes
 *   red on the first dealt state.
 *
 * WHAT THE `nothing-is-hidden` ARM DOES NOT PROVE, stated because a guarantee
 * whose limits are unwritten gets believed past them: the platform cannot see
 * that a state has no secret, only that no seat is told something another
 * seat is not. A game that published EVERY seat's hand to EVERY seat would
 * satisfy it. That game is lying in its declaration, and the arm it needed is
 * the other one.
 */
export type HiddenState<TState> =
  | { readonly kind: "nothing-is-hidden" }
  | {
      readonly kind: "hidden-per-seat";
      /**
       * Every value `viewer` must not find anywhere in their own view of
       * `state`.
       *
       * DECLARE THE SMALLEST VALUE THAT IS STILL UNIQUELY IDENTIFYING — a
       * whole card `{ suit, rank }`, not its rank. `findLeakedSecrets` matches
       * a secret against every node of the view, so a bare `7` would match the
       * viewer's own score, their seat, and a legitimate card of theirs, and
       * the fence would red on a correct projection.
       *
       * Typed `readonly unknown[]` rather than `readonly JsonValue[]` on
       * purpose: every engine's card, tile and signal is declared with
       * `interface`, and TypeScript gives an interface no implicit index
       * signature, so a `JsonValue` return would force `as unknown as` at
       * every declaration site. A declaration people have to fight is a
       * declaration people write badly.
       */
      readonly secretsFor: (state: TState, viewer: PlayerId) => readonly unknown[];
    };

/**
 * Which of `secrets` can be found inside `view`, at any depth, under any key.
 *
 * REPLACES A SCAN THAT COULD NOT FAIL. `truco-engine/src/view.test.ts` fenced
 * hidden cards with `JSON.stringify(view).includes(cardId(card))`, and
 * `cardId` renders `{ suit: "oro", rank: 12 }` as `"12-oro"` while the view
 * serializes it as `{"suit":"oro","rank":12}` — the substring is not there and
 * never can be. Measured, not deduced: planting the opponent's whole hand on
 * `OpponentView` left that file's fast-check redaction property GREEN.
 * Escoba's own scan (`JSON.stringify(view).includes(JSON.stringify(card))`)
 * does bite today, but only while the leaked object happens to serialize its
 * keys in the same order as the fixture's.
 *
 * So the match is STRUCTURAL: a secret is found when some node of the view is
 * deep-equal to it, whatever key it arrived under and whatever order its own
 * keys are in. The one string-shaped extra is a containment check, so a secret
 * embedded in a longer string (a rendered label, a log line) is caught too —
 * the only place a false positive is possible, and it is the game's own choice
 * of secret that decides it.
 */
export function findLeakedSecrets(view: unknown, secrets: readonly unknown[]): readonly unknown[] {
  const nodes = [...nodesOf(view)];
  return secrets.filter((secret) =>
    nodes.some((node) => deepEquals(node, secret) || (typeof secret === "string" && typeof node === "string" && node.includes(secret))),
  );
}

/**
 * Everything a view actually tells its reader, as a sorted multiset of
 * `key=type:value` leaves — the comparable form of "this seat knows that".
 *
 * KEYED BY NAME AND NOT BY PATH, because the honest difference between two
 * seats' views of a public game is a RE-KEY: generala hands each seat the same
 * table with a different entry called `self` (`generala-engine/src/view.ts`),
 * so a path-sensitive fingerprint would report every public game as leaking.
 * The multiset survives that re-key and still moves the moment one seat is
 * told something another is not — including a value already present elsewhere
 * under a different name, which is why the key travels with the leaf instead
 * of the value travelling alone.
 */
export function seatViewFingerprint(view: unknown): readonly string[] {
  const leaves: string[] = [];
  const walk = (key: string, value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) walk(key, entry);
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const [nestedKey, nested] of Object.entries(value)) walk(nestedKey, nested);
      return;
    }
    leaves.push(`${key}=${typeof value}:${String(value)}`);
  };
  walk("", view);
  return [...leaves].sort();
}

/** Every node of a value, the root included — arrays and objects are yielded
 * as themselves AND walked, so a secret that is a whole object is found
 * wherever it sits. */
function* nodesOf(value: unknown): Generator<unknown> {
  yield value;
  if (Array.isArray(value)) {
    for (const entry of value) yield* nodesOf(entry);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) yield* nodesOf(nested);
  }
}

/** Structural equality: key ORDER never matters, array order always does. */
function deepEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => deepEquals(entry, right[index]));
  }
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) return false;
  return leftEntries.every(([key, value]) => key in right && deepEquals(value, (right as Record<string, unknown>)[key]));
}
