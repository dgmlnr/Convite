/// <reference types="@vitest/browser/matchers" />
import { describe, expect, it } from "vitest";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";
import type { GameId } from "@hexdev/platform-contract";
import { renderGameSelection } from "./game-selection.js";
import type { CatalogEntry } from "./bootstrap-data.js";

const TRUCO_ID = "truco-argentino" as GameId;

const TRUCO_ENTRY: CatalogEntry = {
  id: TRUCO_ID,
  displayNameKey: "games.truco.name",
  seatCount: 2,
  configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
};

function noop(): void {
  // intentionally empty — this screen is never clicked in a screenshot test
}

function mountedContainer(): HTMLElement {
  const container = document.createElement("div");
  container.style.width = "375px";
  document.body.appendChild(container);
  return container;
}

describe("visual: the game-selection screen (spec: game-session — the widget's opening view)", () => {
  it("both zero-counter UX rule branches at once: real waiting players for 15 points, the bot CTA promoted for 30", async () => {
    const container = mountedContainer();
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

    renderGameSelection(container, [TRUCO_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    await expect.element(container).toMatchScreenshot("game-selection-mixed-presence");
  });
});
