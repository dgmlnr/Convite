import { describe, expect, it } from "vitest";
import { createGameModuleRegistry } from "@hexdev/platform-core";
import type { GameFamilyId, GameId, GameModule, PlayerId } from "@hexdev/platform-contract";
import { buildCatalog } from "./catalog.js";

const TRUCO_ID = "truco-argentino" as GameId;
const OTHER_ID = "escoba-de-15" as GameId;

function fakeModule(id: GameId, gameFamily?: string): GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> {
  return {
    id,
    metadata: { seatCount: 2, displayNameKey: `games.${id}.name`, assetBase: `/games/${id}`, ...(gameFamily === undefined ? {} : { gameFamily: gameFamily as GameFamilyId }) },
    configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
    createMatch: () => ({}),
    applyAction: () => ({ ok: true, state: {} }),
    getLegalActions: () => [],
    getViewFor: () => ({}),
    getOutcome: () => null,
    serialize: () => null,
    deserialize: () => ({}),
    createBot: () => ({ chooseAction: () => ({ playerId: "bot" as PlayerId }) }),
  };
}

describe("buildCatalog (spec: tenant-catalog — server-enforced per-tenant game catalog)", () => {
  it("returns catalog entries only for entitled games registered in the registry", () => {
    const registry = createGameModuleRegistry([fakeModule(TRUCO_ID)]);
    const catalog = buildCatalog([TRUCO_ID], registry);
    expect(catalog).toEqual([
      {
        id: TRUCO_ID,
        gameFamily: TRUCO_ID, // sin declararla, la familia ES el id
        displayNameKey: "games.truco-argentino.name",
        seatCount: 2,
        configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
      },
    ]);
  });

  /* THE GROUPING KEY, and the whole reason it is explicit.
   *
   * Two catalog entries can be two ways to play ONE game — `truco-argentino`
   * and `truco-argentino-2v2` are separate matches to join but a single game
   * to choose. The lobby has to collapse them, and until now the only thing
   * tying them together was hand-maintained convention: duplicated hero art
   * literals, and a `.find()` in the UI registry that picked whichever
   * entry came first. That worked only because both copies were identical.
   *
   * DECLARED, NEVER DERIVED. Not `assetBase` (which happens to match today,
   * but means "where the assets live" — a different promise that would break
   * the grouping the day anyone honours it), and not a prefix of the id
   * (which is the same implicit convention wearing a regex). */
  it("carries the module's declared gameFamily, so two entries can name one game", () => {
    const registry = createGameModuleRegistry([fakeModule(TRUCO_ID, "truco"), fakeModule("truco-argentino-2v2" as GameId, "truco")]);
    const catalog = buildCatalog([TRUCO_ID, "truco-argentino-2v2" as GameId], registry);

    expect(catalog.map((entry) => entry.gameFamily), "both entries name the same family").toEqual(["truco", "truco"]);
    expect(new Set(catalog.map((entry) => entry.id)).size, "while staying two distinct things to join").toBe(2);
  });

  /* THE FALLBACK IS THE ID ITSELF, which is what makes the field optional on
   * the module side: 26 of this repo's 28 `GameMetadata` construction sites
   * are test fixtures, and a required field would have churned every one of
   * them to say something they do not care about. A game that declares no
   * family is its own family — the honest reading of "ungrouped" — so the
   * CLIENT never has to handle `undefined`. Optional going in, required
   * coming out. */
  it("falls back to the id when a module declares no family, so the client never sees undefined", () => {
    const registry = createGameModuleRegistry([fakeModule(OTHER_ID)]);
    const [entry] = buildCatalog([OTHER_ID], registry);

    expect(entry?.gameFamily, "an ungrouped game is a family of one, named after itself").toBe(OTHER_ID);
  });

  it("drops an entitled id that has no registered module, instead of throwing", () => {
    const registry = createGameModuleRegistry([fakeModule(TRUCO_ID)]);
    const catalog = buildCatalog([TRUCO_ID, OTHER_ID], registry);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.id).toBe(TRUCO_ID);
  });

  it("returns an empty catalog for a tenant with zero entitlements", () => {
    const registry = createGameModuleRegistry([fakeModule(TRUCO_ID)]);
    expect(buildCatalog([], registry)).toEqual([]);
  });
});
