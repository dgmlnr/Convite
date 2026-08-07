import { describe, expect, it } from "vitest";
import type { Client } from "colyseus";
import type { ApplyResult, BotTier, GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import {
  createGameModuleRegistry,
  createJtiReplayGuard,
  createRateLimiter,
  createSessionTokenIssuer,
  createStaticTenantRepository,
} from "@hexdev/platform-core";
import type { RateLimiter, SessionTokenIssuer, TenantId } from "@hexdev/platform-core";
import { MatchRoom } from "./match-room.js";
import type { MatchRoomAuthOptions } from "./match-room.js";

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

const TENANT_ID = "tenant-fixture" as TenantId;
const OTHER_TENANT_ID = "tenant-other" as TenantId;
const ALLOWED_ORIGIN = "https://tenant.example";
const SECRET = "fixture-secret-key";
const P0 = "seat-0-player" as PlayerId;
const P1 = "seat-1-player" as PlayerId;

function createAuth(overrides: { joinRateLimiter?: RateLimiter } = {}): MatchRoomAuthOptions {
  const issuer = createSessionTokenIssuer(SECRET);
  const repository = createStaticTenantRepository([
    { id: TENANT_ID, embedKey: "pk_fixture", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: ["fixture-secret", "fixture-stuck", "fixture-terminal"] },
    { id: OTHER_TENANT_ID, embedKey: "pk_other", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: ["some-other-game"] },
  ]);
  // Generous default so unrelated tests never accidentally trip the limit —
  // the dedicated rate-limiting describe block overrides this.
  return {
    issuer,
    repository,
    replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }), // matches this fixture's default mintToken ttlSeconds
    joinRateLimiter: overrides.joinRateLimiter ?? createRateLimiter({ limit: 1000, windowMs: 60_000 }),
    // This fixture's "our own widget origin" — deliberately the SAME
    // constant every test's WS `origin` header uses (`ALLOWED_ORIGIN`), the
    // real fix's own semantic: this is no longer per-tenant.
    allowedWidgetOrigins: [ALLOWED_ORIGIN],
  };
}

/** A fixed source for tests that never assert on the entropy VALUE, only on
 * the mechanism firing — the real CSPRNG lives in `apps/server` (design §4:
 * "the server is where the entropy lives"). */
const DEFAULT_RNG = () => 0.5;

function mintToken(issuer: SessionTokenIssuer, playerId: PlayerId, overrides: { tenantId?: TenantId; ttlSeconds?: number } = {}) {
  return issuer.mint({ tenantId: overrides.tenantId ?? TENANT_ID, playerId, entitlements: [] }, overrides.ttlSeconds ?? 60);
}

/** See `tenant-auth.test.ts` for why a middle-character flip, not the last
 * character, is required for a reliable (non-flaky) tamper proof. */
function corruptSignature(token: string): string {
  const dot = token.indexOf(".");
  const signature = token.slice(dot + 1);
  const mid = Math.floor(signature.length / 2);
  const replacement = signature[mid] === "a" ? "b" : "a";
  return `${token.slice(0, dot + 1 + mid)}${replacement}${signature.slice(mid + 1)}`;
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

async function joinWithToken(room: MatchRoom, client: Client & { auth: unknown }, token: string | undefined, origin = ALLOWED_ORIGIN) {
  const options = { token };
  const auth = await room.onAuth(client, options, { headers: new Headers({ origin }), ip: "127.0.0.1" });
  client.auth = auth;
  await room.onJoin(client);
}

async function createJoinedRoom() {
  const auth = createAuth();
  const registry = createGameModuleRegistry([fixtureModule]);
  const room = new MatchRoom();
  room.onCreate({ gameId: "fixture-secret", config: undefined, registry, auth, rng: DEFAULT_RNG });
  const seat0 = fakeClient("s0");
  const seat1 = fakeClient("s1");
  await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
  await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));
  return { room, seat0, seat1, auth };
}

describe("MatchRoom", () => {
  it("refuses to create when no module is registered for the requested gameId", () => {
    const registry = createGameModuleRegistry([fixtureModule]);
    const room = new MatchRoom();
    expect(() => room.onCreate({ gameId: "does-not-exist", config: undefined, registry, auth: createAuth(), rng: DEFAULT_RNG })).toThrow(/no GameModule registered/);
  });

  it("delegates match creation to the registered module only once every seat has joined", async () => {
    const { seat0, seat1 } = await createJoinedRoom();
    expect(seat0.sent).toHaveLength(1);
    expect(seat1.sent).toHaveLength(1);
  });

  it("sends each client only its own per-seat view — the opponent's secret never appears", async () => {
    const { seat0, seat1 } = await createJoinedRoom();
    expect(seat0.sent[0]).toEqual({ type: "view", message: { view: { ownSecret: 11, turnSeat: 0 }, legalActions: [{ type: "advance", playerId: P0 }], outcome: null } });
    expect(seat1.sent[0]).toEqual({ type: "view", message: { view: { ownSecret: 22, turnSeat: 0 }, legalActions: [], outcome: null } });
    expect(JSON.stringify(seat1.sent[0]?.message)).not.toContain("11");
  });

  it("applies a legal, in-turn action and broadcasts the resulting view to both seats", async () => {
    const { room, seat0, seat1 } = await createJoinedRoom();
    room.handleAction(seat0.client, { type: "advance", playerId: P0 });
    expect(seat0.sent).toHaveLength(2);
    expect(seat1.sent).toHaveLength(2);
    expect(seat0.sent[1]).toEqual({ type: "view", message: { view: { ownSecret: 11, turnSeat: 1 }, legalActions: [], outcome: null } });
  });

  it("rejects an out-of-turn action and leaves state unchanged (server-authoritative)", async () => {
    const { room, seat0, seat1 } = await createJoinedRoom();
    room.handleAction(seat1.client, { type: "advance", playerId: P1 });
    expect(seat1.sent).toHaveLength(2);
    expect(seat1.sent[1]?.type).toBe("action-rejected");
    expect(seat0.sent).toHaveLength(1); // no new view broadcast: nothing changed
  });

  it("rejects an action whose claimed playerId does not match the authenticated seat, without invoking the module", async () => {
    const { room, seat0 } = await createJoinedRoom();
    room.handleAction(seat0.client, { type: "advance", playerId: P1 });
    expect(seat0.sent[1]).toMatchObject({ type: "action-rejected" });
    expect((seat0.sent[1]?.message as { code: string }).code).toBe("actor-mismatch");
    expect(seat0.sent).toHaveLength(2);
  });

  it("catches a throwing module and rejects the action instead of crashing the room", async () => {
    const { room, seat0, seat1 } = await createJoinedRoom();
    room.handleAction(seat0.client, { type: "detonate", playerId: P0 });
    expect(seat0.sent[1]).toMatchObject({ type: "action-rejected", message: { code: "malformed-action" } });
    expect(seat1.sent).toHaveLength(1); // the crash never reached a broadcast
    // the room survives: a legal action still works afterward
    room.handleAction(seat0.client, { type: "advance", playerId: P0 });
    expect(seat0.sent).toHaveLength(3);
  });

  it("sends legalActions alongside the view — the widget has no other honest way to know what's legal (architectural rule: never re-derived client-side)", async () => {
    const { seat0, seat1 } = await createJoinedRoom();
    expect((seat0.sent[0]?.message as { legalActions: unknown }).legalActions).toEqual([{ type: "advance", playerId: P0 }]);
    expect((seat1.sent[0]?.message as { legalActions: unknown }).legalActions).toEqual([]); // not seat1's turn yet
  });
});

describe("MatchRoom — outcome on the wire (spec: 'a real ending' needs the module's own getOutcome, never re-derived client-side)", () => {
  interface TerminalState {
    readonly players: readonly [PlayerId, PlayerId];
    readonly over: boolean;
  }
  type TerminalAction = { readonly type: "finish"; readonly playerId: PlayerId };

  const terminalModule: GameModule<TerminalState, TerminalAction, TerminalState, void> = {
    id: "fixture-terminal",
    metadata: { seatCount: 2, displayNameKey: "fixture.name", assetBase: "/fixture" },
    configOptions: [],
    createMatch: (_config, seats: readonly SeatAssignment[]) => {
      const sorted = [...seats].sort((a, b) => a.seat - b.seat);
      return { players: [sorted[0]!.playerId, sorted[1]!.playerId], over: false };
    },
    applyAction: (state): ApplyResult<TerminalState> => ({ ok: true, state: { ...state, over: true } }),
    getLegalActions: (state, playerId) => (state.over ? [] : [{ type: "finish", playerId }]),
    getViewFor: (state) => state,
    getOutcome: (state) => (state.over ? { winnerIds: [state.players[0]] } : null),
    serialize: (state) => state as never,
    deserialize: (json) => json as unknown as TerminalState,
    createBot: () => ({ chooseAction: async (_view, legal) => legal[0]! }),
  };

  async function createTerminalRoom() {
    const auth = createAuth();
    const registry = createGameModuleRegistry([terminalModule]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-terminal", config: undefined, registry, auth, rng: DEFAULT_RNG });
    const seat0 = fakeClient("s0");
    const seat1 = fakeClient("s1");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));
    return { room, seat0, seat1 };
  }

  it("carries outcome: null while the match is still in progress", async () => {
    const { seat0 } = await createTerminalRoom();

    expect((seat0.sent[0]?.message as { outcome: unknown }).outcome).toBeNull();
  });

  it("carries the module's own outcome once it reports one, straight through — never guessed client-side", async () => {
    const { room, seat0 } = await createTerminalRoom();

    room.handleAction(seat0.client, { type: "finish", playerId: P0 });

    expect(seat0.sent).toHaveLength(2);
    expect((seat0.sent[1]?.message as { outcome: unknown }).outcome).toEqual({ winnerIds: [P0] });
  });
});

describe("MatchRoom.onAuth — join-time authentication (task 4.1/4.2)", () => {
  function freshRoom() {
    const auth = createAuth();
    const registry = createGameModuleRegistry([fixtureModule]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-secret", config: undefined, registry, auth, rng: DEFAULT_RNG });
    return { room, auth };
  }

  it("derives playerId from the verified token, never from client-declared options", async () => {
    const { room, auth } = freshRoom();
    const seat0 = fakeClient("s0");
    // The client attempts the exact PR10a-era attack: claim to be P1 via a
    // field the room no longer reads for identity. `options.token` is the
    // ONLY source of truth now.
    const token = await mintToken(auth.issuer, P0);
    const resolvedAuth = await room.onAuth(seat0.client, { token, playerId: P1 } as never, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "1.1.1.1" });
    expect(resolvedAuth).toEqual({ playerId: P0 });
  });

  it("end-to-end: onJoin seats the token's identity, not a forged options.playerId (the PR10a-era attack, closed)", async () => {
    const { room, auth } = freshRoom();
    const seat0 = fakeClient("s0");
    const seat1 = fakeClient("s1");
    // seat0 holds a token minted for P0 but ALSO claims playerId: P1 in its
    // join options — the exact shape of the old, now-impossible attack.
    const forgedOptions = { token: await mintToken(auth.issuer, P0), playerId: P1 };
    seat0.client.auth = await room.onAuth(seat0.client, forgedOptions as never, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "1.1.1.1" });
    room.onJoin(seat0.client);
    seat1.client.auth = await room.onAuth(seat1.client, { token: await mintToken(auth.issuer, P1) }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "2.2.2.2" });
    room.onJoin(seat1.client);
    // seat0 can only successfully act AS P0 if the room recorded its seat
    // identity as P0 (from the token). If the forged options.playerId (P1)
    // had won instead, this would be rejected as "actor-mismatch".
    room.handleAction(seat0.client, { type: "advance", playerId: P0 });
    expect(seat0.sent[1]).toMatchObject({ type: "view" });
  });

  it("rejects a join with no token presented", async () => {
    const { room } = freshRoom();
    const seat0 = fakeClient("s0");
    await expect(room.onAuth(seat0.client, {}, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "1.1.1.1" })).rejects.toThrow(/no session token/);
  });

  it("rejects a forged token (signature does not verify)", async () => {
    const { room, auth } = freshRoom();
    const seat0 = fakeClient("s0");
    const valid = await mintToken(auth.issuer, P0);
    const forged = corruptSignature(valid);
    await expect(
      room.onAuth(seat0.client, { token: forged }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "1.1.1.1" }),
    ).rejects.toThrow(/invalid or expired/);
  });

  it("rejects a replayed token: a captured, already-consumed token cannot authenticate a second connection", async () => {
    const { room, auth } = freshRoom();
    const token = await mintToken(auth.issuer, P0);
    const first = fakeClient("s0");
    await room.onAuth(first.client, { token }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "1.1.1.1" });
    const second = fakeClient("s0b");
    await expect(
      room.onAuth(second.client, { token }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "2.2.2.2" }),
    ).rejects.toThrow(/already used/);
  });

  it("re-validates origin at join time against the server's OWN known widget origins (spec: NOT redundant with the mint-time tenant-page check — see MatchRoomAuthOptions's own docstring for why this is not per-tenant)", async () => {
    const { room, auth } = freshRoom();
    const seat0 = fakeClient("s0");
    const token = await mintToken(auth.issuer, P0);
    await expect(
      room.onAuth(seat0.client, { token }, { headers: new Headers({ origin: "https://replayed-from-elsewhere.example" }), ip: "9.9.9.9" }),
    ).rejects.toThrow(/origin/);
  });

  it("rejects a join for a non-entitled game, server-side, even with an otherwise-valid token (crafted request)", async () => {
    const { room, auth } = freshRoom();
    const seat0 = fakeClient("s0");
    const token = await mintToken(auth.issuer, P0, { tenantId: OTHER_TENANT_ID }); // OTHER_TENANT_ID is not entitled to "fixture-secret"
    await expect(
      room.onAuth(seat0.client, { token }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "1.1.1.1" }),
    ).rejects.toThrow(/not entitled/);
  });
});

describe("MatchRoom.onAuth — per-IP join rate limiting (hardening: public surface, obs 2945)", () => {
  function freshRoomWithLimiter(joinRateLimiter: RateLimiter) {
    const auth = createAuth({ joinRateLimiter });
    const registry = createGameModuleRegistry([fixtureModule]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-secret", config: undefined, registry, auth, rng: DEFAULT_RNG });
    return { room, auth };
  }

  it("rejects a join attempt once a single IP exceeds its configured limit within the window", async () => {
    const { room, auth } = freshRoomWithLimiter(createRateLimiter({ limit: 1, windowMs: 60_000 }));
    const first = fakeClient("s0");
    await room.onAuth(first.client, { token: await mintToken(auth.issuer, P0) }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "5.5.5.5" });
    const second = fakeClient("s1");
    await expect(
      room.onAuth(second.client, { token: await mintToken(auth.issuer, P1) }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "5.5.5.5" }),
    ).rejects.toThrow(/too many join attempts/);
  });

  it("does not rate-limit a different IP even after the first IP is exhausted", async () => {
    const { room, auth } = freshRoomWithLimiter(createRateLimiter({ limit: 1, windowMs: 60_000 }));
    const first = fakeClient("s0");
    await room.onAuth(first.client, { token: await mintToken(auth.issuer, P0) }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "5.5.5.5" });
    const second = fakeClient("s1");
    const resolved = await room.onAuth(second.client, { token: await mintToken(auth.issuer, P1) }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "6.6.6.6" });
    expect(resolved).toEqual({ playerId: P1 });
  });

  it("rate-limits BEFORE token verification — a flood of no-token attempts from one IP is rejected too", async () => {
    const { room } = freshRoomWithLimiter(createRateLimiter({ limit: 1, windowMs: 60_000 }));
    const first = fakeClient("s0");
    await expect(room.onAuth(first.client, {}, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "7.7.7.7" })).rejects.toThrow(/no session token/);
    const second = fakeClient("s1");
    await expect(room.onAuth(second.client, {}, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "7.7.7.7" })).rejects.toThrow(/too many join attempts/);
  });
});

/**
 * Again deliberately non-truco: a match that has NO client-reachable legal
 * action at all — the ONLY way it can ever advance is a system action. If
 * `MatchRoom` only advanced games shaped like truco's `start-hand`, this
 * would prove nothing about the mechanism being generic (design: paired in
 * the registry per-module, never a `platform-contract` port member).
 */
interface StuckState {
  readonly dealt: boolean;
}
type StuckAction = { readonly type: "deal"; readonly playerId: PlayerId };
const SYSTEM_ACTOR = "system-actor" as PlayerId;

const stuckModule: GameModule<StuckState, StuckAction, StuckState, void> = {
  id: "fixture-stuck",
  metadata: { seatCount: 2, displayNameKey: "fixture.stuck", assetBase: "/fixture" },
  configOptions: [],
  createMatch: () => ({ dealt: false }),
  applyAction: (_state, action) =>
    action.type === "deal" ? { ok: true, state: { dealt: true } } : { ok: false, violation: { code: "not-supported", message: "only the system can deal" } },
  getLegalActions: () => [], // no seated player can EVER act directly here
  getViewFor: (state) => state,
  getOutcome: () => null,
  serialize: (state) => state as never,
  deserialize: (json) => json as unknown as StuckState,
  createBot: () => ({ chooseAction: async () => ({ type: "deal", playerId: SYSTEM_ACTOR }) }),
};

describe("MatchRoom + system actions (design: paired in the registry, never a GameModule port member)", () => {
  it("applies a registered requestSystemAction automatically once no seated player has any legal action", async () => {
    const auth = createAuth();
    const registry = createGameModuleRegistry([
      { module: stuckModule, requestSystemAction: (state) => ((state as StuckState).dealt ? null : { type: "deal", playerId: SYSTEM_ACTOR }) },
    ]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-stuck", config: undefined, registry, auth, rng: DEFAULT_RNG });
    const seat0 = fakeClient("s0");
    const seat1 = fakeClient("s1");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));
    // First broadcast: createMatch's initial (undealt) view. Second: the
    // system action's resulting (dealt) view — applied without any client
    // ever sending an "action" message.
    expect(seat0.sent).toHaveLength(2);
    expect(seat0.sent[1]).toEqual({ type: "view", message: { view: { dealt: true }, legalActions: [], outcome: null } });
    expect(seat1.sent[1]).toEqual({ type: "view", message: { view: { dealt: true }, legalActions: [], outcome: null } });
  });

  it("never advances a module with no requestSystemAction registered, even with zero legal actions", async () => {
    const auth = createAuth();
    const registry = createGameModuleRegistry([stuckModule]); // bare module: no pairing
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-stuck", config: undefined, registry, auth, rng: DEFAULT_RNG });
    const seat0 = fakeClient("s0");
    const seat1 = fakeClient("s1");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));
    expect(seat0.sent).toHaveLength(1); // stuck: no second broadcast ever arrives
    expect(seat0.sent[0]).toEqual({ type: "view", message: { view: { dealt: false }, legalActions: [], outcome: null } });
  });
});

describe("MatchRoom + single-player vs bot (spec: Single-Player vs Bot Mode)", () => {
  async function createSinglePlayerRoom() {
    const auth = createAuth();
    const registry = createGameModuleRegistry([fixtureModule]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-secret", config: undefined, registry, auth, rng: DEFAULT_RNG, botTier: "easy" });
    const seat0 = fakeClient("s0");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    return { room, seat0, auth };
  }

  it("starts the match the moment the single human seat joins — no second client, no lobby wait", async () => {
    const { seat0 } = await createSinglePlayerRoom();
    expect(seat0.sent).toHaveLength(1);
    expect(seat0.sent[0]).toMatchObject({ type: "view", message: { view: { ownSecret: 11 } } });
  });

  it("the bot acts on its own turn with no client ever occupying its seat — createBot's first live caller", async () => {
    const { room, seat0 } = await createSinglePlayerRoom();
    await room.handleAction(seat0.client, { type: "advance", playerId: P0 });
    // [0] initial view, [1] the human's own move, [2] the bot's automatic reply
    expect(seat0.sent).toHaveLength(3);
    expect(seat0.sent[2]).toMatchObject({ type: "view", message: { view: { turnSeat: 0 } } });
  });

  it("rejects a second real client trying to occupy the bot's seat: maxClients already accounts for it", async () => {
    const { room } = await createSinglePlayerRoom();
    expect(room.maxClients).toBe(1);
  });
});

describe("MatchRoom + disconnect takeover tier (spec 6.3/6.4, obs 2919: 'normal' is the decided default)", () => {
  function moduleWithTierSpy() {
    const tiers: BotTier[] = [];
    const module: GameModule<FixtureState, FixtureAction, FixtureView, void> = {
      ...fixtureModule,
      createBot: (tier) => {
        tiers.push(tier);
        return fixtureModule.createBot(tier);
      },
    };
    return { module, tiers };
  }

  async function twoJoinedSeats(module: GameModule<FixtureState, FixtureAction, FixtureView, void>, overrides: { reconnectionWindowSeconds?: number; takeoverTier?: BotTier } = {}) {
    const auth = createAuth();
    const registry = createGameModuleRegistry([module]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-secret", config: undefined, registry, auth, rng: DEFAULT_RNG, reconnectionWindowSeconds: overrides.reconnectionWindowSeconds ?? 0.01, takeoverTier: overrides.takeoverTier });
    const seat0 = fakeClient("s0");
    const seat1 = fakeClient("s1");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));
    return { room, seat0, seat1 };
  }

  it("takes over with the 'normal' tier by default once the window expires", async () => {
    const { module, tiers } = moduleWithTierSpy();
    const { room, seat0 } = await twoJoinedSeats(module);
    await room.onLeave(seat0.client);
    expect(tiers).toEqual(["normal"]);
  });

  it("honors a configured takeoverTier override", async () => {
    const { module, tiers } = moduleWithTierSpy();
    const { room, seat0 } = await twoJoinedSeats(module, { takeoverTier: "hard" });
    await room.onLeave(seat0.client);
    expect(tiers).toEqual(["hard"]);
  });

  it("never takes over a seat that reconnects within the window", async () => {
    const { module, tiers } = moduleWithTierSpy();
    const { room, seat0 } = await twoJoinedSeats(module, { reconnectionWindowSeconds: 30 });
    void room.onLeave(seat0.client); // window left open; not awaited on purpose
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(tiers).toEqual([]); // still human: no takeover fired
  });
});
