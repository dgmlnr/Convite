import { describe, expect, it } from "vitest";
import { applyAction, createTeamMatch, getLegalActions, startHand } from "@hexdev/truco-engine";
import type { Action, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createGameModuleRegistry } from "@hexdev/platform-core";
import type { ApplyResult, BotStrategy, GameId, GameModule, SeatAssignment } from "@hexdev/platform-contract";
import { MATCH_GAME_IDS, buildGameRegistry } from "./registry.js";

/**
 * sdd-verify CRITICAL-3: `apps/server/src/index.ts`'s own `getConsultAsk`
 * registration had no fence — `match-room.consult.test.ts` builds its OWN
 * hand-authored registry (commented "same real registrations apps/server
 * wires"), which is a copy, not the composition root itself. This file
 * imports `buildGameRegistry` (renamed from `buildTrucoRegistry` in slice
 * L, see that function's own docstring), the EXACT function `index.ts` now
 * calls (registry.ts), so deleting either `getConsultAsk` registration line fails
 * this test rather than shipping silently — the identical class of gap
 * Slice 4b already closed one layer down in `game-ui-registry.ts`.
 */

const A = "srv-a" as PlayerId;
const B = "srv-b" as PlayerId;
const C = "srv-c" as PlayerId;
const D = "srv-d" as PlayerId;
const HAND_A = [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }] as const;
const HAND_B = [{ suit: "oro", rank: 4 }, { suit: "basto", rank: 4 }, { suit: "copa", rank: 4 }] as const;
const HAND_C = [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }] as const;
const HAND_D = [{ suit: "copa", rank: 6 }, { suit: "basto", rank: 2 }, { suit: "espada", rank: 11 }] as const;

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`fence setup: ${action.type} — ${result.violation}`);
  return result.state;
}

/** A real 2v2 pending truco call, built through the real reducer (same
 * fixture shape as `truco-module`'s own `consult-ask.test.ts`) — so a
 * non-null result can only come from a genuinely wired provider, never from
 * a hand-authored stand-in. */
function pendingCallState(): MatchState {
  let state = startHand(createTeamMatch({ seatOrder: [A, B, C, D], pointsToWin: 30, dealerSeat: 3 }), [HAND_A, HAND_B, HAND_C, HAND_D] as never);
  for (const seat of [A, B, C]) {
    const card = getLegalActions(state, seat).find((action) => action.type === "play-card")!;
    state = apply(state, card);
  }
  return apply(state, { type: "call-truco", playerId: D, level: "truco" });
}

describe("buildGameRegistry — the REAL composition root's own registration (sdd-verify CRITICAL-3)", () => {
  it("wires getConsultAsk on the 2v2 entry: a live teammate is named, not null", () => {
    const registry = buildGameRegistry();
    const state = pendingCallState();

    const ask = registry.getConsultAsk("truco-argentino-2v2", state, C);

    // `null` here would mean either "nobody to ask" or "no provider
    // registered" — this fixture rules out the first: A genuinely owes a
    // real respond-truco, fenced below the same way consult-ask.test.ts
    // fences its own equivalent setup.
    expect(getLegalActions(state, A).some((action) => action.type === "respond-truco"), "fence setup: A has a real respond-truco to answer").toBe(true);
    expect(ask, "null here means the getConsultAsk REGISTRATION itself is missing").not.toBeNull();
    expect(ask!.partnerId).toBe(A);
    expect(new Set(ask!.options)).toEqual(new Set(["quiero", "no-quiero"]));
  });
});

/**
 * Slice L.1: escoba's own registration on this SAME real composition-root
 * function — not a hand-copied stand-in. `requestEscobaSystemAction` firing
 * for real, through `registry.getSystemAction`, is the proof the object-form
 * entry is genuinely wired (mutation: deleting the entry would make this
 * `null`, same "registration itself is missing" failure mode the truco
 * fence above already documents).
 */
describe("buildGameRegistry — escoba's registration (slice L.1)", () => {
  const seats: readonly SeatAssignment[] = [
    { seat: 0, playerId: "escoba-srv-a" as PlayerId },
    { seat: 1, playerId: "escoba-srv-b" as PlayerId },
  ];

  it("wires requestEscobaSystemAction on the 1v1 entry: a real start-hand deal, not null", () => {
    const registry = buildGameRegistry();
    const module = registry.get("escoba-de-15");
    expect(module, "null here means the module itself is missing from the registry").toBeDefined();
    const fresh = module!.createMatch({}, seats);

    const action = registry.getSystemAction("escoba-de-15", fresh, () => 0.25);

    expect(action, "null here means the requestSystemAction REGISTRATION itself is missing").not.toBeNull();
    expect(JSON.parse(JSON.stringify(action)).type).toBe("start-hand");
  });

  it("wires requestEscobaSystemAction on the 2v2 entry too, under its own separate gameId", () => {
    const registry = buildGameRegistry();
    const seats4p: readonly SeatAssignment[] = [
      { seat: 0, playerId: "escoba-srv-0" as PlayerId },
      { seat: 1, playerId: "escoba-srv-1" as PlayerId },
      { seat: 2, playerId: "escoba-srv-2" as PlayerId },
      { seat: 3, playerId: "escoba-srv-3" as PlayerId },
    ];
    const module = registry.get("escoba-de-15-2v2");
    expect(module).toBeDefined();
    const fresh = module!.createMatch({}, seats4p);

    expect(registry.getSystemAction("escoba-de-15-2v2", fresh, () => 0.25)).not.toBeNull();
  });

  // design §D3 / slice J: escoba registers NO consult hooks at all — asserted
  // here on the REAL registry rather than assumed, so a future accidental
  // registration (e.g. copy-pasting truco's consult lines onto escoba's
  // entry) fails this test instead of shipping a channel escoba's own
  // engine has no surface for.
  it("registers NO consult hooks for escoba — no señas, no partner-consult mechanic (design §D3, slice J)", () => {
    const registry = buildGameRegistry();
    const fresh = registry.get("escoba-de-15")!.createMatch({}, seats);

    expect(registry.isNonBlockingAction("escoba-de-15", { type: "play-card" })).toBe(false);
    expect(registry.isHumanPriorityAction("escoba-de-15", { type: "play-card" })).toBe(false);
    expect(registry.isPaidQuestion("escoba-de-15", { type: "play-card" })).toBe(false);
    expect(registry.getConsultAsk("escoba-de-15", fresh, seats[0]!.playerId)).toBeNull();
  });
});

/**
 * Slice 9: the solitaire's own registration on this SAME real
 * composition-root function.
 *
 * TWO PAIRED MEMBERS, ONE ENTRY, AND EACH IS FENCED SEPARATELY, because
 * deleting either one is silent in a different way. Without
 * `requestSystemAction` the room admits the player and never lays a board;
 * without `getAbandonedSeatAction` a vacated seat is left to the transport's
 * bot-takeover default, which for a module that supplies no `createBot` at
 * all means the seat is simply never filled and the match never ends.
 * `platform-core`'s registry answers `null` for an unregistered provider —
 * "no opinion, do whatever you would have done" — so both failures are a
 * `null` that nothing else in this process would ever question.
 *
 * Rung 1, stated rather than assumed: the MODULE's own behaviour is fenced
 * in `mahjong-solitaire-module`'s tests, and re-asserting it here would
 * prove nothing about this file. What these two tests hold on their own is
 * that this registry reaches this module's providers BY GAME ID.
 */
describe("buildGameRegistry — the solitaire's registration (slice 9)", () => {
  const seats: readonly SeatAssignment[] = [{ seat: 0, playerId: "mahjong-srv-solo" as PlayerId }];

  it("wires requestMahjongSolitaireSystemAction: a real 144-tile deal, not null", () => {
    const registry = buildGameRegistry();
    const module = registry.get("mahjong-solitario");
    expect(module, "null here means the module itself is missing from the registry").toBeDefined();
    const fresh = module!.createMatch({}, seats);

    const action = registry.getSystemAction("mahjong-solitario", fresh, () => 0.25);

    expect(action, "null here means the requestSystemAction REGISTRATION itself is missing").not.toBeNull();
    const dealt = JSON.parse(JSON.stringify(action)) as { type: string; placements: readonly (string | null)[] };
    expect(dealt.type).toBe("deal-board");
    // Anti-vacuity (R6): a `deal-board` carrying an empty placement list
    // would satisfy the type assertion above and lay no board at all.
    expect(dealt.placements).toHaveLength(144);
  });

  it("wires getAbandonedSeatAction: the seat that was left names its own ending, not the transport's default", () => {
    const registry = buildGameRegistry();
    const fresh = registry.get("mahjong-solitario")!.createMatch({}, seats);

    const action = registry.getAbandonedSeatAction("mahjong-solitario", fresh, seats[0]!.playerId);

    expect(action, "null here means the getAbandonedSeatAction REGISTRATION itself is missing").not.toBeNull();
    expect(JSON.parse(JSON.stringify(action))).toEqual({ type: "abandon-board", playerId: "mahjong-srv-solo" });
  });

  // The registry is the only thing in this process that knows this game has
  // no bot, and nothing here registers a consult channel for it either — the
  // same assertion escoba's own entry carries, for the same reason: a future
  // copy-paste of truco's consult lines onto this entry would open a channel
  // a one-seat game has no second seat for.
  it("registers NO consult hooks and NO bot for the solitaire", () => {
    const registry = buildGameRegistry();
    const module = registry.get("mahjong-solitario")!;
    const fresh = module.createMatch({}, seats);

    expect(module.createBot, "a game with one seat has no opponent for a bot to be").toBeUndefined();
    expect(registry.isNonBlockingAction("mahjong-solitario", { type: "remove-pair" })).toBe(false);
    expect(registry.isHumanPriorityAction("mahjong-solitario", { type: "remove-pair" })).toBe(false);
    expect(registry.isPaidQuestion("mahjong-solitario", { type: "remove-pair" })).toBe(false);
    expect(registry.getConsultAsk("mahjong-solitario", fresh, seats[0]!.playerId)).toBeNull();
  });
});

/**
 * The match root's copy of the entitlement/module coherence fence that
 * `apps/mint-server/src/registry.test.ts` carries — same invariant, this
 * root's own registry.
 *
 * tenant-administration slice 3b UPDATE: entitlement no longer lives in
 * either role's own env-parsed config — it lives in Postgres. `MATCH_GAME_IDS`
 * (registry.ts) replaces `loadServerConfig(...).tenants[0].entitledGames`,
 * derived from the SAME registration list `buildGameRegistry` composes
 * with, so this is a construction-time regression fence (it can only fail
 * if `registry.get` itself stops resolving an id this list names), not a
 * RED-first proof — same standing this test already had before this slice.
 *
 * Resolved through `registry.get` rather than through `buildCatalog`,
 * because `registry.get` is what THIS root does with an entitled id:
 * `MatchRoom` looks the module up (`match-room.ts:312`) after `onAuth`
 * accepts the entitlement (`:406`). This role serves no catalog at all —
 * `/embed` moved to the mint role — so asserting through `buildCatalog`
 * here would prove a property of a function this composition root never
 * calls, and would pull `widget-frontdoor` in as a dependency purely to
 * host the assertion. The mint root's copy uses `buildCatalog` for the
 * mirror-image reason: building that catalog is the only thing its registry
 * exists for.
 */
describe("MATCH_GAME_IDS / buildGameRegistry — every id resolves to a module on THIS root", () => {
  it("registers a module for every game this role's registry lists", () => {
    const registry = buildGameRegistry();

    // Fence setup: an empty list would make the assertion below vacuously
    // true, which is how this class of test fails green.
    expect(MATCH_GAME_IDS.length, "fence setup: the list must not be empty").toBeGreaterThan(0);

    // An id in here is one `onAuth` would happily admit and `MatchRoom`
    // could then never run — the diff names it.
    expect(MATCH_GAME_IDS.filter((gameId) => registry.get(gameId) === undefined)).toEqual([]);
  });
});

/**
 * A one-seat module composes on THIS root, in the registration form this
 * root actually uses.
 *
 * `createGameModuleRegistry` threw at composition time for `seatCount: 1`
 * until this change, which is the single line that made a solitaire
 * unregisterable on either composition root. The bound itself is fenced
 * where it lives, in `platform-core/src/registry.test.ts`, together with the
 * values that are still refused (`0`, negatives, non-integers).
 *
 * DECLARED RATHER THAN DRESSED UP: both roots call that same shared
 * function, so a mutation to the bound reds this test, its
 * `apps/mint-server` twin and the platform-core case together. Neither root
 * copy is independent evidence of the bound (archive §6 rung 1). What this
 * one does hold on its own is the registration FORM this root uses: the
 * OBJECT form, with a paired `requestSystemAction`. That pairing is not
 * decoration here — a solitaire deals itself from a system action, the same
 * shape escoba's entry above already registers, so a one-seat module that
 * could register but not carry a dealer would be a one-seat module that can
 * never lay a board.
 */
describe("createGameModuleRegistry — the factory THIS root composes with admits a one-seat module in the object form", () => {
  const soloModule: GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> = {
    id: "fixture-solo",
    hiddenState: { kind: "nothing-is-hidden" },
    metadata: { seatCount: 1, displayNameKey: "fixture.solo.name", assetBase: "/fixture-solo" },
    configOptions: [],
    createMatch: () => ({}),
    applyAction: (): ApplyResult<unknown> => ({ ok: true, state: {} }),
    getLegalActions: () => [],
    getViewFor: () => ({}),
    getOutcome: () => null,
    serialize: () => ({}),
    deserialize: (json) => json,
    createBot: (): BotStrategy<unknown, { readonly playerId: PlayerId }> => ({ chooseAction: () => ({ playerId: "fixture-solo-actor" as PlayerId }) }),
  };

  it("registers a one-seat module paired with its own dealer, resolves it by id, and fires that dealer", () => {
    const registry = createGameModuleRegistry([{ module: soloModule, requestSystemAction: () => ({ playerId: "fixture-solo-dealer" as PlayerId }) }]);

    expect(registry.get("fixture-solo")).toBe(soloModule);
    // `null` here would mean the pairing was dropped, the same "the
    // REGISTRATION itself is missing" failure mode escoba's fence above
    // documents.
    expect(registry.getSystemAction("fixture-solo", {}, () => 0.25)).toEqual({ playerId: "fixture-solo-dealer" });
  });
});

/**
 * Slice 18: Generala's own registration on this SAME real composition-root
 * function — the first entry in this list with an opinion about its own
 * PACING.
 *
 * THREE THINGS ARE FENCED SEPARATELY BECAUSE EACH IS SILENT IN ITS OWN WAY.
 *
 * Without the module the game is unreachable, which is what it was for
 * seventeen slices. Without `requestSystemAction` the room seats both players
 * in front of a cup nobody can shake: every Generala turn begins in
 * `awaiting-roll`, a phase where NO seat has a legal action, so the first thing
 * that has to happen in a match is a system action — and this registration is
 * the only thing that supplies one. That is the same pairing escoba's and the
 * solitaire's entries above already carry, for the same reason.
 *
 * The third is the one nothing else in this repository would notice, because
 * nothing about it is incorrect. Without `systemActionPauseMs` the entry
 * composes, plays exactly by the rules, and waits the room's 1800ms before
 * EVERY roll — 66 of them in a full match. The game would be right and
 * unplayable, and every assertion about it would still pass.
 *
 * Rung 1, stated rather than assumed: the MODULE's own behaviour is fenced in
 * `generala-module`'s tests, and re-asserting it here would prove nothing about
 * this file. What these tests hold on their own is that THIS registry reaches
 * THIS module's requester by game id, and that the pause travelled with it.
 */
/**
 * Every game id whose own registration declares `systemActionPauseMs` —
 * named explicitly rather than derived from the registry itself, so a test
 * reading this constant states its own exclusion list in plain sight instead
 * of asking the very registry under test which ids to skip.
 */
const GAMES_WITH_OWN_PAUSE: ReadonlySet<GameId> = new Set(["generala", "mentiroso-2", "mentiroso-4", "mentiroso-6"]);

describe("buildGameRegistry — Generala's registration (slice 18)", () => {
  const seats: readonly SeatAssignment[] = [
    { seat: 0, playerId: "generala-srv-a" as PlayerId },
    { seat: 1, playerId: "generala-srv-b" as PlayerId },
  ];

  it("wires requestGeneralaSystemAction: a real opening throw of five faces, not null", () => {
    const registry = buildGameRegistry();
    const module = registry.get("generala");
    expect(module, "null here means the module itself is missing from the registry").toBeDefined();
    const fresh = module!.createMatch({}, seats);

    const action = registry.getSystemAction("generala", fresh, () => 0.25);

    expect(action, "null here means the requestSystemAction REGISTRATION itself is missing").not.toBeNull();
    const thrown = JSON.parse(JSON.stringify(action)) as { type: string; faces: readonly number[] };
    expect(thrown.type).toBe("roll-dice");
    // Anti-vacuity (R6): a `roll-dice` carrying no faces would satisfy the
    // type assertion above and put nothing in the tray.
    expect(thrown.faces).toHaveLength(5);
  });

  it("declares its own 350ms beat — the room's 1800ms is a card game's, and this game pays it once per ROLL", () => {
    expect(buildGameRegistry().getSystemActionPauseMs("generala")).toBe(350);
  });

  /**
   * THE CASE THAT TELLS A LOOKUP FROM A `[0]`, and the regression this whole
   * seam exists to avoid. Generala USED to be the only entry here declaring a
   * pause, so "answered for generala" and "answered from whichever entry
   * declared one" were the same observation until some OTHER game was asked.
   * Every game with NO opinion must still read `undefined` — "no opinion" —
   * because that is what keeps their 1800ms beat, and an accessor answering a
   * declared value for all of them would speed up games nobody asked to speed
   * up.
   *
   * SDD `mentiroso`, task 6.1: mentiroso's own three registrations ALSO
   * declare a pause (design D6, 1200ms) — a second real opinion, not a second
   * accident. Excluding only `"generala"` here would either red this test for
   * the wrong reason the moment mentiroso registers, or — worse — get "fixed"
   * by relaxing the assertion instead of naming the games that legitimately
   * own one. `GAMES_WITH_OWN_PAUSE` (below) names every game with an opinion
   * explicitly, so this fence keeps testing "every game WITHOUT one still
   * reads undefined" rather than quietly narrowing to "every game except the
   * ones this test happens to know about".
   */
  it("leaves every other game on this root at the room's own beat, undefined and unopinionated", () => {
    const registry = buildGameRegistry();
    const others = MATCH_GAME_IDS.filter((gameId) => !GAMES_WITH_OWN_PAUSE.has(gameId));

    // Fence setup: read off the real list, so this cannot pass by iterating
    // over nothing the day the registration list changes shape. Five real
    // games remain excluded only "generala" plus mentiroso's own three ids —
    // never zero, which is what would make this comparison vacuous.
    expect(others.length, "fence setup: some other game has to exist to be asked about").toBeGreaterThan(0);
    for (const gameId of others) {
      expect(registry.getSystemActionPauseMs(gameId), `${gameId} must keep the room's handEndPauseMs`).toBeUndefined();
    }
  });

  // The same assertion escoba's and the solitaire's entries carry, for the same
  // reason: a future copy-paste of truco's consult lines onto this entry would
  // open a channel `generala-module` has no surface for — it registers no
  // consult provider, and its tier signature declares no `answer` at all.
  it("registers NO consult hooks for Generala — there is nothing to ask a partner about", () => {
    const registry = buildGameRegistry();
    const fresh = registry.get("generala")!.createMatch({}, seats);

    expect(registry.isNonBlockingAction("generala", { type: "hold" })).toBe(false);
    expect(registry.isHumanPriorityAction("generala", { type: "hold" })).toBe(false);
    expect(registry.isPaidQuestion("generala", { type: "hold" })).toBe(false);
    expect(registry.getConsultAsk("generala", fresh, seats[0]!.playerId)).toBeNull();
  });
});

/**
 * SDD `mentiroso`, task 6.1 — the composition root's own three registrations,
 * mirrored against Generala's own tests above: rung 1 is the MODULE's own
 * behaviour (fenced in `mentiroso-module`'s own tests, not re-asserted here);
 * what these tests hold on their own is that THIS registry reaches THIS
 * module's requester by game id, and that the pause (design D6) travelled
 * with all three.
 */
describe("buildGameRegistry — Mentiroso's three registrations (task 6.1)", () => {
  const twoSeats: readonly SeatAssignment[] = [
    { seat: 0, playerId: "mentiroso-srv-a" as PlayerId },
    { seat: 1, playerId: "mentiroso-srv-b" as PlayerId },
  ];

  it("wires requestMentirosoSystemAction on mentiroso-2: a real opening draw, not null", () => {
    const registry = buildGameRegistry();
    const module = registry.get("mentiroso-2" as GameId);
    expect(module, "null here means the module itself is missing from the registry").toBeDefined();
    const fresh = module!.createMatch({}, twoSeats);

    const action = registry.getSystemAction("mentiroso-2" as GameId, fresh, () => 0.25);

    expect(action, "null here means the requestSystemAction REGISTRATION itself is missing").not.toBeNull();
    const drawn = JSON.parse(JSON.stringify(action)) as { type: string; faces: readonly number[] };
    expect(drawn.type).toBe("opening-draw-roll");
    // Anti-vacuity: a draw carrying no faces would satisfy the type
    // assertion above and roll nothing for either seat.
    expect(drawn.faces).toHaveLength(2);
  });

  it("wires the same requester on mentiroso-4 and mentiroso-6 too — one function, three ids, never a copy per registration", () => {
    const registry = buildGameRegistry();
    for (const [gameId, seatCount] of [
      ["mentiroso-4", 4],
      ["mentiroso-6", 6],
    ] as const) {
      const module = registry.get(gameId as GameId)!;
      const seats: readonly SeatAssignment[] = Array.from({ length: seatCount }, (_unused, seat) => ({ seat, playerId: `mentiroso-srv-${String(seat)}` as PlayerId }));
      const fresh = module.createMatch({}, seats);
      const action = registry.getSystemAction(gameId as GameId, fresh, () => 0.25);
      expect(action, `${gameId}: requestSystemAction registration is missing`).not.toBeNull();
      const drawn = JSON.parse(JSON.stringify(action)) as { type: string; faces: readonly number[] };
      expect(drawn.type).toBe("opening-draw-roll");
      expect(drawn.faces).toHaveLength(seatCount);
    }
  });

  it("declares the SAME 1200ms beat for all three registrations, design D6's measured (not estimated) value", () => {
    const registry = buildGameRegistry();
    expect(registry.getSystemActionPauseMs("mentiroso-2" as GameId)).toBe(1200);
    expect(registry.getSystemActionPauseMs("mentiroso-4" as GameId)).toBe(1200);
    expect(registry.getSystemActionPauseMs("mentiroso-6" as GameId)).toBe(1200);
  });

  it("registers NO consult hooks for Mentiroso — there is nothing to ask a partner about, on any of its three tables", () => {
    const registry = buildGameRegistry();
    const fresh = registry.get("mentiroso-2" as GameId)!.createMatch({}, twoSeats);

    for (const gameId of ["mentiroso-2", "mentiroso-4", "mentiroso-6"] as const) {
      expect(registry.isNonBlockingAction(gameId as GameId, { type: "doubt" })).toBe(false);
      expect(registry.isHumanPriorityAction(gameId as GameId, { type: "doubt" })).toBe(false);
      expect(registry.isPaidQuestion(gameId as GameId, { type: "doubt" })).toBe(false);
    }
    expect(registry.getConsultAsk("mentiroso-2" as GameId, fresh, twoSeats[0]!.playerId)).toBeNull();
  });
});
