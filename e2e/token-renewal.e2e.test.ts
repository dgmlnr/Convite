import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachConsoleGuard } from "./support/console-guard.js";
import { readHarnessInfo } from "./support/harness-info.js";
import { startSystem, type SystemHandle } from "./support/system.js";

// The session TTL is fixed at build/global-setup time (see
// global-setup.ts), so it is safe to read here at module scope — this value
// only drives this spec's own title/timeout, never a network call. The
// actual running server for THIS file is started fresh in `beforeAll` below
// (see `support/system.ts`'s own doc comment for why every file gets its
// own isolated process).
const info = readHarnessInfo();

/**
 * obs 2968: "the token expires before a human clicks." An automated click
 * happens in milliseconds; a real player, reading whatever they were
 * reading before deciding to play, can genuinely take minutes. That gap is
 * exactly what this spec drives — a REAL wait past the server's own session
 * TTL (configured short for this run, see global-setup.ts's own doc
 * comment), not a shortened/faked one. The fix under test is `main.ts`'s
 * `withFreshToken`: a fresh token is minted immediately before the join,
 * never the page-load bootstrap token this wait would otherwise expire.
 */
describe("a session token minted at page load survives a real wait past its TTL", () => {
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

  const realWaitMs = (info.sessionTtlSeconds + 4) * 1000;

  it(
    `waits ${String(realWaitMs)}ms — genuinely longer than the server's own ${String(info.sessionTtlSeconds)}s session TTL — then starts a bot match, proving the widget joins with a freshly renewed token rather than the stale page-load one`,
    async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const guard = attachConsoleGuard(page);

      await page.goto(system.hostOrigin, { waitUntil: "load" });
      await page.waitForSelector("iframe", { timeout: 15_000 });
      const table = page.frameLocator("iframe");
      await table.locator('[data-tier="easy"]').first().waitFor({ state: "visible", timeout: 15_000 });

      // The real wait. No sped-up clock, no mocked timers — see this spec's
      // own doc comment for why that would defeat the point.
      await page.waitForTimeout(realWaitMs);

      await table.locator('[data-tier="easy"]').first().click();

      await table.locator(".hexdev-truco-table").waitFor({ state: "visible", timeout: 20_000 });
      await table.locator("[data-card]").first().waitFor({ state: "visible", timeout: 15_000 });
      const handCardCount = await table.locator("[data-card]").count();
      expect(handCardCount, "the local hand never rendered — the join likely failed silently past the TTL").toBeGreaterThan(0);

      expect(guard.errors, `console/page errors during the run: ${guard.errors.join("; ")}`).toEqual([]);

      await context.close();
    },
    realWaitMs + 45_000,
  );
});
