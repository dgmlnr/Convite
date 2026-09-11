import type { RandomSource } from "@hexdev/platform-contract";
import type { DieFace, PlayerView } from "@hexdev/mentiroso-engine";
import { DIE_FACES } from "@hexdev/mentiroso-engine";

/**
 * `hard`'s own determinization (SDD `mentiroso`, work unit D4/task 4.4,
 * design D7): one plausible full board, sampled from what the viewer can
 * see plus a random guess at every rival's hidden dice.
 *
 * `truco-bot/src/determinize.ts`'s own `dealFrom` splices a SHARED, FINITE
 * pool because cards are exclusive — a card dealt to one hand cannot also
 * be dealt to another. Dice are not exclusive: two different rivals may
 * both roll a 5, and the showdown tally (mentiroso-rules) counts EVERY die
 * on the table toward one face regardless of who holds it. Reusing the
 * disjoint-pool shape here would silently FORBID that repetition and bias
 * every downstream estimate low. The reuse from `truco-bot` is the SHAPE
 * only — one `rng()` call per hidden die, drawn WITH REPLACEMENT — never
 * the pool/splice mechanics themselves.
 */

/** Draws one die face uniformly over `DIE_FACES`, WITH REPLACEMENT: this
 * function has no memory of a prior draw, so calling it twice in a row can
 * — and, over enough draws, will — return the same face both times. */
export function drawDie(rng: RandomSource): DieFace {
  const index = Math.floor(rng() * DIE_FACES.length);
  return DIE_FACES[index] ?? DIE_FACES[0]!;
}

/**
 * One determinized world's worth of every rival's hidden dice: exactly one
 * array per rival, exactly `rival.diceCount` long, each die drawn
 * independently via `drawDie` above. An eliminated rival (`diceCount === 0`)
 * draws nothing and contributes an empty array, the same
 * derive-from-the-one-field elimination reading `mentiroso-engine`'s own
 * `totalDice`/`tallyFace` already use.
 *
 * Spends EXACTLY `sum(rival.diceCount)` calls to `rng()` — never one per
 * rival, and never a table-wide constant — so a caller sampling `N` full
 * worlds (`hard.ts`) can budget its own total entropy spend precisely.
 */
export function determinizeRivalDice(view: PlayerView, rng: RandomSource): readonly (readonly DieFace[])[] {
  return view.rivals.map((rival) => Array.from({ length: rival.diceCount }, () => drawDie(rng)));
}
