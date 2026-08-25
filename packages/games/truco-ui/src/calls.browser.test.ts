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

  it("labels every truco/envido call level distinctly (Retruco, Vale cuatro, Envido envido, Real envido, Falta envido, Mis tantos, No quiero)", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [
      { type: "call-truco", playerId: PLAYER, level: "retruco" },
      { type: "call-truco", playerId: PLAYER, level: "valeCuatro" },
      { type: "respond-truco", playerId: PLAYER, response: "no-quiero" },
      { type: "call-envido", playerId: PLAYER, level: "envidoEnvido" },
      { type: "call-envido", playerId: PLAYER, level: "realEnvido" },
      { type: "call-envido", playerId: PLAYER, level: "faltaEnvido" },
      { type: "declare-envido", playerId: PLAYER, declaration: "points" },
    ];

    renderCalls(el, legal, () => {});

    // Grouped: every "respond-*" answer to an already-open call renders
    // FIRST, as its own cluster — answering is a different kind of decision
    // from opening/escalating a new one (spec), so the two never interleave.
    const labels = [...el.querySelectorAll<HTMLButtonElement>("button")].map((b) => b.textContent);
    // "Mis tantos" where "Mostrar envido" used to be: showing the envido was
    // one button that resolved it for everybody, and it is a round now — this
    // button says only YOUR number, on your turn to speak.
    expect(labels).toEqual(["No quiero", "Retruco", "Vale cuatro", "Envido envido", "Real envido", "Falta envido", "Mis tantos"]);
  });
});

describe("renderCalls — grouped so answering a call reads distinctly from opening one", () => {
  it("puts respond-truco/respond-envido in their own 'response' group, separate from calls/escalations", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [
      { type: "respond-truco", playerId: PLAYER, response: "quiero" },
      { type: "call-truco", playerId: PLAYER, level: "retruco" },
    ];

    renderCalls(el, legal, () => {});

    const response = el.querySelector(".hexdev-truco-calls-group--response")!;
    const opening = el.querySelector(".hexdev-truco-calls-group--opening")!;
    expect(response.querySelectorAll("button")).toHaveLength(1);
    expect(response.querySelector("button")!.textContent).toBe("Quiero");
    expect(opening.querySelectorAll("button")).toHaveLength(1);
    expect(opening.querySelector("button")!.textContent).toBe("Retruco");
  });

  it("renders no empty group container when a group has no legal actions", () => {
    const el = freshContainer();

    renderCalls(el, [{ type: "call-truco", playerId: PLAYER, level: "truco" }], () => {});

    expect(el.querySelector(".hexdev-truco-calls-group--response")).toBeNull();
    expect(el.querySelector(".hexdev-truco-calls-group--opening")).not.toBeNull();
  });
});
