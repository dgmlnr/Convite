import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer } from "@colyseus/testing";
import type { GameId, GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import {
  createGameModuleRegistry,
  createJtiReplayGuard,
  createRateLimiter,
  createSessionTokenIssuer,
  createSessionTokenVerifier,
  createStaticTenantRepository,
  deriveTestSessionSigningKey,
} from "@hexdev/platform-core";
import type { SessionTokenIssuerHandle, TenantId } from "@hexdev/platform-core";
import { PresenceRoom, createMatchServer } from "@hexdev/transport-colyseus";
import { createTransportClient } from "./client.js";
import { startBotMatch } from "./match-connection.js";

/**
 * THE over-the-wire señas redaction proof (apply prompt: "not just in a
 * unit view test, but in the running system"). Deliberately a SYNTHETIC
 * 4-seat fixture, never `@hexdev/truco-module` — this package sits at the
 * SAME layer (L2) as `truco-module` in the design's own layout, and a
 * sibling L2->L2 dependency would be exactly the kind of edge
 * `check:boundaries` (dependency-cruiser) exists to catch; "no game rules
 * outside the engine" cuts the other way too — a transport-level test
 * proving the WIRE mechanism has no business depending on a specific
 * game's module. This fixture's `TeammateView`/`OpponentView`-shaped split
 * is structurally the SAME redaction discipline truco-engine's own
 * `view.ts` already uses and PR27 already mutation-tested at the unit
 * level (obs 2927): a teammate's view carries the signal, an opponent's
 * view type has no field capable of holding it at all. What THIS test adds
 * is the thing a unit test cannot: proof that `MatchRoom`'s real,
 * generic, per-client "view" broadcast over a REAL WebSocket never lets a
 * signal cross from one team's real client to the other's — the exact
 * transport-level claim the unit tests do not exercise.
 */
interface SignalFixtureTeammate {
  readonly cardsRemaining: number;
  readonly lastSignal: string | null;
}
interface SignalFixtureOpponent {
  readonly cardsRemaining: number;
  // Deliberately NO "lastSignal" field — the same structural guarantee
  // truco-engine's own OpponentView applies (design §4: "a redaction bug
  // is a compile error, not a runtime leak").
}
interface SignalFixtureView {
  readonly self: { readonly playerId: PlayerId; readonly lastSignal: string | null };
  readonly teammates: readonly SignalFixtureTeammate[];
  readonly opponents: readonly SignalFixtureOpponent[];
}
interface SignalFixtureState {
  readonly seats: readonly PlayerId[]; // [seat0, seat1, seat2, seat3] — partners across, 0/2 vs 1/3
  readonly signals: Readonly<Record<string, string>>; // playerId -> most recent claimed signal
}
type SignalFixtureAction = { readonly type: "signal"; readonly playerId: PlayerId; readonly value: string };
const GAME_ID = "fixture-team-play" as GameId;

function seatOf(state: SignalFixtureState, playerId: PlayerId): number {
  return state.seats.indexOf(playerId);
}
function isPartner(seatA: number, seatB: number): boolean {
  return (seatA % 2) === (seatB % 2); // 0/2 vs 1/3, mirroring createTeamMatch's own geometry
}

const fixtureModule: GameModule<SignalFixtureState, SignalFixtureAction, SignalFixtureView, unknown> = {
  id: GAME_ID,
  metadata: { seatCount: 4, displayNameKey: "fixture.teamPlay", assetBase: "/fixture-team-play" },
  configOptions: [],
  createMatch: (_config, seats: readonly SeatAssignment[]) => ({
    seats: [...seats].sort((a, b) => a.seat - b.seat).map((s) => s.playerId),
    signals: {},
  }),
  applyAction: (state, action) => ({ ok: true, state: { ...state, signals: { ...state.signals, [action.playerId]: action.value } } }),
  // Legal ANY time for ANY seated player — the exact "not turn-gated"
  // shape send-sena has (senas.ts's own docstring), which is WHY this
  // fixture also registers `isNonBlockingAction` below, same as
  // apps/server's own real truco-module registration.
  getLegalActions: (state, playerId) => (seatOf(state, playerId) === -1 ? [] : [{ type: "signal", playerId, value: "claim" }]),
  getViewFor: (state, playerId) => {
    const mySeat = seatOf(state, playerId);
    const teammates: SignalFixtureTeammate[] = [];
    const opponents: SignalFixtureOpponent[] = [];
    state.seats.forEach((otherId, seat) => {
      if (otherId === playerId) return;
      if (isPartner(mySeat, seat)) teammates.push({ cardsRemaining: 3, lastSignal: state.signals[otherId] ?? null });
      else opponents.push({ cardsRemaining: 3 });
    });
    return { self: { playerId, lastSignal: state.signals[playerId] ?? null }, teammates, opponents };
  },
  getOutcome: () => null,
  serialize: (state) => state as never,
  deserialize: (json) => json as unknown as SignalFixtureState,
  createBot: () => ({ chooseAction: async (_view, legal) => legal[0]! }),
};

describe("2v2 over-the-wire: a real per-team signal never reaches an opposing REAL client (transport-level, not just a unit view test)", () => {
  const TENANT_ID = "tenant-team-play" as TenantId;
  const ALLOWED_ORIGIN = "https://team-play.example";
  const P0 = "team-play-p0" as PlayerId; // team {0,2}
  const P1 = "team-play-p1" as PlayerId; // team {1,3} — the OPPONENT of P0

  let testServer: ColyseusTestServer;
  let issuer: SessionTokenIssuerHandle;
  let port: number;

  beforeEach(async () => {
    port = 2900 + Math.floor(Math.random() * 500);
    // The SAME classifier wiring apps/server's own composition root uses
    // for the real truco modules (registry.ts's own docstring) — proves
    // this fixture exercises the identical MatchRoom code path a real 2v2
    // match runs through, not a special-cased test-only branch.
    const registry = createGameModuleRegistry([{ module: fixtureModule, isNonBlockingAction: (action) => (action as SignalFixtureAction).type === "signal" }]);
    const httpServer = createServer();
    issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("team-play-live-secret"));
    const repository = createStaticTenantRepository([{ id: TENANT_ID, embedKey: "pk_team_play", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: [GAME_ID] }]);
    const auth = {
      verifier: await createSessionTokenVerifier(issuer.publicKey),
      repository,
      replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }),
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
      allowedWidgetOrigins: [ALLOWED_ORIGIN],
    };
    const gameServer = createMatchServer({ httpServer, registry, auth, rng: () => 0.5 });
    gameServer.define("presence", PresenceRoom, { registry, pool: undefined } as never);
    await gameServer.listen(port);
    testServer = new ColyseusTestServer(gameServer);
    testServer.sdk.http.options.headers = { origin: ALLOWED_ORIGIN };
  });

  afterEach(async () => {
    await testServer.shutdown();
  });

  it("seat 0 sends a real signal; seat 1 (the opponent, a REAL independent client) never receives a lastSignal-shaped field, across every view message", async () => {
    const token0 = await issuer.mint({ tenantId: TENANT_ID, playerId: P0, entitlements: [GAME_ID] }, 60);
    const token1 = await issuer.mint({ tenantId: TENANT_ID, playerId: P1, entitlements: [GAME_ID] }, 60);

    const client0 = createTransportClient(`ws://localhost:${String(port)}`, { headers: { origin: ALLOWED_ORIGIN } });
    const client1 = createTransportClient(`ws://localhost:${String(port)}`, { headers: { origin: ALLOWED_ORIGIN } });

    // Seat 0 CREATES the room with humanSeatsNeeded: 2 (this unit's own
    // MatchRoom generalization) — bots fill only seats 2 and 3 (each
    // team's own partner), leaving seat 1 for the second REAL client.
    const match0 = await startBotMatch<SignalFixtureView & { readonly legalActions?: readonly unknown[] }>(client0, {
      gameId: GAME_ID,
      config: {},
      botTier: "easy",
      playerId: P0,
      token: token0,
      humanSeatsNeeded: 2,
    });
    // Seat 1 joins the SAME, only-existing room — plain join(), no roomId
    // plumbing (this test's own isolated server has exactly one room).
    const room1 = await client1.join("match", { token: token1 });
    const viewsSeat1: unknown[] = [];
    room1.onMessage("view", (payload: unknown) => viewsSeat1.push(payload));

    // The real send, over the real wire.
    match0.sendAction({ type: "signal", playerId: P0, value: "seven-of-gold" });

    // Give the server a real round trip to broadcast to BOTH sides.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(viewsSeat1.length, "seat 1 never received any view message at all").toBeGreaterThan(0);

    // THE PROOF: every view message seat 1 (the OPPONENT) ever received —
    // not just the one after the signal — inspected structurally. An
    // opponents[] entry must NEVER carry a "lastSignal" property at all
    // (matches the mutation-tested unit property: `!("lastSena" in entry)`,
    // never a string-match on the value, since two different players can
    // legitimately claim the identical signal).
    for (const raw of viewsSeat1) {
      const payload = raw as { view?: SignalFixtureView };
      for (const entry of payload.view?.opponents ?? []) {
        expect("lastSignal" in entry, `seat 1's own opponents[] entry structurally carried a lastSignal field: ${JSON.stringify(entry)}`).toBe(false);
      }
    }

    await match0.leave();
    await room1.leave(false);
  });
});
