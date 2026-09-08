import { describe, expect, it } from "vitest";

import { MINT_GAME_IDS } from "../apps/mint-server/src/registry.js";
import { MATCH_GAME_IDS } from "../apps/server/src/registry.js";

/**
 * THE TWO COMPOSITION ROOTS HAVE TO NAME THE SAME GAMES, and until this file
 * existed nothing in the repository checked that they did.
 *
 * Each root already carries a fence over its OWN list — `apps/server`'s
 * `MATCH_GAME_IDS` resolved through `registry.get`, `apps/mint-server`'s
 * `MINT_GAME_IDS` through `buildCatalog`. MEASURED BEFORE THIS FILE WAS
 * WRITTEN, never assumed: both of them stay green when a game is registered on
 * exactly one root. They cannot do otherwise. Each list is DERIVED from that
 * root's own registration array (tenant-administration slice 3b did that
 * precisely so a hand-maintained second list could not drift from it), so a
 * list and its own registry are structurally incapable of disagreeing — and
 * that is the only disagreement either fence is able to see.
 *
 * The disagreement neither can see is the one BETWEEN the roots, and it is the
 * one with teeth. It has two directions, they fail differently, and that is why
 * they are two tests below rather than one set comparison:
 *
 *   * MINT knows the game, MATCH does not. `scripts/dev-stack.mjs` seeds the
 *     dev tenant's `entitledGames` straight from `MINT_GAME_IDS`, and `/embed`
 *     builds its catalog from that same list. So the game is offered, a player
 *     picks it, `onAuth` admits the entitlement — and `MatchRoom` then looks the
 *     module up and finds nothing. The catalog advertises a table the match
 *     server cannot set.
 *   * MATCH knows the game, MINT does not. Nothing ever offers it and nobody
 *     can be entitled to it, so it is code that ships and can never run. Not a
 *     hypothetical: that is exactly what Generala was for seventeen slices — an
 *     engine, a module, three bot tiers and a whole widget, reachable from no
 *     runtime path at all.
 *
 * ORDER IS DELIBERATELY NOT COMPARED. The mint root's own fence already pins
 * its catalog to `MINT_GAME_IDS`' order, because that IS the order a player
 * sees; the match root has no order at all, it resolves by id. A shelf
 * rearranged on one side is a presentation decision, not two roots disagreeing
 * about which games exist, and a fence that reddened for it would teach
 * somebody to stop reading it.
 *
 * WHY THIS LIVES IN `scripts/` AND NOT ON EITHER ROOT. Hosting it on one root
 * means that root importing the other: a `workspace:*` dependency, a project
 * reference, and an `exports` entry on an application that deliberately has
 * none — all three added to hold a test. Nothing would refuse that edge, since
 * `apps/**` is globbed out of every layer rule on purpose
 * (`dependency-cruiser-layer-coverage.test.ts`: apps are the top
 * composition-root tier), which is exactly why `no-admin-internals-outside-admin`
 * had to be hand-written for the one app where somebody had already thought
 * about it. The edge would be unforbidden and still wrong.
 * `composition-root-least-privilege.test.ts` beside this file reached the same
 * conclusion for the same reason and is the precedent: an invariant spanning
 * both roots belongs to neither of them.
 *
 * This one is stronger than that precedent. It imports the roots' real exported
 * lists and compares values; the older fence scans source text because what it
 * needs to see is a symbol's ABSENCE, which no import can show it.
 */
describe("the two composition roots agree on which games exist", () => {
  it("fence setup: neither root's list is empty, so neither comparison below can pass vacuously", () => {
    expect(MATCH_GAME_IDS.length).toBeGreaterThan(0);
    expect(MINT_GAME_IDS.length).toBeGreaterThan(0);
  });

  it("every game the catalog can offer, the match root can actually run", () => {
    // Named individually rather than counted, so a failure says WHICH game a
    // player would be handed a room for and never get one.
    expect(MINT_GAME_IDS.filter((gameId) => !MATCH_GAME_IDS.includes(gameId))).toEqual([]);
  });

  it("every game the match root registers is reachable through the catalog", () => {
    expect(MATCH_GAME_IDS.filter((gameId) => !MINT_GAME_IDS.includes(gameId))).toEqual([]);
  });
});
