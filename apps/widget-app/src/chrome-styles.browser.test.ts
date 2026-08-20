import { afterEach, describe, expect, it } from "vitest";
import { ensureTableStyles, TABLE_STYLE_ID } from "@hexdev/truco-ui";
import { CHROME_STYLE_ID, ensureChromeStyles } from "./chrome-styles.js";

let container: HTMLElement;

afterEach(() => {
  document.getElementById(CHROME_STYLE_ID)?.remove();
  document.getElementById(TABLE_STYLE_ID)?.remove();
  container?.remove();
});

describe("ensureChromeStyles", () => {
  it("injects exactly one <style> element into <head>, even when called twice", () => {
    ensureChromeStyles(document);
    ensureChromeStyles(document);

    expect(document.head.querySelectorAll(`#${CHROME_STYLE_ID}`)).toHaveLength(1);
  });
});

/** Mounts a bare `.hexdev-gamify-chrome[data-chrome-view="lobby"]` tree at a
 * given width — real Chromium, real @container engagement, no
 * `renderGameSelection` involved (this suite is only about the CSS cascade
 * engaging correctly, not about DOM-building logic already covered by
 * game-selection.browser.test.ts). Deliberately id-less, matching every
 * other mount helper in this package — proves the [data-chrome-view]-gated,
 * NOT id-qualified container-type selector chrome-styles.ts's own docblock
 * commits to (PR6-T1's deviation note). Both `content` and `games` are
 * DESCENDANTS of the query-container element (`root`), never `root` itself
 * — a CSS query container can never be targeted by its own container query
 * (see chrome-styles.ts's own docblock on this exact, empirically-found
 * restriction). */
function mountedChrome(width: number): { readonly content: HTMLElement; readonly games: HTMLElement } {
  ensureChromeStyles(document);
  container = document.createElement("div");
  container.className = "hexdev-gamify-chrome";
  container.dataset.chromeView = "lobby";
  container.style.width = `${width}px`;
  const content = document.createElement("div");
  content.className = "hexdev-chrome-content";
  const games = document.createElement("div");
  games.className = "hexdev-chrome-games";
  content.appendChild(games);
  container.appendChild(content);
  document.body.appendChild(container);
  return { content, games };
}

/**
 * PR6-T1/T2 cascade-order proof — the exact pattern PR4/PR5's own CRITICAL
 * findings established: a claim that a later, equal-specificity rule wins a
 * @container override is not trustworthy from reading the CSS string alone,
 * it needs a real computed-style read at real widths. This suite's FIRST
 * draft asserted against `root` (`.hexdev-gamify-chrome` itself) and caught
 * a real bug this way: a query container can never be targeted by its own
 * container query, so that draft's wide-tier assertion genuinely failed
 * (RED) even though the CSS "looked" correct as a string — fixed by moving
 * the responsive padding to the descendant `.hexdev-chrome-content`, which
 * these assertions target instead.
 */
describe("chrome-styles.ts container-query cascade (PR6-T1/T2, cascade-order proof)", () => {
  it("keeps the compact/medium padding below the 1024px container tier", () => {
    const { content } = mountedChrome(900);

    const padding = getComputedStyle(content).padding;

    // --hx-space-lg (24px) / --hx-space-md (16px), the base rule.
    expect(padding).toBe("24px 16px");
  });

  it("switches to the wide-tier padding at/above 1024px — the later @container rule wins the equal-specificity tie, not the nesting", () => {
    const { content } = mountedChrome(1100);

    const padding = getComputedStyle(content).padding;

    // --hx-space-2xl (48px) / --hx-space-xl (32px), the @container override.
    expect(padding).toBe("48px 32px");
  });

  it("keeps .hexdev-chrome-games a flex column below 720px", () => {
    const { games } = mountedChrome(600);

    expect(getComputedStyle(games).display).toBe("flex");
  });

  it("switches .hexdev-chrome-games to a grid at/above 720px", () => {
    const { games } = mountedChrome(800);

    expect(getComputedStyle(games).display).toBe("grid");
  });
});

/**
 * The focus-ring specificity contract between chrome and felt — the same
 * cascade-order-proof ethos as the @container suite above: in the real
 * widget the truco shell NESTS inside the chrome-classed root, so BOTH
 * focus-ring rules select a felt button, and the felt's tenant-proof gold
 * guarantee only holds if it wins by SPECIFICITY, never by whichever
 * stylesheet happened to be injected later.
 */
describe("chrome/felt focus-ring precedence (the felt's gold guarantee must not depend on stylesheet insertion order)", () => {
  it("keeps the felt's gold ring winning inside a chrome-classed ancestor even when the chrome stylesheet is injected LAST", () => {
    // Adversarial order, deliberately: table styles FIRST, chrome SECOND —
    // a same-specificity chrome rule would then win the tie by source order,
    // painting a tenant-dependent currentColor ring on the felt.
    ensureTableStyles(document);
    ensureChromeStyles(document);
    container = document.createElement("div");
    container.className = "hexdev-gamify-chrome";
    const shell = document.createElement("div");
    shell.className = "hexdev-truco-table-shell";
    const button = document.createElement("button");
    shell.appendChild(button);
    container.appendChild(shell);
    document.body.appendChild(container);

    button.focus();

    const style = getComputedStyle(button);
    expect(style.outlineWidth).toBe("2px");
    expect(style.outlineStyle).toBe("solid");
    // --hx-gold — the felt's own ring, not chrome's currentColor.
    expect(style.outlineColor).toBe("rgb(232, 200, 119)");
  });
});
