import { describe, expect, it } from "vitest";

import { collectMatchDiagnostics, formatDiagnosticFailure, formatProgressLine } from "./match-diagnostics.js";

/**
 * A fake `body` carrying only the two methods the collector is allowed to use.
 *
 * Passing a stub rather than reaching for jsdom is the point: it proves the
 * collector touches NOTHING but `querySelector`/`querySelectorAll`, which is
 * what makes it safe to hand to Playwright's `evaluate` — that function is
 * serialized to source and re-created inside the page, so any free variable
 * it closed over would be `undefined` there.
 */
function fakeBody(matches: Record<string, { readonly textContent?: string; readonly attributes?: Record<string, string> }[]>): HTMLElement {
  const nodesFor = (selector: string) =>
    (matches[selector] ?? []).map((node) => ({
      textContent: node.textContent ?? null,
      getAttribute: (name: string) => node.attributes?.[name] ?? null,
      disabled: node.attributes?.disabled === "true",
    }));
  return {
    querySelector: (selector: string) => nodesFor(selector)[0] ?? null,
    querySelectorAll: (selector: string) => nodesFor(selector),
  } as unknown as HTMLElement;
}

describe("collectMatchDiagnostics", () => {
  /**
   * THE regression this module exists for.
   *
   * The diagnostic used to be five separate Playwright locator calls, three of
   * them `.textContent()`. That API AUTO-WAITS for its element, so the one
   * pointing at `.hexdev-truco-turn-indicator` — an element deleted during the
   * a11y work, because it was rebuilt on every render and had therefore never
   * announced anything — blocked for the full 30s default timeout on EVERY
   * firing, and `.catch(() => null)` swallowed the failure without a trace.
   * Measured: 30005ms for that one call against 5ms, 15ms, 3ms and 3ms for the
   * other four. At one firing per 10s that alone was ~420s of a 438s run, and
   * it is the entire reason this spec's budget was raised three times.
   *
   * Inside `evaluate` there is no auto-waiting at all: a selector that matches
   * nothing yields `null` immediately. A stale selector must cost nothing.
   */
  it("yields null for an element that is not there, instead of waiting for it", () => {
    const snapshot = collectMatchDiagnostics(fakeBody({}));

    expect(snapshot.score).toBeNull();
    expect(snapshot.turn).toBeNull();
    expect(snapshot.pendingCall).toBeNull();
    expect(snapshot.offered).toEqual([]);
    expect(snapshot.hand).toEqual([]);
  });

  it("reads the score, the turn announcement and the pending call from the rendered table", () => {
    const snapshot = collectMatchDiagnostics(
      fakeBody({
        ".hexdev-truco-scoreboard-panel": [{ textContent: "Nosotros 7\n  Ellos 5" }],
        ".hexdev-truco-announcer": [{ textContent: "Es tu turno" }],
        ".hexdev-truco-pending-call": [{ textContent: "Truco" }],
      }),
    );

    expect(snapshot.score).toBe("Nosotros 7\n  Ellos 5");
    expect(snapshot.turn).toBe("Es tu turno");
    expect(snapshot.pendingCall).toBe("Truco");
  });

  /** Disabled state matters: "the widget offers a button nobody clicked" and
   * "the widget offers nothing" are different failures, and a previous stall
   * was misreported as a product hang precisely because the log could not
   * tell them apart. */
  /**
   * The collector's OWN expression for the case that actually happens.
   *
   * `.hexdev-truco-pending-call` is present and emptied whenever no call is
   * pending, so `body.querySelector(sel)?.textContent ?? null` must yield `""`
   * there, not `null`. The formatter test above pins the same distinction, but
   * from a hand-built snapshot — it never runs this expression.
   */
  it("yields an empty string for a present-but-empty element, not null", () => {
    const snapshot = collectMatchDiagnostics(fakeBody({ ".hexdev-truco-pending-call": [{ textContent: "" }] }));

    expect(snapshot.pendingCall).toBe("");
    expect(snapshot.pendingCall).not.toBeNull();
  });

  it("records every offered action with whether it is actually clickable", () => {
    const snapshot = collectMatchDiagnostics(
      fakeBody({
        "[data-action]": [
          { attributes: { "data-action": "respond-truco" } },
          { attributes: { "data-action": "play-again", disabled: "true" } },
        ],
      }),
    );

    expect(snapshot.offered).toEqual(["respond-truco", "play-again:disabled"]);
  });

  it("records the hand with each card's playability", () => {
    const snapshot = collectMatchDiagnostics(
      fakeBody({
        "[data-card]": [
          { attributes: { "data-card": "1-espada", "data-playable": "true" } },
          { attributes: { "data-card": "4-copa", "data-playable": "false" } },
        ],
      }),
    );

    expect(snapshot.hand).toEqual(["1-espada:true", "4-copa:false"]);
  });
});

describe("formatProgressLine", () => {
  /**
   * The scoreboard's own `textContent` carries newlines and runs of
   * indentation, and interpolating it raw SPLIT THE LOG LINE — which is why
   * earlier timeout reports showed a score and then nothing: the turn and the
   * offered actions were on lines nobody read.
   */
  it("collapses whitespace so one snapshot is always one line", () => {
    const line = formatProgressLine(42, {
      score: "Nosotros 7\n    Ellos 5",
      turn: "Es tu\tturno",
      pendingCall: null,
      offered: [],
      hand: [],
    });

    expect(line).not.toContain("\n");
    expect(line).toContain('score="Nosotros 7 Ellos 5"');
    expect(line).toContain('turn="Es tu turno"');
  });

  /**
   * A stale selector must be LOUD. The whole cost of this bug was that a
   * missing element looked exactly like a present-but-empty one, so nobody
   * reading the log had any reason to suspect the diagnostic itself.
   */
  it("renders a missing element as ? rather than dropping the field", () => {
    const line = formatProgressLine(10, { score: null, turn: null, pendingCall: null, offered: [], hand: [] });

    expect(line).toContain('score="?"');
    expect(line).toContain('turn="?"');
    expect(line).toContain('pendingCall="?"');
  });

  /**
   * `.hexdev-truco-pending-call` is ALWAYS in the DOM — the banner is emptied,
   * not removed, because `:empty { display: none }` is what hides it. So an
   * empty string is the ordinary case for that field, and it must stay
   * distinguishable from `?`: one says "no call is pending", the other says
   * "this selector is dead". Conflating them is how the last 30s stall hid.
   */
  it("keeps a present-but-empty element distinct from a missing one", () => {
    const line = formatProgressLine(10, { score: "0-0", turn: "", pendingCall: "", offered: [], hand: [] });

    expect(line).toContain('turn=""');
    expect(line).toContain('pendingCall=""');
    expect(line).not.toContain('turn="?"');
    expect(line).not.toContain('pendingCall="?"');
  });

  it("reports the elapsed seconds so a stalled run can be placed in time", () => {
    const line = formatProgressLine(614, { score: "0-0", turn: null, pendingCall: null, offered: [], hand: [] });

    expect(line).toContain("+614s");
  });

  it("lists the offered actions and the hand", () => {
    const line = formatProgressLine(10, {
      score: "0-0",
      turn: null,
      pendingCall: null,
      offered: ["call-truco", "play-again:disabled"],
      hand: ["1-espada:true"],
    });

    expect(line).toContain("offered=[call-truco,play-again:disabled]");
    expect(line).toContain("hand=[1-espada:true]");
  });
});

/**
 * A diagnostic must never be able to fail the run it is diagnosing.
 *
 * The five-locator version of this block wrapped every read in its own
 * `.catch()`, so a diagnostic failure could not reach the test. Collapsing it
 * into one `evaluate` dropped that guard, and a review caught it: `evaluate`
 * can still reject for reasons that have nothing to do with the selectors —
 * a detached iframe, a navigation mid-call — and an uncaught rejection there
 * would fail the match on a diagnostic-only error.
 *
 * The failure is REPORTED rather than swallowed, which is the other half of
 * the lesson: the old `.catch(() => null)` is exactly what turned a 30s stall
 * into silence.
 */
describe("formatDiagnosticFailure", () => {
  it("reports the failure on one line, with the elapsed seconds", () => {
    const line = formatDiagnosticFailure(120, new Error("frame was detached"));

    expect(line).not.toContain("\n");
    expect(line).toContain("+120s");
    expect(line).toContain("frame was detached");
  });

  it("survives a thrown value that is not an Error", () => {
    expect(formatDiagnosticFailure(5, "just a string")).toContain("just a string");
    expect(formatDiagnosticFailure(5, undefined)).toContain("+5s");
  });

  /** It must be recognisable as a diagnostic failure, not misread as a match
   * that reported nothing. */
  it("says plainly that it was the diagnostic that failed", () => {
    expect(formatDiagnosticFailure(5, new Error("boom"))).toContain("diagnostic failed");
  });

  /**
   * The invariant applied to itself. `String()` THROWS on a value with no
   * prototype — there is nothing for `ToPrimitive` to call — so the naive
   * `String(error)` would make the reporter of a diagnostic failure the thing
   * that fails the run. That is the exact shape of bug this module exists to
   * remove, so it must not be reintroduced by the reporter.
   */
  it("survives a thrown value that cannot even be turned into a string", () => {
    const unstringifiable = Object.create(null) as unknown;

    expect(() => formatDiagnosticFailure(7, unstringifiable)).not.toThrow();
    expect(formatDiagnosticFailure(7, unstringifiable)).toContain("+7s");
  });

  /** An Error with no message must still say something. Falling through to a
   * bare trailing space breaks the format's own "?" convention for "nothing
   * useful here". */
  it("falls back to ? when the thrown Error carries no message", () => {
    const line = formatDiagnosticFailure(9, new Error(""));

    expect(line).toContain("diagnostic failed: ?");
    expect(line.endsWith(" ")).toBe(false);
  });
});
