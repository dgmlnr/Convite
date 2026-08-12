import { afterEach, describe, expect, it, vi } from "vitest";
import { renderErrorWithRetry } from "./status-view.js";
import { renderUnsupportedGame } from "./unsupported-game-view.js";

let container: HTMLElement;

afterEach(() => {
  container.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("renderUnsupportedGame (PR6-T9: the dead-end fallback becomes a real navigable screen)", () => {
  it("renders as a .hexdev-gamify-chrome / .hexdev-chrome-status styled card, not bare <p> elements", () => {
    const el = freshContainer();

    renderUnsupportedGame(el, { onBackToLobby: () => {} });

    expect(el.className).toBe("hexdev-gamify-chrome");
    // WCR-3: gates chrome-styles.ts's [data-chrome-view="unsupported"]
    // centered-card rule -- unreachable before this task, since nothing
    // set this value.
    expect(el.dataset.chromeView).toBe("unsupported");
    expect(el.querySelector(".hexdev-chrome-status")).not.toBeNull();
    // The dead end this replaces rendered two bare <p> elements as the
    // container's own direct children -- assert the new structure nests
    // everything inside the chrome/card wrappers instead.
    expect(Array.from(el.children).every((child) => child.tagName !== "P")).toBe(true);
  });

  it("shows the honest 'not available yet' message and a way back to the lobby, in Spanish", () => {
    const el = freshContainer();

    renderUnsupportedGame(el, { onBackToLobby: () => {} });

    expect(el.textContent).toContain("Este juego todavía no está disponible en esta versión.");
    const button = el.querySelector<HTMLButtonElement>('button[data-action="back-to-lobby"]');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("Volver al lobby");
  });

  it("clicking back-to-lobby invokes onBackToLobby exactly once", () => {
    const el = freshContainer();
    const onBackToLobby = vi.fn();

    renderUnsupportedGame(el, { onBackToLobby });
    el.querySelector<HTMLButtonElement>('button[data-action="back-to-lobby"]')?.click();

    expect(onBackToLobby).toHaveBeenCalledOnce();
  });

  it("setUpdateCount mutates only the meta line's textContent, leaving the button wired", () => {
    const el = freshContainer();
    const onBackToLobby = vi.fn();

    const view = renderUnsupportedGame(el, { onBackToLobby });
    view.setUpdateCount(3);

    expect(el.textContent).toContain("Actualizaciones recibidas: 3");
    el.querySelector<HTMLButtonElement>('button[data-action="back-to-lobby"]')?.click();
    expect(onBackToLobby).toHaveBeenCalledOnce();
  });
});

/** How far the button's box sits from each inline edge of its parent's box —
 * equal gaps mean genuinely centered, which is the honest form of "centered
 * margin treatment": a computed margin-inline of auto alone can be inert
 * (an inline-level box resolves auto inline margins to zero), so asserting
 * geometry instead of the margin string is what makes this contract real. */
function horizontalGaps(button: HTMLElement): { readonly left: number; readonly right: number } {
  const parentRect = button.parentElement!.getBoundingClientRect();
  const rect = button.getBoundingClientRect();
  return { left: rect.left - parentRect.left, right: parentRect.right - rect.right };
}

describe("back-to-lobby is an emergency exit (FU-2: one rule, two emergency exits — computed-style contract)", () => {
  it("gets the SAME computed emergency-exit treatment as the error card's retry button", () => {
    const el = freshContainer();

    // Render the error/retry view first and copy its computed treatment out
    // as primitive strings — getComputedStyle returns a live declaration,
    // and the retry button is detached the moment renderUnsupportedGame
    // below replaces the container's children.
    renderErrorWithRetry(el, "No pudimos conectarte a la partida. Probá de nuevo.", () => {});
    const retry = el.querySelector<HTMLButtonElement>('button[data-action="retry"]');
    expect(retry).not.toBeNull();
    const retryStyle = getComputedStyle(retry!);
    const expected = { borderColor: retryStyle.borderColor, boxShadow: retryStyle.boxShadow };
    // The treatment being copied must itself be the real emergency-exit one,
    // or the equality below could pass vacuously on two unstyled buttons.
    expect(expected.boxShadow).not.toBe("none");
    const retryGaps = horizontalGaps(retry!);
    expect(Math.abs(retryGaps.left - retryGaps.right)).toBeLessThanOrEqual(1);

    renderUnsupportedGame(el, { onBackToLobby: () => {} });
    const back = el.querySelector<HTMLButtonElement>('button[data-action="back-to-lobby"]');
    expect(back).not.toBeNull();
    const backStyle = getComputedStyle(back!);
    expect(backStyle.borderColor).toBe(expected.borderColor);
    expect(backStyle.boxShadow).toBe(expected.boxShadow);
    // Centered inside its own parent (the status card), the same visual
    // treatment retry gets under the error card.
    const backGaps = horizontalGaps(back!);
    expect(Math.abs(backGaps.left - backGaps.right)).toBeLessThanOrEqual(1);
  });
});

describe("chrome body copy consumes --hx-leading (FU-5: computed line-height contract)", () => {
  it("gives the card's body paragraph a computed line-height of 1.35x its computed font-size", () => {
    const el = freshContainer();

    renderUnsupportedGame(el, { onBackToLobby: () => {} });

    const body = el.querySelector<HTMLParagraphElement>(".hexdev-chrome-status p");
    expect(body).not.toBeNull();
    const style = getComputedStyle(body!);
    const lineHeight = Number.parseFloat(style.lineHeight);
    expect(lineHeight).toBeCloseTo(Number.parseFloat(style.fontSize) * 1.35, 0);
  });
});
