/**
 * The Node-ONLY entry point of this package.
 *
 * WHY IT EXISTS, and why it is not just another line in `index.ts`.
 * `apps/widget-app` depends on `@hexdev/platform-core` and is bundled for a
 * BROWSER. Every Redis adapter in this package is careful to write
 * `import type { Redis } from "ioredis"` — a type-only import, erased at
 * build time — precisely so that a browser bundle never pulls a Node client
 * library in. `connectRedis` cannot do that: it calls `new Redis(...)`, so
 * its import is a VALUE import.
 *
 * Re-exporting it from the main barrel put ioredis inside the widget bundle
 * (103 modules and 285 kB became 170 and 441 kB), and the widget then failed
 * to mount at all — the iframe stayed hidden with no console error anyone
 * could act on. That regression shipped, and this split is the fix: anything
 * that reaches for a Node runtime lives behind this path, where a browser
 * build cannot reach it by accident.
 *
 * `.dependency-cruiser.cjs` enforces the same rule mechanically, so this
 * docstring is not the only thing standing between the invariant and the
 * next edit.
 *
 * `connectPostgres` joins it for the identical reason (design decision 1.5):
 * it is the ONE value import of `pg` in this package, and every adapter that
 * consumes the `Pool` it returns takes `import type { Pool } from "pg"` —
 * type-only, erased at build, never reaching a browser bundle.
 *
 * `createPostgresTenantRepository` joins it too, even though its own `pg`
 * import IS type-only and would not by itself put anything into the widget
 * bundle (design decision 1.4): every Postgres-backed adapter lives behind
 * this barrel on principle, not case-by-case per import shape, so a future
 * write-side adapter (PR5) has one settled place to land instead of a fresh
 * judgment call each time.
 */
export { connectRedis } from "./redis-client.js";
export { connectPostgres } from "./postgres-client.js";
export { createPostgresTenantRepository } from "./postgres-tenant-repository.js";
