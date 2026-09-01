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
 * IT RE-DECIDES NOTHING, and the mechanism for that had to change. This loop
 * used to hunt for an anchor by pressing tiles until one lit up, on the
 * reasoning that "a tile that lights up is the server's answer, not this
 * file's opinion". That was true only because the widget gated the FIRST
 * press on its offer list — so lighting up doubled as proof that a partner
 * was free. It was never meant to: it also meant a perfectly reachable tile
 * whose twin happened to be buried answered a player's press with nothing at
 * all, which is the defect the widget was fixed for. Every reachable tile
 * marks now, so pressing one proves only that it is reachable, and a loop
 * still probing for an anchor spends its whole budget learning that.
 *
 * SO THE PAIR IS PROPOSED, NEVER DEDUCED. This spec picks two tiles whose
 * faces COULD go together, presses them, and reads what the widget did. It
 * still computes nothing about freedom and settles nothing about legality:
 * a flower and a season are shortlisted together and are not a pair, either
 * tile may be covered, and in every one of those cases the board simply does
 * not move — which is the answer, and it comes from the server exactly as it
 * did before. What was lost was a shortcut; the discipline
 * `single-player.e2e.test.ts` states for truco is intact.
 */

// A full board is 72 removals, each a real websocket round trip through a
// real match room. Measured over the runs that built this spec: a board
// completes in well under two minutes on this machine.
const BOARD_TIMEOUT_MS = 5 * 60_000;

interface BoardTile {
  readonly position: number;
  readonly face: string;
  /**
   * A point INSIDE this tile's own box at which a press reaches THIS tile,
   * or `null` when no such point exists because something is painted over
   * all of it.
   *
   * Asked of the document with `elementFromPoint`, which is the board's own
   * hit test rather than a second opinion about it: a press in this game is a
   * POINT, and on a five-deep turtle most tiles have another tile painted
   * over part of them. Pressing the covered part does something perfectly
   * sensible — it lifts the tile on top — but it is not a press of the tile
   * this loop meant.
   *
   * A POINT AND NO LONGER A YES-OR-NO, and the difference is a blind spot
   * this spec carried from the start. It used to ask only about the CENTRE,
   * so a tile whose middle was covered counted as unreachable and was never
   * pressed at all — while a person, looking at the same board, would simply
   * press the part of it they can see. The old anchor hunt hid the cost by
   * pressing enough tiles to stumble past it; proposing pairs does not, and
   * a loop that cannot press half the board runs out of moves long before
   * the board does. Offsets are relative to the tile's own box, which is
   * exactly what Playwright's `click({ position })` wants.
   */
  readonly hit: { readonly x: number; readonly y: number } | null;
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
    // The centre first, because on an uncovered tile it is the answer and the
    // scan stops at once. Then a spread of points across the box: a covered
    // tile is covered from ONE side (the layer above sits up and to the
    // right), so what stays visible is a band down the left and along the
    // bottom, and these fractions reach it without pretending to know the
    // offset — the document is asked, not the layout.
    const PROBES = [
      [0.5, 0.5],
      [0.15, 0.85],
      [0.15, 0.5],
      [0.5, 0.85],
      [0.15, 0.15],
      [0.85, 0.85],
    ] as const;
    const tiles = [...body.querySelectorAll<HTMLElement>("[data-position][data-tile]")].map((element) => {
      const box = element.getBoundingClientRect();
      let hit: { x: number; y: number } | null = null;
      for (const [fx, fy] of PROBES) {
        const found = body.ownerDocument.elementFromPoint(box.left + box.width * fx, box.top + box.height * fy);
        if (found !== null && found.closest("[data-position]") === element) {
          hit = { x: box.width * fx, y: box.height * fy };
          break;
        }
      }
      return {
        position: Number(element.getAttribute("data-position")),
        face: element.dataset.tile ?? "",
        hit,
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
async function press(table: FrameLocator, tile: BoardTile): Promise<void> {
  // A tile can leave the board between the snapshot that named it and the
  // press: the previous press may have completed a pair this loop was not
  // expecting. A press of something that is no longer there is a no-op, not
  // a failure — the next read is what says what actually happened.
  //
  // AT THE POINT THE SNAPSHOT FOUND, never at the middle by default. The
  // middle is only where the answer happens to be for an uncovered tile;
  // aiming there on a covered one presses whatever is painted over it, which
  // is a real press of the wrong tile and reads back as this loop's proposal
  // being refused.
  await table
    .locator(`[data-position="${String(tile.position)}"]`)
    .click({ timeout: 2_000, force: true, ...(tile.hit === null ? {} : { position: tile.hit }) })
    .catch(() => undefined);
}

const isBonus = (face: string): boolean => face.startsWith("flower-") || face.startsWith("season-");

/** A SHORTLIST, never a decision: same drawn face first, then the bonus
 * tiles when the anchor is one, then everything else. Only a pair the server
 * accepts removes anything, so getting this wrong costs wall clock and
 * nothing else — `2` means "do not bother proposing it", not "illegal". */
function partnerRank(anchor: BoardTile, candidate: BoardTile): number {
  if (candidate.face === anchor.face) return 0;
  return isBonus(anchor.face) && isBonus(candidate.face) ? 1 : 2;
}

/** One pair, named the same way whichever tile was pressed first. */
const pairKey = (a: number, b: number): string => `${String(Math.min(a, b))}:${String(Math.max(a, b))}`;

/**
 * The next pair worth proposing, or nothing when this board has run out of
 * them.
 *
 * ORDERED BY THE ANCHOR AND NOT BY THE PAIR, so the outer walk stays the
 * top-down one the caller hands in — the apex first, which is how a person
 * plays and what keeps the most options open. Within one anchor the
 * shortlist decides, and `refused` is what stops this from proposing the
 * same doomed two tiles for the rest of the board's life.
 */
function nextProposal(reachable: readonly BoardTile[], refused: ReadonlySet<string>): readonly [BoardTile, BoardTile] | undefined {
  for (const anchor of reachable) {
    const partner = reachable.find(
      (other) => other.position !== anchor.position && partnerRank(anchor, other) < 2 && !refused.has(pairKey(anchor.position, other.position)),
    );
    if (partner !== undefined) return [anchor, partner];
  }
  return undefined;
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
      // Pairs this loop proposed and the board did not take, on THIS board.
      // Emptied the moment a pair does come off, because a removal uncovers
      // tiles and every refusal above was a statement about the old board.
      let refused = new Set<string>();
      // Whether the slate has already been wiped since the last removal.
      //
      // A REFUSAL IS A STATEMENT ABOUT A MOMENT, not about the board. `press`
      // swallows a click that could not land — deliberately, since a tile can
      // leave between the snapshot that named it and the press — so a pair
      // can be recorded as refused without ever having been offered. Left
      // permanent, one such miss retires a legal pair for the rest of the
      // run: observed at four tiles left, with the server still holding a
      // move this loop had already crossed off. Wiping the slate once and
      // asking again costs one extra pass and cannot loop, because a pass
      // that removes nothing sets this flag and the next empty proposal ends
      // the loop for real.
      let retriedClean = false;

      while (board.ended === null && Date.now() < deadline) {
        const before = board.tiles.length;
        // TOP DOWN. `tiles` arrives in the layout's own ascending `(z, y, x)`,
        // so reversing takes the apex first — the standard way to play this
        // game by hand, and the one that keeps the most options open: a tile
        // on the top layer is covering something, and a tile on the base
        // layer is covering nothing.
        const reachable = [...board.tiles].reverse().filter((tile) => tile.hit !== null);

        const proposal = nextProposal(reachable, refused);
        if (proposal === undefined) {
          if (retriedClean) break; // asked twice on an unchanged board: this loop is genuinely out of moves
          retriedClean = true;
          refused = new Set<string>();
          continue;
        }
        const [first, second] = proposal;

        // A MARK CAN SURVIVE AN ATTEMPT, so the sequence starts by saying what
        // it wants the board to be holding. A refused pair clears both tiles,
        // but a proposal whose FIRST tile turned out to be unpressable leaves
        // the second one marked instead — a press lands on a point, and the
        // tile that was named may be covered at it. Pressing a marked tile
        // again is how the widget clears it, which is the only tool here and
        // the one a player has too.
        if (board.selected === first.position) {
          await press(table, second);
        } else {
          const marked = board.selected === null ? undefined : board.tiles.find((tile) => tile.position === board.selected);
          if (marked !== undefined) await press(table, marked);
          await press(table, first);
          await press(table, second);
        }

        board = await readBoard(table);
        if (board.tiles.length < before || board.ended !== null) {
          refused = new Set<string>();
          retriedClean = false;
        } else {
          refused.add(pairKey(first.position, second.position));
        }
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
