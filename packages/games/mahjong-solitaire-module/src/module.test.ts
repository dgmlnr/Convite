import { describe, expect, it } from "vitest";
import { LAYOUT, getOutcome as boardOutcome } from "@hexdev/mahjong-solitaire-engine";
import type { RemovePairAction, TileId } from "@hexdev/mahjong-solitaire-engine";
import { describeGameModule } from "@hexdev/platform-contract";
import type { PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import { createGameModuleRegistry } from "@hexdev/platform-core";
import type { AbandonedSeatActionProvider, SystemActionRequester } from "@hexdev/platform-core";
import { SYSTEM_ACTOR_ID, generateDeal } from "./deal.js";
import { getAbandonedSeatAction, mahjongSolitaireModule, requestMahjongSolitaireSystemAction } from "./module.js";
import type { MahjongSolitaireAction, SolitaireMatchState } from "./module.js";

const player = "seat-0-player" as PlayerId;
const stranger = "somebody-else" as PlayerId;
const seats: readonly SeatAssignment[] = [{ seat: 0, playerId: player }];
const config = {};

function seeded(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Everything below builds its states through the module's OWN `createMatch`
 * and `applyAction`, never by writing a state literal: a fence about what a
 * producer stores is worthless when the test file is the producer. */
function dealt(seed = 4): SolitaireMatchState {
  const created = mahjongSolitaireModule.createMatch(config, seats);
  const deal = requestMahjongSolitaireSystemAction(created, seeded(seed));
  expect(deal).not.toBeNull();
  const applied = mahjongSolitaireModule.applyAction(created, deal!);
  expect(applied.ok).toBe(true);
  return applied.ok ? applied.state : created;
}

function apply(state: SolitaireMatchState, action: MahjongSolitaireAction): SolitaireMatchState {
  const result = mahjongSolitaireModule.applyAction(state, action);
  expect(result.ok).toBe(true);
  return result.ok ? result.state : state;
}

/** The port's action type is a union, so narrowing is the test's job — and a
 * board that offers no pair at all would be a failure worth seeing here rather
 * than three assertions later. */
function firstMove(state: SolitaireMatchState): RemovePairAction {
  const [move] = mahjongSolitaireModule.getLegalActions(state, player);
  if (move === undefined || move.type !== "remove-pair") throw new Error("a freshly dealt board offered no pair to take");
  return move;
}

const reachable = dealt();
const legalAction = firstMove(reachable);
const abandoned = apply(reachable, { type: "abandon-board", playerId: player });

describeGameModule(
  mahjongSolitaireModule,
  { config, seats, playerId: player, reachableState: reachable, legalAction, terminalState: abandoned, botTier: "easy" },
  { describe, it, expect },
);

describe("the solitaire module", () => {
  it("asks for a deal exactly once — the board is laid, never re-laid", () => {
    const created = mahjongSolitaireModule.createMatch(config, seats);
    expect(requestMahjongSolitaireSystemAction(created, seeded(1))).not.toBeNull();
    expect(requestMahjongSolitaireSystemAction(dealt(), seeded(1))).toBeNull();
  });

  it("lays every position of the turtle when it applies the deal", () => {
    expect(reachable.board?.tiles).toHaveLength(LAYOUT.length);
    expect(reachable.board?.tiles.filter((tile) => tile !== null)).toHaveLength(LAYOUT.length);
  });

  it("takes exactly the two tiles a legal move names, and refuses one it does not", () => {
    const after = apply(reachable, legalAction);
    const gone = after.board!.tiles.map((tile, index) => (tile === null ? index : -1)).filter((index) => index >= 0);
    expect(gone).toEqual([legalAction.a, legalAction.b].sort((left, right) => left - right));

    const illegal = mahjongSolitaireModule.applyAction(reachable, { ...legalAction, b: legalAction.a });
    expect(illegal.ok).toBe(false);
  });

  /**
   * THE GENERATOR AND THE MODULE, AGREEING, END TO END. The order the
   * generator walked is replayed through the module's own `applyAction` — every
   * step accepted as legal — and the player wins. If the two disagreed about
   * what a board is or about when a pair may be taken, this is where it would
   * show.
   */
  it("plays the generator's own solution to a win, through the module", () => {
    const deal = generateDeal(seeded(21));
    // `SYSTEM_ACTOR_ID`, not `player`: the module now refuses a board laid
    // by anybody else, so a fixture dealing as the seated player would be
    // asserting that a solitaire can deal itself its own board.
    let state = apply(mahjongSolitaireModule.createMatch(config, seats), { type: "deal-board", playerId: SYSTEM_ACTOR_ID, placements: deal.placements });
    expect(deal.solution).toHaveLength(LAYOUT.length / 2);

    for (const step of deal.solution) {
      expect(mahjongSolitaireModule.getOutcome(state)).toBeNull();
      state = apply(state, { type: "remove-pair", playerId: player, a: step.a, b: step.b });
    }
    expect(mahjongSolitaireModule.getOutcome(state)).toEqual({ winnerIds: [player] });
  });

  /**
   * R15: this reads back a state a PRODUCER built (`createMatch` then
   * `applyAction`), never one this file assembled, so the assertion can
   * actually fail. The generator's placement order is what proves the board
   * solvable and it must not be reachable from anything that travels.
   */
  it("stores the board and who is playing it, and nothing about how the board was found", () => {
    expect(Object.keys(reachable).sort()).toEqual(["abandoned", "board", "playerId"]);
    expect(Object.keys(reachable.board!).sort()).toEqual(["playerId", "tiles"]);
    expect(JSON.stringify(mahjongSolitaireModule.serialize(reachable))).not.toContain("solution");
  });
});

describe("only the system lays a board", () => {
  /**
   * The same guard `truco-module` and `escoba-module` now carry, kept here
   * even though this game has nobody to cheat: one seat means a player who
   * chose their own board only chose their own difficulty. It is asserted
   * because the RULE is the same one, and because "the harm is self-
   * inflicted" is a fact about `metadata.seatCount`, not about this reducer —
   * a future variant that seats two would inherit the hole silently.
   */
  it("refuses a deal-board submitted by the seated player", () => {
    const created = mahjongSolitaireModule.createMatch(config, seats);
    expect(mahjongSolitaireModule.getLegalActions(created, player).some((action) => action.type === "deal-board")).toBe(false);

    const result = mahjongSolitaireModule.applyAction(created, { type: "deal-board", playerId: player, placements: generateDeal(seeded(4)).placements });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation.code).toBe("not-a-system-actor");
  });

  /** `abandon-board` is deliberately NOT actor-gated, and this is the test
   * that keeps it that way: leaving the table is the player's own act, and it
   * arrives carrying the player's own id through `getAbandonedSeatAction`. */
  it("still lets the seated player abandon their own board", () => {
    expect(getAbandonedSeatAction(reachable, player)).toEqual({ type: "abandon-board", playerId: player });
    expect(mahjongSolitaireModule.applyAction(reachable, { type: "abandon-board", playerId: player }).ok).toBe(true);
  });
});

describe("a seat somebody walked away from", () => {
  it("ends the match with nobody winning, and the ending is read from the module", () => {
    expect(mahjongSolitaireModule.getOutcome(reachable)).toBeNull();
    const action = getAbandonedSeatAction(reachable, player);
    expect(action).toEqual({ type: "abandon-board", playerId: player });
    expect(mahjongSolitaireModule.getOutcome(apply(reachable, action!))).toEqual({ winnerIds: [] });
  });

  it("leaves the board alone — the tiles are still there, nobody just won", () => {
    expect(abandoned.board!.tiles.filter((tile: TileId | null) => tile !== null)).toHaveLength(LAYOUT.length);
    expect(boardOutcome(abandoned.board!)).toBeNull();
  });

  it("has no answer for a seat that is not the one playing", () => {
    expect(getAbandonedSeatAction(reachable, stranger)).toBeNull();
  });

  it("has no answer for a match that is already over", () => {
    expect(getAbandonedSeatAction(abandoned, player)).toBeNull();
  });

  it("offers nothing to play once the seat is abandoned", () => {
    expect(mahjongSolitaireModule.getLegalActions(reachable, player).length).toBeGreaterThan(0);
    expect(mahjongSolitaireModule.getLegalActions(abandoned, player)).toEqual([]);
  });

  /**
   * The registration slice 2 built this seam for. The composition roots are
   * slice 9's; what is proven here is that the shapes fit and that
   * `createGameModuleRegistry` really does reach this module's provider by id.
   */
  it("reaches the provider through the registry, by game id", () => {
    const registry = createGameModuleRegistry([
      {
        module: mahjongSolitaireModule,
        requestSystemAction: requestMahjongSolitaireSystemAction as SystemActionRequester,
        getAbandonedSeatAction: getAbandonedSeatAction as AbandonedSeatActionProvider,
      },
    ]);
    expect(registry.getAbandonedSeatAction(mahjongSolitaireModule.id, reachable, player)).toEqual({ type: "abandon-board", playerId: player });
    expect(registry.getAbandonedSeatAction("some-other-game", reachable, player)).toBeNull();
    expect(registry.getSystemAction(mahjongSolitaireModule.id, reachable, seeded(1))).toBeNull();
  });
});
