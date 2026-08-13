import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, PlayerId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
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
  it("renders NOTHING at all when no send-sena action is legal AND the quota is untouched — the exact way 1v1 stays silent, no separate feature flag needed", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [{ type: "call-truco", playerId: PLAYER, level: "truco" }];

    renderSenaPicker(el, legal, () => {}, { remaining: MAX_SENAS_PER_HAND });

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

    renderSenaPicker(el, legal, () => {}, { remaining: MAX_SENAS_PER_HAND });

    expect(el.querySelectorAll('button[data-action="senas-toggle"]')).toHaveLength(1);
    expect(el.querySelectorAll('button[data-action="send-sena"]')).toHaveLength(0);
  });

  it("clicking the toggle reveals exactly one button per legal seña, labeled in authentic Spanish Truco vocabulary", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [
      { type: "send-sena", playerId: PLAYER, signal: "asDeEspada" },
      { type: "send-sena", playerId: PLAYER, signal: "tres" },
    ];

    renderSenaPicker(el, legal, () => {}, { remaining: MAX_SENAS_PER_HAND });
    el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!.click();

    const buttons = [...el.querySelectorAll<HTMLButtonElement>('button[data-action="send-sena"]')];
    expect(buttons.map((b) => b.textContent)).toEqual(["As de espada", "Tres"]);
  });

  it("marks the toggle's own open state, so the picker reads as an open selector rather than a floating strip", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [{ type: "send-sena", playerId: PLAYER, signal: "asDeEspada" }];

    renderSenaPicker(el, legal, () => {}, { remaining: MAX_SENAS_PER_HAND });
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

    renderSenaPicker(el, [asDeEspada], dispatch, { remaining: MAX_SENAS_PER_HAND });
    el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!.click();
    el.querySelector<HTMLButtonElement>('button[data-action="send-sena"]')!.click();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith(asDeEspada);
  });
});

/**
 * The per-hand cap's UI half (truco-engine's `MAX_SENAS_PER_HAND`).
 *
 * THE TRAP THIS SUITE EXISTS FOR: `getLegalSenaActions` goes empty at the cap,
 * and the picker's own long-standing rule is "no legal seña, render nothing".
 * Composed naively those two make the entire Señas button VANISH the moment a
 * player spends their third seña — mid-hand, with no explanation. That reads
 * as a broken UI, not as a rule. A rule the player cannot see is not a rule
 * they can play around, so the control has to STAY and say what happened.
 */
describe("renderSenaPicker — at the per-hand cap the control stays put and says so, never disappears", () => {
  const SIX_LEGAL: readonly Action[] = [
    { type: "send-sena", playerId: PLAYER, signal: "asDeEspada" },
    { type: "send-sena", playerId: PLAYER, signal: "asDeBasto" },
    { type: "send-sena", playerId: PLAYER, signal: "sieteDeEspada" },
    { type: "send-sena", playerId: PLAYER, signal: "sieteDeOro" },
    { type: "send-sena", playerId: PLAYER, signal: "tres" },
    { type: "send-sena", playerId: PLAYER, signal: "dos" },
  ];

  it("keeps the toggle on screen once the quota is spent — disabled, not absent (the vanishing-button bug)", () => {
    const el = freshContainer();

    // Exactly the state the engine produces at the cap: no legal send-sena
    // left, and zero remaining.
    renderSenaPicker(el, [], () => {}, { remaining: 0 });

    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]');
    expect(toggle, "the Señas control must survive the cap, not vanish mid-hand").not.toBeNull();
    expect(toggle!.disabled).toBe(true);
  });

  it("says the quota is spent, in the table's own register", () => {
    const el = freshContainer();

    renderSenaPicker(el, [], () => {}, { remaining: 0 });

    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;
    expect(toggle.textContent).toBe("Sin señas");
    // The reason, for anyone who cannot infer it from the label alone — it
    // costs the fixed-height action band nothing, unlike a second line of copy.
    expect(toggle.title).toBe(`Ya hiciste las ${MAX_SENAS_PER_HAND} señas de la mano`);
  });

  it("counts down on the button itself while there is quota left, so the cap is visible BEFORE it bites", () => {
    for (const remaining of [MAX_SENAS_PER_HAND, 2, 1]) {
      const el = freshContainer();

      renderSenaPicker(el, SIX_LEGAL, () => {}, { remaining });

      const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;
      expect(toggle.textContent).toBe(`Señas (${remaining})`);
      expect(toggle.disabled).toBe(false);
      el.remove();
    }
  });

  it("still opens normally while quota remains — the cap changes the count, never the affordance", () => {
    const el = freshContainer();

    renderSenaPicker(el, SIX_LEGAL, () => {}, { remaining: 1 });
    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;
    toggle.click();

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // All six on the LAST seña of the quota too: the cap limits HOW MANY,
    // never WHICH (truco-engine's own bluffing rule).
    expect(el.querySelectorAll('button[data-action="send-sena"]')).toHaveLength(6);
  });

  it("cannot be opened at the cap — there is nothing behind it, so it claims no expandable region either", () => {
    const el = freshContainer();

    renderSenaPicker(el, [], () => {}, { remaining: 0 });
    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;
    toggle.click();

    expect(el.querySelectorAll('button[data-action="send-sena"]')).toHaveLength(0);
    expect(toggle.hasAttribute("aria-expanded")).toBe(false);
  });

  it("keeps the container's own class in every state, so the fixed action band never collapses", () => {
    for (const [legal, remaining] of [[SIX_LEGAL, MAX_SENAS_PER_HAND], [[], 0], [[], MAX_SENAS_PER_HAND]] as const) {
      const el = freshContainer();

      renderSenaPicker(el, legal, () => {}, { remaining });

      expect(el.className).toBe("hexdev-truco-senas");
      el.remove();
    }
  });
});
