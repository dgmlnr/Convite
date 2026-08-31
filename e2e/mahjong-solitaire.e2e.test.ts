import { chromium, type Browser, type FrameLocator, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachConsoleGuard } from "./support/console-guard.js";
import { startSystem, type SystemHandle } from "./support/system.js";

/**
 * A WHOLE BOARD, PLAYED — a real browser, a real cross-origin mount, a real
 * match room, a real generated turtle, and 72 real removals ending in the
 * real completion panel.
 *
 * WHY THIS SPEC EXISTS AT ALL, given that everything it touches is already
 * fenced one tier down. Nothing below here has ever run the whole thing:
 * the engine's tests hand it boards, the module's tests hand it actions, the
 * board's browser tests hand it tile arrays, and the registry's tests hand it
 * payloads. Between them sits a match room that has never dealt a solitaire,
 * a lobby that has never offered one, and a presence queue that has never
 * formed a group of ONE. Each of those is a composition, and this change has
 * already been bitten once by a composition every unit test agreed with — a
 * generator recording its own solution in the order it chose it, refused by a
 * module whose every fence was green.
 *
 * IT RE-DECIDES NOTHING. The spec never computes whether a tile is free or
 * whether two faces match; it presses tiles and reads what the widget does.
 * `resolvePress` only marks a tile the SERVER has offered, so a tile that
 * lights up is the server's answer, not this file's opinion — which is the
 * same discipline `single-player.e2e.test.ts` states for truco, arrived at
 * from the other direction.
 *
 * WHAT THE ORDERING HEURISTIC IS AND IS NOT. Once a tile is marked, the
 * partner is looked for among tiles drawn with the SAME face first, then
 * among the bonus tiles, then among everything else. That is a search ORDER
 * and never a decision: every candidate is pressed, and only a pair the
 * server accepts removes anything. Getting the order wrong costs wall clock
 * and nothing else.
 */

// A full board is 72 removals, each a real websocket round trip through a
// real match room. Measured over the runs that built this spec: a board
// completes in well under two minutes on this machine.
const BOARD_TIMEOUT_MS = 5 * 60_000;

interface BoardTile {
  readonly position: number;
  readonly face: string;
  /**
   * Whether a press at this tile's own centre reaches THIS tile.
   *
   * Asked of the document with `elementFromPoint`, which is the board's own
   * hit test rather than a second opinion about it: a press in this game is a
   * POINT, and on a five-deep turtle most tiles have another tile painted
   * over their middle. Pressing one of those does something perfectly
   * sensible — it lifts the tile on top — but it is not a press of the tile
   * this loop meant, and a loop that does not know the difference spends its
   * whole budget churning the same two selections.
   */
  readonly reachable: boolean;
}

interface BoardSnapshot {
  /** Every tile still on the board, in the DOM's own order — which is the
   * layout's `(z, y, x)`, so the tiles most likely to be free come last. */
  readonly tiles: readonly BoardTile[];
  readonly selected: number | null;
  readonly ended: string | null;
}

/** ONE cross-frame read per press, for the reason `single-player.e2e.test.ts`
 * records at length: each question crosses an iframe boundary, and a
 * per-element query in a 144-tile loop is how a spec spends minutes on
 * bookkeeping. */
async function readBoard(table: FrameLocator): Promise<BoardSnapshot> {
  return table.locator("body").evaluate((body): BoardSnapshot => {
    const tiles = [...body.querySelectorAll<HTMLElement>("[data-position][data-tile]")].map((element) => {
      const box = element.getBoundingClientRect();
      const hit = body.ownerDocument.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      const owner = hit === null ? null : hit.closest("[data-position]");
      return {
        position: Number(element.getAttribute("data-position")),
        face: element.dataset.tile ?? "",
        reachable: owner === element,
      };
    });
    const marked = body.querySelector<HTMLElement>("[data-selected]");
    const panel = body.querySelector<HTMLElement>("[data-result]");
    return {
      tiles,
      selected: marked === null ? null : Number(marked.getAttribute("data-position")),
      ended: panel === null ? null : (panel.dataset.result ?? null),
    };
  });
}

/**
 * A real press at the tile's own centre — the same path a finger takes,
 * through `elementFromPoint` and the board's single surface listener.
 *
 * `force`, and it is the honest option rather than the convenient one. A
 * press in this game is a POINT, not an element: the board's whole hit-test
 * contract is that `elementFromPoint` answers with whatever is painted
 * topmost there, and five layers of a turtle mean most tiles are covered.
 * Playwright's actionability check refuses to click a covered element — which
 * is itself evidence the occlusion is real, and it reported exactly that
 * ("<div data-position=\"141\"> intercepts pointer events") before this
 * option was added. Skipping the check presses the point and lets the board
 * decide, which is what a finger on a covered tile does too: it lifts the one
 * on top.
 */
async function press(table: FrameLocator, position: number): Promise<void> {
  // A tile can leave the board between the snapshot that named it and the
  // press: the previous press may have completed a pair this loop was not
  // expecting. A press of something that is no longer there is a no-op, not
  // a failure — the next read is what says what actually happened.
  await table
    .locator(`[data-position="${String(position)}"]`)
    .click({ timeout: 2_000, force: true })
    .catch(() => undefined);
}

const isBonus = (face: string): boolean => face.startsWith("flower-") || face.startsWith("season-");

/** A SEARCH ORDER, never a decision: same drawn face first, then the bonus
 * tiles when the anchor is one, then everything else. Only a pair the server
 * accepts removes anything, so getting this wrong costs wall clock and
 * nothing else. */
function partnerRank(anchor: BoardTile, candidate: BoardTile): number {
  if (candidate.face === anchor.face) return 0;
  return isBonus(anchor.face) && isBonus(candidate.face) ? 1 : 2;
}

describe("mahjong solitaire: a real board, dealt by a real match room and cleared by a real browser", () => {
  let browser: Browser;
  let system: SystemHandle;

  beforeAll(async () => {
    system = await startSystem({ extraEntitledGames: ["mahjong-solitario"] });
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    await system?.stop();
  });

  it(
    "is reachable from the front door, deals a 144-tile turtle, and reports how long it took once the last pair comes off",
    async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page: Page = await context.newPage();
      const guard = attachConsoleGuard(page);

      await page.goto(system.hostOrigin, { waitUntil: "load" });
      await page.waitForSelector("iframe", { timeout: 15_000 });
      const table = page.frameLocator("iframe");

      // SCREEN ONE. Two entitled families collapse into two shelves, so the
      // front door is what a player meets — and the solitaire's own card is
      // under the shelf this slice named.
      await table.locator('.hexdev-chrome-section-title:text-is("Fichas")').waitFor({ state: "visible", timeout: 15_000 });
      await table.locator('.hexdev-game-card[data-family="mahjong-solitario"]').click({ timeout: 15_000 });

      // SCREEN TWO. One control, and no opponent anywhere on the card.
      await table.locator('button[data-action="play-solo"]').waitFor({ state: "visible", timeout: 15_000 });
      expect(await table.locator('button[data-action="vs-bot"]').count(), "a solitaire offered a machine to play against").toBe(0);
      expect(await table.locator('button[data-action="vs-person"]').count(), "a solitaire offered another person to play against").toBe(0);
      await table.locator('button[data-action="play-solo"]').click();

      // THE DEAL. A one-seat queue forms a group of one and hands off
      // immediately, and the room then asks the module for a board because no
      // seat can act yet.
      await table.locator("[data-position]").first().waitFor({ state: "visible", timeout: 30_000 });
      const dealt = await readBoard(table);
      expect(dealt.tiles, "a full wall is 144 tiles").toHaveLength(144);
      expect(new Set(dealt.tiles.map((tile) => tile.face)).size, "every one of the 42 faces reaches a real board").toBe(42);

      const deadline = Date.now() + BOARD_TIMEOUT_MS;
      let board = dealt;
      // Anchors whose whole candidate list has been walked without a removal,
      // on THIS board. Cleared the moment a pair comes off, because every
      // remaining tile's neighbourhood may have changed.
      let exhausted = new Set<number>();

      while (board.ended === null && Date.now() < deadline) {
        const before = board.tiles.length;
        // TOP DOWN. `tiles` arrives in the layout's own ascending `(z, y, x)`,
        // so reversing takes the apex first — the standard way to play this
        // game by hand, and the one that keeps the most options open: a tile
        // on the top layer is covering something, and a tile on the base
        // layer is covering nothing.
        const reachable = [...board.tiles].reverse().filter((tile) => tile.reachable);
        const moved = (): boolean => board.tiles.length < before || board.ended !== null;

        // ONE ANCHOR: a tile the SERVER is offering. Pressing a tile only
        // marks it when `legalActions` names it, so a tile that lights up is
        // the server's answer and not this file's opinion.
        //
        // A press here can also COMPLETE a pair — the previous iteration may
        // have left a mark on the board — which is a perfectly good outcome
        // and simply ends this iteration early.
        let anchor: BoardTile | undefined;
        for (const tile of reachable) {
          if (exhausted.has(tile.position)) continue;
          if (board.selected !== tile.position) await press(table, tile.position);
          board = await readBoard(table);
          if (moved()) break;
          if (board.selected === tile.position) {
            anchor = tile;
            break;
          }
        }
        if (moved()) {
          exhausted = new Set<number>();
          continue;
        }
        if (anchor === undefined) break; // nothing left on this board can be lifted

        // Its partner, looked for among the tiles a press can actually reach.
        const held = anchor;
        for (const candidate of [...reachable].filter((tile) => tile.position !== held.position).sort((a, b) => partnerRank(held, a) - partnerRank(held, b))) {
          await press(table, candidate.position);
          board = await readBoard(table);
          if (moved()) break;
          // The press marked something else instead: that candidate is itself
          // liftable but not with this anchor. Put the anchor back and carry
          // on down the list.
          if (board.selected !== held.position) {
            if (board.selected !== null) await press(table, board.selected);
            await press(table, held.position);
            board = await readBoard(table);
            if (moved() || board.selected !== held.position) break;
          }
        }

        if (moved()) exhausted = new Set<number>();
        else exhausted.add(held.position);
      }

      const ending = await readBoard(table);
      process.stdout.write(`\n  tiles left: ${String(ending.tiles.length)} · ending: ${String(ending.ended)}\n`);
      expect(ending.ended, "the match never reached an ending").not.toBeNull();

      const sentence = (await table.locator("[data-result] h2").textContent()) ?? "";
      process.stdout.write(`  panel: ${sentence}\n`);

      // BOTH ENDINGS ARE REAL OUTCOMES OF PLAYING THIS BOARD, and which one
      // this run reaches is not something to assert. Every board this game
      // deals is solvable by construction, but the solution is the
      // generator's own and never leaves it — a player, and this loop, plays
      // greedily and can still paint the board into a corner. That is the
      // game, and it is why the deadlock sentence exists.
      //
      // What IS asserted is that each ending says its own thing: a cleared
      // board reports how long it took, and a deadlocked one reports no
      // figure at all. Getting stuck is not an achievement to timestamp.
      if (ending.ended === "cleared") {
        expect(ending.tiles, "a cleared board has nothing left on it").toHaveLength(0);
        expect(sentence).toMatch(/^Lo resolviste en \d+:\d\d\.$/);
      } else {
        expect(ending.ended).toBe("deadlocked");
        expect(ending.tiles.length, "a deadlocked board still has tiles on it").toBeGreaterThan(0);
        expect(sentence).toBe("Te quedaste sin pares. Siempre hay una salida — probá otro.");
        expect(sentence, "a lost board must not be handed a time").not.toMatch(/[0-9]/);
      }

      expect(guard.errors, "the browser console reported an error while a real board was being played").toEqual([]);
      await context.close();
    },
    BOARD_TIMEOUT_MS + 60_000,
  );
});
