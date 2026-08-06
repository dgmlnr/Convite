/**
 * DISCOVERED via a real end-to-end run (Playwright, two real localhost
 * origins — see apply-progress), not assumed: a browser's plain GET
 * navigation to a cross-origin URL — exactly what happens when the loader
 * sets a sandboxed iframe's `src` to `/embed?k=&o=` — does NOT carry an
 * `Origin` header at all. Only `Referer` does (and, per the default
 * `strict-origin-when-cross-origin` referrer policy every browser ships
 * with, `Referer` on a cross-origin request is trimmed to exactly the
 * origin — no path, no query string — which is precisely the shape this
 * needs). `mintSessionForEmbed`'s own origin allowlist check therefore
 * needs a REAL signal on the request that actually reaches it — the
 * "Origin/Referer" wording already present in design §7's own diagram
 * comment, which the original implementation only ever honored half of.
 */
export function refererOrigin(referer: string | undefined): string | undefined {
  if (referer === undefined) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
