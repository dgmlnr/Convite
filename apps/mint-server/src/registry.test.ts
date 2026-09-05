import { describe, expect, it } from "vitest";
import { buildCatalog } from "@hexdev/widget-frontdoor";
import { createGameModuleRegistry } from "@hexdev/platform-core";
import type { ApplyResult, BotStrategy, GameModule, PlayerId } from "@hexdev/platform-contract";
import { MINT_GAME_IDS, buildMintGameRegistry } from "./registry.js";

/**
 * PRE-EXISTING DEFECT, closed here: `index.ts` registered only truco while
 * this role's dev tenant was entitled to all four ids, and `buildCatalog`
 * DROPS an entitled id with no registered module without throwing
 * (`catalog.ts:29-31` — deliberate, and unchanged by this fence). So this
 * role served an `/embed` catalog with no escoba in it, quietly.
 *
 * tenant-administration slice 3b UPDATE: entitlement no longer lives in this
 * role's own env-parsed config at all — it lives in Postgres, provisioned
 * independently (write port lands slice 4). `MINT_GAME_IDS` (registry.ts)
 * replaces `loadMintConfig(...).tenants[0].entitledGames` as this fence's
 * source, derived from the exact same module list `buildMintGameRegistry`
 * itself composes with, so the two structurally cannot drift apart — a
 * strictly stronger guarantee than the env-sourced version this replaces,
 * which is why this test is now a construction-time regression fence rather
 * than a RED-first proof: it can only fail if `buildCatalog` itself starts
 * dropping an id it used to serve.
 *
 * Expressed through `buildCatalog` rather than `registry.get` because
 * building that catalog is the ONLY thing this role's registry exists for
 * (see `buildMintGameRegistry`'s own docstring on why the modules are
 * registered bare). The match root's copy of this fence in
 * `apps/server/src/registry.test.ts` resolves through `registry.get`
 * instead, which is the resolution THAT root actually performs
 * (`match-room.ts:312`, gated by `:406`'s entitlement check) — same
 * invariant, each root proven through its own real path.
 */
describe("MINT_GAME_IDS / buildMintGameRegistry — every id resolves to a module on THIS root", () => {
  it("serves a catalog containing every game this role's registry knows how to run", () => {
    // Fence setup: an empty list would make the assertion below vacuously
    // true, which is how this class of test fails green.
    expect(MINT_GAME_IDS.length, "fence setup: the list must not be empty").toBeGreaterThan(0);

    const served = buildCatalog(MINT_GAME_IDS, buildMintGameRegistry()).map((entry) => entry.id);

    // A missing id here is a game this role's registry list names and
    // `/embed` then silently omits — the diff names it.
    expect(served).toEqual([...MINT_GAME_IDS]);
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
 * function, so a mutation to the bound reds this test, its `apps/server`
 * twin and the platform-core case together. Neither root copy is
 * independent evidence of the bound (archive §6 rung 1). What each one does
 * hold on its own is its own registration FORM — BARE here, because
 * `buildMintGameRegistry` registers bare modules and reads only `metadata`
 * and `configOptions`; the object form over on the match root, because that
 * is where a solitaire will have to pair its own dealer.
 */
describe("createGameModuleRegistry — the factory THIS root composes with admits a one-seat module, registered bare", () => {
  const soloModule: GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> = {
    id: "fixture-solo",
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

  it("registers a bare one-seat module and resolves it by id", () => {
    const registry = createGameModuleRegistry([soloModule]);
    expect(registry.get("fixture-solo")).toBe(soloModule);
  });
});
