import { afterEach, describe, expect, it } from "vitest";
import type { HandPlay, PlayerId, TeamId } from "@hexdev/truco-engine";
import { renderPlayedCards } from "./played-cards.js";
import { ensureTableStyles } from "./table-styles.js";
import type { TableAnchor } from "./seat-position.js";

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
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

  // T-8 (spec: "Persistent Per-Seat Card Piles") — a hand's full history, not
  // only the trick in progress.
  it("stacks every play this hand into a per-seat pile: DOM order stays chronological, pile index ascends per seat, index 0 offsets zero, and N cards keep a one-card footprint", () => {
    ensureTableStyles(document);
    const el = freshContainer();
    el.style.setProperty("--truco-card-width", "60px");

    const plays: readonly HandPlay[] = [
      { playerId: "player-a" as PlayerId, teamId: TEAM_A, seat: 0, card: { suit: "oro", rank: 7 } },
      { playerId: "player-b" as PlayerId, teamId: TEAM_B, seat: 1, card: { suit: "basto", rank: 3 } },
      { playerId: "player-a" as PlayerId, teamId: TEAM_A, seat: 0, card: { suit: "espada", rank: 1 } },
      { playerId: "player-b" as PlayerId, teamId: TEAM_B, seat: 1, card: { suit: "copa", rank: 12 } },
      { playerId: "player-a" as PlayerId, teamId: TEAM_A, seat: 0, card: { suit: "oro", rank: 3 } },
    ];

    renderPlayedCards(el, plays, positions);

    const cards = [...el.querySelectorAll<HTMLElement>("[data-played-by-seat]")];
    expect(cards).toHaveLength(5);
    // DOM order must stay chronological — "most recent on top" (spec) relies
    // on later siblings painting above earlier ones, never on z-index.
    expect(cards.map((c) => c.dataset.playedBySeat)).toEqual(["0", "1", "0", "1", "0"]);
    // Ascending PER SEAT, independent of the other seat's own count.
    expect(cards.map((c) => c.dataset.pileIndex)).toEqual(["0", "0", "1", "1", "2"]);
    // Index 0 must render a zero offset — keeps a single-card trick (e.g.
    // table-mid-hand's own visual baseline) byte-identical to before.
    expect(cards[0]!.style.getPropertyValue("--truco-pile-index")).toBe("0");

    const single = document.createElement("div");
    single.style.setProperty("--truco-card-width", "60px");
    document.body.appendChild(single);
    renderPlayedCards(single, [plays[0]!], positions);

    expect(el.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(el.getBoundingClientRect().height).toBe(single.getBoundingClientRect().height);
    single.remove();
  });
});
