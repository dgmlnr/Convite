/// <reference types="@vitest/browser/matchers" />
import { describe, expect, it } from "vitest";
import type { TeamId } from "@hexdev/truco-engine";
import { renderScoreboardPanel } from "./scoreboard-panel.js";
import { ensureTableStyles } from "./table-styles.js";

const MY_TEAM = "visual-self:team" as TeamId;
const OPPONENT_TEAM = "visual-opponent:team" as TeamId;

function mountedContainer(): HTMLElement {
  const container = document.createElement("div");
  container.style.width = "300px";
  document.body.appendChild(container);
  return container;
}

describe("visual: the matchstick scoreboard (design §4: 'ported from the approved prototype')", () => {
  it("a non-trivial score for both teams, split into malas and buenas casitas", async () => {
    const container = mountedContainer();
    // The panel's own chrome (background box, label colour) is styled by
    // `table-styles.ts`'s stylesheet, normally injected by the full table
    // renderer (`table.ts`'s `ensureTableStyles` call) — done explicitly
    // here so this STANDALONE snapshot matches what a player actually sees,
    // not an unstyled fragment.
    ensureTableStyles(document);

    // 12/30 (all malas, mid-run) for one team and 22/30 (malas full, buenas
    // in progress) for the other — non-trivial on BOTH sides of the
    // malas/buenas split (spec: "split into malas and buenas"), unlike a
    // fresh 0-0 match, which would only ever exercise the zero-counter
    // "ghost casita" path already covered by scoreboard.test.ts's unit tests.
    renderScoreboardPanel(container, {
      teams: [
        { id: MY_TEAM, score: 12 },
        { id: OPPONENT_TEAM, score: 22 },
      ],
      selfTeamId: MY_TEAM,
      target: 30,
    });

    await expect.element(container).toMatchScreenshot("scoreboard-non-trivial-score");
  });
});
