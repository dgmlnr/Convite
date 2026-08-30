/// <reference types="@vitest/browser/matchers" />
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";
import type { GameId } from "@hexdev/platform-contract";
import { renderGameSelection } from "./game-screen.js";
import type { CatalogEntry } from "./bootstrap-data.js";

const TRUCO_ID = "truco-argentino" as GameId;

const TRUCO_ENTRY: CatalogEntry = {
  id: TRUCO_ID,
  gameFamily: "truco",
  section: "cartas",
  displayNameKey: "games.truco.name",
  seatCount: 2,
  configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
};

function noop(): void {
  // intentionally empty — this screen is never clicked in a screenshot test
}

/** Containers this file has mounted, removed after EVERY test — PR8 fix
 * (verify report's PR7 native-review WARNINGs, same pollution class as
 * `table.visual.test.ts`'s FU-1): without this cleanup, an accumulated
 * container from an earlier test stays in the page and can push a later
 * test's own container below the viewport fold, or simply leave stale DOM
 * a screenshot-stability retry has to contend with. */
const mounted: HTMLElement[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

/** Parameterized (PR7-T1 adds a second, wider tier to this same file) —
 * `375` is the narrow tier the pre-existing test below always used. */
function mountedContainer(width: number): HTMLElement {
  const container = document.createElement("div");
  container.style.width = `${width}px`;
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

describe("visual: the game-selection screen (spec: game-session — the widget's opening view)", () => {
  it("both zero-counter UX rule branches at once: real waiting players for 15 points, the bot CTA promoted for 30", async () => {
    const container = mountedContainer(375);
    // Both modalities of the SAME game, deliberately showing the two
    // opposite branches of the zero-counter rule (spec) side by side: real
    // players waiting is the more common state to review, and it is exactly
    // the kind of prominence styling (`data-prominent`, chrome-styles.ts)
    // that silently regresses without ever failing a behavioural assertion.
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [
        TRUCO_ID,
        [
          { modality: { pointsToWin: 15 }, waitingCount: 3, promoteBotFallback: false },
          { modality: { pointsToWin: 30 }, waitingCount: undefined, promoteBotFallback: true },
        ],
      ],
    ]);

    renderGameSelection(container, [TRUCO_ENTRY], TRUCO_ENTRY.gameFamily, presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    await expect.element(container).toMatchScreenshot("game-selection-mixed-presence");
  });

  it("lobby wide grid (WCR-2, PR7-T1, 1024px): the same mixed-presence catalog, now a real grid — chrome-styles.ts's `@container hexdev-chrome (min-width: 720px)` grid rule, plus the 1024px padding override, both engaged at once", async () => {
    // Real bug found writing this test (table-wide.visual.test.ts's own
    // mountedContainer docblock has the full story): Browser Mode's default
    // viewport (414×896) is narrower than 1024px, and Chromium never paints
    // past the viewport edge — the narrow shot above never needed this
    // because 375px < 414px.
    await page.viewport(1024 + 120, 900);
    const container = mountedContainer(1024);
    // Same fixture as the narrow shot above — deliberately, so a reviewer can
    // compare the flex-column vs. grid layout of the identical catalog.
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [
        TRUCO_ID,
        [
          { modality: { pointsToWin: 15 }, waitingCount: 3, promoteBotFallback: false },
          { modality: { pointsToWin: 30 }, waitingCount: undefined, promoteBotFallback: true },
        ],
      ],
    ]);

    renderGameSelection(container, [TRUCO_ENTRY], TRUCO_ENTRY.gameFamily, presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    await expect.element(container).toMatchScreenshot("lobby-wide-grid");
  });
});
