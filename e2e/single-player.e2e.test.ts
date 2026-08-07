import { chromium, type Browser, type FrameLocator, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachConsoleGuard } from "./support/console-guard.js";
import { readHarnessInfo } from "./support/harness-info.js";

const info = readHarnessInfo();

// A real 15-point match, no shortcuts: our own autoplay calls "truco" once
// per hand (mirroring the manual verification in apply-progress obs 2927,
// "called truco once per hand ... to accelerate toward the target") so this
// terminates in a bounded number of hands instead of the ~15 a pure
// card-only strategy would need.
const MATCH_TIMEOUT_MS = 4 * 60_000;
const POLL_INTERVAL_MS = 300;

/**
 * `truco-engine/src/card-power.ts`'s OWN hierarchy, strongest first,
 * duplicated here deliberately (an e2e spec must not import engine internals
 * — it only ever sees what the real DOM renders, `data-card="<rank>-<suit>"`,
 * the exact `cardId()` shape). Real-run discovery, not assumed up front: an
 * earlier version of this spec played "the first legal card" and left a real
 * match's length to an unbounded random walk — the easy bot's OWN
 * `weakestCardPlay` (see `truco-bot/src/easy.ts`) always plays its worst
 * card, so an opponent that does not deliberately play its BEST card is not
 * favored to win any given accepted-truco hand, and the match only ends once
 * ONE side pulls decisively ahead. Playing the strongest legal card every
 * turn — the exact mirror of the bot's designed weakness — is what actually
 * bounds this spec's own real duration instead of leaving it to chance.
 */
const CARD_POWER_ORDER: readonly string[] = [
  "1-espada",
  "1-basto",
  "7-espada",
  "7-oro",
  "3-espada",
  "3-basto",
  "3-oro",
  "3-copa",
  "2-espada",
  "2-basto",
  "2-oro",
  "2-copa",
  "1-oro",
  "1-copa",
  "12-espada",
  "12-basto",
  "12-oro",
  "12-copa",
  "11-espada",
  "11-basto",
  "11-oro",
  "11-copa",
  "10-espada",
  "10-basto",
  "10-oro",
  "10-copa",
  "7-basto",
  "7-copa",
  "6-espada",
  "6-basto",
  "6-oro",
  "6-copa",
  "5-espada",
  "5-basto",
  "5-oro",
  "5-copa",
  "4-espada",
  "4-basto",
  "4-oro",
  "4-copa",
];

/** Picks the strongest of the currently-playable cards' `data-card` values. */
async function pickStrongestPlayableCard(table: FrameLocator): Promise<string | null> {
  const ids = await table.locator('[data-playable="true"]').evaluateAll((elements) => elements.map((el) => el.getAttribute("data-card")));
  const present = ids.filter((id): id is string => id !== null);
  if (present.length === 0) return null;
  present.sort((a, b) => CARD_POWER_ORDER.indexOf(a) - CARD_POWER_ORDER.indexOf(b));
  return present[0]!;
}

/**
 * The smallest honest strategy that keeps a real match moving without
 * scripting envido (never volunteered by the easy bot either — see
 * `truco-bot/src/easy.ts`'s own `priority()`): accept anything pending on
 * us, call truco once when it is offered, otherwise play the strongest legal
 * card. Every action taken is read straight off the DOM the real widget
 * rendered — nothing here re-decides legality client-side.
 */
async function playOneTurnIfAvailable(table: FrameLocator): Promise<void> {
  const quiero = table.locator('[data-action="respond-truco"]', { hasText: "Quiero" });
  if ((await quiero.count()) > 0) {
    await quiero.first().click();
    return;
  }
  const callTruco = table.locator('[data-action="call-truco"]');
  if ((await callTruco.count()) > 0) {
    await callTruco.first().click();
    return;
  }
  const strongestCardId = await pickStrongestPlayableCard(table);
  if (strongestCardId !== null) {
    await table.locator(`[data-card="${strongestCardId}"]`).click();
  }
}

describe("single-player: a real bot match, on a foreign origin, reaches a real ending", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it(
    "mounts the widget from a different origin than the host page, starts an easy-bot match, plays it out, and shows the real match-over overlay",
    async () => {
      const context = await browser.newContext();
      const page: Page = await context.newPage();
      const guard = attachConsoleGuard(page);

      await page.goto(info.hostOrigin, { waitUntil: "load" });

      // Proves the loader actually mounted an iframe — the loader refuses to
      // mount at all when the widget origin equals the host origin (design
      // §6/`loader.ts`), so a visible table below is only reachable through
      // a genuinely cross-origin mount.
      await page.waitForSelector("iframe", { timeout: 15_000 });
      const table = page.frameLocator("iframe");

      await table.locator('[data-tier="easy"]').first().click({ timeout: 15_000 });
      await table.locator(".hexdev-truco-table").waitFor({ state: "visible", timeout: 30_000 });

      const deadline = Date.now() + MATCH_TIMEOUT_MS;
      let sawMatchOver = false;
      while (Date.now() < deadline) {
        if ((await table.locator(".hexdev-truco-match-over[data-result]").count()) > 0) {
          sawMatchOver = true;
          break;
        }
        await playOneTurnIfAvailable(table);
        await page.waitForTimeout(POLL_INTERVAL_MS);
      }

      expect(sawMatchOver, `the match never reached a real ending within ${String(MATCH_TIMEOUT_MS)}ms`).toBe(true);

      const scoreText = await table.locator(".hexdev-truco-match-over-score").textContent();
      expect(scoreText).toBeTruthy();
      await table.locator('[data-action="play-again"]').waitFor({ state: "visible", timeout: 5_000 });

      expect(guard.errors, `console/page errors during the run: ${guard.errors.join("; ")}`).toEqual([]);

      await context.close();
    },
    MATCH_TIMEOUT_MS + 30_000,
  );
});
