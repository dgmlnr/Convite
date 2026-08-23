/**
 * The permanent progress diagnostic for a live match, and a cautionary tale.
 *
 * WHY THIS IS ONE `evaluate` AND NOT FIVE LOCATOR CALLS. Playwright's
 * `locator.textContent()` AUTO-WAITS for its element to attach. That is the
 * right behaviour when you are asserting on something you expect to appear,
 * and a trap when you are taking a diagnostic snapshot of whatever happens to
 * be on screen: a selector that matches nothing does not return `null`, it
 * blocks for the full 30s default timeout and then throws — and a
 * `.catch(() => null)` wrapped around it, written to keep the diagnostic from
 * ever breaking the run, converts that stall into complete silence.
 *
 * This is not hypothetical. The previous version of this diagnostic read
 * `.hexdev-truco-turn-indicator`, an element DELETED during the a11y work
 * (`truco-ui/announcer.ts` explains why: it was rebuilt inside the render path
 * and had therefore never announced anything). Measured, one pass:
 *
 *     scoreboard 5ms · hand 15ms · turnIndicator 30005ms · offered 3ms · pendingCall 3ms
 *
 * At one firing per 10s that is ~420s of a 438s run. It is the sole reason
 * this spec's timeout budget was raised three times — 4 minutes, then 10, then
 * 15 — each time from honest measurements of a number the diagnostic itself
 * was producing. The bot's ~1s thinking delay, long suspected, accounts for
 * 30s of that 438s: a full match is only ~30 bot actions.
 *
 * Inside `evaluate` none of that can happen. `querySelector` either finds a
 * node or returns `null`, right now, for free.
 */

export interface MatchDiagnosticSnapshot {
  /** `null` means the element is not in the DOM — see `formatProgressLine`. */
  readonly score: string | null;
  readonly turn: string | null;
  readonly pendingCall: string | null;
  /** `data-action`, suffixed `:disabled` when the button cannot be clicked. */
  readonly offered: readonly string[];
  /** `data-card`, suffixed with its `data-playable` value. */
  readonly hand: readonly string[];
}

/**
 * Runs INSIDE the page: Playwright serializes this function to source and
 * re-creates it there, so it must close over nothing. Everything it needs
 * arrives through `body` or is a DOM global.
 *
 * Whose-turn comes from `.hexdev-truco-announcer` — the live region that
 * replaced the deleted turn indicator, and the only node that now carries it.
 */
export function collectMatchDiagnostics(body: HTMLElement): MatchDiagnosticSnapshot {
  const textOf = (selector: string): string | null => body.querySelector(selector)?.textContent ?? null;
  return {
    score: textOf(".hexdev-truco-scoreboard-panel"),
    turn: textOf(".hexdev-truco-announcer"),
    pendingCall: textOf(".hexdev-truco-pending-call"),
    offered: [...body.querySelectorAll("[data-action]")].map(
      (el) => `${el.getAttribute("data-action") ?? ""}${(el as HTMLButtonElement).disabled ? ":disabled" : ""}`,
    ),
    hand: [...body.querySelectorAll("[data-card]")].map((el) => `${el.getAttribute("data-card") ?? ""}:${el.getAttribute("data-playable") ?? "?"}`),
  };
}

/**
 * Every diagnostic snapshot goes through this. The scoreboard's own
 * `textContent` carries newlines and runs of indentation, and interpolating it
 * raw SPLIT THE LOG LINE — which is why earlier timeout reports showed a score
 * and then nothing: the turn and the offered actions were on lines nobody
 * read. A diagnostic that only survives the happy path is not one.
 */
function collapse(text: string | null): string {
  return (text ?? "?").replace(/\s+/g, " ").trim();
}

/**
 * One snapshot, one line.
 *
 * A missing element prints as `?` rather than vanishing from the line. That
 * distinction is the whole lesson here: for as long as this diagnostic existed
 * a dead selector was indistinguishable from a present-but-empty element, so
 * nobody reading the log had any reason to suspect the diagnostic itself.
 */
export function formatProgressLine(elapsedSeconds: number, snapshot: MatchDiagnosticSnapshot): string {
  return (
    `[single-player.e2e] progress at +${String(elapsedSeconds)}s: ` +
    `score="${collapse(snapshot.score)}" turn="${collapse(snapshot.turn)}" pendingCall="${collapse(snapshot.pendingCall)}" ` +
    `offered=[${snapshot.offered.join(",")}] hand=[${snapshot.hand.join(",")}]`
  );
}

/**
 * The other half of the same lesson.
 *
 * A diagnostic must never be able to fail the run it is diagnosing. The
 * five-locator version guarded every read with its own `.catch()`, and
 * collapsing it into one `evaluate` dropped that guard — `evaluate` can still
 * reject for reasons that have nothing to do with selectors (a detached
 * iframe, a navigation mid-call), and an uncaught rejection inside the polling
 * loop would fail the match on a diagnostic-only error.
 *
 * But the failure is REPORTED, not swallowed. `.catch(() => null)` is exactly
 * what turned a 30s stall into silence for as long as it did; a diagnostic
 * that hides its own breakage is worse than no diagnostic.
 */
export function formatDiagnosticFailure(elapsedSeconds: number, error: unknown): string {
  return `[single-player.e2e] progress at +${String(elapsedSeconds)}s: diagnostic failed: ${collapse(describeThrown(error))}`;
}

/**
 * The invariant applied to itself.
 *
 * `String(value)` THROWS for a value whose prototype chain offers no
 * `Symbol.toPrimitive`, `valueOf` or `toString` — `Object.create(null)` is the
 * everyday example — because `ToPrimitive` has nothing to call. Left naive,
 * the function that REPORTS a diagnostic failure would itself become the thing
 * that fails the run, which is precisely the bug this module was written to
 * remove.
 *
 * Returns `null` when there is nothing legible to say, so `collapse` renders
 * the same `?` the rest of the format uses for "nothing useful here" rather
 * than a bare trailing space.
 */
function describeThrown(error: unknown): string | null {
  if (error instanceof Error) return error.message === "" ? null : error.message;
  try {
    return String(error);
  } catch {
    return "a thrown value that cannot be converted to a string";
  }
}

/**
 * The guard, owned here rather than inlined at the call site.
 *
 * A diagnostic must never be able to fail the run it is diagnosing, and the
 * read it performs can reject for reasons that have nothing to do with its
 * selectors — a detached iframe, a navigation mid-call. Inlined in the spec
 * this was one `try` nobody could reach with a test; as a function it is the
 * failure path itself that gets proven.
 *
 * The failure is REPORTED, never swallowed. `.catch(() => null)` is exactly
 * what turned a 30s stall into silence for as long as it did.
 *
 * `read` is invoked inside the `try` on purpose: a locator can throw
 * synchronously, before it ever returns a promise, and a version that called
 * it outside would let that one escape.
 */
export async function readDiagnosticLine(elapsedSeconds: number, read: () => Promise<MatchDiagnosticSnapshot>): Promise<string> {
  try {
    return formatProgressLine(elapsedSeconds, await read());
  } catch (error) {
    return formatDiagnosticFailure(elapsedSeconds, error);
  }
}
