import { afterEach, describe, expect, it } from "vitest";
import type { HandPlay, PlayerId, TeamId } from "@hexdev/truco-engine";
import { renderPlayedCards } from "./played-cards.js";
import type { TableAnchor } from "./seat-position.js";

let container: HTMLElement;

afterEach(() => {
  container.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

const TEAM_A = "player-a:team" as TeamId;
const TEAM_B = "player-b:team" as TeamId;
const positions: ReadonlyMap<number, TableAnchor> = new Map([
  [0, "bottom"],
  [1, "top"],
]);

describe("renderPlayedCards (spec: positioned so it's obvious who played what)", () => {
  it("renders nothing when no cards have been played this trick", () => {
    const el = freshContainer();

    renderPlayedCards(el, [], positions);

    expect(el.children).toHaveLength(0);
  });

  it("positions each played card at the anchor of the seat that played it, with real card art (plays are public once made)", () => {
    const el = freshContainer();
    const plays: readonly HandPlay[] = [{ playerId: "player-b" as PlayerId, teamId: TEAM_B, seat: 1, card: { suit: "espada", rank: 1 } }];

    renderPlayedCards(el, plays, positions);

    const played = el.querySelector<HTMLElement>("[data-played-by-seat]")!;
    expect(played.dataset.playedBySeat).toBe("1");
    expect(played.dataset.position).toBe("top");
    expect(played.querySelector("img")?.src).toContain("1-espada.webp");
  });

  it("renders both plays of a two-card trick, each at its own seat's anchor", () => {
    const el = freshContainer();
    const plays: readonly HandPlay[] = [
      { playerId: "player-a" as PlayerId, teamId: TEAM_A, seat: 0, card: { suit: "oro", rank: 7 } },
      { playerId: "player-b" as PlayerId, teamId: TEAM_B, seat: 1, card: { suit: "basto", rank: 3 } },
    ];

    renderPlayedCards(el, plays, positions);

    const cards = [...el.querySelectorAll<HTMLElement>("[data-played-by-seat]")];
    expect(cards.map((c) => c.dataset.position)).toEqual(["bottom", "top"]);
  });
});
