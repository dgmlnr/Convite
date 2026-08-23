import { describe, expect, it } from "vitest";

import { waitForView } from "./live-wait.test-support.js";

interface Fixture {
  readonly moves: number;
}

describe("waitForView", () => {
  it("returns the first view that matches", async () => {
    const views: Fixture[] = [{ moves: 0 }, { moves: 1 }, { moves: 2 }];

    const found = await waitForView({
      views,
      matches: (view) => view.moves >= 1,
      what: "a view with at least one move",
      describe: (view) => `moves=${String(view.moves)}`,
    });

    expect(found).toEqual({ moves: 1 });
  });

  /** The views array is appended to by a live socket, so the helper has to
   * keep looking rather than sample once. */
  it("keeps looking as views arrive", async () => {
    const views: Fixture[] = [];
    setTimeout(() => views.push({ moves: 0 }), 10);
    setTimeout(() => views.push({ moves: 7 }), 30);

    const found = await waitForView({
      views,
      matches: (view) => view.moves === 7,
      what: "the seventh move",
      describe: (view) => `moves=${String(view.moves)}`,
      timeoutMs: 2_000,
    });

    expect(found).toEqual({ moves: 7 });
  });

  /**
   * THE reason this helper exists.
   *
   * The four live suites each carried their own copy that threw
   * `"timed out waiting for the expected view"` — a sentence that names
   * neither what was awaited nor what actually arrived. A failure like that
   * tells whoever reads it at 3am precisely nothing, which is how a
   * load-sensitive flake stays unexplained for months.
   */
  it("names what it waited for AND what it actually saw", async () => {
    const views: Fixture[] = [{ moves: 0 }, { moves: 1 }];

    await expect(
      waitForView({
        views,
        matches: (view) => view.moves === 99,
        what: "the ninety-ninth move",
        describe: (view) => `moves=${String(view.moves)}`,
        timeoutMs: 60,
      }),
    ).rejects.toThrow(/the ninety-ninth move.*2 views.*moves=1/s);
  });

  /** "Nothing arrived at all" and "the wrong thing arrived" are different
   * failures and must not read the same. */
  it("says plainly when nothing arrived at all", async () => {
    await expect(
      waitForView({
        views: [] as Fixture[],
        matches: () => true,
        what: "any view whatsoever",
        describe: () => "unreachable",
        timeoutMs: 60,
      }),
    ).rejects.toThrow(/any view whatsoever.*no views arrived/s);
  });

  it("reports the budget it actually waited, so the number is checkable", async () => {
    await expect(
      waitForView({ views: [] as Fixture[], matches: () => true, what: "x", describe: () => "y", timeoutMs: 60 }),
    ).rejects.toThrow(/60ms/);
  });

  /** A describe that throws must not replace the real failure with its own —
   * the diagnostic is the last thing standing when a test fails. */
  it("survives a describe that throws while building the message", async () => {
    const views: Fixture[] = [{ moves: 0 }];

    await expect(
      waitForView({
        views,
        matches: () => false,
        what: "something unreachable",
        describe: () => {
          throw new Error("describe blew up");
        },
        timeoutMs: 60,
      }),
    ).rejects.toThrow(/something unreachable/);
  });
});
