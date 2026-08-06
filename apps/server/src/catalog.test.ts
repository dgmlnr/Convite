import { describe, expect, it } from "vitest";
import { createGameModuleRegistry } from "@hexdev/platform-core";
import type { GameId, GameModule, PlayerId } from "@hexdev/platform-contract";
import { buildCatalog } from "./catalog.js";

const TRUCO_ID = "truco-argentino" as GameId;
const OTHER_ID = "escoba-de-15" as GameId;

function fakeModule(id: GameId): GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> {
  return {
    id,
    metadata: { seatCount: 2, displayNameKey: `games.${id}.name`, assetBase: `/games/${id}` },
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
        displayNameKey: "games.truco-argentino.name",
        seatCount: 2,
        configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
      },
    ]);
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
