/**
 * What this role answers for, as a pure decision.
 *
 * The mint role owns the widget's FRONT DOOR — everything a browser touches
 * before a game room exists: the embed page and the token it inlines, the
 * session renewal that token needs later, and the static assets the loader
 * and the widget bundle fetch. It deliberately does NOT answer for colyseus's
 * matchmaking surface; that belongs to the match role, and a deployment's
 * path routing is what separates them behind one public origin.
 *
 * Kept pure and separate from the server so `routing.test.ts` can pin every
 * path without binding a port. The failure this guards against is quiet: a
 * path this role should serve, falling through to 404, looks from the browser
 * exactly like the widget failing to mount with no error in the console at
 * all — the same shape as the baked-origin trap that once cost a full day.
 */
export type Route =
  | { readonly kind: "embed" }
  | { readonly kind: "session-renew" }
  | { readonly kind: "loader" }
  | { readonly kind: "widget-app" }
  | { readonly kind: "card-front"; readonly file: string }
  | { readonly kind: "not-found" };

const CARD_FRONT_PREFIX = "/assets/fronts/";

const NOT_FOUND: Route = { kind: "not-found" };

export function resolveRoute(method: string, pathname: string): Route {
  if (method === "GET") {
    if (pathname === "/embed") return { kind: "embed" };
    if (pathname === "/loader.js") return { kind: "loader" };
    if (pathname === "/assets/widget-app.js") return { kind: "widget-app" };
    if (pathname.startsWith(CARD_FRONT_PREFIX)) {
      const file = pathname.slice(CARD_FRONT_PREFIX.length);
      // Rejected HERE, not left to the asset reader: a route that cannot
      // express a traversal is a stronger guarantee than a reader that has
      // to remember to check for one. `%2F` is checked alongside `/` because
      // a caller may hand this function a raw, undecoded pathname.
      if (file === "" || file.includes("/") || file.includes("\\") || file.includes("..") || /%2f/i.test(file)) {
        return NOT_FOUND;
      }
      return { kind: "card-front", file };
    }
    return NOT_FOUND;
  }

  // POST and only POST: the renewal reads Origin/Referer evidence a browser
  // reliably sends on a POST and does not on a same-origin GET — the same
  // discovery `/embed`'s own Referer fallback rests on.
  if (method === "POST" && pathname === "/session/renew") return { kind: "session-renew" };

  return NOT_FOUND;
}
