import { describe, expect, it } from "vitest";
import type { PlayerId, RandomSource } from "@hexdev/platform-contract";
import { createJtiReplayGuard, createRateLimiter, createStaticTenantRepository } from "@hexdev/platform-core";
import { MatchRoom } from "@hexdev/transport-colyseus";
import type { MatchRoomAuthOptions } from "@hexdev/transport-colyseus";
import { escobaModule } from "@hexdev/escoba-module";
import { trucoModule } from "@hexdev/truco-module";
import type { Card as EscobaCard, Rank as EscobaRank, Suit as EscobaSuit } from "@hexdev/escoba-engine";
import { buildGameRegistry } from "./registry.js";

/**
 * A SEATED PLAYER USED TO BE ABLE TO DEAL THEMSELVES WHATEVER THEY WANTED,
 * and this file is the reproduction that says so out loud.
 *
 * `MatchRoom.handleAction` authenticated the SEAT — the action's claimed
 * `playerId` had to match the authenticated controller — and then handed the
 * action straight to `module.applyAction`, without ever asking
 * `getLegalActions` whether the game had offered it. Every game's dealing
 * action (`start-hand` in truco and escoba, `deal-board` in the solitaire) is
 * a SYSTEM action: the room materializes it from server-owned entropy inside
 * `runAdvanceOnce`, and no module ever offers it to a player. But nothing
 * refused one that ARRIVED from a player, under that player's own id, in the
 * window where the module's own gate ("a hand is already in progress") is
 * open — before the first deal, and between hands. The submitted `deal`
 * (truco) or `deck` (escoba) is the whole hand for EVERY seat, so choosing it
 * is choosing everyone's cards.
 *
 * WHY THIS FILE LIVES IN `apps/server`. It is the only place that holds the
 * real transport AND the real game modules at once: `transport-colyseus` is
 * game-agnostic by construction and must stay that way (it may not import a
 * game), and a module package cannot see the transport. The composition root
 * is where the two meet, and `escoba-full-hand.test.ts` beside it already
 * established that an end-to-end proof which must run on EVERY `pnpm test`
 * belongs here rather than in the opt-in Playwright suite.
 *
 * THE UNDEALT WINDOW IS REACHED WITHOUT A RACE. `MatchRoom.onJoin` seats the
 * last player, creates the match, and then fires `advance()` WITHOUT awaiting
 * it (its own comment explains why: awaiting held the join open for a whole
 * bot opening). `advance()` only ever schedules through
 * `advanceChain.then(...)`, so the system deal cannot run until the current
 * synchronous block yields. Submitting in that same block therefore lands on
 * a freshly created, UNDEALT match every single time — no timer, no polling,
 * no flake. That is also the shape of the real attack: a client that sends
 * `action` the instant its own join resolves.
 */

const P0 = "forged-seat-0" as PlayerId;
const P1 = "forged-seat-1" as PlayerId;

/** Fixed rather than random so nothing here varies run to run; the deal it
 * produces is never asserted on by VALUE, only by shape. */
const RNG: RandomSource = () => 0.5;

/**
 * `onCreate` only STORES `auth` (it is read in `onAuth`, which these tests
 * deliberately never call), so a structural stand-in is enough and no real
 * key material is needed — the same minimal double `match-room.test.ts` uses
 * for its own tests that never take the auth path. Seating goes through
 * `onJoin` with a pre-resolved `client.auth`, which is exactly the shape
 * `onAuth` returns.
 */
const AUTH: MatchRoomAuthOptions = {
  verifier: { verify: () => Promise.resolve(undefined) },
  repository: createStaticTenantRepository([]),
  replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }),
  joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
  allowedWidgetOrigins: [],
};

interface ViewMessage {
  readonly view: unknown;
  readonly legalActions: readonly { readonly type: string; readonly playerId: PlayerId }[];
  readonly outcome: unknown;
}

interface FakeSeat {
  readonly client: { sessionId: string; id: string; auth: { playerId: PlayerId }; send: (type: string, message?: unknown) => void };
  readonly sent: { type: string; message: unknown }[];
}

/**
 * `@colyseus/core`'s `Client` is deliberately NOT imported: only the two
 * transport packages may depend on colyseus (`.dependency-cruiser.cjs`'s
 * `no-colyseus-outside-transport`), and this app must not become the third.
 * `MatchRoom` reads exactly `sessionId`, `auth` and `send` off a client, so a
 * structural double covers the whole surface these tests touch.
 */
function fakeSeat(sessionId: string, playerId: PlayerId): FakeSeat {
  const sent: { type: string; message: unknown }[] = [];
  return {
    client: {
      sessionId,
      id: sessionId,
      auth: { playerId },
      send: (type, message) => {
        sent.push({ type, message });
      },
    },
    sent,
  };
}

function views(seat: FakeSeat): ViewMessage[] {
  return seat.sent.filter((entry) => entry.type === "view").map((entry) => entry.message as ViewMessage);
}

function latestView(seat: FakeSeat): ViewMessage {
  const all = views(seat);
  const last = all[all.length - 1];
  if (last === undefined) throw new Error("this seat has received no view at all");
  return last;
}

function rejections(seat: FakeSeat): { code: string; message: string }[] {
  return seat.sent.filter((entry) => entry.type === "action-rejected").map((entry) => entry.message as { code: string; message: string });
}

/**
 * Seats both players and returns while the match is still UNDEALT — the join
 * promise is handed back rather than awaited, because awaiting it is what
 * lets the deal's own microtask run. Everything the caller does before
 * `settle()` happens in the undealt window.
 */
function beforeTheDeal(gameId: string, config: unknown): { room: MatchRoom; seat0: FakeSeat; seat1: FakeSeat; settle: () => Promise<void> } {
  const room = new MatchRoom();
  room.onCreate({ gameId, config, registry: buildGameRegistry(), auth: AUTH, rng: RNG });
  const seat0 = fakeSeat("s0", P0);
  const seat1 = fakeSeat("s1", P1);
  // The first join settles with no match state at all (`createMatch` waits
  // for every seat), so it never schedules an advance to race with.
  void room.onJoin(seat0.client as never);
  const joined = room.onJoin(seat1.client as never);
  return {
    room,
    seat0,
    seat1,
    settle: async () => {
      await joined;
      // `onDispose` returns the room's own advance chain — the documented way
      // to let queued work finish and to disarm the turn timer.
      await room.onDispose();
    },
  };
}

/**
 * Seats both players and waits for the system's own deal to land, so the
 * assertions that follow are about a REAL hand the server dealt itself.
 *
 * Polled rather than awaited on a promise, because the room deliberately
 * exposes none: `advance()` is fire-and-forget from `onJoin` and `onDispose`
 * is the only handle on its chain, which would leave the room unusable
 * afterwards. Bounded, and it fails naming what it waited for — the same
 * discipline `transport-colyseus`'s own `waitForView` states.
 */
async function afterTheDeal(gameId: string, config: unknown): Promise<{ room: MatchRoom; seat0: FakeSeat; seat1: FakeSeat }> {
  const room = new MatchRoom();
  room.onCreate({ gameId, config, registry: buildGameRegistry(), auth: AUTH, rng: RNG });
  const seat0 = fakeSeat("s0", P0);
  const seat1 = fakeSeat("s1", P1);
  await room.onJoin(seat0.client as never);
  await room.onJoin(seat1.client as never);
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if ([seat0, seat1].some((seat) => views(seat).some((message) => message.legalActions.length > 0))) return { room, seat0, seat1 };
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`waited 5000ms for ${gameId}'s system deal to offer some seat a legal action, and it never did`);
}

/** Whichever seat the real deal put on the floor — read off the server's own
 * offer, never guessed from the rules. */
function seatOnTurn(seats: readonly FakeSeat[]): FakeSeat {
  const acting = seats.find((seat) => latestView(seat).legalActions.length > 0);
  if (acting === undefined) throw new Error("the deal left no seat with a legal action");
  return acting;
}

const ESCOBA_SUITS: readonly EscobaSuit[] = ["espada", "basto", "oro", "copa"];
const ESCOBA_RANKS: readonly EscobaRank[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
/** A deck in perfect order. The point is not this particular permutation but
 * that the SUBMITTER chose it: in escoba the deck order is every seat's hand,
 * the opening table, and the whole draw order behind them. */
const STACKED_DECK: readonly EscobaCard[] = ESCOBA_SUITS.flatMap((suit) => ESCOBA_RANKS.map((rank) => ({ suit, rank })));

/** The three best cards in truco (both matas and the seven of oro) for seat
 * 0, and three fours for seat 1. */
const STACKED_DEAL = [
  [
    { suit: "espada", rank: 1 },
    { suit: "basto", rank: 1 },
    { suit: "oro", rank: 7 },
  ],
  [
    { suit: "copa", rank: 4 },
    { suit: "espada", rank: 4 },
    { suit: "basto", rank: 4 },
  ],
];

describe("MatchRoom.handleAction — a seated player cannot submit an action the game never offered them", () => {
  it("truco: refuses a self-dealt start-hand submitted under the player's own id", async () => {
    const { room, seat0, seat1, settle } = beforeTheDeal("truco-argentino", { pointsToWin: 15 });

    // The premise, asserted rather than assumed: the game offers this seat no
    // `start-hand`, so nothing below is measuring a legitimate move. If a
    // future truco ever did offer one, this line says so first.
    const fresh = trucoModule.createMatch({ pointsToWin: 15 }, [
      { seat: 0, playerId: P0 },
      { seat: 1, playerId: P1 },
    ]);
    expect(trucoModule.getLegalActions(fresh, P0).some((action) => action.type === "start-hand")).toBe(false);

    room.handleAction(seat0.client as never, { type: "start-hand", playerId: P0, deal: STACKED_DEAL });

    expect(rejections(seat0).map((rejection) => rejection.code)).toEqual(["action-not-offered"]);
    // Nothing changed, so nobody was told anything changed: the opponent still
    // has only its own join view, never a second one carrying a dealt hand.
    expect(views(seat1)).toHaveLength(1);

    await settle();
  });

  it("escoba: refuses a self-chosen deck submitted under the player's own id", async () => {
    const { room, seat0, seat1, settle } = beforeTheDeal("escoba-de-15", {});

    const fresh = escobaModule.createMatch({}, [
      { seat: 0, playerId: P0 },
      { seat: 1, playerId: P1 },
    ]);
    expect(escobaModule.getLegalActions(fresh, P0).some((action) => action.type === "start-hand")).toBe(false);

    room.handleAction(seat0.client as never, { type: "start-hand", playerId: P0, deck: STACKED_DECK });

    expect(rejections(seat0).map((rejection) => rejection.code)).toEqual(["action-not-offered"]);
    expect(views(seat1)).toHaveLength(1);

    await settle();
  });

  it("truco: a start-hand claiming the system actor is still refused by the seat check, which runs first and is unchanged", async () => {
    const { room, seat0, settle } = beforeTheDeal("truco-argentino", { pointsToWin: 15 });

    room.handleAction(seat0.client as never, { type: "start-hand", playerId: "__system__", deal: STACKED_DEAL });

    expect(rejections(seat0).map((rejection) => rejection.code)).toEqual(["actor-mismatch"]);

    await settle();
  });
});

describe("MatchRoom.handleAction — the legality gate admits ordinary play, it does not merely refuse", () => {
  it("truco: the system still deals on its own, and what it deals is what the seat may then play", async () => {
    const { room, seat0, seat1 } = await afterTheDeal("truco-argentino", { pointsToWin: 15 });

    const acting = seatOnTurn([seat0, seat1]);
    expect(latestView(acting).legalActions.some((action) => action.type === "start-hand")).toBe(false);
    expect(rejections(seat0)).toEqual([]);
    expect(rejections(seat1)).toEqual([]);

    await room.onDispose();
  });

  it("truco: an action the server itself offered is applied, and moves the table on", async () => {
    const { room, seat0, seat1 } = await afterTheDeal("truco-argentino", { pointsToWin: 15 });

    const acting = seatOnTurn([seat0, seat1]);
    // Submitted back VERBATIM, exactly as `truco-ui` does — it dispatches the
    // offer object itself rather than a reconstruction.
    const offer = latestView(acting).legalActions[0]!;
    const viewsBefore = views(acting).length;

    await room.handleAction(acting.client as never, offer);

    expect(rejections(acting)).toEqual([]);
    expect(views(acting).length).toBeGreaterThan(viewsBefore);

    await room.onDispose();
  });

  it("escoba: a play-card carrying the offer's own captured subset is applied — the canonical order the engine emits is the one the widget sends back", async () => {
    const { room, seat0, seat1 } = await afterTheDeal("escoba-de-15", {});

    const acting = seatOnTurn([seat0, seat1]);
    const offer = latestView(acting).legalActions[0]!;
    expect(offer.type).toBe("play-card");
    const viewsBefore = views(acting).length;

    await room.handleAction(acting.client as never, offer);

    expect(rejections(acting)).toEqual([]);
    expect(views(acting).length).toBeGreaterThan(viewsBefore);

    await room.onDispose();
  });

  /**
   * THE WIDGET DOES NOT ALWAYS ECHO THE OFFER, and the one game where that
   * matters most has no browser spec to catch it.
   *
   * `truco-ui` and `mahjong-solitaire-ui` dispatch the offer object itself,
   * and `pnpm test:e2e` drives both through a real browser. Escoba's widget
   * REBUILDS its action instead — `{ type, playerId, card, captured }`, with
   * `card` taken from the view's own hand and only `captured` coming off the
   * offer (`apps/widget-app/src/game-ui-registry.ts`) — and escoba has no
   * e2e spec at all. A structural gate is exactly the kind of change that
   * could refuse a rebuild while every verbatim echo sailed through, so the
   * rebuild is reconstructed here, field for field, rather than assumed
   * equivalent.
   */
  it("escoba: the widget's REBUILT play-card is admitted too, not only the offer echoed back", async () => {
    const { room, seat0, seat1 } = await afterTheDeal("escoba-de-15", {});

    const acting = seatOnTurn([seat0, seat1]);
    const offer = latestView(acting).legalActions[0] as unknown as { readonly type: string; readonly playerId: PlayerId; readonly card: EscobaCard; readonly captured: readonly EscobaCard[] };
    const self = (latestView(acting).view as { self: { playerId: PlayerId; hand: readonly EscobaCard[] } }).self;
    // The card as the HAND carries it, not as the offer does — the same
    // object identity the widget reaches for.
    const handCard = self.hand.find((card) => card.suit === offer.card.suit && card.rank === offer.card.rank)!;
    const viewsBefore = views(acting).length;

    await room.handleAction(acting.client as never, { type: "play-card", playerId: self.playerId, card: handCard, captured: offer.captured });

    expect(rejections(acting)).toEqual([]);
    expect(views(acting).length).toBeGreaterThan(viewsBefore);

    await room.onDispose();
  });
});
