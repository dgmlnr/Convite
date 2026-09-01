import { chromium, type Browser, type FrameLocator, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachConsoleGuard } from "./support/console-guard.js";
import { startSystem, type SystemHandle } from "./support/system.js";

const RELOAD_TIMEOUT_MS = 20_000;

/**
 * The LOCAL player's own hand, `.hexdev-truco-hand [data-card]` — `hand.ts`'s
 * own class name for the container it renders the joining player's real
 * cards into (never the opponent's, which `opponent-hand.ts` renders
 * separately with no `data-card` at all — redaction by type shape, design
 * §4). Comparing this set before and after a reload is the honest proof of
 * "same seat, same hand, same match" — a fresh match dealt after a failed
 * resume would show a DIFFERENT set, and a failed resume falls back to the
 * catalog screen first, which renders no hand at all.
 */
async function ownHandCardIds(table: FrameLocator): Promise<string[]> {
  const ids = await table.locator(".hexdev-truco-hand [data-card]").evaluateAll((elements) => elements.map((el) => el.getAttribute("data-card")));
  return ids.filter((id): id is string => id !== null).sort();
}

/**
 * The hole this closes (apply prompt): `embed-handler.ts` used to mint a
 * brand-new `playerId` on EVERY page load, so a reload — the most ordinary
 * kind of interruption there is — made a mid-match player come back as
 * somebody else, unable to reclaim their seat, while the reconnection window
 * and normal-tier bot takeover only ever helped a socket that dropped
 * WITHOUT the page going away. This spec drives a REAL browser through
 * exactly that scenario: a live match, a real `page.reload()` (which closes
 * the WebSocket exactly as a genuine interruption would), and an assertion
 * that the SAME seat, with the SAME hand, resumes — never a fresh catalog
 * screen requiring the player to pick a bot tier again.
 */
describe("player identity survives a page reload — the same browser lands back in its own seat while the reconnection window is still open", () => {
  let browser: Browser;
  let system: SystemHandle;

  beforeAll(async () => {
    // A fresh, isolated server process for THIS file only — see
    // `support/system.ts`'s own doc comment for why every file gets its own
    // process (a shared one leaks reconnection-window state across specs).
    system = await startSystem();
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    await system?.stop();
  });

  it(
    "reloads mid-match twice in a row and resumes the SAME seat with the SAME hand both times — not a fresh match, and not a one-off",
    async () => {
      const context = await browser.newContext();
      const page: Page = await context.newPage();
      const guard = attachConsoleGuard(page);

      await page.goto(system.hostOrigin, { waitUntil: "load" });
      await page.waitForSelector("iframe", { timeout: 15_000 });
      let table = page.frameLocator("iframe");

      await table.locator('[data-tier="easy"]').first().click({ timeout: 15_000 });
      await table.locator(".hexdev-truco-table").waitFor({ state: "visible", timeout: 30_000 });
      await table.locator(".hexdev-truco-hand [data-card]").first().waitFor({ state: "visible", timeout: 15_000 });

      // Reloaded TWICE, deliberately: a single successful reload could be a
      // one-off timing fluke; a second reload — which depends on the FIRST
      // resume having correctly re-armed the mechanism with a freshly
      // rotated `reconnectionToken` — is what shows this is a repeatable
      // mechanism, not a coincidence.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const handBefore = await ownHandCardIds(table);
        expect(handBefore.length, `attempt ${String(attempt)}: no hand rendered before reload`).toBeGreaterThan(0);

        await page.reload({ waitUntil: "load" });
        await page.waitForSelector("iframe", { timeout: 15_000 });
        table = page.frameLocator("iframe");

        // The core proof: the match table reappears WITHOUT this script ever
        // re-selecting a bot tier again. A failed/no-op resume would fall
        // back to the catalog screen instead, where `[data-tier="easy"]` is
        // exactly what a player would need to click again.
        await table.locator(".hexdev-truco-table").waitFor({ state: "visible", timeout: RELOAD_TIMEOUT_MS });
        expect(await table.locator('[data-tier="easy"]').count(), `attempt ${String(attempt)}: the catalog re-appeared — the seat was not reclaimed`).toBe(0);

        const handAfter = await ownHandCardIds(table);
        expect(handAfter, `attempt ${String(attempt)}: the hand changed across reload — this looks like a NEW match, not the same seat resumed`).toEqual(handBefore);
      }

      // Genuinely still live after the last reload, not a frozen ghost of a
      // stale connection: the resumed match must still accept a real action
      // when one is available.
      const playable = table.locator('[data-playable="true"]').first();
      if ((await playable.count()) > 0) {
        await playable.click();
        await table.locator(".hexdev-truco-played").first().waitFor({ state: "visible", timeout: 10_000 });
      }

      expect(guard.errors, `console/page errors during the run: ${guard.errors.join("; ")}`).toEqual([]);

      await context.close();
    },
    75_000,
  );

  it(
    "storage denied or unavailable still lets someone play — just without the reload benefit",
    async () => {
      const context = await browser.newContext();
      const page: Page = await context.newPage();
      const guard = attachConsoleGuard(page);

      // Simulates a browser (or a policy) that denies storage outright — the
      // same shape a real "block all site data" setting or Safari ITP in
      // private mode produces: touching `window.localStorage` itself throws
      // synchronously, not merely a read/write on it. `addInitScript`
      // applies to EVERY frame Playwright attaches, including the widget's
      // own sandboxed cross-origin iframe — exactly where
      // `identity-storage.ts`'s defensive reads/writes actually run.
      await page.addInitScript(() => {
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          get(): never {
            throw new DOMException("storage denied", "SecurityError");
          },
        });
      });

      await page.goto(system.hostOrigin, { waitUntil: "load" });
      await page.waitForSelector("iframe", { timeout: 15_000 });
      const table = page.frameLocator("iframe");

      await table.locator('[data-tier="easy"]').first().click({ timeout: 15_000 });
      await table.locator(".hexdev-truco-table").waitFor({ state: "visible", timeout: 30_000 });
      await table.locator(".hexdev-truco-hand [data-card]").first().waitFor({ state: "visible", timeout: 15_000 });
      const handCardCount = await table.locator(".hexdev-truco-hand [data-card]").count();
      expect(handCardCount, "the match never rendered a hand with storage blocked — the widget should still be fully playable").toBeGreaterThan(0);

      expect(guard.errors, `console/page errors with storage blocked: ${guard.errors.join("; ")}`).toEqual([]);

      await context.close();
    },
    45_000,
  );
});
