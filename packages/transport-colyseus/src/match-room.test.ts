import { describe, expect, it } from "vitest";
import type { Client } from "@colyseus/core";
import type { ApplyResult, BotTier, GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
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

// NOT annotated `: Promise<MatchRoomAuthOptions>` — the extra `issuer` field
// below (a full mint+verify handle, kept ONLY so this file's tests can mint
// fixture tokens) would trip TypeScript's excess-property check against
// that narrower port type. `room.onCreate({ ..., auth })` still typechecks:
// a wider object satisfies `MatchRoomAuthOptions` structurally through a
// variable, never excess-property-checked outside a literal.
async function createAuth(overrides: { joinRateLimiter?: RateLimiter } = {}) {
  const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey(SECRET));
  // The verify-only construction this whole change exists to prove: MINTING
  // in these tests still goes through `auth.issuer` below, but the ROOM
  // ITSELF (`room.onCreate({ auth, ... })`) only ever receives `verifier` —
  // matching exactly what `apps/server/src/index.ts` wires in production.
  const verifier = await createSessionTokenVerifier(issuer.publicKey);
  const repository = createStaticTenantRepository([
    { id: TENANT_ID, embedKey: "pk_fixture", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: ["fixture-secret", "fixture-stuck", "fixture-terminal", "fixture-race", "fixture-signal"] },
    { id: OTHER_TENANT_ID, embedKey: "pk_other", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: ["some-other-game"] },
  ]);
  // Generous default so unrelated tests never accidentally trip the limit —
  // the dedicated rate-limiting describe block overrides this.
  return {
    issuer,
    verifier,
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
  const auth = await createAuth();
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
    // A minimal static double, not `createAuth()` (which is now async: it
    // imports real Ed25519 key material) — this test only asserts `onCreate`
    // throws before ever touching `auth`, so no real crypto is needed here.
    const dummyAuth: MatchRoomAuthOptions = {
      verifier: { verify: () => Promise.resolve(undefined) },
      repository: createStaticTenantRepository([]),
      replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }),
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
      allowedWidgetOrigins: [],
    };
    expect(() => room.onCreate({ gameId: "does-not-exist", config: undefined, registry, auth: dummyAuth, rng: DEFAULT_RNG })).toThrow(/no GameModule registered/);
  });

  it("delegates match creation to the registered module only once every seat has joined", async () => {
    const { seat0, seat1 } = await createJoinedRoom();
    expect(seat0.sent).toHaveLength(1);
    expect(seat1.sent).toHaveLength(1);
  });

  it("sends each client only its own per-seat view — the opponent's secret never appears", async () => {
    const { seat0, seat1 } = await createJoinedRoom();
    expect(seat0.sent[0]).toEqual({ type: "view", message: { view: { ownSecret: 11, turnSeat: 0 }, legalActions: [{ type: "advance", playerId: P0 }], outcome: null, turnDeadline: expect.any(Number) } });
    expect(seat1.sent[0]).toEqual({ type: "view", message: { view: { ownSecret: 22, turnSeat: 0 }, legalActions: [], outcome: null, turnDeadline: expect.any(Number) } });
    // Deliberately NOT the whole message: `turnDeadline` is an epoch
    // millisecond, and a real slice of them contain the digits "11" by pure
    // accident — sweeping the server's clock for a game secret proves nothing
    // about redaction and fails at random (it did, 3 runs in 20, the moment the
    // deadline joined this message; sampling epoch milliseconds directly puts
    // the underlying rate at 7-11% depending on the window). The redacted view
    // and this seat's own legal actions are the entire surface a secret can
    // leak through, and they are exactly what this sweeps now.
    const leakSurface = seat1.sent[0]?.message as { view: unknown; legalActions: unknown };
    expect(JSON.stringify({ view: leakSurface.view, legalActions: leakSurface.legalActions })).not.toContain("11");
  });

  it("applies a legal, in-turn action and broadcasts the resulting view to both seats", async () => {
    const { room, seat0, seat1 } = await createJoinedRoom();
    room.handleAction(seat0.client, { type: "advance", playerId: P0 });
    expect(seat0.sent).toHaveLength(2);
    expect(seat1.sent).toHaveLength(2);
    expect(seat0.sent[1]).toEqual({ type: "view", message: { view: { ownSecret: 11, turnSeat: 1 }, legalActions: [], outcome: null, turnDeadline: expect.any(Number) } });
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
    const auth = await createAuth();
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
  async function freshRoom() {
    const auth = await createAuth();
    const registry = createGameModuleRegistry([fixtureModule]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-secret", config: undefined, registry, auth, rng: DEFAULT_RNG });
    return { room, auth };
  }

  it("derives playerId from the verified token, never from client-declared options", async () => {
    const { room, auth } = await freshRoom();
    const seat0 = fakeClient("s0");
    // The client attempts the exact PR10a-era attack: claim to be P1 via a
    // field the room no longer reads for identity. `options.token` is the
    // ONLY source of truth now.
    const token = await mintToken(auth.issuer, P0);
    const resolvedAuth = await room.onAuth(seat0.client, { token, playerId: P1 } as never, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "1.1.1.1" });
    expect(resolvedAuth).toEqual({ playerId: P0 });
  });

  it("end-to-end: onJoin seats the token's identity, not a forged options.playerId (the PR10a-era attack, closed)", async () => {
    const { room, auth } = await freshRoom();
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
    const { room } = await freshRoom();
    const seat0 = fakeClient("s0");
    await expect(room.onAuth(seat0.client, {}, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "1.1.1.1" })).rejects.toThrow(/no session token/);
  });

  it("rejects a forged token (signature does not verify)", async () => {
    const { room, auth } = await freshRoom();
    const seat0 = fakeClient("s0");
    const valid = await mintToken(auth.issuer, P0);
    const forged = corruptSignature(valid);
    await expect(
      room.onAuth(seat0.client, { token: forged }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "1.1.1.1" }),
    ).rejects.toThrow(/invalid or expired/);
  });

  it("rejects a replayed token: a captured, already-consumed token cannot authenticate a second connection", async () => {
    const { room, auth } = await freshRoom();
    const token = await mintToken(auth.issuer, P0);
    const first = fakeClient("s0");
    await room.onAuth(first.client, { token }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "1.1.1.1" });
    const second = fakeClient("s0b");
    await expect(
      room.onAuth(second.client, { token }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "2.2.2.2" }),
    ).rejects.toThrow(/already used/);
  });

  it("re-validates origin at join time against the server's OWN known widget origins (spec: NOT redundant with the mint-time tenant-page check — see MatchRoomAuthOptions's own docstring for why this is not per-tenant)", async () => {
    const { room, auth } = await freshRoom();
    const seat0 = fakeClient("s0");
    const token = await mintToken(auth.issuer, P0);
    await expect(
      room.onAuth(seat0.client, { token }, { headers: new Headers({ origin: "https://replayed-from-elsewhere.example" }), ip: "9.9.9.9" }),
    ).rejects.toThrow(/origin/);
  });

  it("rejects a join for a non-entitled game, server-side, even with an otherwise-valid token (crafted request)", async () => {
    const { room, auth } = await freshRoom();
    const seat0 = fakeClient("s0");
    const token = await mintToken(auth.issuer, P0, { tenantId: OTHER_TENANT_ID }); // OTHER_TENANT_ID is not entitled to "fixture-secret"
    await expect(
      room.onAuth(seat0.client, { token }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "1.1.1.1" }),
    ).rejects.toThrow(/not entitled/);
  });
});

describe("MatchRoom.onAuth — per-IP join rate limiting (hardening: public surface, obs 2945)", () => {
  async function freshRoomWithLimiter(joinRateLimiter: RateLimiter) {
    const auth = await createAuth({ joinRateLimiter });
    const registry = createGameModuleRegistry([fixtureModule]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-secret", config: undefined, registry, auth, rng: DEFAULT_RNG });
    return { room, auth };
  }

  it("rejects a join attempt once a single IP exceeds its configured limit within the window", async () => {
    const { room, auth } = await freshRoomWithLimiter(createRateLimiter({ limit: 1, windowMs: 60_000 }));
    const first = fakeClient("s0");
    await room.onAuth(first.client, { token: await mintToken(auth.issuer, P0) }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "5.5.5.5" });
    const second = fakeClient("s1");
    await expect(
      room.onAuth(second.client, { token: await mintToken(auth.issuer, P1) }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "5.5.5.5" }),
    ).rejects.toThrow(/too many join attempts/);
  });

  it("does not rate-limit a different IP even after the first IP is exhausted", async () => {
    const { room, auth } = await freshRoomWithLimiter(createRateLimiter({ limit: 1, windowMs: 60_000 }));
    const first = fakeClient("s0");
    await room.onAuth(first.client, { token: await mintToken(auth.issuer, P0) }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "5.5.5.5" });
    const second = fakeClient("s1");
    const resolved = await room.onAuth(second.client, { token: await mintToken(auth.issuer, P1) }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "6.6.6.6" });
    expect(resolved).toEqual({ playerId: P1 });
  });

  it("rate-limits BEFORE token verification — a flood of no-token attempts from one IP is rejected too", async () => {
    const { room } = await freshRoomWithLimiter(createRateLimiter({ limit: 1, windowMs: 60_000 }));
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
    const auth = await createAuth();
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
    expect(seat0.sent[1]).toEqual({ type: "view", message: { view: { dealt: true }, legalActions: [], outcome: null, turnDeadline: null } });
    expect(seat1.sent[1]).toEqual({ type: "view", message: { view: { dealt: true }, legalActions: [], outcome: null, turnDeadline: null } });
  });

  it("waits out handEndPauseMs before dealing again, so the last card can be read", async () => {
    // Reported from real play: "cuando se tira la ultima carta de la ronda no
    // hay tiempo de verla, enseguida desaparece y se vuelve a repartir". The
    // system action fired the instant no seat could act, so the winning card
    // and the hand's own outcome went past in the same broadcast burst that
    // replaced them.
    //
    // A short pause here, not the real 1800ms: what is under test is that the
    // room WAITS, not how long the server chose.
    const auth = await createAuth();
    const registry = createGameModuleRegistry([
      { module: stuckModule, requestSystemAction: (state) => ((state as StuckState).dealt ? null : { type: "deal", playerId: SYSTEM_ACTOR }) },
    ]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-stuck", config: undefined, registry, auth, rng: DEFAULT_RNG, handEndPauseMs: 60 });
    const seat0 = fakeClient("s0");
    const seat1 = fakeClient("s1");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));

    expect(seat0.sent, "the table dealt again in the same breath as the hand ending").toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(seat0.sent, "the next hand never arrived at all").toHaveLength(2);
    expect(seat0.sent[1]).toEqual({ type: "view", message: { view: { dealt: true }, legalActions: [], outcome: null, turnDeadline: null } });
  });

  it("deals immediately when no pause is configured — every test that plays a hand pays nothing", async () => {
    // The control, and the reason the pause is an option rather than a
    // constant: a suite that drives a match to its end would otherwise wait
    // out a real server's beat on every hand.
    const auth = await createAuth();
    const registry = createGameModuleRegistry([
      { module: stuckModule, requestSystemAction: (state) => ((state as StuckState).dealt ? null : { type: "deal", playerId: SYSTEM_ACTOR }) },
    ]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-stuck", config: undefined, registry, auth, rng: DEFAULT_RNG });
    const seat0 = fakeClient("s0");
    const seat1 = fakeClient("s1");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));

    expect(seat0.sent).toHaveLength(2);
  });

  it("never advances a module with no requestSystemAction registered, even with zero legal actions", async () => {
    const auth = await createAuth();
    const registry = createGameModuleRegistry([stuckModule]); // bare module: no pairing
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-stuck", config: undefined, registry, auth, rng: DEFAULT_RNG });
    const seat0 = fakeClient("s0");
    const seat1 = fakeClient("s1");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));
    expect(seat0.sent).toHaveLength(1); // stuck: no second broadcast ever arrives
    expect(seat0.sent[0]).toEqual({ type: "view", message: { view: { dealt: false }, legalActions: [], outcome: null, turnDeadline: null } });
  });
});

describe("MatchRoom + single-player vs bot (spec: Single-Player vs Bot Mode)", () => {
  async function createSinglePlayerRoom() {
    const auth = await createAuth();
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

/**
 * Joining must not wait for the bots' opening.
 *
 * THE BUG THIS CLOSES, reported from real play and then measured: a 2v2 match
 * against bots sat on "Buscando jugadores…" for 12 seconds and then dropped
 * the player into a hand that already had nine calls in its log — envido
 * shown, retruco and vale cuatro accepted, several of them by their own
 * partner. They arrived at a table where the stakes had been raised to four
 * points by decisions they never made.
 *
 * Nothing was slow and nothing was lost. `onJoin` ENDED with
 * `await this.advance()`, and `@colyseus/core@0.17.46`'s own `Room.ts` sends
 * the JOIN_ROOM confirmation — the message that resolves the client's
 * `join()`/`create()` promise — only after `await this.onJoin(...)` returns
 * (src/Room.ts:1251 and :1293). So the join hung for the whole bot opening:
 * three bots at a real ~1s `withThinkingDelay` each, through an entire
 * envido/truco/retruco chain. The views were not lost either — that same
 * file queues messages sent during `onJoin` and flushes them once the client
 * has joined (src/Room.ts:1694), which is exactly why the hand arrived all at
 * once instead of unfolding.
 *
 * The thinking delay exists so a player can WATCH the bots think. Awaiting
 * the chain here turned it into a waiting room.
 *
 * `handleAction` already had this right, and says so in its own comment:
 * Colyseus never awaits a message handler's return value, so that path has
 * always been fire-and-forget. This makes the join path agree with it.
 */
describe("MatchRoom.onJoin — the join completes at once; the bots' opening plays out afterwards, in view", () => {
  /** Long enough that awaiting even ONE of them is unmistakable in the
   * assertion below, short enough that the suite never waits in real time. */
  const BOT_THINKING_MS = 150;

  /** The fixture, with two changes: the FIRST turn belongs to the bot seat
   * (so the room genuinely has bot work to do the moment the human joins),
   * and its bot takes a real, measurable moment to decide. */
  function moduleWithSlowOpeningBot(): GameModule<FixtureState, FixtureAction, FixtureView, void> {
    return {
      ...fixtureModule,
      createMatch: (config, seats) => ({ ...fixtureModule.createMatch(config, seats), turnSeat: 1 }),
      createBot: () => ({
        chooseAction: async (_view, legal) => {
          await new Promise((resolve) => setTimeout(resolve, BOT_THINKING_MS));
          return legal[0]!;
        },
      }),
    };
  }

  async function botMatchRoom() {
    const auth = await createAuth();
    const module = moduleWithSlowOpeningBot();
    const registry = createGameModuleRegistry([module]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-secret", config: undefined, registry, auth, rng: DEFAULT_RNG, botTier: "normal" });
    const seat0 = fakeClient("s0");
    return { room, seat0, auth };
  }

  it("resolves without waiting for the bot to decide", async () => {
    const { room, seat0, auth } = await botMatchRoom();

    const started = Date.now();
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    const elapsed = Date.now() - started;

    // The whole point: the human is IN before the bot has finished thinking.
    expect(elapsed, `joining took ${String(elapsed)}ms; one bot decision alone is ${String(BOT_THINKING_MS)}ms`).toBeLessThan(BOT_THINKING_MS);
  });

  it("sends the opening view immediately, so the player sees the deal rather than a wait", async () => {
    const { room, seat0, auth } = await botMatchRoom();

    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));

    // Queued during onJoin and flushed on join (Room.ts:1694) — either way it
    // is on its way before any bot has moved.
    expect(seat0.sent, "the table is on screen before the bots start playing").toHaveLength(1);
    expect(seat0.sent[0]).toMatchObject({ type: "view", message: { view: { turnSeat: 1 } } });
  });

  it("the bot still plays — not awaiting it must not mean abandoning it", async () => {
    const { room, seat0, auth } = await botMatchRoom();
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));

    await new Promise((resolve) => setTimeout(resolve, BOT_THINKING_MS * 3));

    // A SECOND view, arriving on its own after the join: the bot's move,
    // reaching the player as a move they can watch rather than as history.
    expect(seat0.sent.length, "the bot's opening arrives as its own broadcast").toBeGreaterThan(1);
    expect(seat0.sent.at(-1)).toMatchObject({ type: "view", message: { view: { turnSeat: 0 } } });
  });
});

describe("MatchRoom.advance() — a misbehaving bot strategy must not crash the room (root cause of the disclosed intermittent single-player stall, obs 2973/2925)", () => {
  /**
   * NOT a hypothetical: `truco-bot`'s `easy`/`normal`/`hard` tiers ALL throw
   * `"no legal actions to choose from"` when handed an empty list — a real,
   * currently-shipping code path. This fixture reproduces that exact shape
   * generically (never truco-specific), matching the same anti-truco-shape
   * discipline the rest of this file already applies.
   */
  function moduleWithThrowingBot() {
    const module: GameModule<FixtureState, FixtureAction, FixtureView, void> = {
      ...fixtureModule,
      createBot: () => ({
        chooseAction: async (): Promise<FixtureAction> => {
          throw new Error("boom: a misbehaving bot strategy (e.g. truco-bot's own empty-legal-actions guard)");
        },
      }),
    };
    return module;
  }

  async function createSinglePlayerRoomWithThrowingBot() {
    const auth = await createAuth();
    const registry = createGameModuleRegistry([moduleWithThrowingBot()]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-secret", config: undefined, registry, auth, rng: DEFAULT_RNG, botTier: "easy" });
    const seat0 = fakeClient("s0");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    return { room, seat0, auth };
  }

  it("does not let the bot's thrown exception escape handleAction's returned promise as a rejection", async () => {
    const { room, seat0 } = await createSinglePlayerRoomWithThrowingBot();

    // The human's move hands the turn to the bot, whose own chooseAction
    // throws mid-decision. BEFORE the fix, `advance()`'s promise chain
    // propagated this as a rejection all the way out of `handleAction` —
    // exactly what Colyseus's own `onMessage` dispatch never catches
    // (verified in the installed `@colyseus/core` source: a listener's
    // return value is never awaited unless the room defines its own
    // `onUncaughtException`, which this room deliberately does not), which
    // is a FATAL unhandled rejection under Node's default behavior since
    // v15 — the entire server process, not just this match.
    await expect(room.handleAction(seat0.client, { type: "advance", playerId: P0 })).resolves.toBeUndefined();
  });

  it("survives the bot's exception: the room keeps accepting legal actions afterward instead of being permanently abandoned", async () => {
    const { room, seat0 } = await createSinglePlayerRoomWithThrowingBot();

    await room.handleAction(seat0.client, { type: "advance", playerId: P0 });
    // The room is still alive and its state is exactly what the human's own
    // legal move produced — the bot's own aborted turn is the ONLY thing
    // abandoned, not the whole room. [0] initial view, [1] the human's move.
    expect(seat0.sent).toHaveLength(2);
    expect(seat0.sent[1]).toMatchObject({ type: "view", message: { view: { turnSeat: 1 } } });
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
    const auth = await createAuth();
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

  /**
   * The OTHER shutdown shape — the one `onLeave`'s `Error("disposing")` check
   * cannot see. `Error("disposing")` is only produced when `allowReconnection`
   * is CALLED on an already-DISPOSING room; a window that was ALREADY OPEN when
   * the room started going away is rejected down a different path entirely
   * (`Room#_rejectPendingReconnections`), with a `ServerError` carrying
   * `CloseCode.NORMAL_CLOSURE`.
   *
   * The rejection here is produced by Colyseus's OWN private method, reached
   * exactly the way Colyseus's own `MatchMaker` reaches it
   * (`rooms[roomId]['_rejectPendingReconnections']?.("devmode_restart")`) — not
   * by hand-building an error object, which would only prove that the guard
   * matches whatever this test decided to throw. `Room#disconnect()` calls the
   * same method with `"disconnecting"`; it is not used directly because it also
   * goes through the matchmaker driver, which no unit-test room has.
   */
  it("does not take over or drive the room when an already-open reconnection window is rejected by room shutdown", async () => {
    const { module, tiers } = moduleWithTierSpy();
    const { room, seat0, seat1 } = await twoJoinedSeats(module, { reconnectionWindowSeconds: 30 });
    // `onLeave` runs synchronously up to its `await allowReconnection(...)`, so
    // by the time this returns a promise the window is already registered.
    const leaving = room.onLeave(seat0.client);
    (room as unknown as { _rejectPendingReconnections(message: string): void })._rejectPendingReconnections("disconnecting");
    await leaving;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(tiers).toEqual([]); // no bot was ever built for a room that is going away
    expect(seat1.sent).toHaveLength(1); // and nothing was driven: still just the initial view
  });
});

/**
 * The "quit affordance" `onLeave`'s own docstring said did not exist yet.
 *
 * Until this, a player who deliberately walked away and a player whose wifi
 * dropped were the SAME event to this room: both got the full reconnection
 * window, so the table sat waiting ~30 seconds for someone who was never
 * coming back. That is the right default for a drop and the wrong one for a
 * decision, and the room had no way to tell them apart because the client
 * had no way to say which one it was.
 *
 * The mechanism deliberately adds no state. A quit takes the seat over
 * FIRST; `seatOfClient` only ever matches a controller that is still
 * `kind: "human"`, so by the time the socket closes and `onLeave` runs,
 * there is no seat to find and it returns before reaching
 * `allowReconnection` at all. No "already quit" set to keep in step with
 * anything, and no second code path through the window.
 */
describe("MatchRoom — a deliberate quit is not a disconnect (skips the reconnection window)", () => {
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

  async function twoJoinedSeats(module: GameModule<FixtureState, FixtureAction, FixtureView, void>, reconnectionWindowSeconds: number) {
    const auth = await createAuth();
    const registry = createGameModuleRegistry([module]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-secret", config: undefined, registry, auth, rng: DEFAULT_RNG, reconnectionWindowSeconds });
    const seat0 = fakeClient("s0");
    const seat1 = fakeClient("s1");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));
    return { room, seat0, seat1 };
  }

  /** Fails loudly instead of letting a re-opened window quietly stall the
   * suite for the full 30 seconds and read as an unrelated timeout. */
  async function withinMs<T>(work: Promise<T>, ms: number, description: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${description} did not settle within ${String(ms)}ms`)), ms);
    });
    try {
      return await Promise.race([work, deadline]);
    } finally {
      clearTimeout(timer!);
    }
  }

  it("hands the seat to a bot at once, without waiting out the window", async () => {
    const { module, tiers } = moduleWithTierSpy();
    // A window long enough that waiting it out is unmistakable: if the quit
    // went through the ordinary disconnect path, no bot would exist yet.
    const { room, seat0 } = await twoJoinedSeats(module, 30);

    room.handleQuit(seat0.client);

    expect(tiers, "the bot is built on the quit itself, not 30 seconds later").toEqual(["normal"]);
  });

  it("the socket closing right after a quit opens no window and takes no second seat", async () => {
    const { module, tiers } = moduleWithTierSpy();
    const { room, seat0 } = await twoJoinedSeats(module, 30);

    room.handleQuit(seat0.client);
    // What really happens next: the client closes its connection, so
    // Colyseus calls onLeave. If that still opened a window it would hang
    // here for thirty seconds.
    await withinMs(Promise.resolve(room.onLeave(seat0.client)), 1000, "onLeave after a quit");

    expect(tiers, "no second takeover for a seat that is already a bot").toEqual(["normal"]);
  });

  it("the other seats keep playing — a quit ends one player's match, not the table's", async () => {
    const { module } = moduleWithTierSpy();
    const { room, seat0, seat1 } = await twoJoinedSeats(module, 30);
    const seatOneViewsBefore = seat1.sent.length;

    room.handleQuit(seat0.client);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(seat1.sent.length, "the bot took the vacated seat and the room advanced").toBeGreaterThan(seatOneViewsBefore);
  });

  it("ignores a quit from a connection that holds no seat — never a crash, never someone else's seat", async () => {
    const { module, tiers } = moduleWithTierSpy();
    const { room } = await twoJoinedSeats(module, 30);
    const stranger = fakeClient("not-seated");

    expect(() => {
      room.handleQuit(stranger.client);
    }).not.toThrow();
    expect(tiers, "no seat was taken over on behalf of a client that never had one").toEqual([]);
  });
});

describe("MatchRoom.advance() — structural serialization against overlap (closes the disclosed debt, apply-progress obs 2927/2925)", () => {
  /**
   * A "race" fixture, deliberately non-truco (same anti-truco-shape
   * discipline as every other fixture in this file): two actions per seat,
   * one turn-gated (`move`), one NOT turn-gated (`call`, legal exactly
   * once per seat regardless of whose turn it is) — mirroring truco's own
   * proactive calls, which the PR19 investigation (apply-progress obs
   * 2927) confirmed do not depend on turn order. This turn-independence is
   * exactly what lets a human's own legal action arrive while the bot's
   * decision on ITS turn-independent `call` is still in flight — the real
   * shape of the disclosed debt, not a contrived one.
   */
  interface RaceState {
    readonly players: readonly [PlayerId, PlayerId];
    readonly turnSeat: 0 | 1;
    readonly called: readonly [boolean, boolean];
  }
  type RaceAction = { readonly type: "move"; readonly playerId: PlayerId } | { readonly type: "call"; readonly playerId: PlayerId };
  interface RaceView {
    readonly turnSeat: 0 | 1;
    readonly called: readonly [boolean, boolean];
  }

  function raceSeatOf(state: RaceState, playerId: PlayerId): 0 | 1 | -1 {
    const index = state.players.indexOf(playerId);
    return index === 0 || index === 1 ? index : -1;
  }

  const raceModule: GameModule<RaceState, RaceAction, RaceView, void> = {
    id: "fixture-race",
    metadata: { seatCount: 2, displayNameKey: "fixture.race", assetBase: "/fixture" },
    configOptions: [],
    createMatch: (_config, seats: readonly SeatAssignment[]) => {
      const sorted = [...seats].sort((a, b) => a.seat - b.seat);
      return { players: [sorted[0]!.playerId, sorted[1]!.playerId], turnSeat: 0, called: [false, false] };
    },
    applyAction: (state, action): ApplyResult<RaceState> => {
      const seat = raceSeatOf(state, action.playerId);
      if (seat === -1) return { ok: false, violation: { code: "unknown-player", message: "no such seat" } };
      if (action.type === "call") {
        if (state.called[seat]) return { ok: false, violation: { code: "already-called", message: "this seat already called" } };
        const called = [...state.called] as [boolean, boolean];
        called[seat] = true;
        return { ok: true, state: { ...state, called } };
      }
      if (seat !== state.turnSeat) return { ok: false, violation: { code: "not-your-turn", message: `seat ${seat} acted out of turn` } };
      return { ok: true, state: { ...state, turnSeat: state.turnSeat === 0 ? 1 : 0 } };
    },
    // `call` listed first on purpose: the controllable bot below always
    // picks `legal[0]`, and this ordering is what makes the bot pick its
    // turn-independent `call` FIRST (reproducing the real race), then its
    // turn-gated `move` once `call` is spent and it is genuinely its turn.
    getLegalActions: (state, playerId) => {
      const seat = raceSeatOf(state, playerId);
      if (seat === -1) return [];
      const actions: RaceAction[] = [];
      if (!state.called[seat]) actions.push({ type: "call", playerId });
      if (seat === state.turnSeat) actions.push({ type: "move", playerId });
      return actions;
    },
    getViewFor: (state) => ({ turnSeat: state.turnSeat, called: state.called }),
    getOutcome: () => null,
    serialize: (state) => state as never,
    deserialize: (json) => json as unknown as RaceState,
    createBot: () => ({ chooseAction: async (_view, legal) => legal[0]! }),
  };

  /**
   * Give the chain a fair chance to progress, then assert something did NOT
   * happen. That is the ONLY thing a fixed number of drained turns can honestly
   * do, and — since this file's flake — the only thing it is used for.
   *
   * A couple of macrotask boundaries rather than a `Promise.resolve()` loop,
   * because token verification (`SessionTokenIssuer.verify`) does real
   * signature-checking crypto, which Node schedules on the libuv threadpool
   * and a microtask loop never observes complete. The surrounding microtask
   * flushes drain what chains off it (`advance()`'s own `.then()` link, an
   * async fixture body).
   *
   * NEVER use it to wait for something TO happen — see `waitUntil`. Counting
   * turns to reach a state is a guess about scheduling, and this file's own
   * description called itself "deterministic, no timers" while this was built
   * on `setTimeout`. What that guess actually cost was NOT a slow release:
   * `handleAction` returns EARLY and SILENTLY while `matchState` is unset or
   * the seat is not yet a known controller, so dispatching a human action
   * after a mere `flush()` could drop it without a trace, leaving the bot
   * never asked again and a later release waiting on something that could no
   * longer happen. It failed about once in twenty-three full-suite runs, only
   * under load, never in isolation. Starving this loop to one turn reproduced
   * it on every run.
   */
  async function flush(): Promise<void> {
    for (let i = 0; i < 3; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      for (let j = 0; j < 5; j += 1) await Promise.resolve();
    }
  }

  /** How long ONE condition gets before we call it a genuine hang. */
  const CONDITION_TIMEOUT_MS = 2_000;

  /**
   * Every test below declares this explicitly, and the reason is the whole
   * point of `waitUntil`: its failure must be the one a reader sees.
   *
   * These tests chain several waits — the busiest has two explicit ones plus
   * the two inside `releaseNextBotDecision` — so a worst case of 4 x 2s
   * overshoots vitest's 5s default. Leave the default in place and a slow
   * run under load dies of an opaque "test timed out" BEFORE any `waitUntil`
   * can say which condition never arrived, which is exactly the diagnostic
   * this change exists to provide. The ceiling is generous on purpose: it is
   * not what bounds a hang — each `waitUntil` already does that — it only
   * guarantees the named error always wins the race to report.
   */
  const OVERLAP_TEST_TIMEOUT_MS = 30_000;

  /**
   * Wait for a condition to actually hold, instead of assuming some number of
   * drained turns got us there. A real hang still fails — bounded, and naming
   * what never happened.
   */
  async function waitUntil(condition: () => boolean, description: string): Promise<void> {
    const deadline = Date.now() + CONDITION_TIMEOUT_MS;
    while (!condition()) {
      if (Date.now() > deadline) {
        throw new Error(`waited ${String(CONDITION_TIMEOUT_MS)}ms for ${description} and it never happened`);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  /** A bot whose `chooseAction` is held open until the test explicitly
   * releases it — this is what makes the overlap deterministic instead of
   * probabilistic: the real `withThinkingDelay` ~1s pause is replaced with
   * a promise this test fully controls. */
  function controllableRaceModule() {
    const pendingReleases: Array<() => void> = [];
    let concurrentCalls = 0;
    let maxConcurrentCalls = 0;
    let totalCalls = 0;
    let legalActionQueries = 0;
    const module: GameModule<RaceState, RaceAction, RaceView, void> = {
      ...raceModule,
      // Counted because every step the drive loop takes asks this first
      // (`findActingBot`, then `anySeatCanAct`). A disposal test watching only
      // sends and timers cannot tell "the room stopped working" apart from "the
      // room worked and `broadcastViews` threw the result away" — this can.
      getLegalActions: (state, playerId) => {
        legalActionQueries += 1;
        return raceModule.getLegalActions(state, playerId);
      },
      createBot: () => ({
        chooseAction: async (_view, legal): Promise<RaceAction> => {
          totalCalls += 1;
          concurrentCalls += 1;
          maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
          await new Promise<void>((resolve) => {
            pendingReleases.push(resolve);
          });
          concurrentCalls -= 1;
          return legal[0]!;
        },
      }),
    };
    return {
      module,
      /** Awaits the decision's ARRIVAL before releasing it. The caller no
       * longer has to guess how many turns the chain needs to reach
       * `chooseAction`. The guess this replaces was never the whole flake —
       * see `flush` — but it is what turned the real cause into an opaque
       * "test setup error" instead of a message naming what never arrived. */
      releaseNextBotDecision: async (): Promise<void> => {
        await waitUntil(() => pendingReleases.length > 0, "a bot decision to become pending");
        const resolve = pendingReleases.shift();
        if (resolve === undefined) throw new Error("test setup error: no pending bot decision to release");
        resolve();
      },
      pendingCount: () => pendingReleases.length,
      totalCalls: () => totalCalls,
      maxConcurrentCalls: () => maxConcurrentCalls,
      legalActionQueries: () => legalActionQueries,
    };
  }

  async function createRaceRoom(module: GameModule<RaceState, RaceAction, RaceView, void>, overrides: { turnTimeoutSeconds?: number } = {}) {
    const auth = await createAuth();
    const registry = createGameModuleRegistry([module]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-race", config: undefined, registry, auth, rng: DEFAULT_RNG, botTier: "easy", turnTimeoutSeconds: overrides.turnTimeoutSeconds });
    const seat0 = fakeClient("s0");
    return { room, seat0, auth };
  }

  it("never lets a second advance() chain start while the first is still awaiting a bot decision — RED before the fix, GREEN after (deterministic, no timers)", async () => {
    const { module, releaseNextBotDecision, pendingCount, totalCalls, maxConcurrentCalls } = controllableRaceModule();
    const { room, seat0, auth } = await createRaceRoom(module);

    // The single human seat joining fills the match (seat1 is the bot).
    // `onJoin`'s own `await this.advance()` immediately finds the bot has
    // a legal `call` action — turn-independent, legal from turn zero — and
    // parks on the held-open `chooseAction`. Deliberately NOT awaited: the
    // whole point is to act again while this is still in flight.
    const joinPromise = joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    await waitUntil(() => pendingCount() === 1, "the bot's first decision to be pending");
    // `pendingCount()` is NOT re-asserted here: the wait above already
    // established it, and nothing can run between the two lines. `totalCalls`
    // is a different observable and still fences something real — that the
    // room asked for exactly ONE decision, not that one is outstanding.
    expect(totalCalls()).toBe(1);

    // The human's OWN move is legal right now (turnSeat is still seat0's) —
    // this is the exact trigger the debt describes: a real, legal human
    // action arriving while the bot's decision is mid-flight.
    const handlePromise = room.handleAction(seat0.client, { type: "move", playerId: P0 });
    await flush();

    // THE assertion: no second `chooseAction` was invoked while the first
    // is still unresolved. Before the fix, `handleAction`'s own
    // fire-and-forget `return this.advance()` started a fully independent
    // second chain, which called `findActingBot()` again and invoked
    // `chooseAction` a SECOND time on the very same still-pending
    // decision — `totalCalls()` would already be 2 here.
    expect(totalCalls()).toBe(1);
    expect(maxConcurrentCalls()).toBe(1);

    // Release the bot's `call` decision: the FIRST chain's own loop
    // continues (turnSeat already flipped by the human's move above) and
    // discovers the bot's `move` is now legal too — a second, SEQUENTIAL
    // (not concurrent) decision, still within the same serialized chain.
    await releaseNextBotDecision();
    await waitUntil(() => pendingCount() === 1, "the bot's second decision to be pending");
    expect(totalCalls()).toBe(2);
    expect(maxConcurrentCalls()).toBe(1); // still never overlapped

    await releaseNextBotDecision();
    await joinPromise;
    await handlePromise;

    // Settled: no third bot decision ever happened — the queued second
    // chain (from `handleAction`) ran to completion and correctly found
    // nothing left to do, instead of erroneously re-triggering the bot.
    expect(totalCalls()).toBe(2);
    expect(maxConcurrentCalls()).toBe(1);
  }, OVERLAP_TEST_TIMEOUT_MS);

  it("still drives the advance() that arrived mid-flight to completion — nothing is silently dropped (liveness)", async () => {
    const { module, releaseNextBotDecision, totalCalls } = controllableRaceModule();
    const { room, seat0, auth } = await createRaceRoom(module);

    const joinPromise = joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    // THE precondition, and the one this test used to only assume.
    // `handleAction` returns EARLY — untouched state, nothing queued — while
    // `matchState` is unset or the seat is not yet a known controller. Send it
    // a turn too early and the human's move never lands, so the bot is never
    // asked a second time and the release below waits for something that can
    // no longer happen. That is the whole flake: not a slow release, a move
    // that was silently dropped before it.
    await waitUntil(() => totalCalls() === 1, "the join to start the match and park the bot's first decision");
    // Synchronous all the way to `this.matchState = result.state` once the
    // precondition above holds, so there is nothing here to wait for.
    const handlePromise = room.handleAction(seat0.client, { type: "move", playerId: P0 });

    // No `flush()` between these two either: each release waits for its own
    // decision to arrive. That is what keeps `flush`'s doc comment true —
    // it is used ONLY before asserting something did not happen.
    await releaseNextBotDecision(); // bot's `call`
    await releaseNextBotDecision(); // bot's `move`

    // Both the request that was already in flight AND the one that
    // arrived mid-flight resolve — neither promise hangs forever, which is
    // what a naive "if busy, return" guard risks (the busy caller's own
    // needed work simply never happens).
    await joinPromise;
    await handlePromise;

    expect(totalCalls()).toBe(2);
    // Final broadcast reflects a FULLY settled state: the bot's `call`
    // happened, the bot's `move` happened, and the human's own `move`
    // (dispatched mid-flight) was applied too — turn is back on the human
    // (0 -> 1 -> 0), who still has both a fresh `move` and their own
    // never-used `call` available. Nothing is stuck half-driven: if the
    // mid-flight request had been silently dropped, the bot's own `move`
    // (which depends on the human's move having flipped the turn) would
    // never have happened, and this would still show only `call`.
    const lastMessage = seat0.sent.at(-1)?.message as { legalActions: readonly RaceAction[] };
    expect(lastMessage.legalActions).toEqual([
      { type: "call", playerId: P0 },
      { type: "move", playerId: P0 },
    ]);
  }, OVERLAP_TEST_TIMEOUT_MS);

  it("onDispose() waits for any in-flight or queued advance() work to settle before the room finishes disposing", async () => {
    const { module, releaseNextBotDecision, legalActionQueries, pendingCount } = controllableRaceModule();
    const { room, seat0, auth } = await createRaceRoom(module);

    const joinPromise = joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    // Same precondition as the liveness test above: disposal can only be
    // observed WAITING if there is something in flight to wait for. Reaching
    // `onDispose` before the bot's decision is parked would settle it at once
    // and turn the assertion below green for the wrong reason.
    await waitUntil(() => pendingCount() === 1, "the bot's decision to be parked and in flight");

    let disposeSettled = false;
    const disposePromise = Promise.resolve(room.onDispose()).then(() => {
      disposeSettled = true;
    });
    await flush();
    // The bot's decision is still held open — disposal must not have
    // resolved yet, or a chain would be left running past teardown.
    expect(disposeSettled).toBe(false);

    const queriesAtDisposal = legalActionQueries();
    await releaseNextBotDecision();
    await joinPromise;
    await disposePromise;
    expect(disposeSettled).toBe(true);
    // Settling that work broadcast one more view on its way out, and a
    // broadcast is what arms a clock. A disposed room must not come away from
    // it holding a timer — same fence the turn-clock suite's own dispose race
    // proves, reached here through `advance()` instead of an expired turn.
    expect(room.hasPendingTurnTimer()).toBe(false);
    // And the work is not merely suppressed, it stops: the released decision
    // was the LAST step this room took. Without the disposal exit at the top of
    // `runAdvanceOnce`'s loop, the `continue` after it would go right back to
    // asking the module what to drive next, on a room the framework has already
    // released — with `onDispose` still waiting on every bit of it.
    expect(legalActionQueries()).toBe(queriesAtDisposal);
  }, OVERLAP_TEST_TIMEOUT_MS);

  it("never asks a bot to resolve a timed-out turn that was still queued when the room was disposed", async () => {
    const { module, releaseNextBotDecision, totalCalls } = controllableRaceModule();
    // Short enough that seat 0's clock expires while the bot's own decision is
    // still held open. That is the one state in which disposal can land BEFORE
    // the timed-out turn has started any work of its own: `onTurnExpired`
    // chains onto `advanceChain`, so its turn sits queued behind that decision.
    // Neither older dispose test reaches this: both release into a method that
    // had already begun, where the ~1s decision is by then already spent.
    const { room, seat0, auth } = await createRaceRoom(module, { turnTimeoutSeconds: 0.03 });

    const joinPromise = joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    // Not re-asserted, for the same reason as the test above: the wait already
    // established it and nothing runs between the two lines. The bot's `call`
    // is now parked, which is the state the rest of this test needs.
    await waitUntil(() => totalCalls() === 1, "the bot's `call` decision to be requested and parked");

    // Polled, not slept: `onTurnExpired` clears the timer as its first act, so
    // this returns within a couple of ms of the real expiry.
    const deadline = Date.now() + 2000;
    while (room.hasPendingTurnTimer()) {
      if (Date.now() > deadline) throw new Error("seat 0's turn clock never expired");
      await new Promise<void>((resolve) => setTimeout(resolve, 2));
    }

    const disposePromise = room.onDispose();
    await releaseNextBotDecision(); // the bot's `call` returns; the queued turn is next
    await flush();

    // THE assertion: the queued turn took its disposal exit instead of building
    // a strategy and awaiting one — in production a full `withThinkingDelay`
    // second that `onDispose` sits and waits through, only for `broadcastViews`
    // to discard the result. This fixture never releases that decision at all,
    // so without the exit `onDispose` would also never settle.
    expect(totalCalls()).toBe(1);

    await joinPromise;
    await disposePromise;
    expect(room.hasPendingTurnTimer()).toBe(false);
  }, OVERLAP_TEST_TIMEOUT_MS);
});

describe("MatchRoom turn clock — a seat cannot sit on its turn forever (per-turn time limit, bot plays the expired turn)", () => {
  /** Same duration-injection discipline `reconnectionWindowSeconds` already
   * established in this file: the production default is a whole minute, and
   * every test here passes a tiny value instead of waiting for one. */
  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Returns the instant `predicate` first holds, rather than sleeping a
   * fixed multiple of the timeout. BOTH seats here are human, so each one
   * gets its own clock and a fixed sleep long enough to be safe would span
   * SEVERAL expiries — which would make "exactly one action per expiry"
   * untestable by construction. Polling returns within a few ms of the first
   * expiry, well inside the next seat's own window. */
  async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error("waitFor: condition never became true");
      await sleep(2);
    }
  }

  async function twoHumanSeats(overrides: { turnTimeoutSeconds?: number } = {}) {
    const auth = await createAuth();
    const registry = createGameModuleRegistry([fixtureModule]);
    const room = new MatchRoom();
    room.onCreate({
      gameId: "fixture-secret",
      config: undefined,
      registry,
      auth,
      rng: DEFAULT_RNG,
      turnTimeoutSeconds: overrides.turnTimeoutSeconds ?? 0.03,
    });
    const seat0 = fakeClient("s0");
    const seat1 = fakeClient("s1");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));
    return { room, seat0, seat1 };
  }

  const deadlineOf = (entry: { message: unknown } | undefined): number | null =>
    (entry?.message as { turnDeadline: number | null } | undefined)?.turnDeadline ?? null;

  it("carries an absolute turn deadline on the view message — the SAME instant for every client, not a per-client countdown", async () => {
    const { seat0, seat1 } = await twoHumanSeats({ turnTimeoutSeconds: 30 });

    const seat0Deadline = deadlineOf(seat0.sent[0]);
    const seat1Deadline = deadlineOf(seat1.sent[0]);
    expect(typeof seat0Deadline).toBe("number");
    // The seat NOT on the clock still sees the same clock: "visible to
    // everyone" is one deadline, the active seat's, never a private per-seat
    // number each client would have to reconcile.
    expect(seat1Deadline).toBe(seat0Deadline);
    expect(seat0Deadline!).toBeGreaterThan(Date.now());
  });

  it("moves the deadline when the turn moves — the seat that just began owes the new clock, not the seat that just acted", async () => {
    const { room, seat0 } = await twoHumanSeats({ turnTimeoutSeconds: 30 });
    const first = deadlineOf(seat0.sent[0]);

    await sleep(5);
    await room.handleAction(seat0.client, { type: "advance", playerId: P0 });

    // Seat 1 is now the seat that owes a blocking action, so the clock is
    // theirs and it started when seat 0's action resolved.
    expect(deadlineOf(seat0.sent[1])!).toBeGreaterThan(first!);
  });

  it("plays exactly ONE action for the expired seat and leaves that seat human — the player keeps their seat", async () => {
    const { room, seat0, seat1 } = await twoHumanSeats({ turnTimeoutSeconds: 0.05 });
    const before = seat0.sent.length;

    await waitFor(() => seat0.sent.length > before);

    // Exactly one further broadcast: the bot resolved seat 0's own obligation
    // and stopped. Seat 1 (a human) owes the next action, so nothing else is
    // auto-driven.
    expect(seat0.sent.length - before).toBe(1);
    expect(seat0.sent.at(-1)).toMatchObject({ type: "view", message: { view: { turnSeat: 1 } } });

    // THE seat-ownership proof: `seatOfClient` only ever matches a HUMAN
    // controller, so if the timeout had swapped seat 0 to a bot the way a
    // disconnect takeover does, this action would come back "actor-mismatch"
    // instead of being applied.
    await room.handleAction(seat1.client, { type: "advance", playerId: P1 });
    await room.handleAction(seat0.client, { type: "advance", playerId: P0 });
    expect(seat0.sent.filter((entry) => entry.type === "action-rejected")).toEqual([]);
    expect(seat0.sent.at(-1)).toMatchObject({ type: "view", message: { view: { turnSeat: 1 } } });
  });

  it("gives the returning seat a fresh deadline — one timeout costs one turn, never the seat", async () => {
    const { room, seat0, seat1 } = await twoHumanSeats({ turnTimeoutSeconds: 0.05 });
    const original = deadlineOf(seat0.sent[0]);
    const before = seat0.sent.length;

    await waitFor(() => seat0.sent.length > before);
    const afterTimeout = deadlineOf(seat0.sent.at(-1));
    expect(afterTimeout!).toBeGreaterThan(original!);

    // The same deliberate pause the "moves the deadline when the turn moves"
    // test above already takes, and for the same reason: `waitFor` returns
    // within ~2ms of the expiry, so acting immediately can arm the next clock
    // inside the SAME millisecond and leave two equal deadlines. One tick of
    // real separation is what makes "started now" observable at all.
    await sleep(2);
    await room.handleAction(seat1.client, { type: "advance", playerId: P1 });
    // Seat 0 is on the clock again, with a clock that started now — not a
    // leftover deadline from the turn it missed.
    expect(deadlineOf(seat0.sent.at(-1))!).toBeGreaterThan(afterTimeout!);
  });

  it("never restarts a live clock for a non-blocking action — a seña from another seat cannot buy the thinking seat more time", async () => {
    interface SignalState {
      readonly players: readonly [PlayerId, PlayerId];
      readonly turnSeat: 0 | 1;
      readonly signals: number;
    }
    type SignalAction = { readonly type: "advance"; readonly playerId: PlayerId } | { readonly type: "signal"; readonly playerId: PlayerId };
    const signalModule: GameModule<SignalState, SignalAction, { readonly turnSeat: 0 | 1 }, void> = {
      ...(fixtureModule as unknown as GameModule<SignalState, SignalAction, { readonly turnSeat: 0 | 1 }, void>),
      id: "fixture-signal",
      createMatch: (_config, seats: readonly SeatAssignment[]) => {
        const sorted = [...seats].sort((a, b) => a.seat - b.seat);
        return { players: [sorted[0]!.playerId, sorted[1]!.playerId], turnSeat: 0, signals: 0 };
      },
      applyAction: (state, action): ApplyResult<SignalState> => {
        if (action.type === "signal") return { ok: true, state: { ...state, signals: state.signals + 1 } };
        const seat = state.players.indexOf(action.playerId);
        if (seat !== state.turnSeat) return { ok: false, violation: { code: "not-your-turn", message: "out of turn" } };
        return { ok: true, state: { ...state, turnSeat: state.turnSeat === 0 ? 1 : 0 } };
      },
      // `signal` is legal for EVERY seat at all times — truco's own `send-sena`
      // shape, the exact reason `isNonBlockingAction` exists.
      getLegalActions: (state, playerId) => {
        const seat = state.players.indexOf(playerId);
        const actions: SignalAction[] = [{ type: "signal", playerId }];
        if (seat === state.turnSeat) actions.unshift({ type: "advance", playerId });
        return actions;
      },
      getViewFor: (state) => ({ turnSeat: state.turnSeat }),
      getOutcome: () => null,
    };

    const auth = await createAuth();
    const registry = createGameModuleRegistry([
      { module: signalModule as unknown as GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown>, isNonBlockingAction: (action) => (action as { type?: string }).type === "signal" },
    ]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-signal", config: undefined, registry, auth, rng: DEFAULT_RNG, turnTimeoutSeconds: 30 });
    const seat0 = fakeClient("s0");
    const seat1 = fakeClient("s1");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));

    const armed = deadlineOf(seat0.sent[0]);
    expect(typeof armed).toBe("number"); // guards this assertion against passing on two nulls
    const beforeSignal = seat0.sent.length;
    await sleep(20);
    await room.handleAction(seat1.client, { type: "signal", playerId: P1 });

    // The signal really did reach seat 0. Without this, the deadline check
    // below could pass VACUOUSLY: `at(-1)` would still be seat 0's own join
    // message, whose deadline trivially equals the one armed with it.
    expect(seat0.sent.length).toBeGreaterThan(beforeSignal);
    // Seat 0 still owes the only BLOCKING action, so it is still seat 0's
    // turn and seat 0's clock — untouched to the millisecond.
    expect(deadlineOf(seat0.sent.at(-1))).toBe(armed);
  });

  it("has no deadline once the match is over — a finished match never keeps a clock running", async () => {
    const auth = await createAuth();
    const terminalModule: GameModule<{ readonly done: boolean }, { readonly playerId: PlayerId }, { readonly done: boolean }, void> = {
      ...(fixtureModule as unknown as GameModule<{ readonly done: boolean }, { readonly playerId: PlayerId }, { readonly done: boolean }, void>),
      id: "fixture-terminal",
      createMatch: () => ({ done: true }),
      getLegalActions: () => [],
      getViewFor: (state) => state,
      getOutcome: () => ({ winnerIds: [P0] }),
    };
    const registry = createGameModuleRegistry([terminalModule as unknown as GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown>]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-terminal", config: undefined, registry, auth, rng: DEFAULT_RNG, turnTimeoutSeconds: 0.03 });
    const seat0 = fakeClient("s0");
    const seat1 = fakeClient("s1");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));

    // Explicitly the FIELD, not `deadlineOf`'s own `?? null` fallback: a
    // finished match must send a present, null deadline (the client's cue to
    // clear its countdown), never an absent one it would have to guess about.
    expect((seat0.sent[0]!.message as Record<string, unknown>).turnDeadline).toBeNull();
    const settled = seat0.sent.length;
    await sleep(120);
    expect(seat0.sent).toHaveLength(settled);
  });

  it("clears a STILL-ARMED turn timer on disposal — the deadline passing afterwards drives nothing", async () => {
    const { room, seat0 } = await twoHumanSeats({ turnTimeoutSeconds: 0.05 });
    const before = seat0.sent.length;

    // Named for the narrow case it actually covers: disposal lands while the
    // timer is still armed, where one synchronous clear genuinely is enough.
    // It does NOT earn the broader "no timer outlives the room" claim — the
    // case that does is the test below, where the timer has already fired and
    // its bot is mid-decision, so there is nothing here left to clear and the
    // re-arm happens after this method has already returned.
    await room.onDispose();
    expect(room.hasPendingTurnTimer()).toBe(false);

    await sleep(160);
    // The deadline has now passed by a wide margin. Nothing fired: no bot
    // played, no view was broadcast against a room the framework already
    // considers torn down.
    expect(seat0.sent).toHaveLength(before);
  });

  it("never re-arms a turn timer on a room disposed while the expired turn's bot is still thinking", async () => {
    // The gap this reproduces is real, not synthetic: production wraps every
    // truco strategy in `withThinkingDelay`'s ~1s pause, so a room disposed
    // mid-decision spends a full second in a state where the timer has
    // ALREADY fired (so disposal's own clear finds nothing) and the bot has
    // not yet come back to re-arm. The held-open promise below IS that second.
    const releases: Array<() => void> = [];
    let legalActionQueries = 0;
    const heldBotModule: GameModule<FixtureState, FixtureAction, FixtureView, void> = {
      ...fixtureModule,
      // Same instrument as the race suite's own counter, and for the same
      // reason: it is the only way to see the room STOP working rather than
      // merely see the fence throw its output away.
      getLegalActions: (state, playerId) => {
        legalActionQueries += 1;
        return fixtureModule.getLegalActions(state, playerId);
      },
      createBot: () => ({
        chooseAction: async (_view, legal) => {
          await new Promise<void>((resolve) => releases.push(resolve));
          return legal[0]!;
        },
      }),
    };
    const auth = await createAuth();
    const registry = createGameModuleRegistry([heldBotModule]);
    const room = new MatchRoom();
    room.onCreate({ gameId: "fixture-secret", config: undefined, registry, auth, rng: DEFAULT_RNG, turnTimeoutSeconds: 0.03 });
    const seat0 = fakeClient("s0");
    const seat1 = fakeClient("s1");
    await joinWithToken(room, seat0.client, await mintToken(auth.issuer, P0));
    await joinWithToken(room, seat1.client, await mintToken(auth.issuer, P1));

    // One held decision means seat 0's clock expired and `onTurnExpired`
    // already cleared it — nothing is armed right now, by construction.
    await waitFor(() => releases.length === 1);
    const before = seat0.sent.length;

    const disposePromise = room.onDispose();
    expect(room.hasPendingTurnTimer()).toBe(false); // disposal's clear found nothing to clear
    const queriesAtDisposal = legalActionQueries;

    releases[0]!();
    await disposePromise;

    // The bot has now come back into a torn-down room. Neither of these may
    // happen: a fresh timer would wake up a whole minute later and drive a bot
    // against a room the framework already released, with no second disposal
    // left to ever clear it, and the broadcast that arms it goes out on
    // connections that are already dead.
    expect(room.hasPendingTurnTimer()).toBe(false);
    expect(seat0.sent).toHaveLength(before);
    // Beyond the effects: the room does not keep DRIVING either. Once
    // `playOneBotActionFor` returns, `runTimedOutTurnOnce` still calls
    // `runAdvanceOnce`, and that call's own disposal exit is what stops it
    // asking the module for a next step on a room that is already gone.
    expect(legalActionQueries).toBe(queriesAtDisposal);
  });
});
