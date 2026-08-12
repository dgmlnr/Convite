/// <reference types="@vitest/browser/matchers" />
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { STRINGS } from "./i18n.js";
import { renderStatusMessage } from "./status-view.js";
import { renderUnsupportedGame } from "./unsupported-game-view.js";

/**
 * NEW file (PR7-T1/T2, spec VB-3): no visual test previously captured
 * `.hexdev-chrome-status` (`rg` confirmed before writing this file —
 * `status-view.ts` only had a `.browser.test.ts`) or the unregistered-game
 * fallback. Both render through the same `.hexdev-gamify-chrome` >
 * `.hexdev-chrome-content` > `.hexdev-chrome-status` card language
 * (chrome-styles.ts, WCR-3), so they share this one file rather than each
 * needing their own — following `game-selection.visual.test.ts`'s own
 * "one file per screen" convention, this IS that screen (status/fallback),
 * just two of its variants.
 */

function noop(): void {
  // intentionally empty — neither screen is ever clicked in a screenshot test
}

/** Containers this file has mounted, removed after EVERY test — PR8 fix
 * (verify report's PR7 native-review WARNINGs, same pollution class as
 * `table.visual.test.ts`'s FU-1 and `game-selection.visual.test.ts`'s own
 * PR8 fix): an unremoved container from one test otherwise stays live for
 * the next, the same accumulation risk `table-wide.visual.test.ts` and
 * `table.visual.test.ts` already guard against. */
const mounted: HTMLElement[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

/** Also resizes Browser Mode's viewport to fit — its 414×896 default
 * (visual/README.md) is narrower than every width this file uses; Chromium
 * never paints past the viewport edge, so both baselines here would
 * otherwise clip solid white past x≈414 (real bug, found and fixed while
 * writing `table-wide.visual.test.ts`'s own `mountedContainer`). */
async function mountedContainer(width: number): Promise<HTMLElement> {
  await page.viewport(width + 120, 900);
  const container = document.createElement("div");
  container.style.width = `${width}px`;
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

describe("visual: the widget's status/fallback screens (spec: WCR-3 — status/error/unregistered share the card language)", () => {
  it("chrome status card, wide (WCR-3, PR7-T1, 1024px): the centered card, at the same tier the lobby grid also widens padding at", async () => {
    const container = await mountedContainer(1024);

    renderStatusMessage(container, STRINGS.searchingOpponent);

    await expect.element(container).toMatchScreenshot("chrome-status-wide");
  });

  // PR7-T2 (optional, tasks §2.3's own bonus — the design's PR6-T14
  // suggestion, skipped in PR6b for budget): trivially cheap to add once
  // this file's own 1024px chrome-card mounting already exists for the
  // baseline above.
  it("chrome unsupported-game fallback, wide (WCR-4, PR7-T2, 1024px): the navigable card language, not the former bare-<p> dead end", async () => {
    const container = await mountedContainer(1024);

    renderUnsupportedGame(container, { onBackToLobby: noop });

    await expect.element(container).toMatchScreenshot("chrome-unsupported-game");
  });
});
