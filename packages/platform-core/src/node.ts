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
 *
 * `createPostgresTenantAdminRepository` (PR5, tenant-administration slice 4)
 * is that write-side adapter arriving — same principle, same barrel, on the
 * same theory rather than a fresh per-adapter judgment call.
 *
 * `createPostgresOperatorRepository` (PR9, tenant-administration slice 8a)
 * joins for the identical reason: its own `pg` import is type-only, but
 * every Postgres-backed adapter lives behind this barrel on principle, so a
 * future consumer (`apps/admin`'s composition root, slice 8b) has one
 * settled place to import it from.
 *
 * `createPostgresOperatorSessionRepository` (PR10, tenant-administration
 * slice 8b) is that consumer arriving — `apps/admin`'s composition root now
 * imports THIS barrel for real, its first workspace dependency on
 * `@hexdev/platform-core` (this app's own `no-signing-seed.test.ts` fence
 * stays satisfied: nothing here is the Ed25519 issuer).
 *
 * `findOperatorAuthorizationContext` (PR11, tenant-administration slice 9)
 * is the authorization checkpoint's own one-query join (design §7) — same
 * placement principle, same barrel: its `Pool` parameter is type-only, but
 * every Postgres-touching function in this package lives behind `node.ts`
 * on principle, not case-by-case per import shape.
 */
export { connectRedis } from "./redis-client.js";
export { connectPostgres } from "./postgres-client.js";
export { createPostgresTenantRepository } from "./postgres-tenant-repository.js";
export { createPostgresTenantAdminRepository } from "./postgres-tenant-admin-repository.js";
export { createPostgresOperatorRepository } from "./postgres-operator-repository.js";
export { createPostgresOperatorSessionRepository } from "./postgres-operator-session-repository.js";
export { findOperatorAuthorizationContext } from "./postgres-operator-authorization.js";
// `disableOperator`/`enableOperator` (PR13, tenant-administration slice 11a,
// design §7/§8): standalone Postgres-bound functions, not port methods
// (`operator-repository.ts`'s own docstring explains why) — they take a real
// `Pool` directly, same placement principle as every adapter above.
export { disableOperator, enableOperator } from "./operator-lifecycle.js";
// `bootstrapOperator`/`resetOperatorPassword` (PR14, tenant-administration
// slice 11b, design §12): the bootstrap CLI's own two Postgres-bound
// operations — same "no port, no static double" placement as
// `operator-lifecycle.ts`'s own pair.
export { bootstrapOperator, resetOperatorPassword } from "./operator-bootstrap.js";
// `grantPermission`/`revokePermission` (PR15, tenant-administration slice
// 12, design §8's own advance note): standalone Postgres-bound functions,
// the identical placement principle as `disableOperator`/`enableOperator`
// above — `revokePermission` reuses THIS package's own
// `withLastAccountManagerGuard`, so it needs a real `Pool` and belongs
// behind this barrel exactly like its sibling pair.
export { grantPermission, revokePermission } from "./operator-permissions.js";
// `listOperatorsWithPermissions` (PR-16a, tenant-administration slice 16a,
// design §6.1): the operator directory both the operator list AND the
// permission matrix screens read from — same placement principle, same
// barrel: a plain `Pool` read, no port, no static double (see this
// function's own docstring for why).
export { listOperatorsWithPermissions } from "./operator-directory.js";
// `assertSchemaUpToDate` (sdd-verify's own finding 3, design Part A §4/
// Part B §15): `apps/admin`'s own boot-time schema-version READ — never a
// migration run, only `pnpm db:migrate` (the owner) may ever apply one.
// Lives behind this barrel for the same reason `runMigrations` itself does
// not sit on the public one: it takes a real `Pool`-shaped query function.
export { assertSchemaUpToDate } from "./postgres-migrations.js";
