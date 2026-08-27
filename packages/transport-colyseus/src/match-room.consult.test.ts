import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@colyseus/core";
import type { ConsultAdviceProvider, ConsultAskProvider } from "@hexdev/platform-core";
import { createGameModuleRegistry } from "@hexdev/platform-core";
import { applyAction, createTeamMatch, getLegalActions, startHand } from "@hexdev/truco-engine";
import type { Action, MatchState, PlayerId } from "@hexdev/truco-engine";
import { getConsultAdvice, getConsultAsk, trucoModule2v2 } from "@hexdev/truco-module";
import type { MatchRoomAuthOptions } from "./match-room.js";
import { MatchRoom } from "./match-room.js";

/**
 * SLICE 2A — pending record, cancel funnel, view field, cap fallback (design
 * D1–D3, D5). Slice 2b's answer handler/guards are OUT OF SCOPE; 2a.10 calls
 * the private `resolveConsult` primitive directly to prove the resolve-once
 * guard 2b will later call through its own guards.
 *
 * State is built through the REAL reducer, same discipline as
 * `truco-module`'s own `consult-ask.test.ts`. Seats are wired directly onto
 * the room (no live auth/join dance — irrelevant here, same private-field
 * precedent `match-room.test.ts` already uses), then `broadcastViews()` runs
 * for real so `turnDeadline` and every view reflect the state honestly.
 */

const A = "pc-a" as PlayerId;
const B = "pc-b" as PlayerId;
const C = "pc-c" as PlayerId;
const D = "pc-d" as PlayerId;
const HAND_A = [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }] as const;
const HAND_B = [{ suit: "oro", rank: 4 }, { suit: "basto", rank: 4 }, { suit: "copa", rank: 4 }] as const;
const HAND_C = [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }] as const;
const HAND_D = [{ suit: "copa", rank: 6 }, { suit: "basto", rank: 2 }, { suit: "espada", rank: 11 }] as const;

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`fence setup: ${action.type} — ${result.violation}`);
  return result.state;
}

/** A real pending truco call on D, answerable by team A+C. A (seat 0) is
 * both the asker and the seat `seatOnTheClock` picks first; C (seat 2) is
 * A's live human teammate. */
function pendingCallState(): MatchState {
  let state = startHand(createTeamMatch({ seatOrder: [A, B, C, D], pointsToWin: 30, dealerSeat: 3 }), [HAND_A, HAND_B, HAND_C, HAND_D] as never);
  for (const seat of [A, B, C]) {
    const card = getLegalActions(state, seat).find((action) => action.type === "play-card")!;
    state = apply(state, card);
  }
  return apply(state, { type: "call-truco", playerId: D, level: "truco" });
}

const isSena = (action: unknown): boolean => (action as { type?: unknown }).type === "send-sena";
const isConsult = (action: unknown): boolean => (action as { type?: unknown }).type === "consult-partner";
const isTrucoResponse = (action: unknown): boolean => (action as { type?: unknown }).type === "respond-truco" || (action as { type?: unknown }).type === "respond-envido";

function fakeClient(id: string) {
  const sent: { type: string; message: unknown }[] = [];
  const client = { sessionId: id, id, auth: undefined, send: (type: string, message?: unknown) => sent.push({ type, message }) } as unknown as Client & { auth: unknown };
  return { client, sent };
}

/** Same real registrations `apps/server` wires — `isHumanPriorityAction` so a
 * bot teammate (2a.2) stands down from a decision a live human shares. */
function buildRoom(turnTimeoutSeconds: number) {
  const registry = createGameModuleRegistry([
    {
      module: trucoModule2v2,
      isNonBlockingAction: isSena,
      isHumanPriorityAction: isTrucoResponse,
      getConsultAdvice: getConsultAdvice as ConsultAdviceProvider,
      getConsultAsk: getConsultAsk as ConsultAskProvider,
      isPaidQuestion: isConsult,
    },
  ]);
  const room = new MatchRoom();
  room.onCreate({ gameId: "truco-argentino-2v2", config: undefined, registry, auth: {} as MatchRoomAuthOptions, rng: () => 0.5, turnTimeoutSeconds });
  const seats = { A: fakeClient("A"), B: fakeClient("B"), C: fakeClient("C"), D: fakeClient("D") };
  const controllers = (room as unknown as { controllers: Map<number, unknown> }).controllers;
  controllers.set(0, { kind: "human", playerId: A, client: seats.A.client });
  controllers.set(1, { kind: "human", playerId: B, client: seats.B.client });
  controllers.set(2, { kind: "human", playerId: C, client: seats.C.client });
  controllers.set(3, { kind: "human", playerId: D, client: seats.D.client });
  (room as unknown as { matchState: unknown }).matchState = pendingCallState();
  (room as unknown as { broadcastViews(): void }).broadcastViews();
  return { room, seats };
}

const last = (sent: { type: string; message: unknown }[]) => sent.at(-1);
const only = (sent: { type: string; message: unknown }[], type: string) => sent.filter((entry) => entry.type === type);
/** Waits out `advance()`'s own chain — the same promise `onDispose` awaits,
 * never a `setTimeout(…, 0)` poll (which fake timers below would freeze). */
async function settle(room: MatchRoom): Promise<void> {
  await (room as unknown as { advanceChain: Promise<void> }).advanceChain;
}
async function askConsult(room: MatchRoom, client: Client, playerId: PlayerId): Promise<void> {
  await room.handleConsult(client, { type: "consult-partner", playerId, about: "pending-call" });
  await settle(room);
}

describe("MatchRoom pending consult — slice 2a", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("2a.1 human teammate is asked first: consult-ask reaches the partner, no consult-advice reaches the asker yet", async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A);

    expect(only(seats.C.sent, "consult-ask")).toHaveLength(1);
    const ask = last(only(seats.C.sent, "consult-ask"))!.message as { about: string; options: readonly string[] };
    expect(ask.about).toBe("pending-call");
    expect(new Set(ask.options)).toEqual(new Set(["quiero", "no-quiero"]));
    expect(only(seats.A.sent, "consult-advice")).toHaveLength(0);
  });

  it("2a.2 bot-controlled teammate: consult-advice sends synchronously, no pending window opens", async () => {
    const { room, seats } = buildRoom(60);
    // A harmless choice: the real driving loop still auto-acts for this bot
    // seat, and answering the pending call itself would confound the setup.
    const harmlessBot = { chooseAction: async (_v: unknown, legal: readonly { type: string }[]) => legal.find((action) => action.type === "send-sena") ?? legal[0] };
    (room as unknown as { controllers: Map<number, unknown> }).controllers.set(2, { kind: "bot", playerId: C, strategy: harmlessBot });

    await askConsult(room, seats.A.client, A);

    expect(only(seats.C.sent, "consult-ask")).toHaveLength(0);
    expect(only(seats.A.sent, "consult-advice")).toHaveLength(1);
    expect(last(only(seats.A.sent, "consult-advice"))).toMatchObject({ message: { from: "partner" } });
  });

  it("2a.3 the asker's señas quota spends immediately, before any answer exists", async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A);

    expect(only(seats.A.sent, "consult-advice")).toHaveLength(0); // still unanswered
    const view = (last(seats.A.sent)!.message as { view: { self: { senasRemaining: number } } }).view;
    expect(view.self.senasRemaining).toBe(2); // 3 - 1, spent on open
  });

  it('2a.4 30s cap fires before a long turn clock: from:"fallback", turn clock keeps running unchanged', async () => {
    const { room, seats } = buildRoom(90);
    await askConsult(room, seats.A.client, A);
    const armed = (last(seats.A.sent)!.message as { turnDeadline: number }).turnDeadline;

    await vi.advanceTimersByTimeAsync(30_000);
    await settle(room);

    expect(only(seats.A.sent, "consult-advice")).toHaveLength(1);
    expect(last(only(seats.A.sent, "consult-advice"))).toMatchObject({ message: { from: "fallback" } });
    // The seat's own latest "view" (broadcast AFTER the send) carries the clock.
    expect((last(seats.A.sent)!.message as { turnDeadline: number }).turnDeadline).toBe(armed);
  });

  it("2a.5 turn clock under 30s: consult cancelled with no advice, existing timeout path still fires", async () => {
    const { room, seats } = buildRoom(5); // turnDeadline binds before the 30s cap
    await askConsult(room, seats.A.client, A);
    const before = seats.A.sent.length;

    // 5s expiry plus room for the timeout bot's own real thinking delay.
    await vi.advanceTimersByTimeAsync(10_000);
    await settle(room);

    expect(only(seats.A.sent, "consult-advice")).toHaveLength(0);
    expect(last(seats.A.sent)).toMatchObject({ message: { pendingConsult: null } });
    expect(seats.A.sent.length).toBeGreaterThan(before); // the timeout bot resolved A's own obligation
  });

  it("2a.6 partner taken over by a bot mid-consult: cancelled immediately, no advice", async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A);

    room.handleQuit(seats.C.client); // synchronous — no settle needed

    expect(only(seats.A.sent, "consult-advice")).toHaveLength(0);
    expect((room as unknown as { pendingConsult: unknown }).pendingConsult).toBeNull();
  });

  it("2a.7 the reconnecting seat is the partner: consult-ask is re-sent", async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A);
    const reconnected = fakeClient("C"); // same sessionId — same seat, new socket instance

    room.onReconnect(reconnected.client);

    expect(only(reconnected.sent, "consult-ask")).toHaveLength(1);
  });

  it("2a.8 room disposed while open: cancelled, and the cap timer never fires", async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A);

    await room.onDispose();
    await vi.advanceTimersByTimeAsync(30_000); // if the timer leaked, this is where it would fire

    expect(only(seats.A.sent, "consult-advice")).toHaveLength(0);
    expect((room as unknown as { pendingConsult: unknown }).pendingConsult).toBeNull();
  });

  it("2a.9 a second consult while one is open is refused: first window unchanged", async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A);
    const firstId = (room as unknown as { pendingConsult: { id: number } | null }).pendingConsult?.id;

    await askConsult(room, seats.A.client, A); // legal at the engine level (quota permits), refused by the room

    expect(only(seats.C.sent, "consult-ask")).toHaveLength(1); // still just the first
    expect(only(seats.A.sent, "consult-advice")).toHaveLength(1); // the second falls to the synchronous bot path
    expect((room as unknown as { pendingConsult: { id: number } | null }).pendingConsult?.id).toBe(firstId);
  });

  it("2a.10 two resolutions racing for the same consult resolve exactly once (design D2's atomic check-and-clear)", async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A);
    const id = (room as unknown as { pendingConsult: { id: number } }).pendingConsult.id;
    // Calls the shared resolve-once primitive directly (2b's future guarded
    // caller), no `await` between the two racing calls.
    const resolveConsult = (room as unknown as { resolveConsult(id: number, advice: unknown, from: "partner" | "fallback"): void }).resolveConsult.bind(room);

    resolveConsult(id, "quiero", "partner");
    resolveConsult(id, "no-quiero", "fallback");

    expect(only(seats.A.sent, "consult-advice")).toHaveLength(1);
    expect(last(only(seats.A.sent, "consult-advice"))).toMatchObject({ message: { advice: "quiero", from: "partner" } });
  });

  it("2a.11/2a.12 every seat's view carries the SAME redacted {askerSeat, deadline} — no subject, no options, no advice content", async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A);

    const fields = [seats.A, seats.B, seats.C, seats.D].map((seat) => (last(seat.sent)!.message as { pendingConsult: Record<string, unknown> }).pendingConsult);
    const opponentPending = fields[3]!; // D, an opponent — the redaction fence
    expect(Object.keys(opponentPending).sort()).toEqual(["askerSeat", "deadline"]);
    expect(opponentPending).toEqual({ askerSeat: 0, deadline: expect.any(Number) });
    expect(new Set(fields.map((field) => JSON.stringify(field))).size).toBe(1); // same field, all four seats
  });
});
