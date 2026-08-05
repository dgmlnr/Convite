import { describe, expect, it } from "vitest";
import type { Client } from "colyseus";
import type { ApplyResult, GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import { createGameModuleRegistry } from "@hexdev/platform-core";
import { MatchRoom } from "./match-room.js";

/**
 * A deliberately non-truco fixture, mirroring `platform-contract`'s own
 * anti-truco-shape audit style: if `MatchRoom` only worked for this shape,
 * it would prove nothing about genericity. Two seats, a hidden per-seat
 * secret, and a strict turn order — enough to exercise redaction and
 * server-authoritative rejection without a single truco concept.
 */
interface FixtureState {
  readonly players: readonly [PlayerId, PlayerId];
  readonly turnSeat: 0 | 1;
  readonly secrets: readonly [number, number];
}
type FixtureAction = { readonly type: "advance"; readonly playerId: PlayerId } | { readonly type: "detonate"; readonly playerId: PlayerId };
interface FixtureView {
  readonly ownSecret: number;
  readonly turnSeat: 0 | 1;
}

function seatOf(state: FixtureState, playerId: PlayerId): 0 | 1 | -1 {
  const index = state.players.indexOf(playerId);
  return index === 0 || index === 1 ? index : -1;
}

const fixtureModule: GameModule<FixtureState, FixtureAction, FixtureView, void> = {
  id: "fixture-secret",
  metadata: { seatCount: 2, displayNameKey: "fixture.name", assetBase: "/fixture" },
  configOptions: [],
  createMatch: (_config, seats: readonly SeatAssignment[]) => {
    const sorted = [...seats].sort((a, b) => a.seat - b.seat);
    return { players: [sorted[0]!.playerId, sorted[1]!.playerId], turnSeat: 0, secrets: [11, 22] };
  },
  applyAction: (state, action): ApplyResult<FixtureState> => {
    if (action.type === "detonate") {
      throw new Error("boom: the fixture module intentionally blows up on this action");
    }
    const seat = seatOf(state, action.playerId);
    if (seat !== state.turnSeat) {
      return { ok: false, violation: { code: "not-your-turn", message: `seat ${seat} acted out of turn` } };
    }
    return { ok: true, state: { ...state, turnSeat: state.turnSeat === 0 ? 1 : 0 } };
  },
  getLegalActions: (state, playerId) => (seatOf(state, playerId) === state.turnSeat ? [{ type: "advance", playerId }] : []),
  getViewFor: (state, playerId) => {
    const seat = seatOf(state, playerId);
    return { ownSecret: seat === -1 ? -1 : state.secrets[seat], turnSeat: state.turnSeat };
  },
  getOutcome: () => null,
  serialize: (state) => state as never,
  deserialize: (json) => json as unknown as FixtureState,
  createBot: () => ({ chooseAction: async (_view, legal) => legal[0]! }),
};

function fakeClient(sessionId: string) {
  const sent: Array<{ type: string; message: unknown }> = [];
  const client = {
    sessionId,
    id: sessionId,
    send: (type: string, message?: unknown) => {
      sent.push({ type, message });
    },
  } as unknown as Client;
  return { client, sent };
}

function createJoinedRoom() {
  const registry = createGameModuleRegistry([fixtureModule]);
  const room = new MatchRoom();
  room.onCreate({ gameId: "fixture-secret", config: undefined, registry });
  const seat0 = fakeClient("s0");
  const seat1 = fakeClient("s1");
  room.onJoin(seat0.client, { playerId: P0 });
  room.onJoin(seat1.client, { playerId: P1 });
  return { room, seat0, seat1 };
}

const P0 = "seat-0-player" as PlayerId;
const P1 = "seat-1-player" as PlayerId;

describe("MatchRoom", () => {
  it("refuses to create when no module is registered for the requested gameId", () => {
    const registry = createGameModuleRegistry([fixtureModule]);
    const room = new MatchRoom();
    expect(() => room.onCreate({ gameId: "does-not-exist", config: undefined, registry })).toThrow(/no GameModule registered/);
  });

  it("delegates match creation to the registered module only once every seat has joined", () => {
    const registry = createGameModuleRegistry([fixtureModule]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-secret", config: undefined, registry });
    const seat0 = fakeClient("s0");
    room.onJoin(seat0.client, { playerId: P0 });
    expect(seat0.sent).toHaveLength(0);
    const seat1 = fakeClient("s1");
    room.onJoin(seat1.client, { playerId: P1 });
    expect(seat0.sent).toHaveLength(1);
    expect(seat1.sent).toHaveLength(1);
  });

  it("sends each client only its own per-seat view — the opponent's secret never appears", () => {
    const { seat0, seat1 } = createJoinedRoom();
    expect(seat0.sent[0]).toEqual({ type: "view", message: { ownSecret: 11, turnSeat: 0 } });
    expect(seat1.sent[0]).toEqual({ type: "view", message: { ownSecret: 22, turnSeat: 0 } });
    expect(JSON.stringify(seat1.sent[0]?.message)).not.toContain("11");
  });

  it("applies a legal, in-turn action and broadcasts the resulting view to both seats", () => {
    const { room, seat0, seat1 } = createJoinedRoom();
    room.handleAction(seat0.client, { type: "advance", playerId: P0 });
    expect(seat0.sent).toHaveLength(2);
    expect(seat1.sent).toHaveLength(2);
    expect(seat0.sent[1]).toEqual({ type: "view", message: { ownSecret: 11, turnSeat: 1 } });
  });

  it("rejects an out-of-turn action and leaves state unchanged (server-authoritative)", () => {
    const { room, seat0, seat1 } = createJoinedRoom();
    room.handleAction(seat1.client, { type: "advance", playerId: P1 });
    expect(seat1.sent).toHaveLength(2);
    expect(seat1.sent[1]?.type).toBe("action-rejected");
    expect(seat0.sent).toHaveLength(1); // no new view broadcast: nothing changed
  });

  it("rejects an action whose claimed playerId does not match the authenticated seat, without invoking the module", () => {
    const { room, seat0 } = createJoinedRoom();
    room.handleAction(seat0.client, { type: "advance", playerId: P1 });
    expect(seat0.sent[1]).toMatchObject({ type: "action-rejected" });
    expect((seat0.sent[1]?.message as { code: string }).code).toBe("actor-mismatch");
    expect(seat0.sent).toHaveLength(2);
  });

  it("catches a throwing module and rejects the action instead of crashing the room", () => {
    const { room, seat0, seat1 } = createJoinedRoom();
    room.handleAction(seat0.client, { type: "detonate", playerId: P0 });
    expect(seat0.sent[1]).toMatchObject({ type: "action-rejected", message: { code: "malformed-action" } });
    expect(seat1.sent).toHaveLength(1); // the crash never reached a broadcast
    // the room survives: a legal action still works afterward
    room.handleAction(seat0.client, { type: "advance", playerId: P0 });
    expect(seat0.sent).toHaveLength(3);
  });
});
