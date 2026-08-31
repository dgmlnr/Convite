/**
 * HOW LONG THE BOARD TOOK — measured, never limited, and it never leaves this
 * closure.
 *
 * THE THING THIS FILE EXISTS TO PROTECT is one sentence long: a board is a
 * pure function of one permutation. That is the property the engine's own
 * `packages/games/*-engine/src/**` eslint glob already fences (no `Date.now`,
 * no `new Date()`, no `Math.random`) and the property the rejected reshuffle
 * was rejected to keep. A clock that reached the engine would end it — two
 * replays of the same permutation could then disagree, and every fence in the
 * engine and the generator is written on the assumption that they cannot.
 *
 * So time rides where the repository already puts it. `match-room.ts` states
 * the rule for the turn clock in exactly these terms: the deadline "rides on
 * the view MESSAGE, never inside the engine's `PlayerView`, so the engine
 * stays a pure reducer with no clock". This chronometer does not even go that
 * far — it never touches the wire at all. It is a client closure, it starts
 * when a renderer is created, it resets on reload because it was never
 * written anywhere, it is never scored and never compared to anyone else's.
 *
 * NOTHING ACTS ON IT. There is no turn clock and no match clock in this game:
 * no move is refused because of it, no outcome depends on it, no bot is
 * summoned by it. It exists so that a player who has just cleared a turtle
 * can be told how long they took.
 *
 * IT IS DOM-FREE, deliberately: everything here is arithmetic over two
 * numbers, so it can be fenced in the node suite at exact values instead of
 * being inferred from a rendered string. `match-over.ts` is where it becomes
 * a sentence.
 */

/**
 * The current instant in epoch milliseconds — structurally identical to
 * `platform-contract`'s `Clock`, and deliberately NOT imported from it.
 *
 * No `packages/games/*-ui` package in this repository depends on
 * `platform-contract`; `escoba-ui/match-outcome.ts` mirrors that contract's
 * `MatchOutcome` shape for the same reason and says so. A one-line type alias
 * is not worth a new workspace edge from a game's presentation layer to the
 * platform, and the edge would be the first of its kind on this tier.
 *
 * `apps/widget-app` is the tier that DOES hold both, and its
 * `MatchRenderContext` reuses the real `Clock` rather than re-declaring it —
 * so the type is mirrored exactly once, at exactly the boundary that forces
 * it.
 */
export type ChronometerClock = () => number;

/** What a chronometer needs to know at the moment a match is entered. */
export interface ChronometerContext {
  /**
   * Whether this match was RESUMED from a persisted session rather than
   * started in this page session. The one fact that decides whether a figure
   * may be shown at all — see `createChronometer`.
   */
  readonly resumed: boolean;
  /**
   * The clock this closure measures with. Injected rather than calling
   * `Date.now()` inline for the reason `truco-ui/table.ts` already writes out
   * for its countdown: so a test can assert an exact number, and so a visual
   * baseline can freeze one. A chronometer counting UP is exactly as
   * nondeterministic in a screenshot as a countdown counting down.
   */
  readonly now: ChronometerClock;
}

export interface Chronometer {
  /**
   * The elapsed time at the moment the board was cleared, in milliseconds.
   *
   * FROZEN ON THE FIRST CALL, and every later call repeats it. The completion
   * message sits on screen while the player reads it, and it is repainted by
   * any later view; reading the clock on each of those would show how long
   * the message had been open rather than how long the board took. The first
   * call is the one that happened when the last pair came off, so the first
   * call is the one that decides.
   */
  readonly finish: () => number;
  /**
   * The elapsed time RIGHT NOW, for a readout the player watches while they
   * play.
   *
   * IT DOES NOT FREEZE AND IT DOES NOT START ANYTHING, which is the whole of
   * what separates it from `finish`. Reading it a hundred times changes
   * nothing; `finish` is a decision about when the board was cleared and can
   * therefore only be made once. A single method could not be both, and the
   * one that was here was correctly the freezing one — a live readout calling
   * it would have stopped the clock on its first tick and shown the player a
   * number frozen at zero.
   *
   * AFTER THE BOARD IS CLEARED IT REPORTS THE FINISHED FIGURE, so the readout
   * on the felt and the sentence on the panel cannot disagree by the seconds
   * the player spent reading the panel. It follows `finish`'s decision rather
   * than making a second one.
   */
  readonly elapsed: () => number;
}

/**
 * Milliseconds to whole seconds — the ONE rounding rule every face of this
 * chronometer shares, named so that the reason can sit beside it.
 *
 * IT FLOORS, AND IT DOES NOT CLAMP, which is the exact opposite of
 * `truco-ui`'s `remainingWholeSeconds`. That is not an inconsistency: both of
 * that function's two arguments are about a COUNTDOWN, and neither survives
 * the change of direction.
 *
 *   - IT ROUNDS UP because a clock armed for a minute must read "1:00" on its
 *     first frame. A chronometer reports time that has ALREADY PASSED, and it
 *     may never report more of it than there was — at 4:32.999 the player has
 *     not yet spent 4 minutes and 33 seconds, and crediting them with a
 *     second they did not take is the one error a stopwatch must not make.
 *   - IT CLAMPS AT ZERO because a passed deadline is an ordinary state of a
 *     countdown, and "-0:03" would read as a bug while the server's own
 *     decision was still in flight. There is no ordinary state of a
 *     chronometer in which time runs backwards. A negative here means the
 *     injected clock went backwards during the match, and clamping it would
 *     dress that defect up as the fastest game anybody ever played — a
 *     result, shown to a player, manufactured by a bug. It stays negative and
 *     stays visible.
 *
 * The discipline is copied from that file; the rule is not.
 */
export function elapsedWholeSeconds(elapsedMs: number): number {
  return Math.floor(elapsedMs / 1000);
}

/**
 * Whole seconds as `m:ss`.
 *
 * Minutes are unbounded — a board that took an hour and a quarter reads
 * "75:12", never "1:15:12". Same shape as `truco-ui`'s `formatCountdown`, and
 * one unit fewer for a player to parse in a sentence whose whole job is to
 * end the match.
 *
 * The sign is carried on the OUTSIDE of the whole reading rather than left to
 * fall out of the arithmetic: `-1:-1` is not a duration, and a clock that ran
 * backwards deserves a number a person can actually read in the bug report
 * they are about to file.
 */
export function formatElapsed(elapsedMs: number): string {
  const total = elapsedWholeSeconds(elapsedMs);
  const magnitude = Math.abs(total);
  return `${total < 0 ? "-" : ""}${Math.floor(magnitude / 60)}:${String(magnitude % 60).padStart(2, "0")}`;
}

/**
 * Start measuring — or, on a resumed match, deliberately do not.
 *
 * `null` FOR A RESUMED MATCH IS THE WHOLE HONESTY MECHANISM, and it is
 * structural rather than a rule a caller has to remember. A match in this
 * repository survives a page reload (`identity-storage.ts`'s
 * `PersistedMatchSession`, read back on boot in `main.ts` before the catalog
 * is ever shown). A closure started at first render on that path measures
 * TIME SINCE THE RELOAD, and shown as a final result that is a SHORTER number
 * than the truth wearing the truth's clothes. The player cannot tell, and
 * neither can anyone reading the code downstream — unless there is nothing
 * there to render.
 *
 * There is no partial mode and no smaller font. A partial readout is the same
 * dishonesty in a quieter voice, and it costs a second piece of copy, a
 * second state and a second thing to get wrong. A caller holding `null`
 * cannot show a figure by mistake.
 *
 * WHY THE PROVENANCE IS A PARAMETER AND NOT SOMETHING THIS FILE COULD LOOK UP:
 * see `MatchRenderContext` in `apps/widget-app/src/game-ui-registry.ts`, and
 * `enterMatch`'s own docblock, which records the derivation that does not
 * work and why.
 */
export function createChronometer(context: ChronometerContext): Chronometer | null {
  if (context.resumed) return null;

  const startedAt = context.now();
  let finishedAt: number | null = null;

  return {
    finish: () => {
      finishedAt ??= context.now();
      return finishedAt - startedAt;
    },
    elapsed: () => (finishedAt ?? context.now()) - startedAt,
  };
}
