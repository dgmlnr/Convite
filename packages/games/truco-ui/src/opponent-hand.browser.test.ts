import { afterEach, describe, expect, it } from "vitest";
import { renderOpponentHand } from "./opponent-hand.js";

let container: HTMLElement;

afterEach(() => {
  container.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("renderOpponentHand (spec: opponents' hands as face-down backs — never the front art, never the actual cards)", () => {
  it("renders exactly `cardsRemaining` face-down backs, never the card identity", () => {
    const el = freshContainer();

    renderOpponentHand(el, 3);

    const backs = el.querySelectorAll<HTMLElement>("[data-card-back]");
    expect(backs).toHaveLength(3);
    for (const back of backs) {
      expect(back.querySelector("svg")).not.toBeNull();
      expect(back.querySelector("img")).toBeNull(); // never the front artwork
    }
  });

  it("renders nothing when the opponent has no cards left", () => {
    const el = freshContainer();

    renderOpponentHand(el, 0);

    expect(el.querySelectorAll("[data-card-back]")).toHaveLength(0);
  });
});
