import { createGameModuleRegistry } from "@hexdev/platform-core";
import type { GameModuleRegistry } from "@hexdev/platform-core";
import type { GameId } from "@hexdev/platform-contract";
import { trucoModule, trucoModule2v2 } from "@hexdev/truco-module";
import { escobaModule, escobaModule2v2 } from "@hexdev/escoba-module";
import { mahjongSolitaireModule } from "@hexdev/mahjong-solitaire-module";

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
 *
 * THE SOLITAIRE JOINS BARE, and that is a decision rather than an omission.
 * The match root pairs it with `requestSystemAction` (it has to deal itself
 * a board) and with `getAbandonedSeatAction` (it has to say what a vacated
 * seat means, having no bot to hand it to). Neither is reachable from here:
 * this role never runs a match, never advances one, and never sees a seat
 * vacated — it reads `metadata` and `configOptions` to build a catalog.
 * Registering the pair here anyway would add two lines nothing in this
 * process can call and no test on this root can tell apart from their
 * absence, which is the shape the paragraph above already refuses for the
 * bot-driving collaborators.
 */
/** The exact module list `buildMintGameRegistry` composes with — pulled into
 * its own constant (tenant-administration slice 3b) so `MINT_GAME_IDS`
 * below can derive from the SAME array rather than authoring a second,
 * independently-maintained list of ids that could drift from it. */
const MINT_GAME_MODULES = [trucoModule, trucoModule2v2, escobaModule, escobaModule2v2, mahjongSolitaireModule];

export function buildMintGameRegistry(): GameModuleRegistry {
  return createGameModuleRegistry(MINT_GAME_MODULES);
}

/** Every game id this role's registry actually serves, derived from the
 * SAME module list `buildMintGameRegistry` registers above — never a
 * second, independently maintained list. `scripts/dev-stack.mjs` sources
 * its dev seed tenant's `entitledGames` from here (design §14), so the
 * demo it boots can never again show fewer games than the server is
 * actually ready to run — the exact drift the old, hand-copied
 * `DEV_TENANT.entitledGames` fixture (now retired) once rotted into. */
export const MINT_GAME_IDS: readonly GameId[] = MINT_GAME_MODULES.map((module) => module.id);
