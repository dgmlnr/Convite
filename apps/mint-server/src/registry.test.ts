import { describe, expect, it } from "vitest";
import { buildCatalog } from "@hexdev/widget-frontdoor";
import { createGameModuleRegistry } from "@hexdev/platform-core";
import type { ApplyResult, BotStrategy, GameModule, PlayerId } from "@hexdev/platform-contract";
import { loadMintConfig } from "./config.js";
import { buildMintGameRegistry } from "./registry.js";

const KEY = "oUW9QPNCc-C-rkyKCakJbggyhW2quFy4Kv98Pyd7MeI";

/**
 * PRE-EXISTING DEFECT, closed here: `index.ts` registered only truco while
 * `config.ts`'s dev tenant is entitled to all four ids, and `buildCatalog`
 * DROPS an entitled id with no registered module without throwing
 * (`catalog.ts:29-31` — deliberate, and unchanged by this fence). So this
 * role served an `/embed` catalog with no escoba in it, quietly, while
 * `config.test.ts`'s "entitles the dev tenant to BOTH escoba ids" sat green:
 * a test guarding one half of an invariant whose other half nothing checked.
 *
 * WHAT IS FENCED is the invariant, not the registration: every id this
 * root's OWN tenants are entitled to must resolve to a module on this root.
 * That needs no new production surface — the drop is already observable
 * through the public API, because `buildCatalog` preserves order and adds
 * nothing, so its ids equal `entitledGames` exactly when none was dropped.
 *
 * Expressed through `buildCatalog` rather than `registry.get` because
 * building that catalog is the ONLY thing this role's registry exists for
 * (see `buildMintGameRegistry`'s own docstring on why the modules are
 * registered bare). The match root's copy of this fence in
 * `apps/server/src/registry.test.ts` resolves through `registry.get`
 * instead, which is the resolution THAT root actually performs
 * (`match-room.ts:312`, gated by `:406`'s entitlement check) — same
 * invariant, each root proven through its own real path.
 *
 * Deliberately its own copy per root, not a fixture shared with
 * `apps/server`: the two roots carry independently configured `DEV_TENANT`s
 * and independently built registries, so they can drift apart without either
 * one's fence noticing the other's breakage. That is the same argument
 * `config.test.ts:68-72` already makes for its own duplicated pair.
 */
describe("buildMintGameRegistry — every entitled id resolves to a module on THIS root", () => {
  it("serves a catalog containing every game the dev tenant is entitled to", () => {
    const entitled = loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY }).tenants[0]!.entitledGames;

    // Fence setup: an empty entitlement list would make the assertion below
    // vacuously true, which is how this class of test fails green.
    expect(entitled.length, "fence setup: the dev tenant must be entitled to something").toBeGreaterThan(0);

    const served = buildCatalog(entitled, buildMintGameRegistry()).map((entry) => entry.id);

    // A missing id here is a game this role advertises in its tenant config
    // and then silently omits from `/embed` — the diff names it.
    expect(served).toEqual([...entitled]);
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
