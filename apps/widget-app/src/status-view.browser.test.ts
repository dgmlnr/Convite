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

    expect(el.querySelector<HTMLElement>(".hexdev-chrome-content")!.textContent).toBe("Conectando…");
    expect(el.textContent).not.toContain("stale content");
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

describe("chrome body copy consumes --hx-leading (FU-5: computed line-height contract)", () => {
  it("gives the single-paragraph status card a computed line-height of 1.35x its computed font-size", () => {
    const el = freshContainer();

    renderStatusMessage(el, "Buscando rival…");

    const card = el.querySelector<HTMLParagraphElement>("p.hexdev-chrome-status");
    expect(card).not.toBeNull();
    const style = getComputedStyle(card!);
    const lineHeight = Number.parseFloat(style.lineHeight);
    expect(lineHeight).toBeCloseTo(Number.parseFloat(style.fontSize) * 1.35, 0);
  });
});

/**
 * WCAG 4.1.3 (the B6 remainder). Every chrome status screen replaces the whole
 * container: "Buscando jugadores…" lands, then a join failure replaces it,
 * then a retry replaces that. On screen each step is obvious. To a screen
 * reader, none of it happened — the container was wiped and refilled, and no
 * region was ever there to notice a change.
 *
 * This is the SAME defect truco-ui's announcer.ts exists for, one layer up,
 * and it is fixed the same way rather than a second way: an element that
 * OUTLIVES the render. A fresh region that happens to contain text is not a
 * change to anything, so the fences below are about NODE IDENTITY across
 * renders, never about attribute presence — the shape that looks correct in
 * the DOM and announces nothing.
 *
 * The card itself cannot be the region: it is rebuilt on every call, which is
 * precisely the mistake being closed.
 */
describe("chrome status changes reach a screen reader (WCAG 4.1.3)", () => {
  const regionOf = (el: HTMLElement): HTMLElement | null => el.querySelector<HTMLElement>('[data-announces="chrome-status"]');

  it("carries one polite, atomic region", () => {
    const el = freshContainer();

    renderStatusMessage(el, "Buscando jugadores…");

    const region = regionOf(el)!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.textContent).toBe("Buscando jugadores…");
  });

  it("keeps the SAME node across a status→error→status sequence — the one property that makes an announcement real", () => {
    const el = freshContainer();

    renderStatusMessage(el, "Buscando jugadores…");
    const first = regionOf(el)!;
    renderErrorWithRetry(el, "No pudimos conectarte a la partida. Probá de nuevo.", () => {});
    const second = regionOf(el)!;
    renderStatusMessage(el, "Buscando jugadores…");

    expect(second).toBe(first);
    expect(regionOf(el)).toBe(first);
    expect(first.isConnected, "never detached for even one render").toBe(true);
  });

  it("says the failure and the recovery, not only the search", () => {
    const el = freshContainer();

    renderStatusMessage(el, "Buscando jugadores…");
    renderErrorWithRetry(el, "No pudimos conectarte a la partida. Probá de nuevo.", () => {});

    expect(regionOf(el)!.textContent).toBe("No pudimos conectarte a la partida. Probá de nuevo.");
  });

  it("stays out of the flow and out of sight — it must cost the card no layout and no visual baseline", () => {
    const el = freshContainer();

    renderStatusMessage(el, "Buscando jugadores…");

    const region = regionOf(el)!;
    expect(getComputedStyle(region).position).toBe("absolute");
    expect(region.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(el.querySelector<HTMLElement>(".hexdev-chrome-content")!.textContent).toBe("Buscando jugadores…");
  });

  it("does not re-say a message that has not changed — a repeated render is not a new event", () => {
    const el = freshContainer();

    renderStatusMessage(el, "Buscando jugadores…");
    const region = regionOf(el)!;
    const writes = vi.fn();
    new MutationObserver(writes).observe(region, { childList: true, characterData: true, subtree: true });

    renderStatusMessage(el, "Buscando jugadores…");

    expect(writes).not.toHaveBeenCalled();
  });
});
