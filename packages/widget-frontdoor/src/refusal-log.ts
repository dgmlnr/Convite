/**
 * Structured log line for a refused mint/renew request (tenant-administration
 * slice 6, design §10/§1.9, spec Domain D's non-persistence requirement).
 *
 * WHY THIS EXISTS AS ITS OWN MODULE rather than a `console.warn` call inline
 * at each of `embed-handler.ts` and `session-renew-handler.ts`: design §2.4's
 * own instruction ("ONE implementation of the comparison, three call sites")
 * applies just as much to the LOG SHAPE as it does to the window comparison
 * itself — two independently-hand-rolled log lines could quietly diverge in
 * field names, and an operator grepping logs for one tenant's refusals would
 * have to know two formats instead of one.
 *
 * WHY `console.warn`, NEVER A DATABASE WRITE — the load-bearing property this
 * whole function exists to prove, not merely to state: `mint-server` and
 * `server` hold READ-ONLY Postgres credentials on purpose (decisions #3684
 * item 4). The operator's diagnostic question ("why isn't tenant X working?")
 * is answered elsewhere — a status DERIVED, on read, from the tenant record
 * itself through the injected `Clock` (design §1.9, `describeTenantStatus`,
 * `tenant-validity.ts`) — never from a stored trail of this traffic. Writing
 * this reason anywhere persistent would require granting these two roles
 * write access and would destroy the least-privilege split decision 4 rests
 * on. This function's only side effect is a line on stdout/stderr; it holds
 * no database handle and cannot be handed one without changing its signature.
 */
export function logTenantRefusal(endpoint: "embed" | "session-renew", reason: string, embedKey: string, origin: string): void {
  console.warn(JSON.stringify({ event: "tenant-refused", endpoint, reason, embedKey, origin, at: new Date().toISOString() }));
}
