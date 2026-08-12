import { afterEach, describe, expect, it, vi } from "vitest";
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
