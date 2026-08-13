import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, PlayerId } from "@hexdev/truco-engine";
import { renderSenaPicker } from "./senas.js";

const PLAYER = "player-a" as PlayerId;

let container: HTMLElement;

afterEach(() => {
  container.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("renderSenaPicker — discoverable without being noisy (2v2 only, absent entirely in 1v1)", () => {
  it("renders NOTHING at all when no send-sena action is legal — the exact way 1v1 stays silent, no separate feature flag needed", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [{ type: "call-truco", playerId: PLAYER, level: "truco" }];

    renderSenaPicker(el, legal, () => {});

    expect(el.children).toHaveLength(0);
  });

  it("renders a single collapsed toggle button when señas are legal — the six signals are NOT shown until the player opens it (never noisy)", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [
      { type: "send-sena", playerId: PLAYER, signal: "asDeEspada" },
      { type: "send-sena", playerId: PLAYER, signal: "asDeBasto" },
      { type: "send-sena", playerId: PLAYER, signal: "sieteDeEspada" },
      { type: "send-sena", playerId: PLAYER, signal: "sieteDeOro" },
      { type: "send-sena", playerId: PLAYER, signal: "tres" },
      { type: "send-sena", playerId: PLAYER, signal: "dos" },
    ];

    renderSenaPicker(el, legal, () => {});

    expect(el.querySelectorAll('button[data-action="senas-toggle"]')).toHaveLength(1);
    expect(el.querySelectorAll('button[data-action="send-sena"]')).toHaveLength(0);
  });

  it("clicking the toggle reveals exactly one button per legal seña, labeled in authentic Spanish Truco vocabulary", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [
      { type: "send-sena", playerId: PLAYER, signal: "asDeEspada" },
      { type: "send-sena", playerId: PLAYER, signal: "tres" },
    ];

    renderSenaPicker(el, legal, () => {});
    el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!.click();

    const buttons = [...el.querySelectorAll<HTMLButtonElement>('button[data-action="send-sena"]')];
    expect(buttons.map((b) => b.textContent)).toEqual(["As de espada", "Tres"]);
  });

  it("marks the toggle's own open state, so the picker reads as an open selector rather than a floating strip", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [{ type: "send-sena", playerId: PLAYER, signal: "asDeEspada" }];

    renderSenaPicker(el, legal, () => {});
    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;

    // Collapsed: the attribute must be PRESENT and false, never absent —
    // it is both the a11y contract (a control that owns a revealable
    // region always announces its state) and the styling hook the open
    // toggle's own active treatment selects on.
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking a seña button dispatches EXACTLY that legal action", () => {
    const el = freshContainer();
    const asDeEspada: Action = { type: "send-sena", playerId: PLAYER, signal: "asDeEspada" };
    const dispatch = vi.fn();

    renderSenaPicker(el, [asDeEspada], dispatch);
    el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!.click();
    el.querySelector<HTMLButtonElement>('button[data-action="send-sena"]')!.click();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith(asDeEspada);
  });
});
