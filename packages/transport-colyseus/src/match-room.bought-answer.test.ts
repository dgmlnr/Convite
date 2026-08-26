import { describe, expect, it } from "vitest";
import type { Client } from "@colyseus/core";
import type { ApplyResult, GameModule, JsonValue, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
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
 * A BOT RECEIVES WHAT IT PAID FOR, AND ONLY THAT.
 *
 * WHAT WAS MISSING. Some games let a seat spend something to learn something
 * — truco's consult costs a seña. A human's answer goes out on their own
 * socket; a bot has no socket, and `chooseAction` had no input that could
 * carry one. So a bot could take the action, pay the price, and learn
 * nothing, which is strictly worse than not asking. `BotStrategy`'s fourth
 * input closed that, and this file fences the transport half of it.
 *
 * THE DANGEROUS HALF IS THE SECOND ONE. Handing a bot an answer is only safe
 * because it is handed for a question the bot actually asked, exactly once,
 * and never otherwise. Resolving advice after every bot move — or keeping the
 * last one around — would quietly turn `BotStrategy`'s "cannot reach hidden
 * state" guarantee into a standing feed of the partner's hand. Three of the
 * four cases below are about NOT delivering.
 *
 * A NON-TRUCO FIXTURE, matching this package's discipline: `MatchRoom` is
 * game-agnostic and nothing here may assert a truco fact. The fixture keeps
 * only the shape — one action the game calls a paid question, one advice
 * provider, and a bot that records what it was handed on every decision.
 */

type BoughtAction = { readonly type: "ask" | "move"; readonly playerId: PlayerId };

interface BoughtState {
  readonly players: readonly [PlayerId, PlayerId];
  /** How many times seat 1 has moved. The fixture ends after two, so the bot
   * gets a bounded, countable series of decisions to inspect. */
  readonly moves: number;
  readonly asked: number;
}

const ADVICE: JsonValue = "the-answer";

/** Every `answer` the bot at seat 1 was handed, decision by decision. */
type Handed = (JsonValue | null | undefined)[];

function buildModule(handed: Handed, askFirst: boolean): GameModule<BoughtState, BoughtAction, BoughtState, void> {
  return {
    id: "fixture-bought",
    metadata: { seatCount: 2, displayNameKey: "fixture.bought", assetBase: "/fixture-bought" },
    configOptions: [],
    createMatch: (_config, seats: readonly SeatAssignment[]) => {
      const bySeat = [...seats].sort((a, b) => a.seat - b.seat).map((s) => s.playerId);
      return { players: [bySeat[0]!, bySeat[1]!] as const, moves: 0, asked: 0 };
    },
    applyAction: (state, action): ApplyResult<BoughtState> =>
      action.type === "ask" ? { ok: true, state: { ...state, asked: state.asked + 1 } } : { ok: true, state: { ...state, moves: state.moves + 1 } },
    getLegalActions: (state, playerId) => {
      if (playerId !== state.players[1]) return [];
      if (state.moves >= 2) return []; // the table stops, so `settle` can settle
      // Ask once (if this fixture is asking at all), then plain moves.
      return askFirst && state.asked === 0 ? [{ type: "ask", playerId }] : [{ type: "move", playerId }];
    },
    getViewFor: (state) => state,
    getOutcome: () => null,
    serialize: (state) => state as never,
    deserialize: (json) => json as unknown as BoughtState,
    createBot: () => ({
      chooseAction: (_view, legal, _budgetMs, answer) => {
        handed.push(answer);
        return legal[0]!;
      },
    }),
  };
}

const TENANT_ID = "tenant-bought" as TenantId;
const ALLOWED_ORIGIN = "https://bought.example";
const SECRET = "fixture-bought-secret-key";
const HUMAN = "seat-0-human" as PlayerId;
const DEFAULT_RNG = (): number => 0.5;

async function createAuth() {
  const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey(SECRET));
  const verifier = await createSessionTokenVerifier(issuer.publicKey);
  const repository = createStaticTenantRepository([
    { id: TENANT_ID, embedKey: "pk_bought", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: ["fixture-bought"] },
  ]);
  const joinRateLimiter: RateLimiter = createRateLimiter({ limit: 1000, windowMs: 60_000 });
  return { issuer, verifier, repository, replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }), joinRateLimiter, allowedWidgetOrigins: [ALLOWED_ORIGIN] };
}

function mintToken(issuer: SessionTokenIssuer, playerId: PlayerId): Promise<string> {
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

async function settle(sent: Array<{ type: string; message: unknown }>): Promise<void> {
  let quiet = 0;
  for (let i = 0; i < 200 && quiet < 2; i += 1) {
    const before = sent.length;
    await new Promise((resolve) => setTimeout(resolve, 0));
    quiet = sent.length === before ? quiet + 1 : 0;
  }
}

async function joinWithToken(room: MatchRoom, client: Client & { auth: unknown }, token: string): Promise<void> {
  const auth = await room.onAuth(client, { token }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "127.0.0.1" });
  client.auth = auth;
  await room.onJoin(client);
}

/** Runs a table and returns what the bot was handed on each of its decisions. */
async function runTable(options: { readonly askFirst: boolean; readonly classifyAsPaid: boolean; readonly provideAdvice?: boolean }): Promise<Handed> {
  const handed: Handed = [];
  const module = buildModule(handed, options.askFirst);
  const auth = await createAuth();
  const registry = createGameModuleRegistry([
    {
      module,
      ...(options.provideAdvice === false ? {} : { getConsultAdvice: () => Promise.resolve(ADVICE) }),
      ...(options.classifyAsPaid ? { isPaidQuestion: (action: unknown) => (action as BoughtAction).type === "ask" } : {}),
    },
  ]);
  const room = new MatchRoom();
  room.onCreate({ gameId: "fixture-bought", config: undefined, registry, auth, rng: DEFAULT_RNG, botTier: "easy" });

  const seat0 = fakeClient("s0");
  await joinWithToken(room, seat0.client, await mintToken(auth.issuer, HUMAN));
  await settle(seat0.sent);
  return handed;
}

describe("what a bot is handed, decision by decision", () => {
  it("hands the answer over on the decision right after the question", async () => {
    const handed = await runTable({ askFirst: true, classifyAsPaid: true });

    expect(handed.length, `fence setup: the bot decided ${String(handed.length)} times`).toBeGreaterThanOrEqual(2);
    expect(handed[0], "it had not asked yet — undefined, never null").toBeUndefined();
    expect(handed[1], "this is the decision the seña bought").toBe(ADVICE);
  });

  it("takes it away again immediately — one question, one decision, never a feed", async () => {
    const handed = await runTable({ askFirst: true, classifyAsPaid: true });

    expect(handed.length, "fence setup: the bot needs a third decision for this to mean anything").toBeGreaterThanOrEqual(3);
    expect(handed[2], "the answer outlived the decision it was bought for").toBeUndefined();
  });

  it("hands over NOTHING to a bot that never asked", async () => {
    const handed = await runTable({ askFirst: false, classifyAsPaid: true });

    expect(handed.length).toBeGreaterThanOrEqual(2);
    expect(handed.every((entry) => entry === undefined), `the bot was handed: ${JSON.stringify(handed)}`).toBe(true);
  });

  it("hands over nothing when the game names no paid question — fail closed", async () => {
    // The control, and the security half: the room must not decide for itself
    // that an action bought something. An unclassified game has no paid
    // questions, so no bot of its ever receives anything, even here where the
    // fixture asks and an advice provider is registered and willing.
    const handed = await runTable({ askFirst: true, classifyAsPaid: false });

    expect(handed.every((entry) => entry === undefined), `the bot was handed: ${JSON.stringify(handed)}`).toBe(true);
  });

  it("hands over null — not undefined — when the question went unanswered", async () => {
    // A strategy has to tell "I never asked" from "I asked and nothing came",
    // or it spends its whole budget re-asking. That distinction is made here,
    // in the room, and nowhere else.
    const handed = await runTable({ askFirst: true, classifyAsPaid: true, provideAdvice: false });

    expect(handed.length).toBeGreaterThanOrEqual(2);
    expect(handed[0]).toBeUndefined();
    expect(handed[1], "asked, and no answer came — that is null, and it is different").toBeNull();
  });
});
