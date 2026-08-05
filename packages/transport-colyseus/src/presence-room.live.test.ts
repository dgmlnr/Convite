import { Server, WebSocketTransport } from "colyseus";
import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer } from "@colyseus/testing";
import type { GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import { createGameModuleRegistry, createMatchmakingPool } from "@hexdev/platform-core";
import { PresenceRoom } from "./presence-room.js";

/**
 * Deliberately non-truco (same reasoning as `match-room.test.ts`'s fixture):
 * two `configOptions` values, proving the lobby derives its modalities
 * generically instead of a hardcoded "pointsToWin" name (roadmap constraint,
 * obs 2943 — Escoba/Generala are next and must need zero lobby changes).
 */
const fixtureModule: GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> = {
  id: "fixture-lobby",
  metadata: { seatCount: 2, displayNameKey: "fixture.lobby", assetBase: "/fixture" },
  configOptions: [{ key: "roundLength", labelKey: "fixture.roundLength", values: [15, 30], defaultValue: 15 }],
  createMatch: (_config, seats: readonly SeatAssignment[]) => ({ seats }),
  applyAction: (state) => ({ ok: true, state }),
  getLegalActions: () => [],
  getViewFor: (state) => state,
  getOutcome: () => null,
  serialize: (state) => state as never,
  deserialize: (json) => json,
  createBot: () => ({ chooseAction: async () => ({ playerId: "bot" as PlayerId }) }),
};

/**
 * "A pairing mechanism proven only against fakes is weak evidence" (apply
 * prompt) — two REAL clients, over a REAL websocket, get REALLY paired.
 */
describe("PresenceRoom — live WebSocket pairing (design §8, spec: Human-vs-Human Matchmaking)", () => {
  let testServer: ColyseusTestServer;
  // See `server.live.test.ts` for the full explanation: `boot()` silently
  // ignores its `port` argument for a raw `Server` instance and always
  // binds 2568 internally, which collided with that other live-socket file
  // once both ran in the same suite (found from-clean, not assumed). Listen
  // on our own distinctly-ranged port ourselves, bypassing that path.
  let nextPort = 2600;

  beforeEach(async () => {
    const registry = createGameModuleRegistry([fixtureModule]);
    const pool = createMatchmakingPool();
    const gameServer = new Server({ transport: new WebSocketTransport({ server: createServer() }) });
    gameServer.define("presence", PresenceRoom, { registry, pool } as never);
    await gameServer.listen(nextPort++);
    testServer = new ColyseusTestServer(gameServer);
  });

  afterEach(async () => {
    await testServer.shutdown();
  });

  it("pairs two real waiting clients in the same modality and removes both from the live counter", async () => {
    const room = await testServer.createRoom("presence", { gameId: "fixture-lobby" });
    const client0 = await testServer.connectTo(room, { modality: { roundLength: 15 }, playerId: "p0" });
    const counts0: unknown[] = [];
    client0.onMessage("counts", (message) => counts0.push(message));
    const paired0: unknown[] = [];
    client0.onMessage("paired", (message) => paired0.push(message));

    await new Promise((resolve) => setTimeout(resolve, 30)); // let the first "counts" broadcast land

    const client1 = await testServer.connectTo(room, { modality: { roundLength: 15 }, playerId: "p1" });
    const paired1: unknown[] = [];
    client1.onMessage("paired", (message) => paired1.push(message));

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(paired0[0]).toEqual({ opponentPlayerId: "p1", modality: { roundLength: 15 } });
    expect(paired1[0]).toEqual({ opponentPlayerId: "p0", modality: { roundLength: 15 } });
    const lastCounts = counts0[counts0.length - 1] as Array<{ modality: { roundLength: number }; waitingCount: number }>;
    expect(lastCounts.find((entry) => entry.modality.roundLength === 15)?.waitingCount).toBe(0);
  });

  it("keeps two different modalities independent: a lone waiting client in a different modality is never paired", async () => {
    const room = await testServer.createRoom("presence", { gameId: "fixture-lobby" });
    const client0 = await testServer.connectTo(room, { modality: { roundLength: 15 }, playerId: "p0" });
    const paired0: unknown[] = [];
    client0.onMessage("paired", (message) => paired0.push(message));
    await testServer.connectTo(room, { modality: { roundLength: 30 }, playerId: "p1" });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(paired0).toHaveLength(0);
  });
});
