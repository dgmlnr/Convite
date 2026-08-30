import { describe, expect, it } from "vitest";
import { buildCatalog } from "@hexdev/widget-frontdoor";
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
