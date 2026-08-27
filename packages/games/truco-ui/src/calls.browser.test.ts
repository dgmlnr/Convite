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

/**
 * THE ESCALATION LADDER FOLDS INTO ONE BUTTON.
 *
 * When a rival opens the envido you owe an answer AND you may raise: quiero,
 * no quiero, envido envido, real envido, falta envido. Five buttons, 567px of
 * them, on a band that has 296 at 320px. Measured before this: the ladder was
 * given 104px of the 383 it wants -- readable, but two of its three calls were
 * off the edge behind a scrollbar.
 *
 * It folds because that is the real shape of the decision, not only because it
 * saves room: a player at a table thinks "quiero, no quiero, o subo?", and the
 * three ways to raise are one branch of that, not three peers of the first two.
 *
 * DERIVED FROM THE ACTIONS, never from a count or a width. The engine was
 * asked what this group actually holds, and it holds different things:
 *
 *     truco pendiente ... opening = [call-envido:envido]              1 button
 *     envido escalado ... opening = [envidoEnvido, realEnvido, falta] 3 buttons
 *
 * Folding the first would be a lie -- cantar envido while a truco is pending is
 * not "subir" the truco, it is a different call entirely, and it fits anyway.
 * So the fold asks whether every opening escalates the SAME chain the owed
 * answer belongs to, and needs at least two of them to be worth folding.
 */
describe("renderCalls — the escalation ladder folds behind one button", () => {
  const OWES_ENVIDO: readonly Action[] = [
    { type: "respond-envido", playerId: PLAYER, response: "quiero" },
    { type: "respond-envido", playerId: PLAYER, response: "no-quiero" },
    { type: "call-envido", playerId: PLAYER, level: "envidoEnvido" },
    { type: "call-envido", playerId: PLAYER, level: "realEnvido" },
    { type: "call-envido", playerId: PLAYER, level: "faltaEnvido" },
  ];

  it("the band carries the answer plus ONE way to raise, not four", () => {
    const el = freshContainer();
    renderCalls(el, OWES_ENVIDO, () => {});

    const inFlow = [...el.querySelectorAll<HTMLButtonElement>("button")].filter(
      (b) => b.closest(".hexdev-truco-calls-ladder") === null,
    );
    expect(inFlow.map((b) => b.textContent), "what the band shows before anyone taps").toEqual(["Quiero", "No quiero", "Subir"]);
  });

  it("the three ways to raise are one tap away, and dispatch the exact action the engine offered", () => {
    const el = freshContainer();
    const dispatch = vi.fn();
    renderCalls(el, OWES_ENVIDO, dispatch);

    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="escalate-toggle"]');
    if (toggle === null) throw new Error("fence setup: no fold toggle");
    expect(toggle.getAttribute("aria-expanded"), "a control that owns a revealable region says so from the first render").toBe("false");

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    const ladder = el.querySelector<HTMLElement>(".hexdev-truco-calls-ladder");
    if (ladder === null) throw new Error("fence setup: no ladder region");
    // WCAG 4.1.2: aria-expanded promises a revealable region and aria-controls
    // is what names it — the pair is built together so it can never dangle.
    expect(toggle.getAttribute("aria-controls"), "the toggle names the region it owns").toBe(ladder.id);

    const raises = [...ladder.querySelectorAll<HTMLButtonElement>("button")];
    expect(raises.map((b) => b.textContent)).toEqual(["Envido envido", "Real envido", "Falta envido"]);

    raises[1]!.click();
    // THAT EXACT OBJECT, never a reconstructed one — the same property the
    // unfolded buttons have always had.
    expect(dispatch).toHaveBeenCalledWith(OWES_ENVIDO[3]);
  });

  it("a call that is not an escalation of what you owe is never folded away", () => {
    const el = freshContainer();
    // The engine's real "truco pendiente" shape: you owe an answer to a truco,
    // and envido is still openable. One button, a different chain, and folding
    // it under "Subir" would name it something it is not.
    renderCalls(
      el,
      [
        { type: "respond-truco", playerId: PLAYER, response: "quiero" },
        { type: "respond-truco", playerId: PLAYER, response: "no-quiero" },
        { type: "call-envido", playerId: PLAYER, level: "envido" },
      ],
      () => {},
    );

    expect(el.querySelector('button[data-action="escalate-toggle"]'), "nothing to fold here").toBeNull();
    expect([...el.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Quiero", "No quiero", "Envido"]);
  });

  it("the fold survives a re-render, because a server broadcast is not a reason to close what a player opened", () => {
    const el = freshContainer();
    renderCalls(el, OWES_ENVIDO, () => {});
    el.querySelector<HTMLButtonElement>('button[data-action="escalate-toggle"]')!.click();

    renderCalls(el, OWES_ENVIDO, () => {});

    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="escalate-toggle"]');
    expect(toggle?.getAttribute("aria-expanded"), "still open after the rebuild").toBe("true");
  });
});
