import { describe, expect, it } from "vitest";
import type { Client } from "@colyseus/core";
import type { ApplyResult, GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import {
  createGameModuleRegistry,
  createJtiReplayGuard,
  createRateLimiter,
  createSessionTokenIssuer,
  createSessionTokenVerifier,
  createStaticTenantRepository,
  deriveTestSessionSigningKey,
} from "@hexdev/platform-core";
import type { RateLimiter, SessionTokenIssuer, TenantId } from "@hexdev/platform-core";
import { MatchRoom } from "./match-room.js";

/**
 * A deliberately non-truco, 4-seat fixture (same anti-truco-shape discipline
 * `match-room.test.ts`'s own `fixtureModule` already applies) — proves
 * `MatchRoom`'s bot-fill generalizes to N seats, never asserting anything
 * truco-specific.
 */
interface FixtureState4 {
  readonly players: readonly [PlayerId, PlayerId, PlayerId, PlayerId];
  readonly turnSeat: 0 | 1 | 2 | 3;
}
type FixtureAction4 = { readonly type: "advance"; readonly playerId: PlayerId };
interface FixtureView4 {
  readonly turnSeat: 0 | 1 | 2 | 3;
}

function seatOf4(state: FixtureState4, playerId: PlayerId): 0 | 1 | 2 | 3 | -1 {
  const index = state.players.indexOf(playerId);
  return index === -1 ? -1 : (index as 0 | 1 | 2 | 3);
}

const fixtureModule4: GameModule<FixtureState4, FixtureAction4, FixtureView4, void> = {
  id: "fixture-4seat",
  metadata: { seatCount: 4, displayNameKey: "fixture4.name", assetBase: "/fixture4" },
  configOptions: [],
  createMatch: (_config, seats: readonly SeatAssignment[]) => {
    const sorted = [...seats].sort((a, b) => a.seat - b.seat);
    return { players: [sorted[0]!.playerId, sorted[1]!.playerId, sorted[2]!.playerId, sorted[3]!.playerId], turnSeat: 0 };
  },
  applyAction: (state, action): ApplyResult<FixtureState4> => {
    const seat = seatOf4(state, action.playerId);
    if (seat !== state.turnSeat) {
      return { ok: false, violation: { code: "not-your-turn", message: `seat ${seat} acted out of turn` } };
    }
    const nextSeat = ((state.turnSeat + 1) % 4) as 0 | 1 | 2 | 3;
    return { ok: true, state: { ...state, turnSeat: nextSeat } };
  },
  getLegalActions: (state, playerId) => (seatOf4(state, playerId) === state.turnSeat ? [{ type: "advance", playerId }] : []),
  getViewFor: (state) => ({ turnSeat: state.turnSeat }),
  getOutcome: () => null,
  serialize: (state) => state as never,
  deserialize: (json) => json as unknown as FixtureState4,
  createBot: () => ({ chooseAction: async (_view, legal) => legal[0]! }),
};

const TENANT_ID = "tenant-fixture4" as TenantId;
const ALLOWED_ORIGIN = "https://tenant4.example";
const SECRET = "fixture-4seat-secret-key";
const P0 = "seat-0-player" as PlayerId;
const P1 = "seat-1-player" as PlayerId;

async function createAuth() {
  const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey(SECRET));
  const verifier = await createSessionTokenVerifier(issuer.publicKey);
  // `validUntil` far in the future (tenant-administration slice 6): a real
  // join now enforces the validity window (`MatchRoom.onAuth`).
  const repository = createStaticTenantRepository([
    { id: TENANT_ID, embedKey: "pk_fixture4", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: ["fixture-4seat", "fixture-4seat-signal"], validUntil: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 },
  ]);
  const joinRateLimiter: RateLimiter = createRateLimiter({ limit: 1000, windowMs: 60_000 });
  return { issuer, verifier, repository, replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }), joinRateLimiter, allowedWidgetOrigins: [ALLOWED_ORIGIN] };
}

const DEFAULT_RNG = () => 0.5;

function mintToken(issuer: SessionTokenIssuer, playerId: PlayerId) {
  return issuer.mint({ tenantId: TENANT_ID, playerId, entitlements: [] }, 60);
}

function fakeClient(sessionId: string) {
  const sent: Array<{ type: string; message: unknown }> = [];
  const client = {
    sessionId,
    id: sessionId,
    auth: undefined as unknown,
    send: (type: string, message?: unknown) => {
      sent.push({ type, message });
    },
  } as unknown as Client & { auth: unknown };
  return { client, sent };
}

async function joinWithToken(room: MatchRoom, client: Client & { auth: unknown }, token: string) {
  const auth = await room.onAuth(client, { token }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "127.0.0.1" });
  client.auth = auth;
  await room.onJoin(client);
}

describe("MatchRoom + bot-fill generalized to N seats (2v2 'play vs bots', obs 2927/2925's own named gap)", () => {
  it("with humanSeatsNeeded omitted (defaults to 1), fills the other 3 seats with bots — one human starts immediately, no lobby wait", async () => {
    const auth = await createAuth();
    const registry = createGameModuleRegistry([fixtureModule4]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-4seat", config: undefined, registry, auth, rng: DEFAULT_RNG, botTier: "easy" });

    expect(room.maxClients).toBe(1);

    const seat0 = fakeClient("s0");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));

    expect(seat0.sent).toHaveLength(1);
    expect(seat0.sent[0]).toMatchObject({ type: "view", message: { view: { turnSeat: 0 } } });
  });

  it("the 3 bot-filled seats each take their own turn automatically once the human acts, cycling turnSeat all the way back to the human", async () => {
    const auth = await createAuth();
    const registry = createGameModuleRegistry([fixtureModule4]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-4seat", config: undefined, registry, auth, rng: DEFAULT_RNG, botTier: "easy" });
    const seat0 = fakeClient("s0");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));

    await room.handleAction(seat0.client, { type: "advance", playerId: P0 });

    // [0] initial view, [1] the human's own move, [2]/[3]/[4] the 3 bots'
    // automatic replies (seats 1, 2, 3) — turnSeat cycles all the way back to 0.
    expect(seat0.sent).toHaveLength(5);
    expect(seat0.sent[4]).toMatchObject({ type: "view", message: { view: { turnSeat: 0 } } });
  });

  it("never hangs when a bot's ONLY legal action is registered non-blocking (a real, reproduced deadlock: a continuously-legal side action must not starve the real pending decision)", async () => {
    // A dedicated fixture, deliberately non-truco: every seat ALWAYS has a
    // "signal" action legal (mirrors send-sena's own "legal any time, not
    // turn-gated" shape) PLUS "advance" only on its own turnSeat. Bot
    // insertion order is seats 3, 2, 1 (this room's own bot-fill loop) —
    // the OLD `findActingBot` (no classifier) would pick seat 3 FIRST every
    // single time (it always has "signal" legal), loop forever without
    // ever reaching seat 1's real "advance" turn. This is exactly the
    // deadlock a real 2v2 bot-vs-bot simulation reproduced in this unit's
    // own apply-progress (never converged in 2000 steps).
    interface SignalFixtureState {
      readonly turnSeat: 0 | 1 | 2 | 3;
    }
    type SignalFixtureAction = { readonly type: "advance" | "signal"; readonly playerId: PlayerId };
    const fixtureModuleWithSignal: GameModule<SignalFixtureState, SignalFixtureAction, unknown, void> = {
      id: "fixture-4seat-signal",
      metadata: { seatCount: 4, displayNameKey: "fixture4signal.name", assetBase: "/fixture4signal" },
      configOptions: [],
      createMatch: () => ({ turnSeat: 1 }), // seat 1's real turn from the start — seats 3 and 2 (earlier in bot-fill insertion order) can only "signal"
      applyAction: (state, action): ApplyResult<SignalFixtureState> => {
        if (action.type === "signal") return { ok: true, state }; // a real no-op, exactly like send-sena replacing "the same" claim
        return { ok: true, state: { turnSeat: ((state.turnSeat + 1) % 4) as 0 | 1 | 2 | 3 } };
      },
      getLegalActions: (state, playerId) => {
        const seat = seats4.find((s) => s.playerId === playerId)?.seat;
        const actions: SignalFixtureAction[] = [{ type: "signal", playerId }];
        if (seat === state.turnSeat) actions.push({ type: "advance", playerId });
        return actions;
      },
      getViewFor: (state) => state,
      getOutcome: () => null,
      serialize: (state) => state as never,
      deserialize: (json) => json as unknown as SignalFixtureState,
      createBot: () => ({
        chooseAction: async (_view, legal) => (legal as readonly SignalFixtureAction[]).find((a) => a.type === "advance") ?? legal[0]!,
      }),
    };
    const seats4: readonly SeatAssignment[] = [
      { seat: 0, playerId: P0 },
      { seat: 1, playerId: "bot-seat-1" as PlayerId },
      { seat: 2, playerId: "bot-seat-2" as PlayerId },
      { seat: 3, playerId: "bot-seat-3" as PlayerId },
    ];

    const auth = await createAuth();
    const registry = createGameModuleRegistry([{ module: fixtureModuleWithSignal, isNonBlockingAction: (action) => (action as SignalFixtureAction).type === "signal" }]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-4seat-signal", config: undefined, registry, auth, rng: DEFAULT_RNG, botTier: "easy" });
    const seat0 = fakeClient("s0");

    // `onJoin` itself `await`s the room's own `advance()` before returning —
    // under the OLD bug this call NEVER resolves. A bounded race is the
    // honest way to prove "did not hang", not a hardcoded delay.
    const HANG_TIMEOUT_MS = 2_000;
    const joined = joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    const timedOut = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), HANG_TIMEOUT_MS));
    const outcome = await Promise.race([joined.then(() => "joined" as const), timedOut]);

    expect(outcome, "MatchRoom.advance() hung — a bot with only a non-blocking action starved the real pending turn").toBe("joined");
  });

  it("with humanSeatsNeeded: 2, fills only the last 2 seats with bots — TWO real clients (seats 0 and 1) are needed before the match starts", async () => {
    const auth = await createAuth();
    const registry = createGameModuleRegistry([fixtureModule4]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-4seat", config: undefined, registry, auth, rng: DEFAULT_RNG, botTier: "easy", humanSeatsNeeded: 2 });

    expect(room.maxClients).toBe(2);

    const seat0 = fakeClient("s0");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    // Only the first human joined — the match must NOT start yet (2 human
    // seats are needed, exactly the same "reserve/fill everything before
    // start" discipline the 1v1 single-player path already has for 1 seat).
    expect(seat0.sent).toHaveLength(0);

    const seat1 = fakeClient("s1");
    await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));

    expect(seat0.sent).toHaveLength(1);
    expect(seat1.sent).toHaveLength(1);
  });
});
