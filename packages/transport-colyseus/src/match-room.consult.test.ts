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
function buildRoom(turnTimeoutSeconds: number, seedState: (state: MatchState) => MatchState = (state) => state) {
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
  (room as unknown as { matchState: unknown }).matchState = seedState(pendingCallState());
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

  it('2a.6 partner taken over by a bot mid-consult: resolves right away, marked from:"fallback" (not "partner" — the human is gone)', async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A);

    room.handleQuit(seats.C.client);
    // Only flushes microtasks (no real/fake-timer delay): `adviceFor` never
    // waits on a bot's own thinking delay. Deliberately NOT `settle(room)`
    // here — the takeover's OWN `advance()` may separately drive C's fresh
    // bot strategy, which DOES carry a real thinking delay, and awaiting
    // that would be asserting on unrelated gameplay, not this resolution.
    await vi.advanceTimersByTimeAsync(0);

    expect(only(seats.A.sent, "consult-advice")).toHaveLength(1);
    expect(last(only(seats.A.sent, "consult-advice"))).toMatchObject({ message: { from: "fallback" } });
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

    // WARNING-2 (sdd-verify): the behavioural assertions below ALONE cannot
    // tell a genuinely-cancelled cap timer apart from a LEAKED one, because
    // `runConsultFallbackOnce` re-checks `this.disposed` and returns before
    // sending anything (match-room.ts) — a SECOND, redundant guard that
    // keeps both assertions green even if `clearPendingConsult`'s own
    // `clearTimeout` call were deleted. `vi.getTimerCount()` reads vitest's
    // own fake-timer queue directly — a channel neither this room's
    // `disposed` flag nor its `pendingConsult` field can influence — so it
    // is the one check that actually distinguishes "cancelled" from "leaked
    // but silenced downstream". Both the turn timer and the consult's own
    // cap timer must be gone: `onDispose` -> `clearTurnTimer` -> the D3
    // funnel -> `clearPendingConsult`.
    expect(vi.getTimerCount(), "no timer — turn or consult — survives dispose").toBe(0);

    await vi.advanceTimersByTimeAsync(30_000); // if a timer had leaked, this is where it would fire

    expect(only(seats.A.sent, "consult-advice")).toHaveLength(0);
    expect((room as unknown as { pendingConsult: unknown }).pendingConsult).toBeNull();
  });

  /* THE TWO CANCELLATION PATHS THE VERIFICATION LEFT UNFENCED.
   *
   * Spec R2 lists four moments the question stops mattering — the asker's
   * turn clock expiring, the HAND ENDING, the MATCH BEING DECIDED, and the
   * room disposing. Only the first and last had fences (2a.5, 2a.8). The
   * middle two ride the same funnel, but "rides the same funnel" is an
   * argument about the code, not evidence about its behaviour, and this file
   * has already paid for trusting one of those.
   *
   * Both go through `armTurnTimer`, which calls `clearTurnTimer` — and so
   * `clearPendingConsult` — the moment the seat on the clock changes or
   * `getOutcome` stops returning null. Neither needs its own bookkeeping, and
   * that is exactly why neither is obviously covered from reading. */
  it("the hand ends under an open consult (the partner declines the truco): cancelled, no advice, no answer arrives late", async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A);
    expect(last(seats.A.sent)).toMatchObject({ message: { pendingConsult: { askerSeat: 0 } } }); // open, on the record

    // C is A's teammate and shares the obligation, so C can answer the truco
    // while A is still consulting about it. Declining ENDS THE HAND.
    await room.handleAction(seats.C.client, { type: "respond-truco", playerId: C, response: "no-quiero" });
    await settle(room);

    expect(only(seats.A.sent, "consult-advice"), "the question died with the hand").toHaveLength(0);
    expect(last(seats.A.sent)).toMatchObject({ message: { pendingConsult: null } });
    // THE HAND ended, the MATCH did not — this is what separates this fence
    // from the one below, which would otherwise be the same test twice.
    expect((last(seats.A.sent)!.message as { outcome: unknown }).outcome, "the match is still running").toBeNull();

    // And it stays dead: the 30s cap must not fire into a hand that is over.
    await vi.advanceTimersByTimeAsync(60_000);
    await settle(room);
    expect(only(seats.A.sent, "consult-advice"), "no late fallback after the hand ended").toHaveLength(0);
  });

  it("the match is decided under an open consult: cancelled, no advice, and no clock survives the result", async () => {
    // The engine's `pointsToWin` is a literal `15 | 30`, so a one-point match
    // is not representable — seed D's team at 29 instead, where the single
    // point a truco decline pays takes the match. Same path either way: the
    // one `armTurnTimer` guards with `getOutcome`.
    const { room, seats } = buildRoom(60, (state) => ({
      ...state,
      teams: state.teams.map((team) => (team.playerIds.includes(D) ? { ...team, score: 29 } : team)),
    }));
    await askConsult(room, seats.A.client, A);
    expect(last(seats.A.sent)).toMatchObject({ message: { pendingConsult: { askerSeat: 0 } } });

    await room.handleAction(seats.C.client, { type: "respond-truco", playerId: C, response: "no-quiero" });
    await settle(room);

    expect(only(seats.A.sent, "consult-advice"), "a decided match answers nobody").toHaveLength(0);
    expect(last(seats.A.sent)).toMatchObject({ message: { pendingConsult: null } });
    // The seed has to have TAKEN, or this is the hand-end fence wearing a
    // different name: `getOutcome` is what `armTurnTimer` actually branches on.
    expect((last(seats.A.sent)!.message as { outcome: unknown }).outcome, "the match really is decided").not.toBeNull();
    expect(room.hasPendingTurnTimer(), "a finished match keeps no clock running").toBe(false);

    await vi.advanceTimersByTimeAsync(60_000);
    await settle(room);
    expect(only(seats.A.sent, "consult-advice"), "no late fallback after the match was decided").toHaveLength(0);
  });

  /* NO REFUND (spec R3, last clause). 2a.3 proves the quota is SPENT on open;
   * nothing proved it is not handed back when the consult produces a fallback
   * instead of a real answer. Those are different claims: a refund would be a
   * generous-looking bug that costs the asker nothing today and lets them
   * consult unlimited times per hand, which is the whole point of the cap. */
  it("a consult that ends in the fallback does NOT refund the asker's spent quota", async () => {
    const { room, seats } = buildRoom(90);
    const before = (last(seats.A.sent)!.message as { view: { self: { senasRemaining: number } } }).view.self.senasRemaining;
    await askConsult(room, seats.A.client, A);

    await vi.advanceTimersByTimeAsync(30_000); // the cap fires: fallback, not a partner answer
    await settle(room);

    expect(last(only(seats.A.sent, "consult-advice"))).toMatchObject({ message: { from: "fallback" } });
    const after = (last(seats.A.sent)!.message as { view: { self: { senasRemaining: number } } }).view.self.senasRemaining;
    expect(before, "the fixture starts with the full quota").toBe(3);
    expect(after, "asking is what costs — the fallback does not buy it back").toBe(2);
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

  /**
   * sdd-verify: the spec's own dividing line ("did the question outlive its
   * own turn", not "did somebody take the seat") had NO fence — `onLeave`
   * (the real disconnect path, distinct from 2a.6's `handleQuit`) was never
   * driven with a consult open anywhere in this suite. Inserting the OLD,
   * now-rejected behaviour — silently cancelling `pendingConsult` the
   * instant `onLeave` sees the partner's own seat — left every other test
   * green, because nothing here ever called `onLeave` at all.
   *
   * `DEFAULT_RECONNECTION_WINDOW_SECONDS` (30s) and `CONSULT_CAP_MS` (30s)
   * are equal, but their clocks start at DIFFERENT instants: the cap starts
   * when the consult opens (t=0 below), the reconnection window starts when
   * `onLeave` actually runs (t=5000 below, simulating the disconnect
   * happening a few seconds into the window) — so the cap's own deadline
   * (t=30000) always arrives before the reconnection window's (t=35000).
   * The test drives BOTH instants, in order, to prove the cap — not
   * `onLeave` itself — is what resolves the consult, and that the LATER
   * window expiry (which still runs `takeOverSeat`, per design D3) does not
   * send a second answer.
   */
  it("the partner disconnects (onLeave) while the cap is still running: the cap resolves it with a marked fallback, exactly as if they had stayed connected and silent", async () => {
    const { room, seats } = buildRoom(90); // long turn clock: the 30s cap binds the deadline, not the turn
    await askConsult(room, seats.A.client, A);

    // 5s pass with C (the asked partner) still silent, THEN C's connection
    // drops. Deliberately not `await`ed here: `onLeave` awaits the whole
    // reconnection window, which this scenario keeps open well past this
    // point — awaiting it here would hang the test.
    await vi.advanceTimersByTimeAsync(5_000);
    const leaving = room.onLeave(seats.C.client);

    // 25s more reaches the CONSULT's own cap (t=30000 since it opened at
    // t=0) — before the reconnection window (t=5000 + 30000 = 35000).
    await vi.advanceTimersByTimeAsync(25_000);
    await settle(room);

    expect(only(seats.A.sent, "consult-advice"), "the cap resolves it — a disconnected-but-still-reserved partner must not have silently cancelled the consult").toHaveLength(1);
    expect(last(only(seats.A.sent, "consult-advice"))).toMatchObject({ message: { from: "fallback" } });
    expect((room as unknown as { pendingConsult: unknown }).pendingConsult, "resolved and cleared by the cap, same as an ordinary silent partner").toBeNull();

    // The reconnection window itself (t=5000 + 30000 = 35000) still has not
    // expired at t=30000 — advance the remaining 5s so `onLeave`'s own await
    // settles too, into the takeover branch (design D3's explicit hook).
    // Harmless by now: the consult is already resolved, so `takeOverSeat`'s
    // own `pending !== null` guard skips queuing a second fallback.
    await vi.advanceTimersByTimeAsync(5_000);
    await leaving;
    await settle(room);

    expect(only(seats.A.sent, "consult-advice"), "resolved exactly once — the later window expiry must not send a second answer").toHaveLength(1);
    const controllers = (room as unknown as { controllers: Map<number, { kind: string }> }).controllers;
    expect(controllers.get(2)?.kind, "the seat is still taken over once the window itself expires — just too late to matter for the already-resolved consult").toBe("bot");
  });
});

/**
 * SLICE 2B — the inbound `consult-answer` handler and its four guards (design
 * D4), plus the redaction fence's counterpart on the answer path itself. This
 * is the one real trust boundary in the whole change: everything else the
 * room does is deciding what to SEND; this is the one place it decides
 * whether to BELIEVE something that arrived from outside. Every guard test
 * proves the consult STAYS OPEN (same `pendingConsult.id`) after a rejection,
 * not merely that no advice was sent — a handler that silently closed the
 * consult on a forged answer would still pass a weaker assertion.
 */
describe("MatchRoom consult answer — slice 2b", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("2b.1 no pending consult open: consult-answer is dropped silently, no advice sent (guard 1)", () => {
    const { room, seats } = buildRoom(60);

    room.handleConsultAnswer(seats.C.client, { about: "pending-call", answer: "quiero" });

    expect(only(seats.A.sent, "consult-advice")).toHaveLength(0);
    expect((room as unknown as { pendingConsult: unknown }).pendingConsult).toBeNull();
  });

  it("2b.2 answer from a non-partner seat is rejected identically: bot seat, opponent, the asker, and an unseated socket (guard 2)", async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A); // C (seat 2) is the asked partner
    const openId = (room as unknown as { pendingConsult: { id: number } | null }).pendingConsult?.id;
    // Seat 1 (B) is now bot-controlled — no live human behind it to answer as.
    (room as unknown as { controllers: Map<number, unknown> }).controllers.set(1, { kind: "bot", playerId: B, strategy: { chooseAction: () => { throw new Error("must never be asked"); } } });
    const stranger = fakeClient("stranger"); // never seated at all

    room.handleConsultAnswer(seats.A.client, { about: "pending-call", answer: "quiero" }); // the asker themselves
    room.handleConsultAnswer(seats.B.client, { about: "pending-call", answer: "quiero" }); // bot-controlled seat
    room.handleConsultAnswer(seats.D.client, { about: "pending-call", answer: "quiero" }); // an opponent
    room.handleConsultAnswer(stranger.client, { about: "pending-call", answer: "quiero" }); // unseated socket

    expect(only(seats.A.sent, "consult-advice")).toHaveLength(0);
    expect((room as unknown as { pendingConsult: { id: number } | null }).pendingConsult?.id).toBe(openId);
  });

  it("2b.3 answer for the wrong subject is rejected: consult open on pending-call, answered for envido (guard 3)", async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A);
    const openId = (room as unknown as { pendingConsult: { id: number } | null }).pendingConsult?.id;

    room.handleConsultAnswer(seats.C.client, { about: "envido", answer: "quiero" });

    expect(only(seats.A.sent, "consult-advice")).toHaveLength(0);
    expect((room as unknown as { pendingConsult: { id: number } | null }).pendingConsult?.id).toBe(openId);
  });

  it('2b.4 a UI label sent as the answer is rejected as an unknown option — both "Dale" and "Quiere", either display vocabulary, never the wire value (guard 4)', async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A);
    const openId = (room as unknown as { pendingConsult: { id: number } | null }).pendingConsult?.id;

    room.handleConsultAnswer(seats.C.client, { about: "pending-call", answer: "Dale" }); // the partner's own button label
    room.handleConsultAnswer(seats.C.client, { about: "pending-call", answer: "Quiere" }); // the asker's report label

    expect(only(seats.A.sent, "consult-advice")).toHaveLength(0);
    expect((room as unknown as { pendingConsult: { id: number } | null }).pendingConsult?.id).toBe(openId);
  });

  it('2b.5 partner answers a valid option inside the window: consult-advice sent from:"partner", partner\'s own señas unchanged', async () => {
    const { room, seats } = buildRoom(60);
    await askConsult(room, seats.A.client, A);
    const before = (last(seats.C.sent)!.message as { view: { self: { senasRemaining: number } } }).view.self.senasRemaining;

    room.handleConsultAnswer(seats.C.client, { about: "pending-call", answer: "quiero" });

    expect(only(seats.A.sent, "consult-advice")).toHaveLength(1);
    expect(last(only(seats.A.sent, "consult-advice"))).toMatchObject({ message: { advice: "quiero", from: "partner" } });
    expect((room as unknown as { pendingConsult: unknown }).pendingConsult).toBeNull(); // resolved, not left open
    const after = (last(seats.C.sent)!.message as { view: { self: { senasRemaining: number } } }).view.self.senasRemaining;
    expect(after).toBe(before); // answering spends nothing
  });
});
