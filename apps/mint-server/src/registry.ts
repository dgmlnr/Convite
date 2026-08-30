import { createGameModuleRegistry } from "@hexdev/platform-core";
import type { GameModuleRegistry } from "@hexdev/platform-core";
import { trucoModule, trucoModule2v2 } from "@hexdev/truco-module";
import { escobaModule, escobaModule2v2 } from "@hexdev/escoba-module";

/**
 * The MINTING role's own game registry — EXTRACTED from `index.ts` for the
 * same reason `apps/server/src/registry.ts` was extracted from its own
 * composition root: `index.ts` has a top-level `await` and calls
 * `createServer` at module scope, so importing it from a test boots an HTTP
 * server. Nothing could reach the registrations, and a missing one shipped
 * silently. Pulling them into a side-effect-free function is what lets
 * `registry.test.ts` call the EXACT function `index.ts` calls, rather than a
 * hand-copied stand-in — the "a copy, never the thing" gap that file's own
 * docstring records.
 *
 * Registered as BARE modules: this role reads only `metadata` and
 * `configOptions`, to build the tenant-scoped catalog `/embed` returns. The
 * bot-driving collaborators (`requestSystemAction`, `isNonBlockingAction`)
 * are the match role's concern and are deliberately absent — the registry
 * factory accepts either shape.
 *
 * Escoba's two entries were MISSING here while `config.ts`'s dev tenant was
 * already entitled to both ids, so `/embed` served a catalog without them:
 * `buildCatalog` drops an entitled id with no module and never throws. That
 * is what `registry.test.ts` now fences, on the invariant rather than on
 * these two lines — see its own docstring.
 */
export function buildMintGameRegistry(): GameModuleRegistry {
  return createGameModuleRegistry([trucoModule, trucoModule2v2, escobaModule, escobaModule2v2]);
}
