import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, Card, PlayerId } from "@hexdev/truco-engine";
import { renderHand } from "./hand.js";

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

const ACE_ESPADA: Card = { suit: "espada", rank: 1 };
const REY_ORO: Card = { suit: "oro", rank: 12 };

describe("renderHand (spec: playable cards must look playable, unplayable ones must not invite a tap)", () => {
  it("renders one card element per hand card, with the real card art", () => {
    const el = freshContainer();

    renderHand(el, [ACE_ESPADA, REY_ORO], [], { onPlayCard: () => {} });

    const images = el.querySelectorAll<HTMLImageElement>("img");
    expect(images).toHaveLength(2);
    expect(images[0]!.src).toContain("1-espada.webp");
    expect(images[1]!.src).toContain("12-oro.webp");
  });

  it("marks a card playable only when a matching play-card action is in the legal action list", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [{ type: "play-card", playerId: PLAYER, card: ACE_ESPADA }];

    renderHand(el, [ACE_ESPADA, REY_ORO], legal, { onPlayCard: () => {} });

    const cards = el.querySelectorAll<HTMLElement>("[data-card]");
    expect(cards[0]!.dataset.playable).toBe("true");
    expect(cards[1]!.dataset.playable).toBe("false");
  });

  it("an unplayable card is not a button — it must not invite a tap", () => {
    const el = freshContainer();

    renderHand(el, [ACE_ESPADA], [], { onPlayCard: () => {} });

    expect(el.querySelector<HTMLElement>("[data-card]")!.tagName).not.toBe("BUTTON");
  });

  /**
   * WCAG 4.1.2 (B13). The locked card used to carry `aria-disabled="true"` on
   * a plain `<div>`, where the attribute is inert: `aria-disabled` qualifies an
   * INTERACTIVE role, and a div has none, so nothing was ever announced from
   * it. What a reader actually got was the inner image's alt — the card's own
   * name and not one word about why it cannot be played.
   *
   * Dropping the attribute alone was rejected. It would leave "As de espada,
   * imagen" against a playable "As de espada, botón", which asks a player to
   * infer a game rule from an ARIA role. The state is said out loud instead:
   * the wrapper becomes a real `role="img"` whose label names the card AND its
   * condition, which is also what makes the role honest — role="img" is a leaf,
   * so the card is one object with one name rather than a nameless box holding
   * a picture.
   */
  it("an unplayable card names itself AND its locked state, in Spanish", () => {
    const el = freshContainer();

    renderHand(el, [ACE_ESPADA], [], { onPlayCard: () => {} });

    const card = el.querySelector<HTMLElement>("[data-card]")!;
    expect(card.getAttribute("role")).toBe("img");
    expect(card.getAttribute("aria-label")).toBe("As de espada, no jugable");
    // Inert on a non-interactive element, so it says nothing and stays gone.
    expect(card.hasAttribute("aria-disabled")).toBe(false);
    // The picture inside a named leaf must not offer a second name.
    expect(card.querySelector("img")!.alt).toBe("");
  });

  it("a playable card is a button that carries the card's own name, and no locked wording", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [{ type: "play-card", playerId: PLAYER, card: ACE_ESPADA }];

    renderHand(el, [ACE_ESPADA], legal, { onPlayCard: () => {} });

    const card = el.querySelector<HTMLElement>("[data-card]")!;
    expect(card.tagName).toBe("BUTTON");
    expect(card.hasAttribute("role")).toBe(false);
    // The button takes its accessible name from the image it contains, which
    // is why THIS alt stays populated where the locked one is emptied.
    expect(card.querySelector("img")!.alt).toBe("As de espada");
  });

  it("clicking a playable card invokes onPlayCard with that exact card", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [{ type: "play-card", playerId: PLAYER, card: ACE_ESPADA }];
    const onPlayCard = vi.fn();

    renderHand(el, [ACE_ESPADA], legal, { onPlayCard });
    el.querySelector<HTMLButtonElement>("[data-card]")!.click();

    expect(onPlayCard).toHaveBeenCalledExactlyOnceWith(ACE_ESPADA);
  });

  it("clicking an unplayable card never invokes onPlayCard", () => {
    const el = freshContainer();
    const onPlayCard = vi.fn();

    renderHand(el, [ACE_ESPADA], [], { onPlayCard });
    el.querySelector<HTMLElement>("[data-card]")!.click();

    expect(onPlayCard).not.toHaveBeenCalled();
  });
});
