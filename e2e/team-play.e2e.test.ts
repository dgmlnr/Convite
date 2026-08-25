import { chromium, type Browser, type FrameLocator, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachConsoleGuard } from "./support/console-guard.js";
import { startSystem, type SystemHandle } from "./support/system.js";

const MATCH_START_TIMEOUT_MS = 30_000;
/**
 * Deliberately generous, and deliberately NOT tied to how fast the bots
 * think.
 *
 * This was 15s, a number that silently encoded the bots' own pace: in 2v2
 * the human waits out a whole bot opening before their first playable turn,
 * and three bots can chain an entire envido/truco/retruco exchange first —
 * nine decisions in a row is an ordinary run. 15s cleared nine decisions at
 * a 1000ms pause and stopped clearing them the moment that pause was tuned
 * up, at which point the spec failed as "never got a real playable turn":
 * a message that reads like a broken 2v2 room rather than a stale timer.
 *
 * The loop exits the instant a turn is playable, so a large budget costs
 * nothing on a healthy run — it is only ever spent on a genuine hang. That
 * is what this bound should mean, and pinning it to the bot's pace was what
 * made it mean something else.
 */
const ACTOR_WAIT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 200;

/**
 * "Make 2v2 truco actually playable" (this unit's own top-level ask),
 * proven by running it, not asserted: a REAL browser, through the REAL
 * rendered widget UI — the exact path a player uses — picks the 2v2
 * catalog entry and a bot tier, reaching a genuine 4-seat match (1 human +
 * 3 bot-filled seats, via this unit's own `humanSeatsNeeded`-generalized
 * `MatchRoom`), sees the real partner/opponent labels, and plays real turns
 * through it — the same "one real action through the real transport, not a
 * full hand" honesty discipline this suite's own `pairing.e2e.test.ts`
 * already applies.
 *
 * The over-the-wire señas redaction proof lives separately, in
 * `packages/transport-colyseus-client/src/team-play.live.test.ts`: proving
 * "does a signal ever cross the wire to an opponent" is a transport-level
 * claim best proven with two real client connections against a real
 * (in-process) Colyseus server via `@colyseus/testing` — the SAME
 * established live-transport pattern `adapter.live.test.ts` already uses in
 * that package, with a SYNTHETIC 4-seat fixture (never `@hexdev/truco-module`
 * — both packages sit at the same L2 layer; see that file's own docstring
 * for the full boundary argument) — rather than adding a new root-level
 * workspace dependency edge to this repo-root `e2e/` folder, which this
 * unit deliberately avoided after hitting this workspace's pnpm
 * exotic-subdependency block trying exactly that.
 */
describe("2v2: a real four-seat match, playable through the widget UI", () => {
  let browser: Browser;
  let system: SystemHandle;

  beforeAll(async () => {
    system = await startSystem({ extraEntitledGames: ["truco-argentino-2v2"] });
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    await system?.stop();
  });

  it(
    "a real browser starts a 2v2 match against 3 bot-filled seats, sees the partner/opponent labels, and plays real turns",
    async () => {
      const context = await browser.newContext();
      const page: Page = await context.newPage();
      const guard = attachConsoleGuard(page);

      await page.goto(system.hostOrigin, { waitUntil: "load" });
      await page.waitForSelector("iframe", { timeout: 15_000 });
      const table: FrameLocator = page.frameLocator("iframe");

      // The 2v2 game card offers ONLY bot buttons (game-selection.ts's own
      // seatCount gate — no vs-person affordance for a 4-seat modality this
      // unit's matchmaking pool cannot yet pair). Scoped to the 2v2 card's
      // own heading so this never accidentally clicks the 1v1 card's button
      // — both cards are on screen at once once the tenant is entitled to
      // both.
      const card2v2 = table.locator(".hexdev-game-card", { hasText: "Truco Argentino 2v2" });
      await card2v2.locator('[data-tier="easy"]').first().click({ timeout: 15_000 });

      await table.locator(".hexdev-truco-table").waitFor({ state: "visible", timeout: MATCH_START_TIMEOUT_MS });
      expect(await table.locator(".hexdev-truco-table").getAttribute("data-seat-count")).toBe("4");

      // Partner-vs-opponent must be obvious at a glance — the real rendered
      // labels, not merely asserted at the unit level.
      await table.locator(".hexdev-truco-relation-label", { hasText: "Compañero" }).waitFor({ state: "attached", timeout: 5_000 });
      expect(await table.locator(".hexdev-truco-relation-label", { hasText: "Rival" }).count()).toBe(2);

      // Play real turns until at least one card play propagates — accept
      // anything pending, otherwise play the first playable card. Not a
      // full match to conclusion: this spec's own honest scope is proving a
      // real 4-seat turn genuinely advances through the real 2v2 engine and
      // room, matching pairing.e2e.test.ts's own "one real action" bar.
      const deadline = Date.now() + ACTOR_WAIT_TIMEOUT_MS;
      let playedAtLeastOneTurn = false;
      while (Date.now() < deadline && !playedAtLeastOneTurn) {
        const quieroTruco = table.locator('[data-action="respond-truco"]', { hasText: "Quiero" });
        if ((await quieroTruco.count()) > 0) {
          await quieroTruco.first().click();
        }
        const quieroEnvido = table.locator('[data-action="respond-envido"]', { hasText: "Quiero" });
        if ((await quieroEnvido.count()) > 0) {
          await quieroEnvido.first().click();
        }
        const playable = table.locator('[data-playable="true"]');
        if ((await playable.count()) > 0) {
          await playable.first().click();
          playedAtLeastOneTurn = true;
          break;
        }
        await page.waitForTimeout(POLL_INTERVAL_MS);
      }
      expect(playedAtLeastOneTurn, "never got a real playable turn in a live 2v2 bot match").toBe(true);

      expect(guard.errors, `console/page errors during the 2v2 run: ${guard.errors.join("; ")}`).toEqual([]);

      await context.close();
    },
    MATCH_START_TIMEOUT_MS + ACTOR_WAIT_TIMEOUT_MS + 30_000,
  );
});
