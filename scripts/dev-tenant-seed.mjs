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
 * `validUntil` is set far in the future (slice 5, task 5.10a, closing the gap
 * PR4d's own docstring flagged): migration 002 gives `tenants.valid_until` a
 * column, and "zero window configured = inactive" (design §1.3) is real
 * enforcement from slice 6 onward — omitting it here would make the freshly
 * seeded dev tenant existent but permanently refused at mint time. `now` is
 * an explicit, injectable argument rather than a bare `Date.now()` call
 * inside this pure function, matching this repo's own `Clock`-injection
 * convention (`rate-limiter.ts`, `tenant-auth.ts`) so the ten-year offset
 * stays deterministically testable.
 */
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1_000;

/** The two loopback origins the mint role's retired `DEV_TENANT` fixture
 * used to ship, kept as the seed's own baseline so `pnpm dev:server` (served
 * from `localhost`) still works with no widening at all. */
const LOOPBACK_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

/**
 * @param {{ readonly id: string; readonly embedKey: string; readonly hostOrigin: string; readonly entitledGames: readonly string[]; readonly now?: number }} args
 * @returns {{ readonly id: string; readonly embedKey: string; readonly allowedOrigins: readonly string[]; readonly entitledGames: readonly string[]; readonly validUntil: number }}
 */
export function buildDevTenantSeed({ id, embedKey, hostOrigin, entitledGames, now = Date.now() }) {
  return {
    id,
    embedKey,
    // De-duplicated: at `localhost` the served origin IS one of the
    // loopback defaults, and a repeated entry in the stored row is noise an
    // operator inspecting it would have to stop and explain to themselves.
    allowedOrigins: [...new Set([hostOrigin, ...LOOPBACK_ORIGINS])],
    entitledGames: [...entitledGames],
    validUntil: now + TEN_YEARS_MS,
  };
}
