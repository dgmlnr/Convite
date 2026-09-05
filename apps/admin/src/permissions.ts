/**
 * The permission taxonomy (design §6.1, spec Domain K) — SEVEN members,
 * every one write-oriented.
 *
 * A `const` array, not a bare union type, because THREE consumers need it as
 * a VALUE, not merely a compile-time shape: the bootstrap CLI (slice 8a/11)
 * grants every member by ITERATING it rather than a hand-copied list, so a
 * permission added later is granted at bootstrap automatically (spec
 * assumption 5, made structural); the grant/revoke endpoint (slice 12)
 * validates an incoming permission string against membership, refusing mass
 * assignment of an invented string; and `routing.coverage.test.ts` (task
 * 7.7) asserts CLOSURE in both directions against the route table — every
 * permission a route names is a member here, and every member here is named
 * by at least one route. A union type alone cannot be iterated, validated
 * against at runtime, or enumerated by a coverage test.
 *
 * DELIBERATELY NO READ-ONLY PERMISSION. This is a maintainer decision taken
 * knowingly (decisions #3684), not an oversight to "helpfully" patch: an
 * operator cannot be granted read-only visibility into the tenant list today
 * (design §19's own open question, accepted as non-blocking). Permissions
 * are DATA — widening this array later is one migration and two table rows,
 * not a code change — and a read-only tier is deferred to arrive alongside a
 * planned reports module, rather than bolted onto this panel ahead of any
 * requirement for it. `permissions.test.ts` pins the count at seven so an
 * eighth member cannot slip in silently as a side effect of some other edit.
 */
export const PERMISSIONS = [
  "tenant.create",
  "tenant.origins.edit",
  "tenant.games.edit",
  "tenant.window.edit",
  "tenant.embed-key.rotate",
  "operators.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
