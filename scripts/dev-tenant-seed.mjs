/**
 * Pure construction of the dev-stack seed tenant's row values — extracted
 * out of `dev-stack.mjs` for testability (tenant-administration slice 3b),
 * the same "logic in a plain `.mjs`, wiring in the side-effecting caller"
 * split `browser-test-include.mjs`/`virtual-display.mjs` already use:
 * `dev-stack.mjs` itself has a top-level `await` and real subprocess/network
 * side effects the instant it runs, so nothing inside it is reachable from a
 * test.
 *
 * `entitledGames` is a REQUIRED argument, never computed here. The caller
 * (`dev-stack.mjs`) must pass `MINT_GAME_IDS` (`apps/mint-server/src/registry.ts`),
 * derived from the exact module list `buildMintGameRegistry()` itself is
 * built from — so this seed can never again show fewer games than the
 * server is actually ready to run, the drift the old, hand-copied
 * `DEV_TENANT.entitledGames` fixture (retired this slice) once rotted into.
 * This function stays a pure pass-through on purpose: it must never invent,
 * default, or hardcode a game list of its own, or it becomes exactly the
 * kind of second, independently-drifting fixture this change removes.
 *
 * `validUntil` is DELIBERATELY NOT set here yet. Design §1.3 requires a dev
 * seed to carry a far-future `validUntil` once the validity window exists,
 * but as of this slice neither the `tenants.valid_until` column (migration
 * 002, slice 5) nor its enforcement (slice 6) has landed — inserting it now
 * would be a write against a column that does not exist. Flagged here for
 * slice 5/6 to extend this function, not silently deferred.
 */

/** The two loopback origins the mint role's retired `DEV_TENANT` fixture
 * used to ship, kept as the seed's own baseline so `pnpm dev:server` (served
 * from `localhost`) still works with no widening at all. */
const LOOPBACK_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

/**
 * @param {{ readonly id: string; readonly embedKey: string; readonly hostOrigin: string; readonly entitledGames: readonly string[] }} args
 * @returns {{ readonly id: string; readonly embedKey: string; readonly allowedOrigins: readonly string[]; readonly entitledGames: readonly string[] }}
 */
export function buildDevTenantSeed({ id, embedKey, hostOrigin, entitledGames }) {
  return {
    id,
    embedKey,
    // De-duplicated: at `localhost` the served origin IS one of the
    // loopback defaults, and a repeated entry in the stored row is noise an
    // operator inspecting it would have to stop and explain to themselves.
    allowedOrigins: [...new Set([hostOrigin, ...LOOPBACK_ORIGINS])],
    entitledGames: [...entitledGames],
  };
}
