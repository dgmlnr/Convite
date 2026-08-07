import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, PlayerId } from "@hexdev/truco-engine";
import { renderCalls } from "./calls.js";

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

describe("renderCalls (spec: calls shown ONLY when legal, from getLegalActions — never re-derived)", () => {
  it("renders one button per legal call action, labeled in Spanish", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [
      { type: "call-truco", playerId: PLAYER, level: "truco" },
      { type: "call-envido", playerId: PLAYER, level: "envido" },
    ];

    renderCalls(el, legal, () => {});

    const buttons = [...el.querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons).toHaveLength(2);
    expect(buttons.map((b) => b.textContent)).toEqual(["Truco", "Envido"]);
  });

  it("renders NOTHING (no buttons at all) when no calls are legal — never a disabled/greyed-out button for an illegal action", () => {
    const el = freshContainer();
    el.appendChild(document.createElement("button")).textContent = "stale";

    renderCalls(el, [], () => {});

    expect(el.querySelectorAll("button")).toHaveLength(0);
  });

  it("never renders a button for a play-card action — that lives on the hand itself, not the calls row", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [{ type: "play-card", playerId: PLAYER, card: { suit: "oro", rank: 1 } }];

    renderCalls(el, legal, () => {});

    expect(el.querySelectorAll("button")).toHaveLength(0);
  });

  it("clicking a call button dispatches EXACTLY that legal action, never a re-derived one", () => {
    const el = freshContainer();
    const respondQuiero: Action = { type: "respond-truco", playerId: PLAYER, response: "quiero" };
    const dispatch = vi.fn();

    renderCalls(el, [respondQuiero], dispatch);
    el.querySelector<HTMLButtonElement>("button")!.click();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith(respondQuiero);
  });

  it("labels every truco/envido call level distinctly (Retruco, Vale cuatro, Envido envido, Real envido, Falta envido, Mostrar envido, No quiero)", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [
      { type: "call-truco", playerId: PLAYER, level: "retruco" },
      { type: "call-truco", playerId: PLAYER, level: "valeCuatro" },
      { type: "respond-truco", playerId: PLAYER, response: "no-quiero" },
      { type: "call-envido", playerId: PLAYER, level: "envidoEnvido" },
      { type: "call-envido", playerId: PLAYER, level: "realEnvido" },
      { type: "call-envido", playerId: PLAYER, level: "faltaEnvido" },
      { type: "reveal-envido", playerId: PLAYER },
    ];

    renderCalls(el, legal, () => {});

    const labels = [...el.querySelectorAll<HTMLButtonElement>("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Retruco", "Vale cuatro", "No quiero", "Envido envido", "Real envido", "Falta envido", "Mostrar envido"]);
  });
});
