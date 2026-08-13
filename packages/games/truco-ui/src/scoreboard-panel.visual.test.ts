/// <reference types="@vitest/browser/matchers" />
import { describe, expect, it } from "vitest";
import type { TeamId } from "@hexdev/truco-engine";
import { renderScoreboardPanel } from "./scoreboard-panel.js";
import { ensureTableStyles } from "./table-styles.js";

const MY_TEAM = "visual-self:team" as TeamId;
const OPPONENT_TEAM = "visual-opponent:team" as TeamId;

/** The one width every baseline in this file is captured at: a COMPACT-tier
 * shell (< 640px), which is the tier FU-3's own compact-strip layout is
 * scoped to. Named rather than inlined so the mount and the assertion that
 * pins it can never drift apart. */
const SHELL_WIDTH = 300;

/** The panel mounted inside a real shell-container context, matching where
 * it ALWAYS lives in production (table.ts mounts it under
 * .hexdev-truco-table-shell, never bare). FU-3's compact-strip layout is
 * scoped through the shell's own named @container query — a bare mount has
 * no ancestor container for that query to resolve against, so it would
 * silently render the pre-FU-3 stacked layout no player ever sees.
 *
 * The stylesheet is injected HERE rather than in the test body. The panel's
 * own chrome (background box, label colour) is styled by `table-styles.ts`'s
 * stylesheet, normally injected by the full table renderer (`table.ts`'s
 * `ensureTableStyles` call) — done explicitly so this STANDALONE snapshot
 * matches what a player actually sees, not an unstyled fragment — and the
 * width assertion below is only worth anything if it measures the SAME
 * cascade the capture will.
 *
 * PINNED WIDTH (native review of the FU-3 compact-strip PR): the returned
 * element carries no width of its own. It is a bare block child that simply
 * fills whatever the shell above it grants, which is deliberate — a width on
 * the inner div would decouple the captured box from the very container the
 * @container query resolves against — but it left every baseline in this file
 * resting on an IMPLICIT 300px handed down by ancestor CSS. The assertion
 * turns that inheritance into a checked contract: give
 * `.hexdev-truco-table-shell` a padding or a border and this fails loudly,
 * here, instead of silently re-cropping every scoreboard baseline. Asserted
 * inside the helper rather than as its own test because the property being
 * pinned is the helper's OWN contract — every present and future caller gets
 * it for free, with no separate case to remember to keep in sync.
 *
 * Same 0.5px epsilon the sibling browser suites use for layout rects. */
function mountedContainer(): HTMLElement {
  ensureTableStyles(document);
  const shell = document.createElement("div");
  shell.className = "hexdev-truco-table-shell";
  shell.style.width = `${SHELL_WIDTH}px`;
  document.body.appendChild(shell);
  const container = document.createElement("div");
  shell.appendChild(container);
  const measured = container.getBoundingClientRect().width;
  expect(
    Math.abs(measured - SHELL_WIDTH),
    `the capture container measures ${measured}px, not the intended ${SHELL_WIDTH}px — ancestor CSS no longer grants it the shell's full width`,
  ).toBeLessThan(0.5);
  return container;
}

describe("visual: the matchstick scoreboard (design §4: 'ported from the approved prototype')", () => {
  it("a non-trivial score for both teams, split into malas and buenas casitas", async () => {
    // The mount injects `table-styles.ts`'s stylesheet and pins its own
    // container width — see `mountedContainer`'s docblock for both.
    const container = mountedContainer();

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
