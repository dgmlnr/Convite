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
  it("renders one card element per hand card, with the real Fournier art", () => {
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

  it("an unplayable card is not a button and carries aria-disabled — it must not invite a tap", () => {
    const el = freshContainer();

    renderHand(el, [ACE_ESPADA], [], { onPlayCard: () => {} });

    const card = el.querySelector<HTMLElement>("[data-card]")!;
    expect(card.tagName).not.toBe("BUTTON");
    expect(card.getAttribute("aria-disabled")).toBe("true");
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
