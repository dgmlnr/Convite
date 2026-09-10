import { describe, expect, it } from "vitest";
import type { ApplyResult, BotStrategy, GameModule, PlayerId } from "@hexdev/platform-contract";
import { createGameModuleRegistry } from "./registry.js";

function fixtureModule(id: string): GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> {
  return {
    id,
    hiddenState: { kind: "nothing-is-hidden" },
    metadata: { seatCount: 2, displayNameKey: "fixture.name", assetBase: "/fixture" },
    configOptions: [],
    createMatch: () => ({}),
    applyAction: (): ApplyResult<unknown> => ({ ok: true, state: {} }),
    getLegalActions: () => [],
    getViewFor: () => ({}),
    getOutcome: () => null,
    serialize: () => ({}),
    deserialize: (json) => json,
    createBot: (): BotStrategy<unknown, { readonly playerId: PlayerId }> => ({
      chooseAction: () => ({ playerId: "fixture-actor" as PlayerId }),
    }),
  };
}

describe("createGameModuleRegistry", () => {
  it("resolves a registered module by its id", () => {
    const module = fixtureModule("fixture-a");
    const registry = createGameModuleRegistry([module]);
    expect(registry.get("fixture-a")).toBe(module);
  });

  it("returns undefined for a gameId nothing registered", () => {
    const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
    expect(registry.get("does-not-exist")).toBeUndefined();
  });

  it("distinguishes between multiple registered games by id", () => {
    const a = fixtureModule("fixture-a");
    const b = fixtureModule("fixture-b");
    const registry = createGameModuleRegistry([a, b]);
    expect(registry.get("fixture-a")).toBe(a);
    expect(registry.get("fixture-b")).toBe(b);
  });

  it("still resolves a module registered as a bare GameModule (no system-action pairing)", () => {
    const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
    expect(registry.getSystemAction("fixture-a", {}, () => 0)).toBeNull();
  });

  it("returns null from getSystemAction for a gameId nothing registered", () => {
    const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
    expect(registry.getSystemAction("does-not-exist", {}, () => 0)).toBeNull();
  });

  it("resolves the module and pairs it with an optional requestSystemAction (design: never a platform-contract port member)", () => {
    const module = fixtureModule("fixture-a");
    const requestSystemAction = (state: unknown, rng: () => number) => ({ playerId: `${JSON.stringify(state)}:${rng()}` as PlayerId });
    const registry = createGameModuleRegistry([{ module, requestSystemAction }]);
    expect(registry.get("fixture-a")).toBe(module);
    expect(registry.getSystemAction("fixture-a", { turn: 1 }, () => 0.5)).toEqual({ playerId: '{"turn":1}:0.5' });
  });

  describe("isNonBlockingAction — paired with a module, never a platform-contract port member (same convention as requestSystemAction)", () => {
    it("defaults to false (every action blocks) for a bare GameModule registration with no classifier supplied", () => {
      const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
      expect(registry.isNonBlockingAction("fixture-a", { playerId: "p" as PlayerId })).toBe(false);
    });

    it("defaults to false for a gameId nothing registered", () => {
      const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
      expect(registry.isNonBlockingAction("does-not-exist", { playerId: "p" as PlayerId })).toBe(false);
    });

    it("delegates to the paired classifier when one is supplied", () => {
      const module = fixtureModule("fixture-a");
      const isNonBlockingAction = (action: unknown): boolean => (action as { type?: string }).type === "signal";
      const registry = createGameModuleRegistry([{ module, isNonBlockingAction }]);
      expect(registry.isNonBlockingAction("fixture-a", { playerId: "p" as PlayerId, type: "signal" })).toBe(true);
      expect(registry.isNonBlockingAction("fixture-a", { playerId: "p" as PlayerId, type: "play" })).toBe(false);
    });
  });

  /**
   * `metadata.seatCount` is consumed downstream by BOTH transports —
   * `MatchRoom.onCreate` sizes its seats from it, and `PresenceRoom` forms
   * matchmaking groups of it — so an invalid value would otherwise only
   * surface at runtime, as an unhandled rejection out of `onJoin` on EVERY
   * join attempt for that game. Fail loud at composition time instead,
   * naming the offending module (the same boot-guard discipline as
   * `PresenceRoom.onCreate`'s unknown-module throw).
   *
   * THE FLOOR IS 1, AND IT ALWAYS SHOULD HAVE BEEN. This block used to
   * assert that `seatCount: 1` throws, on a rationale — repeated verbatim in
   * the guard's own comment — that `MatchmakingPool.tryPairSeats` "rejects
   * any seatCount that is not an integer >= 2". It does not:
   * `presence.ts`'s `assertValidSeatCount` admits >= 1, and its docstring
   * explicitly retracts the older "0-or-1 is always a caller bug" wording,
   * because arity 1 is the degradation path's atomic claim of the head
   * waiter. The registry was refusing a group size the layer it cited
   * already accepts.
   *
   * A one-seat game has nobody to be paired with. That is a reason for it to
   * skip matchmaking, never a reason to refuse to register it.
   *
   * The old `seatCount: 1` rejection is REPLACED by the acceptance case
   * below, in the same block, rather than quietly deleted — the behaviour
   * change is the point of this diff and it should be readable in it. The
   * three genuinely impossible values keep one `it` each, so a mutation to
   * either half of the guard reds exactly the case it broke.
   */
  describe("metadata.seatCount is an integer >= 1, checked at registration rather than at first join", () => {
    function moduleWithSeatCount(seatCount: number): GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> {
      const module = fixtureModule("fixture-bad-seats");
      return { ...module, metadata: { ...module.metadata, seatCount } };
    }

    it("accepts a one-seat module and resolves it by id — the case this guard used to refuse", () => {
      const solo = moduleWithSeatCount(1);
      expect(createGameModuleRegistry([solo]).get("fixture-bad-seats")).toBe(solo);
    });

    it("throws for seatCount 0, naming the module id and the offending value", () => {
      expect(() => createGameModuleRegistry([moduleWithSeatCount(0)])).toThrowError(/fixture-bad-seats.*\b0\b/);
    });

    it("throws for a negative seatCount, naming the module id and the offending value", () => {
      expect(() => createGameModuleRegistry([moduleWithSeatCount(-1)])).toThrowError(/fixture-bad-seats.*-1/);
    });

    it("throws for a non-integer seatCount, naming the module id and the offending value", () => {
      expect(() => createGameModuleRegistry([moduleWithSeatCount(1.5)])).toThrowError(/fixture-bad-seats.*1\.5/);
    });

    it("validates the wrapped registration form ({ module, ... }) identically to a bare module", () => {
      expect(() => createGameModuleRegistry([{ module: moduleWithSeatCount(-1) }])).toThrowError(/fixture-bad-seats/);
    });

    it("accepts the usual group sizes unchanged: head-to-head (2) and a team game (4)", () => {
      const two = fixtureModule("fixture-two");
      const four = { ...fixtureModule("fixture-four"), metadata: { seatCount: 4, displayNameKey: "fixture.name", assetBase: "/fixture" } };
      expect(() => createGameModuleRegistry([two, four])).not.toThrow();
    });
  });

  /**
   * A section key lives on ENTRIES; a section groups FAMILIES. Nothing in the
   * type system stops two ways of playing one game from declaring different
   * shelves — `GameFamilyId` and `CatalogSectionId` are both `string`, and TS
   * cannot express "every element sharing field A shares field B" across a
   * heterogeneous array. So it is a composition-time throw, exactly like the
   * `seatCount` guard above and for the same reason: fail loud where the
   * modules are assembled, naming them, rather than at whatever screen first
   * notices the game appearing twice.
   *
   * NOT LEFT TO `buildCatalog`, which is where the sections reach a client.
   * That check is tenant-scoped, so a tenant entitled to only ONE of the two
   * straddling entries never sees the contradiction: green on the dev tenant,
   * broken on a customer's. Two build-authored facts contradicting each other
   * inside one binary is not the entitlement gap `/embed` deliberately
   * tolerates — no external party's data can produce it, and unlike a missing
   * module it has no correct degraded answer. The game appears twice, or one
   * declaration is discarded; every resolution is a lie.
   */
  describe("rejects a family straddling two sections — at registration, not at whatever screen notices it", () => {
    function grouped(id: string, gameFamily: string, section?: string): GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> {
      const module = fixtureModule(id);
      return { ...module, metadata: { ...module.metadata, gameFamily, ...(section === undefined ? {} : { section }) } };
    }

    it("throws naming the family, both modules and both sections, so the operator needs no debugger", () => {
      const compose = (): unknown => createGameModuleRegistry([grouped("a", "x", "cartas"), grouped("b", "x", "fichas")]);

      // Quoted, so `"a"` cannot be satisfied by the letter inside "family".
      for (const named of ["x", "a", "b", "cartas", "fichas"]) expect(compose, `the message has to name ${named}`).toThrowError(new RegExp(`"${named}"`));
    });

    /**
     * THE CASE A WEAKER FENCE MISSES, and the likeliest authoring slip: a
     * second way of playing a game added without repeating the section. A
     * fence comparing only DECLARED sections sees one declaration and agrees
     * with itself. This one compares NORMALIZED ones, so `b` resolves to its
     * family `"x"`, `"x"` is not `"cartas"`, and the two disagree.
     */
    it("throws when only ONE module of a family declares a section, because the other normalizes to its family", () => {
      const compose = (): unknown => createGameModuleRegistry([grouped("a", "x", "cartas"), grouped("b", "x")]);

      expect(compose).toThrowError(/"cartas"/);
      expect(compose, "and it names the section `b` was normalized INTO, which is the family itself").toThrowError(/"x"/);
    });

    it("accepts a family where nobody declares a section — today's four modules, unchanged", () => {
      expect(() => createGameModuleRegistry([grouped("a", "x"), grouped("b", "x")])).not.toThrow();
    });

    it("accepts distinct families on distinct shelves, which is the arrangement this whole tier is for", () => {
      expect(() => createGameModuleRegistry([grouped("truco-argentino", "truco", "cartas"), grouped("mahjong-solo", "mahjong", "fichas")])).not.toThrow();
    });

    /**
     * THE FAMILY THIS GUARD IS ABOUT TO MATTER FOR, pinned by name while it
     * still costs nothing.
     *
     * Generala declares `section: "dados"` — a shelf no other family sits on —
     * and it registers today as exactly ONE entry. One entry can never straddle
     * anything, so for this family the guard above is unreachable code until a
     * second id lands: `generala-3`, the additive registration `truco-module`'s
     * own 1v1/2v2 pair already models and which needs no engine change. That is
     * the whole reason to assert it NOW. The day somebody writes that entry the
     * question "does it have to repeat the section?" is answered by a test that
     * already fails, rather than by a boot that already failed.
     *
     * THE SECOND CASE IS A SHAPE NOTHING ABOVE COVERS. Every accepting case so
     * far has either nobody declaring a section (both entries normalize to
     * their own family) or two distinct families on two shelves. "Two entries
     * of ONE family, both declaring the same non-family section" is a third
     * shape, and it is the shape a shipped `generala-3` would actually have.
     */
    it("refuses a second Generala entry that forgets `dados`, naming the family, both ids and both resolved sections", () => {
      const compose = (): unknown => createGameModuleRegistry([grouped("generala", "generala", "dados"), grouped("generala-3", "generala")]);

      // Quoted, for the reason the first case in this block records.
      for (const named of ["generala", "generala-3", "dados"]) expect(compose, `the message has to name ${named}`).toThrowError(new RegExp(`"${named}"`));
      // And it names the shelf the silent entry was normalized INTO, which for
      // this family is the family's own name — the one thing a reader of the
      // message cannot work out for themselves.
      expect(compose, "the fallback section has to be named AS a section, not merely as the family").toThrowError(/section "generala"/);
    });

    it("accepts the pair once BOTH declare `dados` — one family, one shelf, two ways of playing it", () => {
      expect(() => createGameModuleRegistry([grouped("generala", "generala", "dados"), grouped("generala-3", "generala", "dados")])).not.toThrow();
    });
  });

  describe("getConsultAsk — paired with a module, mirrors ConsultAdviceProvider's fail-closed shape (design D7)", () => {
    it("returns null for a gameId nothing registered", () => {
      const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
      expect(registry.getConsultAsk("does-not-exist", {}, "p" as PlayerId)).toBeNull();
    });

    it("returns null for a bare GameModule registration — no getConsultAsk provider supplied", () => {
      const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
      expect(registry.getConsultAsk("fixture-a", {}, "p" as PlayerId)).toBeNull();
    });

    it("returns null when the paired provider itself has nobody to ask (a state with no teammate)", () => {
      const module = fixtureModule("fixture-a");
      const registry = createGameModuleRegistry([{ module, getConsultAsk: () => null }]);
      expect(registry.getConsultAsk("fixture-a", {}, "p" as PlayerId)).toBeNull();
    });

    it("delegates to the paired provider and returns its answer, forwarding the subject", () => {
      const module = fixtureModule("fixture-a");
      const seen: { about: string | undefined }[] = [];
      const getConsultAsk = (_state: unknown, _playerId: PlayerId, about?: string): { readonly partnerId: PlayerId; readonly options: readonly string[] } => {
        seen.push({ about });
        return { partnerId: "partner-x" as PlayerId, options: ["quiero", "no-quiero"] };
      };
      const registry = createGameModuleRegistry([{ module, getConsultAsk }]);
      expect(registry.getConsultAsk("fixture-a", { turn: 1 }, "p" as PlayerId, "envido")).toEqual({ partnerId: "partner-x", options: ["quiero", "no-quiero"] });
      expect(seen).toEqual([{ about: "envido" }]);
    });
  });

  /**
   * "A player walked away from this seat for good — what does that mean?" is a
   * RULES question, and this is where a game gets to answer it. The transport
   * asks; it never decides.
   *
   * The three fail-closed cases below are not filler: they are what makes the
   * answer OPTIONAL, and therefore what keeps every game that has no opinion
   * (truco, escoba: an absent player is replaced by a bot and the table plays
   * on) working with no registration change at all. They are also the positive
   * controls for the fourth — without them, "the provider's answer came back"
   * and "something came back" are the same observation.
   */
  describe("getAbandonedSeatAction — paired with a module, the same fail-closed shape as every other hook here", () => {
    const abandon = (_state: unknown, playerId: PlayerId) => ({ playerId });

    it("returns null for a gameId nothing registered", () => {
      const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
      expect(registry.getAbandonedSeatAction("does-not-exist", {}, "p" as PlayerId)).toBeNull();
    });

    it("returns null for a bare GameModule registration — no provider supplied, so a bot takeover stays the answer", () => {
      const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
      expect(registry.getAbandonedSeatAction("fixture-a", {}, "p" as PlayerId)).toBeNull();
    });

    it("returns null when the paired provider itself declines for this state", () => {
      const module = fixtureModule("fixture-a");
      const registry = createGameModuleRegistry([{ module, getAbandonedSeatAction: () => null }]);
      expect(registry.getAbandonedSeatAction("fixture-a", {}, "p" as PlayerId)).toBeNull();
    });

    /**
     * THE ONLY CASE THAT CAN TELL A LOOKUP FROM A `[0]`. Every other test here
     * registers exactly one module, so "found it by id" and "took the only
     * entry there is" are the same observation — measured: a version ignoring
     * its `gameId` and answering from the first registration passes all four
     * of them. Two modules, and the one being ASKED ABOUT is the one with no
     * provider.
     */
    it("answers for the game it was ASKED about, not for whichever registration happens to have a provider", () => {
      const registry = createGameModuleRegistry([{ module: fixtureModule("fixture-a"), getAbandonedSeatAction: abandon }, fixtureModule("fixture-b")]);
      expect(registry.getAbandonedSeatAction("fixture-b", {}, "p" as PlayerId)).toBeNull();
    });

    it("delegates to the paired provider, forwarding BOTH the state and the seat's own playerId", () => {
      const module = fixtureModule("fixture-a");
      const seen: { state: unknown; playerId: PlayerId }[] = [];
      const registry = createGameModuleRegistry([
        {
          module,
          getAbandonedSeatAction: (state: unknown, playerId: PlayerId) => {
            seen.push({ state, playerId });
            return abandon(state, playerId);
          },
        },
      ]);

      // Both arguments asserted, not just the return: a provider handed the
      // wrong seat would answer for whoever it was given, and a lookup that
      // ignores its arguments answers identically for every one of them.
      expect(registry.getAbandonedSeatAction("fixture-a", { turn: 1 }, "quien-se-fue" as PlayerId)).toEqual({ playerId: "quien-se-fue" });
      expect(seen).toEqual([{ state: { turn: 1 }, playerId: "quien-se-fue" }]);
    });
  });

  /**
   * How long the table sits still before a system action lands, declared by
   * the registration that asks for one — beside `requestSystemAction`,
   * because it is THAT requester's pacing. Not on `GameMetadata` (metadata is
   * what the catalog shows a player; this is transport-only) and not on the
   * `GameModule` port (this file's own header: a transport-only pairing
   * belongs on the registration).
   *
   * `undefined` AND `0` ARE DIFFERENT ANSWERS, and keeping them apart is the
   * whole point of this block. "No opinion — use the room's own beat" is what
   * truco, escoba and mahjong say by declaring nothing, and the room's beat is
   * a real 1800ms that exists for a reported reason: dealing again in the same
   * breath made the winning card vanish before anyone could read it. "0, do
   * not pause at all" is a different, deliberate declaration. A `?? 0` on the
   * accessor below would collapse the first into the second and strip that
   * 1800ms from every card game without touching one line of their
   * registrations — which is why the two `toBeUndefined()` cases here are
   * fences and not filler.
   *
   * A pause that is not an integer >= 0 can never be waited, so it is refused
   * where the modules are assembled, naming the module — the same fail-loud
   * discipline as the `seatCount` guard and the section straddle above.
   */
  describe("systemActionPauseMs — declared per registration, and `undefined` is not `0`", () => {
    function pacedBy(systemActionPauseMs: number) {
      return { module: fixtureModule("fixture-paced"), systemActionPauseMs };
    }

    it("returns undefined for a bare GameModule registration — no opinion, so the room keeps its own beat", () => {
      const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
      expect(registry.getSystemActionPauseMs("fixture-a")).toBeUndefined();
    });

    it("returns undefined for a wrapped registration that declares no pause — truco, escoba and mahjong's exact shape", () => {
      const registry = createGameModuleRegistry([{ module: fixtureModule("fixture-a"), requestSystemAction: () => null }]);
      expect(registry.getSystemActionPauseMs("fixture-a")).toBeUndefined();
    });

    it("returns undefined for a gameId nothing registered, the same fail-closed shape as every other lookup here", () => {
      const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
      expect(registry.getSystemActionPauseMs("does-not-exist")).toBeUndefined();
    });

    it("returns a declared 0 AS 0 — 'do not pause' is an answer, and it must never read back as 'no opinion'", () => {
      const registry = createGameModuleRegistry([pacedBy(0)]);
      expect(registry.getSystemActionPauseMs("fixture-paced")).toBe(0);
    });

    it("returns a declared value untouched", () => {
      const registry = createGameModuleRegistry([pacedBy(350)]);
      expect(registry.getSystemActionPauseMs("fixture-paced")).toBe(350);
    });

    /**
     * The `[0]` trap `getAbandonedSeatAction` above already documents: with a
     * single registration, "found it by id" and "took the only entry there is"
     * are the same observation. Two entries, and the one being ASKED about is
     * the one that declared nothing.
     */
    it("answers for the game it was ASKED about, not for whichever registration happens to declare a pause", () => {
      const registry = createGameModuleRegistry([pacedBy(350), fixtureModule("fixture-b")]);
      expect(registry.getSystemActionPauseMs("fixture-b")).toBeUndefined();
    });

    it("throws for a negative pause, naming the module id and the offending value", () => {
      expect(() => createGameModuleRegistry([pacedBy(-1)])).toThrowError(/fixture-paced.*-1/);
    });

    it("throws for a non-integer pause, naming the module id and the offending value", () => {
      expect(() => createGameModuleRegistry([pacedBy(1.5)])).toThrowError(/fixture-paced.*1\.5/);
    });

    /** The case a bare `< 0` check lets straight through: every comparison
     * against `NaN` is false, so a guard written as `if (pauseMs < 0) throw`
     * composes happily and then hands `setTimeout` a value it silently treats
     * as 0. `Number.isInteger` is what refuses it. */
    it("throws for NaN, which no comparison can catch", () => {
      expect(() => createGameModuleRegistry([pacedBy(Number.NaN)])).toThrowError(/fixture-paced.*NaN/);
    });
  });
});
