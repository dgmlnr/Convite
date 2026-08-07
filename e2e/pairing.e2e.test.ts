import { chromium, type Browser, type BrowserContext, type FrameLocator, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachConsoleGuard, type ConsoleGuard } from "./support/console-guard.js";
import { readHarnessInfo } from "./support/harness-info.js";

const info = readHarnessInfo();
const PAIRING_TIMEOUT_MS = 30_000;
const ACTOR_WAIT_TIMEOUT_MS = 15_000;

interface Side {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly table: FrameLocator;
  readonly guard: ConsoleGuard;
}

async function mountAndOpenSelection(browser: Browser): Promise<Side> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const guard = attachConsoleGuard(page);
  await page.goto(info.hostOrigin, { waitUntil: "load" });
  await page.waitForSelector("iframe", { timeout: 15_000 });
  const table = page.frameLocator("iframe");
  await table.locator('[data-action="vs-person"]').first().waitFor({ state: "visible", timeout: 15_000 });
  return { context, page, table, guard };
}

/**
 * The single most-repeated open item in this project's history (apply
 * prompt: "the multiplayer path has never been verified with two real
 * browsers"). Two independent `BrowserContext`s — separate storage, separate
 * `playerId` — both mounting the widget on the SAME host page, both choosing
 * "jugar contra otra persona" for the same modality, and one real action
 * from one side observed by the other through the server. This is
 * deliberately NOT a full hand: proving one action propagates end to end is
 * the honest claim this spec makes; playing a whole hand between two bots
 * pretending to be humans would not prove anything a scripted second player
 * doesn't already prove better.
 */
describe("two real browsers pair and one real action is observed by the other side", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it(
    "two independent browser contexts both requesting a person match land in the same room, and a played card propagates",
    async () => {
      const a = await mountAndOpenSelection(browser);
      const b = await mountAndOpenSelection(browser);

      await a.table.locator('[data-action="vs-person"]').first().click();
      await b.table.locator('[data-action="vs-person"]').first().click();

      await a.table.locator(".hexdev-truco-table").waitFor({ state: "visible", timeout: PAIRING_TIMEOUT_MS });
      await b.table.locator(".hexdev-truco-table").waitFor({ state: "visible", timeout: PAIRING_TIMEOUT_MS });

      // Mano moves first — poll both sides for whichever one actually got a
      // playable card; do not assume which seat that is.
      const deadline = Date.now() + ACTOR_WAIT_TIMEOUT_MS;
      let actor: Side | null = null;
      let observer: Side | null = null;
      while (Date.now() < deadline && actor === null) {
        if ((await a.table.locator('[data-playable="true"]').count()) > 0) {
          actor = a;
          observer = b;
          break;
        }
        if ((await b.table.locator('[data-playable="true"]').count()) > 0) {
          actor = b;
          observer = a;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      expect(actor, "neither side ever saw a playable card — pairing did not reach a real turn").not.toBeNull();

      const playedBefore = await observer!.table.locator(".hexdev-truco-played").count();
      await actor!.table.locator('[data-playable="true"]').first().click();

      // The real proof: a card played on ONE browser context, arriving on
      // the OTHER, independent browser context, through the server — never
      // observed via two SDK-level clients before this suite.
      const propagationDeadline = Date.now() + 10_000;
      let propagated = false;
      while (Date.now() < propagationDeadline) {
        const now = await observer!.table.locator(".hexdev-truco-played").count();
        if (now > playedBefore) {
          propagated = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      expect(propagated, "the acting side's played card never appeared on the observing side").toBe(true);

      expect(a.guard.errors, `console/page errors on side A: ${a.guard.errors.join("; ")}`).toEqual([]);
      expect(b.guard.errors, `console/page errors on side B: ${b.guard.errors.join("; ")}`).toEqual([]);

      await a.context.close();
      await b.context.close();
    },
    PAIRING_TIMEOUT_MS + 60_000,
  );
});
