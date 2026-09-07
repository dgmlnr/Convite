import type { DieFace } from "@hexdev/generala-engine";
import type { PlayerId } from "@hexdev/platform-contract";

/**
 * The author of every throw, and an id no seat can ever hold. Mirrors
 * `mahjong-solitaire-module/src/deal.ts`'s own sentinel, which mirrors
 * `escoba-module`'s, which mirrors `truco-module`'s.
 *
 * It is a SENTINEL, not a guarantee on its own: it stops a client CLAIMING to
 * be the system, and that is all it does. Nothing here prevents a seated player
 * from submitting a `roll-dice` under their own honest id — that refusal is
 * `applyAction`'s, in `index.ts`, and the two halves are deliberately in
 * different files so neither is mistaken for the other.
 */
export const SYSTEM_ACTOR_ID = "__system__" as PlayerId;

/**
 * The cup, as DATA — the faces the server drew, on their way to the engine's
 * positional splice.
 *
 * IT CARRIES THE RE-THROWN FACES ONLY, never all five, and that is the action's
 * own shape doing a job no runtime check could do as well. An action carrying
 * five final faces could silently change a die the player was holding, and the
 * only way to catch it would be to compare against the kept dice afterwards —
 * a check somebody has to remember to write. With this shape there is nowhere
 * for a held die's face to be overwritten from, because the action never names
 * one. `generala-engine`'s `applyRoll` states the same split from the other
 * side: `slots` carries `null` exactly where a die is being thrown again.
 *
 * Declared here rather than in the engine because it carries a `playerId` and
 * the engine's reducer takes no actor at all (D4) — the actor is a platform
 * concept, and this is the layer that knows the platform exists.
 *
 * WHAT MATERIALIZES ONE IS NOT HERE YET. `requestGeneralaSystemAction` — the
 * only door entropy comes through for this whole game — arrives in the next
 * unit with the entropy budget that measures it. This file carries the shape
 * and the actor; that one carries the draw.
 */
export interface RollDiceAction {
  readonly type: "roll-dice";
  readonly playerId: PlayerId;
  readonly faces: readonly DieFace[];
}
