import { chromium, type Browser, type FrameLocator, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachConsoleGuard } from "./support/console-guard.js";
import { startSystem, type SystemHandle } from "./support/system.js";

/**
 * WHAT HAPPENS AFTER THE RESUMED MATCH ENDS — the half of the reload story
 * nobody was driving.
 *
 * `reload-identity.e2e.test.ts` next door proves a reloaded player lands back
 * in their own seat, and stops there. It is the right place to stop for the
 * question it asks. But a resumed match is not the last thing that happens to
 * a player: they finish it, or they walk away from it, and then they are
 * standing in the lobby again — and THAT boot took a different path through
 * `main.ts` than the ordinary one, so the lobby they come back to is not the
 * lobby the other specs have ever seen.
 *
 * THE DEFECT THIS EXISTS FOR, reported from real play. The resume branch ends
 * in `return`, and the loop that opens one watch-only presence connection per
 * catalog game sits BELOW it. On that path no watcher is ever created, so
 * `presenceByGame` stays empty for the life of the page — and `game-screen.ts`
 * renders `.hexdev-chrome-loading` ("Cargando…") for exactly that: a game with
 * no presence yet. The player leaves the match and every game on the shelf is
 * stuck loading, forever, with no error and nothing to click. Only a page
 * reload gets them out, which is the gesture that put them there.
 *
 * WHY THE FENCE IS HERE AND NOT A UNIT. The bug is not a wrong answer inside
 * any function — every function involved is correct on its own, and both
 * halves of `main.ts` read fine in isolation. It is an ORDER: a `return`
 * placed above a loop that had to run. Nothing smaller than a boot can
 * observe that, so nothing smaller than a boot is fencing it.
 *
 * TRUCO, ONE GAME, AND THE SHELF BEHIND IT. The catalog screen is shared, so
 * one game stuck is the whole shelf stuck; driving truco is enough to observe
 * it and it is the game every other spec here already knows how to drive.
 */

const RESUME_TIMEOUT_MS = 20_000;

/** `game-screen.ts`'s own class for "this game has no presence yet". A literal
 * on purpose, exactly like `reload-identity`'s `[data-tier]`: if that class is
 * renamed, this fence must fail loudly rather than quietly stop looking at
 * anything. */
const LOADING = ".hexdev-chrome-loading";

/** The bot-tier button, which `game-screen.ts` renders ONLY once presence has
 * arrived for the game. Its presence is the positive half of the assertion —
 * "the loading text is gone" alone would also be true of a blank card. */
const TIER = '[data-tier="easy"]';

describe("a player who resumed a match and then left it gets a working lobby back", () => {
  let browser: Browser;
  let system: SystemHandle;

  beforeAll(async () => {
    system = await startSystem();
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    await system?.stop();
  });

  it(
    "shows a playable shelf, not a shelf stuck on Cargando…",
    async () => {
      const context = await browser.newContext();
      const page: Page = await context.newPage();
      const guard = attachConsoleGuard(page);

      await page.goto(system.hostOrigin, { waitUntil: "load" });
      await page.waitForSelector("iframe", { timeout: 15_000 });
      let table: FrameLocator = page.frameLocator("iframe");

      // A live match, entered the ordinary way. This first lobby is the one
      // that WORKS — every watcher exists on this path — which is what makes
      // the comparison at the end meaningful rather than a guess about what
      // a lobby is supposed to look like.
      await table.locator(TIER).first().click({ timeout: 15_000 });
      await table.locator(".hexdev-truco-table").waitFor({ state: "visible", timeout: 30_000 });

      // The reload is the whole setup: it is what makes the NEXT boot take
      // the resume branch instead of the ordinary one.
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector("iframe", { timeout: 15_000 });
      table = page.frameLocator("iframe");
      await table.locator(".hexdev-truco-table").waitFor({ state: "visible", timeout: RESUME_TIMEOUT_MS });
      expect(await table.locator(TIER).count(), "the catalog appeared instead of the seat being reclaimed — this run never reached the resume path it exists to test").toBe(0);

      // Walking away, through the real two-step control a player uses: ask,
      // then confirm. `returnToSelection` is what runs next, and it is the
      // only thing standing between the resumed boot and the lobby.
      await table.locator('[data-action="leave-match"]').click({ timeout: 15_000 });
      await table.locator('[data-action="leave-match-confirm"]').click({ timeout: 15_000 });

      // THE ASSERTION. A tier button means presence arrived and the card is
      // playable; against the defect this never appears and the card sits on
      // its loading line until the page is reloaded.
      await table
        .locator(TIER)
        .first()
        .waitFor({ state: "visible", timeout: RESUME_TIMEOUT_MS })
        .catch(() => {
          throw new Error("the lobby never became playable after leaving a resumed match — no bot-tier button ever rendered");
        });
      expect(await table.locator(LOADING).count(), "a game card is still showing its loading line after the lobby came back").toBe(0);

      expect(guard.errors, `console/page errors during the run: ${guard.errors.join("; ")}`).toEqual([]);

      await context.close();
    },
    90_000,
  );
});
