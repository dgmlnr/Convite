import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, PlayerId } from "@hexdev/truco-engine";
import { renderPartnerSena, renderSenaPicker } from "./senas.js";

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

describe("renderPartnerSena — the teammate's most recent claimed signal (structurally never available for an opponent)", () => {
  it("renders nothing when the teammate has not signaled this hand", () => {
    const el = freshContainer();

    renderPartnerSena(el, null);

    expect(el.textContent).toBe("");
  });

  it("shows the teammate's claimed signal in authentic Spanish vocabulary", () => {
    const el = freshContainer();

    renderPartnerSena(el, "sieteDeOro");

    expect(el.textContent).toContain("7 de oro");
  });
});
