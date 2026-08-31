import { describe, expect, it } from "vitest";
import type { ApplyResult, BotStrategy, GameModule, PlayerId } from "@hexdev/platform-contract";
import { createGameModuleRegistry } from "./registry.js";

function fixtureModule(id: string): GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> {
  return {
    id,
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
});
