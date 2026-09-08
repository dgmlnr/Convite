import { chromium, type Browser, type FrameLocator, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachConsoleGuard } from "./support/console-guard.js";
import { startSystem, type SystemHandle } from "./support/system.js";

/**
 * ELEVEN BOXES, WRITTEN ONE PER TURN, IN A REAL BROWSER — a real cross-origin
 * mount, a real match room, a real bot in the other seat, and every throw made
 * by the server.
 *
 * WHY THIS SPEC EXISTS given that everything under it is fenced one tier down,
 * which is the question `mahjong-solitaire.e2e.test.ts` answers for its own
 * board: nothing below here has ever run the whole thing. The engine's tests
 * hand it states, the module's tests hand it actions, the board's browser tests
 * hand it views, and the registry's tests hand it payloads. Between them sits a
 * room that has never asked this module for entropy on a real timer, a lobby
 * that has never offered a dice game, a widget that has never mounted this
 * renderer over a websocket, and a bot that has never been driven by anything
 * but a test's own loop. Each of those is a composition, and this change has
 * already been bitten twice by a composition every unit test agreed with — a
 * board whose two regions could be deleted with the suite green (slice 19), and
 * two composition roots that could disagree with nothing to say so (slice 18).
 *
 * IT DECIDES NOTHING ABOUT THE RULES, and the mechanism is the planilla's own:
 * a cell carries a `<button>` if and only if the server offered a `score` for
 * it, and that button's LABEL is the engine's own `scoreFor` for the throw on
 * the table. So this loop reads which boxes are pressable and what each would
 * pay, and presses one — it never works out a category, a total or a legality.
 * The discipline `single-player.e2e.test.ts` states for truco, unchanged.
 *
 * ONE HOLD PER TURN, DELIBERATELY. Scoring straight off the opening throw would
 * finish a whole match without this spec ever exercising the half of the game
 * that has a round trip in it: a `hold` names die INDICES, the server splices
 * only the re-rolled faces back BY POSITION, and a held die has to come back as
 * the same die. Keeping the first die and throwing the other four is the
 * smallest press sequence that puts that path through a real socket, and it is
 * also the only press in this file that dispatches an action rather than
 * writing a box.
 */

// FOUR MINUTES AGAINST A MEASURED MINUTE, and what the minute goes on is not
// this spec's own work. A bot decision is paced at `DEFAULT_THINKING_DELAY_MS`
// (1200 ms) and every throw waits the registration's own `systemActionPauseMs`
// (350 ms) before it lands, so a two-seat, 22-turn match pays roughly a minute
// of deliberate rhythm over milliseconds of actual computation — slice 17
// measured the hard tier's slowest decision at 8.87 ms. Measured here, whole
// file including its server boot and its browser launch: 51.3 s, 58.3 s,
// 58.1 s, and the match itself finished at 22/22 boxes each time, four boxes
// per ten seconds throughout. Set from the longest, not from an average, and
// `single-player.e2e.test.ts`'s own budget history is why the number is
// justified here instead of raised later: three of its raises blamed a bot
// that was innocent.
const MATCH_TIMEOUT_MS = 4 * 60_000;
const POLL_INTERVAL_MS = 150;
const PROGRESS_LOG_INTERVAL_MS = 10_000;
/** Eleven categories on two cards. The only other way this match can end is a
 * generala servida off the cup, which writes no box at all — see the final
 * assertion, which is a branch precisely because both are real endings. */
const BOXES_ON_THE_SHEET = 22;
const CATEGORIES = 11;
const DICE = 5;

interface ScoreOffer {
  readonly category: string;
  readonly seat: string;
  readonly preview: number;
}

interface TableSnapshot {
  /** `data-result` off the match-over overlay, or `null` while the match is
   * live. The overlay renders nothing at all until the view carries an
   * outcome, so its own emptiness is the liveness check. */
  readonly ended: string | null;
  /** The roll control's label, or `null` when the board draws none or draws it
   * disabled. Three states answer that way for ONE reason — the third throw,
   * another seat's turn, and the moment the cup is shaking all offer no
   * `hold` — which is exactly why this spec reads the affordance instead of
   * counting throws. */
  readonly rollLabel: string | null;
  readonly dice: number;
  readonly offers: readonly ScoreOffer[];
  readonly filled: number;
  /** Whether the servida callout is up, which `generala-ui` draws on exactly
   * one condition: the turn is `deciding` at `SERVIDA_ROLL`. So it is the
   * board's own, unforgeable answer to "is this still the opening throw?" —
   * see the two flags the loop keeps with it. */
  readonly servida: boolean;
  readonly announced: string;
}

/**
 * ONE cross-frame read per press, for the reason `single-player.e2e.test.ts`
 * records at length: every question crosses an iframe boundary, and a
 * per-element query inside a 22-turn loop is how a spec spends its budget on
 * bookkeeping instead of on the game.
 */
async function readTable(table: FrameLocator): Promise<TableSnapshot> {
  return table.locator("body").evaluate((body): TableSnapshot => {
    const overlay = body.querySelector<HTMLElement>(".hexdev-generala-match-over");
    const roll = body.querySelector<HTMLButtonElement>("button.hexdev-generala-roll");
    const offers = [...body.querySelectorAll<HTMLTableCellElement>("tbody tr[data-category] td[data-seat]")].flatMap((cell) => {
      const button = cell.querySelector<HTMLButtonElement>("button.hexdev-generala-score");
      if (button === null) return [];
      return [
        {
          category: cell.closest("tr")?.getAttribute("data-category") ?? "",
          seat: cell.getAttribute("data-seat") ?? "",
          preview: Number(button.textContent ?? "0"),
        },
      ];
    });
    return {
      ended: overlay?.dataset.result ?? null,
      rollLabel: roll === null || roll.disabled ? null : (roll.textContent ?? ""),
      // `button.` on purpose: a slot waiting for a face is a `<div>` wearing
      // the same class, so this counts dice a player can actually press.
      dice: body.querySelectorAll("button.hexdev-generala-die").length,
      offers,
      // `data-state` is the planilla's own word for a spent box, and reading
      // it is not the same as reading the cell's text: an OPEN cell on the
      // acting seat's column carries a preview number that looks exactly like
      // a written score.
      filled: body.querySelectorAll('td[data-seat][data-state="filled"], td[data-seat][data-state="crossed"]').length,
      servida: body.querySelector("p.hexdev-generala-servida") !== null,
      announced: body.querySelector("[aria-live]")?.textContent ?? "",
    };
  });
}

describe("generala: eleven boxes against a real bot, on a foreign origin, reach a real ending", () => {
  let browser: Browser;
  let system: SystemHandle;

  beforeAll(async () => {
    // A fresh, isolated server process for THIS file only — `support/system.ts`
    // carries why sharing one across spec files reproducibly stalled a match.
    // The tenant is entitled to truco AND generala, so the front door is a
    // real two-shelf catalogue rather than the single-family bypass.
    system = await startSystem({ extraEntitledGames: ["generala"] });
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    await system?.stop();
  });

  it(
    "is reachable from the dados shelf, throws through the server on every turn, and ends on a real match-over overlay",
    async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page: Page = await context.newPage();
      const guard = attachConsoleGuard(page);

      await page.goto(system.hostOrigin, { waitUntil: "load" });

      // Proves the loader really mounted an iframe: it refuses to mount at all
      // when the widget origin equals the host origin, so a board below is
      // only reachable through a genuinely cross-origin mount.
      await page.waitForSelector("iframe", { timeout: 15_000 });
      const table = page.frameLocator("iframe");

      // SCREEN ONE. Two entitled families collapse into two shelves, and this
      // game's card is under the one this change added.
      await table.locator('.hexdev-chrome-section-title:text-is("Dados")').waitFor({ state: "visible", timeout: 15_000 });
      await table.locator('.hexdev-game-card[data-family="generala"]').click({ timeout: 15_000 });

      // SCREEN TWO. Two seats, so a rival — a person or one of three tiers —
      // and no solitaire control anywhere on the card.
      await table.locator('button[data-action="vs-bot"][data-tier="easy"]').waitFor({ state: "visible", timeout: 15_000 });
      expect(await table.locator('button[data-action="play-solo"]').count(), "a two-seat game offered the solitaire control").toBe(0);
      await table.locator('button[data-action="vs-bot"][data-tier="easy"]').click();

      // THE OPENING THROW. Nobody asked for it: a new match begins in
      // `awaiting-roll`, where NO seat has a legal action, which is the exact
      // condition the room reads before asking the module for entropy.
      await table.locator("table.hexdev-generala-scorecard-table").waitFor({ state: "visible", timeout: 30_000 });
      await table.locator("button.hexdev-generala-die").first().waitFor({ state: "visible", timeout: 30_000 });
      const dealt = await readTable(table);
      expect(await table.locator("tbody tr[data-category]").count(), "eleven categories on the sheet").toBe(CATEGORIES);
      expect(dealt.dice, "five dice on the table before anyone pressed anything").toBe(DICE);
      expect(dealt.filled, "a box was written before the first turn was played").toBe(0);

      const deadline = Date.now() + MATCH_TIMEOUT_MS;
      let lastProgressLogAt = Date.now();
      let sawMatchOver = false;
      let scoredByThisPlayer = 0;
      let heldByThisPlayer = 0;
      // Whether this turn's one hold has already been spent. Reset by the
      // score that ends the turn, so the DOM is never asked whose turn it is —
      // a question it does not answer directly and this spec has no business
      // inferring.
      let holdSpent = false;
      // THE HOLD'S ONLY OBSERVABLE PROOF, and it is here because the ladder
      // asked for it: without these two flags a `throwThem` that dispatched
      // NOTHING still finished a whole match at 22/22, because the loop would
      // simply score the opening throw and move on. The callout is up on
      // exactly one condition — `deciding` at `SERVIDA_ROLL` — so seeing this
      // player offered boxes with it up AND with it down is seeing a second
      // throw arrive on this player's own turn, which only a dispatched
      // `hold` and a real system roll can produce.
      let sawOwnOpeningThrow = false;
      let sawOwnLaterThrow = false;

      while (Date.now() < deadline) {
        const snapshot = await readTable(table);
        if (snapshot.ended !== null) {
          sawMatchOver = true;
          break;
        }

        if (snapshot.offers.length > 0) {
          if (snapshot.servida) sawOwnOpeningThrow = true;
          else sawOwnLaterThrow = true;

          if (!holdSpent && snapshot.rollLabel !== null && snapshot.dice === DICE) {
            // Keep the first die, throw the other four. The tray turns these
            // two presses into the engine's OWN offer object rather than a
            // shape this file builds — which matters since PR #257, because
            // the room admits an action only when it matches one the game
            // offered, comparing `keep` BY INDEX.
            await table.locator("button.hexdev-generala-die").first().click();
            await table.locator("button.hexdev-generala-roll").click();
            heldByThisPlayer += 1;
            holdSpent = true;
          } else {
            // The best box on offer, by the number the planilla is showing.
            const best = [...snapshot.offers].sort((left, right) => right.preview - left.preview)[0]!;
            await table.locator(`tbody tr[data-category="${best.category}"] td[data-seat="${best.seat}"] button.hexdev-generala-score`).click();
            scoredByThisPlayer += 1;
            holdSpent = false;
          }
        }

        await page.waitForTimeout(POLL_INTERVAL_MS);

        // Permanent diagnostic, not throwaway. If this spec ever hits its own
        // timeout, this is what says whether the match genuinely stopped
        // advancing (`filled` frozen with nothing on offer) or was merely
        // unfinished — the distinction three of `single-player`'s budget
        // raises were spent failing to make.
        if (Date.now() - lastProgressLogAt >= PROGRESS_LOG_INTERVAL_MS) {
          lastProgressLogAt = Date.now();
          const elapsedSeconds = Math.round((Date.now() - (deadline - MATCH_TIMEOUT_MS)) / 1000);
          // `process.stdout.write`, not `console.log`: this runner intercepts
          // the console, and a diagnostic nobody can read in a CI log is not a
          // diagnostic. `mahjong-solitaire.e2e.test.ts` writes its own the same
          // way, for the same reason.
          process.stdout.write(`  ${String(elapsedSeconds)}s · boxes ${String(snapshot.filled)}/${String(BOXES_ON_THE_SHEET)} · offers ${String(snapshot.offers.length)} · roll ${snapshot.rollLabel ?? "—"} · ${snapshot.announced}\n`);
        }
      }

      expect(sawMatchOver, `the match never reached a real ending within ${String(MATCH_TIMEOUT_MS)}ms`).toBe(true);

      const final = await readTable(table);
      // The whole match in one line, kept rather than deleted: which of the two
      // terminal paths ran is not this spec's choice, and a reader of a CI log
      // should not have to work it out from a green tick.
      process.stdout.write(`\n  boxes ${String(final.filled)}/${String(BOXES_ON_THE_SHEET)} · written here ${String(scoredByThisPlayer)} · holds ${String(heldByThisPlayer)} · ${final.announced}\n`);

      expect(sawOwnOpeningThrow, "this player was never offered a box on an opening throw").toBe(true);
      expect(sawOwnLaterThrow, "every box this player wrote was written off an opening throw — no hold ever produced a second one").toBe(true);

      expect(final.ended, "the overlay is up but says nothing about who won").toMatch(/^(won|lost)$/);
      await table.locator(".hexdev-generala-match-over-panel").waitFor({ state: "visible", timeout: 5_000 });
      expect(await table.locator(".hexdev-generala-match-over-score").textContent(), "the final line does not read like a result").toMatch(/^Resultado final: /);
      await table.locator('[data-action="play-again"]').waitFor({ state: "visible", timeout: 5_000 });

      // THE TWO TERMINAL PATHS, AND WHICH ONE HAPPENED IS NOT THIS SPEC'S
      // CHOICE. Every box filled is the ordinary ending. A generala servida —
      // five of a kind on an opening throw — ends the match outright before
      // the seat is offered anything, and writes nothing: roughly 1 in 1296
      // per opening throw, and there are 22 of them, so it lands on about 1.7%
      // of runs. Asserted as a branch rather than tolerated as a range,
      // because a match that stopped early for any OTHER reason must still red
      // here.
      if (scoredByThisPlayer === CATEGORIES) {
        expect(final.filled, "every box on both cards, written one per turn").toBe(BOXES_ON_THE_SHEET);
      } else {
        expect(final.announced, `the match ended after ${String(scoredByThisPlayer)} of this player's boxes and nothing announced a servida`).toContain("Generala servida");
        expect(final.filled, "a servida win writes no box, so the sheet cannot be full").toBeLessThan(BOXES_ON_THE_SHEET);
      }

      expect(guard.errors, `console/page errors during the run: ${guard.errors.join("; ")}`).toEqual([]);

      await context.close();
    },
    MATCH_TIMEOUT_MS + 30_000,
  );
});
