/// <reference types="@vitest/browser/matchers" />
import { describe, expect, it } from "vitest";
import type { TeamId } from "@hexdev/truco-engine";
import { renderScoreboardPanel } from "./scoreboard-panel.js";
import { ensureTableStyles } from "./table-styles.js";

const MY_TEAM = "visual-self:team" as TeamId;
const OPPONENT_TEAM = "visual-opponent:team" as TeamId;

/** The panel mounted inside a real shell-container context, matching where
 * it ALWAYS lives in production (table.ts mounts it under
 * .hexdev-truco-table-shell, never bare). FU-3's compact-strip layout is
 * scoped through the shell's own named @container query — a bare mount has
 * no ancestor container for that query to resolve against, so it would
 * silently render the pre-FU-3 stacked layout no player ever sees. */
function mountedContainer(): HTMLElement {
  const shell = document.createElement("div");
  shell.className = "hexdev-truco-table-shell";
  shell.style.width = "300px";
  document.body.appendChild(shell);
  const container = document.createElement("div");
  shell.appendChild(container);
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
