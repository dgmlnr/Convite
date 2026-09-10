import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer } from "@colyseus/testing";
import type { ApplyResult, GameId, GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import {
  createGameModuleRegistry,
  createJtiReplayGuard,
  createMatchmakingPool,
  createRateLimiter,
  createSessionTokenIssuer,
  createSessionTokenVerifier,
  createStaticTenantRepository,
  deriveTestSessionSigningKey,
} from "@hexdev/platform-core";
import type { SessionTokenIssuerHandle, TenantId } from "@hexdev/platform-core";
import { PresenceRoom } from "./presence-room.js";
import { createMatchServer } from "./server.js";
import { LIVE_TEST_TIMEOUT_MS, waitForView } from "./live-wait.test-support.js";

/**
 * SDD `mentiroso`, work unit A1 — a SIX-SEAT TRANSPORT PROBE, deliberately
 * test-only and discardable (`sdd/mentiroso/tasks`, unit A1's own rollback
 * boundary: "delete the fixture + its test file; nothing else references
 * it"). Zero production lines: this file is the entire unit.
 *
 * WHY THIS EXISTS BEFORE ANY MENTIROSO PRODUCTION CODE. `sdd-init/convite`
 * recorded, as a fact every later phase must know: "`seatCount` solo existe
 * como 1, 2 o 4 en todo el repo. Nada ejercita 5 ni 6." The largest fixture
 * any existing test drives through `MatchRoom`/`PresenceRoom` is
 * `groupModule` / `fixtureModule4` at 4 seats (`presence-room.live.test.ts`,
 * `match-room.team.test.ts`). Mentiroso's ruleset needs 2, 4 AND 6 seats, and
 * its engine must support 2 through 6 regardless of which modality a table
 * opens with (`convite/mentiroso/reglas-decididas`). Six seats is therefore a
 * genuinely unprecedented transport claim, not an extrapolation:
 * `MatchRoom.freeSeat`'s loop bound, `PresenceRoom.degradeLongWaits`'s
 * `seatCount` reads, and the matchmaking pool's group-of-N reservation are
 * all generic BY INSPECTION (no hardcoded `2`/`4` literal found reading
 * `match-room.ts`/`presence-room.ts`) — but "reads generic" and "has ever run
 * at 6" are different claims, and only the second is evidence.
 *
 * FOUR BEHAVIORS, one throwaway fixture, mapped onto this unit's own name for
 * them (`sdd/mentiroso/tasks`, unit A1: "join, freeSeat, reconnection,
 * degradeLongWaits"): "join" and "degradeLongWaits" live in the first
 * `describe` below (full and partial `PresenceRoom` hand-off); "freeSeat" and
 * "reconnection" live in the second (seat 5 specifically — the one index
 * seatCount=6 offers that every existing 4-seat fixture structurally cannot
 * reach).
 *
 * This fixture is deliberately NOT shaped like the eventual mentiroso engine
 * (no bid, no dice, no phases, no hidden state) — the same discipline
 * `match-room.team.test.ts`'s own 4-seat fixture states for truco: a probe
 * that happened to validate one future game's specific shape would prove
 * nothing general about the transport layer underneath it.
 */
interface Seat6State {
  readonly players: readonly [PlayerId, PlayerId, PlayerId, PlayerId, PlayerId, PlayerId];
  readonly turnSeat: 0 | 1 | 2 | 3 | 4 | 5;
}
type Seat6Action = { readonly type: "advance"; readonly playerId: PlayerId };

function seatOf6(state: Seat6State, playerId: PlayerId): 0 | 1 | 2 | 3 | 4 | 5 | -1 {
  const index = state.players.indexOf(playerId);
  return index === -1 ? -1 : (index as 0 | 1 | 2 | 3 | 4 | 5);
}

const SIX_SEAT_GAME_ID = "fixture-6seat-probe" as GameId;

const sixSeatModule: GameModule<Seat6State, Seat6Action, Seat6State, void> = {
  id: SIX_SEAT_GAME_ID,
  hiddenState: { kind: "nothing-is-hidden" },
  metadata: { seatCount: 6, displayNameKey: "fixture6.name", assetBase: "/fixture6" },
  configOptions: [],
  createMatch: (_config, seats: readonly SeatAssignment[]) => {
    const sorted = [...seats].sort((a, b) => a.seat - b.seat);
    const players: Seat6State["players"] = [
      sorted[0]!.playerId,
      sorted[1]!.playerId,
      sorted[2]!.playerId,
      sorted[3]!.playerId,
      sorted[4]!.playerId,
      sorted[5]!.playerId,
    ];
    return { players, turnSeat: 0 };
  },
  applyAction: (state, action): ApplyResult<Seat6State> => {
    const seat = seatOf6(state, action.playerId);
    if (seat !== state.turnSeat) {
      return { ok: false, violation: { code: "not-your-turn", message: `seat ${String(seat)} acted out of turn` } };
    }
    const nextSeat = ((state.turnSeat + 1) % 6) as Seat6State["turnSeat"];
    return { ok: true, state: { ...state, turnSeat: nextSeat } };
  },
  getLegalActions: (state, playerId) => (seatOf6(state, playerId) === state.turnSeat ? [{ type: "advance", playerId }] : []),
  getViewFor: (state) => state,
  getOutcome: () => null,
  serialize: (state) => state as never,
  deserialize: (json) => json as unknown as Seat6State,
  createBot: () => ({ chooseAction: async (_view, legal) => legal[0]! }),
};

const describeSeat6View = (view: Seat6State): string => `turnSeat=${String(view.turnSeat)} players=${String(view.players.length)}`;

describe("PresenceRoom -> MatchRoom hand-off generalizes to six seats (SDD mentiroso, unit A1)", () => {
  const TENANT_ID = "tenant-6seat-probe" as TenantId;
  const ALLOWED_ORIGIN = "https://six-seat-probe.example";
  const PLAYERS: readonly PlayerId[] = ["seat6-p0", "seat6-p1", "seat6-p2", "seat6-p3", "seat6-p4", "seat6-p5"].map((id) => id as PlayerId);

  let testServer: ColyseusTestServer;
  let issuer: SessionTokenIssuerHandle;
  // Own disjoint 100-wide band, one past the highest documented in
  // `adapter.live.test.ts`'s own band-map comment (`...3900`, `4000
  // presence-room.live.test.ts (bot-fill degradation)`) — this file adds two
  // more bands beyond it rather than editing that comment, so deleting this
  // file (its own stated rollback boundary above) never leaves a dangling
  // reference in a file this unit does not otherwise touch.
  let nextPort = 4100;

  beforeEach(async () => {
    const registry = createGameModuleRegistry([sixSeatModule]);
    const pool = createMatchmakingPool();
    const httpServer = createServer();
    issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("six-seat-probe-secret"));
    // `validUntil` far in the future (tenant-administration slice 6): a real
    // join now enforces the validity window (`MatchRoom.onAuth`).
    const repository = createStaticTenantRepository([
      { id: TENANT_ID, embedKey: "pk_six_seat_probe", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: [SIX_SEAT_GAME_ID], validUntil: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 },
    ]);
    const auth = {
      verifier: await createSessionTokenVerifier(issuer.publicKey),
      repository,
      replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }),
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
      allowedWidgetOrigins: [ALLOWED_ORIGIN],
    };
    const gameServer = createMatchServer({ httpServer, registry, auth, rng: () => 0.5 });
    gameServer.define("presence", PresenceRoom, { registry, pool } as never);
    await gameServer.listen(nextPort++);
    testServer = new ColyseusTestServer(gameServer);
    testServer.sdk.http.options.headers = { origin: ALLOWED_ORIGIN };
  });

  afterEach(async () => {
    await testServer.shutdown();
  });

  /**
   * Bounded poll, not a fixed sleep. Six sequential connects (mint + a real
   * websocket handshake, each) take longer — and by a more variable amount —
   * than the 4-seat precedent's fixed 150ms wait, which already caused one
   * documented flake at 3 humans / 4 seats on a loaded runner (see
   * `presence-room.live.test.ts`'s own "THE WINDOW HERE IS DELIBERATELY WIDE"
   * comment on the exact same race, one seat count down from here).
   */
  async function waitForAllPaired(paired: ReadonlyArray<readonly unknown[]>, expectedEach: number, what: string): Promise<void> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !paired.every((messages) => messages.length >= expectedEach)) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (!paired.every((messages) => messages.length >= expectedEach)) {
      throw new Error(`waited for ${what} and it never arrived; got lengths [${paired.map((messages) => messages.length).join(",")}]`);
    }
  }

  it("hands a full 6-human group off into ONE MatchRoom: every member gets the same 6-seat roster and all six real seats fill", async () => {
    const presenceRoom = await testServer.createRoom("presence", { gameId: SIX_SEAT_GAME_ID });
    const paired: Array<Array<{ players: readonly string[]; matchReservation: unknown }>> = [[], [], [], [], [], []];
    for (const [index, playerId] of PLAYERS.entries()) {
      const token = await issuer.mint({ tenantId: TENANT_ID, playerId, entitlements: [SIX_SEAT_GAME_ID] }, 60);
      const client = await testServer.connectTo(presenceRoom, { gameId: SIX_SEAT_GAME_ID, modality: {}, playerId, token });
      client.onMessage("paired", (message) => paired[index]!.push(message));
    }

    await waitForAllPaired(paired, 1, "all six seats to receive 'paired'");

    for (const messages of paired) {
      expect(messages).toHaveLength(1);
      expect(messages[0]!.players).toEqual([...PLAYERS]);
    }

    const views: Seat6State[] = [];
    const matchRooms = [];
    for (const messages of paired) {
      const matchRoom = await testServer.sdk.consumeSeatReservation<Seat6State>(messages[0]!.matchReservation as never);
      matchRoom.onMessage("view", (message: { view: Seat6State }) => views.push(message.view));
      matchRooms.push(matchRoom);
    }
    expect(new Set(matchRooms.map((matchRoom) => matchRoom.roomId)).size).toBe(1);

    const started = await waitForView({ views, matches: (view) => view.players.length === 6, what: "the match to start with all six seats filled", describe: describeSeat6View });
    expect([...started.players].sort()).toEqual([...PLAYERS].sort());
  }, LIVE_TEST_TIMEOUT_MS);

  it("degradeLongWaits at six seats: four humans waiting past botFillAfterSeconds are handed off with the remaining two seats bot-filled", async () => {
    const presenceRoom = await testServer.createRoom("presence", { gameId: SIX_SEAT_GAME_ID, botFillAfterSeconds: 1, sweepTickMs: 25 });
    const humans = PLAYERS.slice(0, 4);
    const paired: Array<Array<{ players: readonly string[]; matchReservation: unknown }>> = [[], [], [], []];
    for (const [index, playerId] of humans.entries()) {
      const token = await issuer.mint({ tenantId: TENANT_ID, playerId, entitlements: [SIX_SEAT_GAME_ID] }, 60);
      const client = await testServer.connectTo(presenceRoom, { gameId: SIX_SEAT_GAME_ID, modality: {}, playerId, token });
      client.onMessage("paired", (message) => paired[index]!.push(message));
    }

    await waitForAllPaired(paired, 1, "the four waiting humans to be degraded past the timeout");

    for (const messages of paired) {
      expect(messages).toHaveLength(1);
      expect(messages[0]!.players).toEqual([...humans]);
    }

    const views: Seat6State[] = [];
    for (const messages of paired) {
      const matchRoom = await testServer.sdk.consumeSeatReservation<Seat6State>(messages[0]!.matchReservation as never);
      matchRoom.onMessage("view", (message: { view: Seat6State }) => views.push(message.view));
    }
    const started = await waitForView({ views, matches: (view) => view.players.length === 6, what: "the degraded match to start with 4 humans + 2 bots", describe: describeSeat6View });

    const humanSet = new Set<string>(humans);
    expect(started.players.filter((playerId) => humanSet.has(playerId))).toHaveLength(4);
    expect(started.players.filter((playerId) => !humanSet.has(playerId))).toHaveLength(2);
  }, LIVE_TEST_TIMEOUT_MS);
});

describe("MatchRoom seat assignment and reconnection generalize to six seats (SDD mentiroso, unit A1)", () => {
  const TENANT_ID = "tenant-6seat-reconnect" as TenantId;
  const ALLOWED_ORIGIN = "https://six-seat-reconnect.example";
  const PLAYERS: readonly PlayerId[] = ["seat6r-p0", "seat6r-p1", "seat6r-p2", "seat6r-p3", "seat6r-p4", "seat6r-p5"].map((id) => id as PlayerId);

  let testServer: ColyseusTestServer;
  let issuer: SessionTokenIssuerHandle;
  // Second band this file adds, immediately after the first describe
  // block's own band — see that block's comment for why neither edits
  // `adapter.live.test.ts`'s documented map.
  let nextPort = 4200;

  beforeEach(async () => {
    issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("six-seat-reconnect-secret"));
    const repository = createStaticTenantRepository([
      { id: TENANT_ID, embedKey: "pk_six_seat_reconnect", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: [SIX_SEAT_GAME_ID], validUntil: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 },
    ]);
    const registry = createGameModuleRegistry([sixSeatModule]);
    const httpServer = createServer();
    const auth = {
      verifier: await createSessionTokenVerifier(issuer.publicKey),
      repository,
      replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }),
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
      allowedWidgetOrigins: [ALLOWED_ORIGIN],
    };
    const gameServer = createMatchServer({ httpServer, registry, auth, rng: () => 0.5 });
    await gameServer.listen(nextPort++);
    testServer = new ColyseusTestServer(gameServer);
    testServer.sdk.http.options.headers = { origin: ALLOWED_ORIGIN };
  });

  afterEach(async () => {
    await testServer.shutdown();
  });

  /**
   * Joins all six players in seat order and drives the turn to seat 5 — the
   * ONE index this whole repo has never reached (`freeSeat`'s loop bound;
   * every prior fixture's own top seat, `3`, is four short of it). A single
   * client's own "view" stream is enough to track the shared state: this
   * fixture declares `hiddenState: "nothing-is-hidden"`, so every seat's view
   * is byte-identical (the same convention `match-room.team.test.ts`'s
   * 4-seat fixture relies on for its own turn-cycling assertions).
   */
  async function joinAllSixAndAdvanceToSeat5(
    room: Awaited<ReturnType<typeof testServer.createRoom>>,
  ): Promise<{ clients: Array<Awaited<ReturnType<typeof testServer.connectTo>>>; views: Seat6State[] }> {
    const clients: Array<Awaited<ReturnType<typeof testServer.connectTo>>> = [];
    const views: Seat6State[] = [];
    for (const [index, playerId] of PLAYERS.entries()) {
      const token = await issuer.mint({ tenantId: TENANT_ID, playerId, entitlements: [SIX_SEAT_GAME_ID] }, 60);
      const client = await testServer.connectTo(room, { token });
      if (index === 0) client.onMessage("view", (message: { view: Seat6State }) => views.push(message.view));
      clients.push(client);
    }
    const started = await waitForView({ views, matches: (view) => view.players.length === 6, what: "the match to start with all six seats filled", describe: describeSeat6View });
    // freeSeat placed the 6th joiner in seat index 5, not wrapped or
    // truncated anywhere else in the join path.
    expect(started.players[5]).toBe(PLAYERS[5]);

    for (let seat = 0; seat < 5; seat += 1) {
      clients[seat]!.send("action", { type: "advance", playerId: PLAYERS[seat] });
      const target = seat + 1;
      await waitForView({ views, matches: (view) => view.turnSeat === target, what: `the turn to reach seat ${String(target)}`, describe: describeSeat6View });
    }
    return { clients, views };
  }

  it("assigns the 6th joiner to seat 5 and resumes that SAME seat on reconnection — freeSeat's loop bound, exercised at its actual boundary for the first time in this repo", async () => {
    const room = await testServer.createRoom("match", { gameId: SIX_SEAT_GAME_ID, config: undefined, reconnectionWindowSeconds: 5 });
    const { clients, views } = await joinAllSixAndAdvanceToSeat5(room);
    const seat5 = clients[5]!;
    const reconnectionToken = seat5.reconnectionToken;

    seat5.leave(false); // abrupt drop, not a consented leave
    await new Promise((resolve) => setTimeout(resolve, 50));

    const reconnected = await testServer.sdk.reconnect(reconnectionToken);
    const reconnectedViews: Seat6State[] = [];
    reconnected.onMessage("view", (message: { view: Seat6State }) => reconnectedViews.push(message.view));
    const resumed = await waitForView({ views: reconnectedViews, matches: () => true, what: "any view at all — onReconnect resends the current one unprompted", describe: describeSeat6View });
    expect(resumed.players[5]).toBe(PLAYERS[5]); // same identity, not a fresh seat handed out by freeSeat

    // Still a HUMAN-controlled seat, not a bot: this player's own action is
    // what advances the match, proving the seat was genuinely resumed.
    reconnected.send("action", { type: "advance", playerId: PLAYERS[5] });
    await waitForView({ views, matches: (view) => view.turnSeat === 0, what: "the turn to cycle all the way back to seat 0", describe: describeSeat6View });
  }, LIVE_TEST_TIMEOUT_MS);

  it("window expiry hands seat 5 to a bot that resolves its own turn unprompted, cycling all the way back to a human seat", async () => {
    const room = await testServer.createRoom("match", { gameId: SIX_SEAT_GAME_ID, config: undefined, reconnectionWindowSeconds: 0.2 });
    const { clients, views } = await joinAllSixAndAdvanceToSeat5(room);
    clients[5]!.leave(false);

    await new Promise((resolve) => setTimeout(resolve, 400)); // past the 0.2s window: takeover fires

    // Nobody prompts this: the takeover bot's own advance() call is what
    // must cycle the turn from seat 5 all the way back to seat 0.
    await waitForView({ views, matches: (view) => view.turnSeat === 0, what: "the takeover bot to resolve seat 5's turn unprompted", describe: describeSeat6View });
  }, LIVE_TEST_TIMEOUT_MS);
});
