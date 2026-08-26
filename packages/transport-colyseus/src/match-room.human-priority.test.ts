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
 * The human gets the first word on a decision they share with a bot.
 *
 * WHAT WAS REPORTED, from real 2v2 play against bots: "el bot compañero
 * canta y responde muy rápido las cosas, debería dejar que responda el
 * jugador (humano), como prioridad". Truco offers a pending call's response
 * to BOTH members of the answering team — either partner may say quiero — so
 * a bot partner had the answer legal at the very same instant its human
 * teammate did, and `findActingBot` returns the first bot with a blocking
 * action. The bot won that race every time, and the human never decided
 * anything their partner could decide first.
 *
 * WHY THE OBVIOUS RULE IS WRONG, and it is worth writing down because it
 * looks right: "a bot waits whenever a human has a blocking action" deadlocks
 * truco outright. `call-truco` is legal for every player for as long as
 * nobody has called, so a human seat almost always has a blocking action and
 * no bot would ever move again. What is actually shared is a specific KIND of
 * decision, which only a game can recognise — hence a classifier paired at
 * registration, the same seam and the same convention `isNonBlockingAction`
 * already uses.
 *
 * A NON-TRUCO FIXTURE, deliberately, matching this package's own discipline:
 * `MatchRoom` is game-agnostic and nothing here may assert a truco fact. The
 * fixture below reproduces only the SHAPE that matters — one decision offered
 * to two seats at once, one of them human.
 */

/**
 * `pending` is a decision offered to seats 0 and 2 at the same time (the
 * "answering side"); seat 1 is the one who raises it. `answeredBy` records
 * who actually took it, which is the whole question this file asks.
 */
interface PriorityState {
  readonly players: readonly [PlayerId, PlayerId, PlayerId, PlayerId];
  readonly pending: boolean;
  readonly answeredBy: PlayerId | null;
  /** Set when seat 3 takes its own private action — the control that proves
   * a bot with genuinely private work is never held up. */
  readonly seat3Moved: boolean;
  /** Set if anybody took the extra action the answering side is offered
   * ALONGSIDE the shared decision. Truco's shape, exactly: a pending envido
   * offers the two responses AND every higher call to escalate to. */
  readonly escalated: boolean;
}

type PriorityAction =
  | { readonly type: "raise"; readonly playerId: PlayerId }
  | { readonly type: "respond"; readonly playerId: PlayerId }
  | { readonly type: "own-move"; readonly playerId: PlayerId }
  | { readonly type: "escalate"; readonly playerId: PlayerId };

function seatOf(state: PriorityState, playerId: PlayerId): number {
  return state.players.indexOf(playerId);
}

/** `seat3AlsoHasItsOwnMove` is what separates the two rules under test: with
 * it, the bot at seat 3 has a blocking action nobody else can take, so it
 * must keep moving even while a human is owed the shared decision. */
function buildModule(seat3AlsoHasItsOwnMove: boolean, answeringSideCanAlsoEscalate = false): GameModule<PriorityState, PriorityAction, PriorityState, void> {
  return {
    id: "fixture-priority",
    metadata: { seatCount: 4, displayNameKey: "fixture.priority", assetBase: "/fixture-priority" },
    configOptions: [],
    createMatch: (_config, seats: readonly SeatAssignment[]) => {
      const bySeat = [...seats].sort((a, b) => a.seat - b.seat).map((s) => s.playerId);
      return {
        players: [bySeat[0]!, bySeat[1]!, bySeat[2]!, bySeat[3]!] as const,
        pending: false,
        answeredBy: null,
        seat3Moved: false,
        escalated: false,
      };
    },
    applyAction: (state, action): ApplyResult<PriorityState> => {
      if (action.type === "raise") return { ok: true, state: { ...state, pending: true } };
      if (action.type === "own-move") return { ok: true, state: { ...state, seat3Moved: true } };
      if (action.type === "escalate") return { ok: true, state: { ...state, escalated: true } };
      return { ok: true, state: { ...state, pending: false, answeredBy: action.playerId } };
    },
    getLegalActions: (state, playerId) => {
      const seat = seatOf(state, playerId);
      if (seat === -1) return [];
      if (state.pending) {
        // The shared decision: BOTH the human (seat 0) and its bot partner
        // (seat 2) are offered it, exactly as truco offers a response to
        // either member of the answering team.
        if (seat === 0 || seat === 2) {
          const shared: PriorityAction[] = [{ type: "respond", playerId }];
          if (answeringSideCanAlsoEscalate) shared.push({ type: "escalate", playerId });
          return shared;
        }
        if (seat === 3 && seat3AlsoHasItsOwnMove && !state.seat3Moved) return [{ type: "own-move", playerId }];
        return [];
      }
      if (state.answeredBy !== null) return [];
      return seat === 1 ? [{ type: "raise", playerId }] : [];
    },
    getViewFor: (state) => state,
    getOutcome: () => null,
    serialize: (state) => state as never,
    deserialize: (json) => json as unknown as PriorityState,
    createBot: () => ({ chooseAction: async (_view, legal) => legal[0]! }),
  };
}

const TENANT_ID = "tenant-priority" as TenantId;
const ALLOWED_ORIGIN = "https://priority.example";
const SECRET = "fixture-priority-secret-key";
const HUMAN = "seat-0-human" as PlayerId;
const DEFAULT_RNG = (): number => 0.5;

async function createAuth() {
  const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey(SECRET));
  const verifier = await createSessionTokenVerifier(issuer.publicKey);
  const repository = createStaticTenantRepository([
    { id: TENANT_ID, embedKey: "pk_priority", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: ["fixture-priority"] },
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

/** The last view this seat was sent — the room's own broadcast is the only
 * honest place to read what the table looks like from outside. */
function latestState(sent: Array<{ type: string; message: unknown }>): PriorityState {
  const last = sent[sent.length - 1];
  if (last === undefined) throw new Error("fence setup: the seat was sent no view at all");
  return (last.message as { view: PriorityState }).view;
}

/**
 * Waits until the table stops moving.
 *
 * NOT optional, and the reason is worth recording: `onJoin` does not await
 * the room's advance chain (it dispatches it with `void`, so a join can never
 * be held open by a bot's thinking time). Reading straight after the join
 * therefore reads a table mid-flight — which is how the first draft of this
 * file "passed" its main assertion while its own control proved the read was
 * simply too early. Settling on "no new broadcast for two consecutive
 * macrotasks" observes the room through the same channel a client does,
 * rather than reaching into its internals.
 */
async function settle(sent: Array<{ type: string; message: unknown }>): Promise<void> {
  let quiet = 0;
  for (let i = 0; i < 200 && quiet < 2; i += 1) {
    const before = sent.length;
    await new Promise((resolve) => setTimeout(resolve, 0));
    quiet = sent.length === before ? quiet + 1 : 0;
  }
}

async function runTable(options: {
  readonly humanPriority: boolean;
  readonly seat3AlsoHasItsOwnMove?: boolean;
  readonly answeringSideCanAlsoEscalate?: boolean;
}): Promise<PriorityState> {
  const module = buildModule(options.seat3AlsoHasItsOwnMove ?? false, options.answeringSideCanAlsoEscalate ?? false);
  const auth = await createAuth();
  const registry = createGameModuleRegistry([
    options.humanPriority
      ? { module, isHumanPriorityAction: (action: unknown) => (action as PriorityAction).type === "respond" }
      : { module },
  ]);
  const room = new MatchRoom();
  room.onCreate({ gameId: "fixture-priority", config: undefined, registry, auth, rng: DEFAULT_RNG, botTier: "easy" });

  const seat0 = fakeClient("s0");
  await joinWithToken(room, seat0.client, await mintToken(auth.issuer, HUMAN));
  await settle(seat0.sent);
  return latestState(seat0.sent);
}

async function joinWithToken(room: MatchRoom, client: Client & { auth: unknown }, token: string): Promise<void> {
  const auth = await room.onAuth(client, { token }, { headers: new Headers({ origin: ALLOWED_ORIGIN }), ip: "127.0.0.1" });
  client.auth = auth;
  await room.onJoin(client);
}

describe("a bot stands down from a decision its human is also being offered", () => {
  it("leaves the shared decision unanswered and waiting for the human", async () => {
    const state = await runTable({ humanPriority: true });

    expect(state.pending, "fence setup: the table really did reach the shared decision").toBe(true);
    expect(state.answeredBy, "the bot partner answered a question that was the human's to answer").toBeNull();
  });

  it("WITHOUT the classifier the bot answers — which is the behaviour being changed, not an accident of the fixture", async () => {
    const state = await runTable({ humanPriority: false });

    // The control. If this passed too, the test above would be proving
    // nothing about the classifier — only that this fixture never lets a bot
    // respond in the first place.
    expect(state.answeredBy, "an unclassified game keeps the previous behaviour: first bot with a blocking action takes it").not.toBeNull();
    expect(state.pending).toBe(false);
  });

  it("stands down even when the shared decision comes bundled with moves of its own", async () => {
    // THE DEFECT THIS EXISTS FOR, and it shipped once. The first rule read
    // "every blocking action this bot has is human-priority". A pending TRUCO
    // offers the answering side nothing but its two responses, so that held.
    // A pending ENVIDO offers the responses AND every higher call it could
    // escalate to — one non-priority action was enough to send the bot
    // straight past the rule. Reported as exactly that asymmetry: "espera
    // para mi respuesta de si quiero o no el truco pero no lo hace para el
    // envido".
    const state = await runTable({ humanPriority: true, answeringSideCanAlsoEscalate: true });

    expect(state.answeredBy, "the shared decision is still the human's").toBeNull();
    expect(state.escalated, "and the bot must not slip out the side door either — standing down is standing down").toBe(false);
  });

  it("a bot with a move of its OWN keeps playing — it is not waiting on anybody", async () => {
    // Seat 3 holds something no human is offered at all, so it never meets
    // the deferral condition in the first place — this is the half that keeps
    // the room moving. It costs nothing to be generous here either: while any
    // call is pending, nobody can play a card anyway, so a bot with genuinely
    // private work and a shared decision at the same time cannot arise.
    const state = await runTable({ humanPriority: true, seat3AlsoHasItsOwnMove: true });

    expect(state.answeredBy, "the shared decision is still the human's").toBeNull();
    expect(state.seat3Moved, "but a bot with its own private move must not be held up by someone else's decision").toBe(true);
  });
});
