/**
 * Waiting for a live view to arrive, with a failure worth reading.
 *
 * WHY THIS IS SHARED. Four live suites — `server`, `single-player`,
 * `reconnection` and `presence-room` — each carried a near-identical private
 * `waitFor`, and three of the four threw the same sentence:
 *
 *     throw new Error("timed out waiting for the expected view");
 *
 * That names neither what was awaited nor what actually arrived. When
 * `reconnection.live.test.ts` failed once in a full-suite run under load, the
 * message could not say whether the view never came, came wrong, or came late
 * — so the failure was unexplainable from its own output, which is how a
 * load-sensitive flake survives.
 *
 * The budget was also a guess, and a tight one: 3s under vitest's 5s default
 * per-test timeout leaves 2s of headroom for a test that performs SEVERAL
 * waits in sequence. Stack enough of them and vitest's own opaque timeout wins
 * the race to report, which defeats the whole point of having a named error.
 * `LIVE_TEST_TIMEOUT_MS` below is what keeps that from happening; it is not
 * what bounds a hang, since every wait bounds itself.
 *
 * This file is `.test-support.ts` rather than `.test.ts` so the runner does
 * not collect it as a suite of its own; its behaviour is pinned by
 * `live-wait.test-support.test.ts`.
 */

/** One wait's budget. Generous because it costs nothing on the happy path —
 * these views arrive in milliseconds — and because the previous number was
 * chosen to fit under a per-test ceiling that no longer applies. */
export const LIVE_WAIT_TIMEOUT_MS = 10_000;

/**
 * The per-test ceiling every live suite declares, so a NAMED wait failure
 * always beats vitest's generic one. It is not what bounds a hang — each wait
 * already does that — it only decides which error gets reported.
 *
 * DERIVED, not picked, and the derivation is a full count rather than a
 * sample. Across all 22 tests in these four files: SEVENTEEN contain no wait
 * at all, two contain one, and three contain two — `reconnection`'s reconnect
 * test, `single-player`'s full match and `server`'s two-client join. Nothing
 * stacks three. So the waits alone top out at 2 x 10s = 20s, and thirty leaves
 * ten seconds for the room creation, token minting and socket connects around
 * them.
 *
 * A first draft of this comment said "every other test stacks one", which was
 * simply wrong — most stack none — and a review caught it. Worth keeping in
 * mind: a comment that advertises itself as an exact count is read as one.
 *
 * Deliberately NOT more generous than that. Every second here is added to the
 * worst-case failure latency of any test in these files that genuinely hangs —
 * not just the flake this helper was written for — and a first draft of this
 * constant sat at 60s for no better reason than that it felt safe.
 *
 * If a future test stacks a third wait, this number has to move with it. The
 * count above is what makes that checkable rather than a matter of faith.
 */
export const LIVE_TEST_TIMEOUT_MS = 30_000;

const POLL_INTERVAL_MS = 20;

export interface WaitForViewOptions<TView> {
  /** The array a live socket appends to. Re-read on every poll, never sampled
   * once: the whole point is that it fills in over time. */
  readonly views: readonly TView[];
  readonly matches: (view: TView) => boolean;
  /** What is being awaited, in words, for the failure message. */
  readonly what: string;
  /** How to render a view that DID arrive. This is the half that makes a
   * timeout diagnosable rather than merely reported. */
  readonly describe: (view: TView) => string;
  readonly timeoutMs?: number;
}

/**
 * Never lets the diagnostic become the thing that fails: a `describe` that
 * throws must not replace the real timeout with its own error.
 *
 * `matches` is deliberately NOT guarded the same way, and the asymmetry is the
 * point. `describe` runs only on the failure path, where masking the real
 * error would be the worst thing it could do. `matches` runs on the happy
 * path, where a throw is a genuine defect in the test — swallowing it would
 * turn a loud, immediate bug into a ten-second timeout claiming the view never
 * arrived, which is a lie about what happened.
 */
function safelyDescribe<TView>(view: TView, describe: (view: TView) => string): string {
  try {
    return describe(view);
  } catch (error) {
    return `<describe threw: ${error instanceof Error ? error.message : String(error)}>`;
  }
}

/**
 * Resolves with the first view that matches, or throws naming BOTH what it
 * waited for and what it actually saw.
 */
export async function waitForView<TView>(options: WaitForViewOptions<TView>): Promise<TView> {
  const timeoutMs = options.timeoutMs ?? LIVE_WAIT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const found = options.views.find(options.matches);
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // "Nothing arrived" and "the wrong thing arrived" are different failures and
  // must not read the same — the first points at the connection, the second at
  // the expectation.
  const seen = options.views.length;
  const last = seen === 0 ? undefined : options.views[seen - 1];
  const actual = last === undefined ? "no views arrived at all" : `${String(seen)} views arrived, the last being ${safelyDescribe(last, options.describe)}`;
  throw new Error(`waited ${String(timeoutMs)}ms for ${options.what} and it never arrived; ${actual}`);
}
