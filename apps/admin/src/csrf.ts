import { refererOrigin } from "@hexdev/widget-frontdoor";

/**
 * CSRF defence, second half (design §11.2, tasks 8b.5/8b.6). The FIRST half
 * is the cookie itself: `SameSite=Strict` (`session-cookie.ts`) already stops
 * a modern browser from attaching this app's session cookie to a
 * cross-site request at all. This check is defense-in-depth for a browser
 * that ignores `SameSite` (or a future admin route that, unlike login,
 * accepts a request bearing no cookie of ours to begin with) — the same
 * "belt and braces" posture `apps/mint-server/src/index.ts`'s own comment
 * on its Origin/Referer fallback describes.
 *
 * REUSES `refererOrigin` from `@hexdev/widget-frontdoor` (design §11.2's own
 * instruction) rather than re-deriving the identical six-line function:
 * a plain, no-JavaScript cross-origin `<form method="post">` submission — the
 * shape a CSRF attack actually takes — carries NO `Origin` header at all,
 * only `Referer`, trimmed to exactly the origin by the default
 * `strict-origin-when-cross-origin` referrer policy every browser ships
 * with. Without this fallback, a same-origin-only Origin check would be
 * blind to precisely the request shape it exists to catch.
 */
export function isSameOriginRequest(originHeader: string | undefined, refererHeader: string | undefined, selfOrigin: string): boolean {
  const origin = originHeader ?? refererOrigin(refererHeader);
  // FAILS CLOSED: neither header present is refused, never silently treated
  // as same-origin. A legitimate same-origin XHR/fetch from this app's own
  // login/logout forms always sends at least one of the two.
  return origin === selfOrigin;
}
