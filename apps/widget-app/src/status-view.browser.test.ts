import { afterEach, describe, expect, it, vi } from "vitest";
import { renderErrorWithRetry, renderStatusMessage } from "./status-view.js";

let container: HTMLElement;

afterEach(() => {
  container.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("renderStatusMessage", () => {
  it("shows the given message as the container's only content", () => {
    const el = freshContainer();

    renderStatusMessage(el, "Buscando rival…");

    expect(el.textContent).toContain("Buscando rival…");
  });

  it("replaces whatever was there before, rather than appending to it", () => {
    const el = freshContainer();
    el.appendChild(document.createElement("p")).textContent = "stale content";

    renderStatusMessage(el, "Conectando…");

    expect(el.textContent).toBe("Conectando…");
  });
});

describe("renderErrorWithRetry (bug fix, obs 2968/issue 2: a rejected join used to leave the UI doing nothing at all)", () => {
  it("shows the failure message AND a retry button, in Spanish", () => {
    const el = freshContainer();

    renderErrorWithRetry(el, "No pudimos conectarte a la partida. Probá de nuevo.", () => {});

    expect(el.textContent).toContain("No pudimos conectarte a la partida. Probá de nuevo.");
    const button = el.querySelector<HTMLButtonElement>('button[data-action="retry"]');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("Reintentar");
  });

  it("clicking the retry button invokes the given callback", () => {
    const el = freshContainer();
    const onRetry = vi.fn();

    renderErrorWithRetry(el, "No pudimos conectarte a la partida. Probá de nuevo.", onRetry);
    el.querySelector<HTMLButtonElement>('button[data-action="retry"]')?.click();

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
