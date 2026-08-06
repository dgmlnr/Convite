/**
 * `targetOrigin: "*"` is BANNED, both directions (apply prompt, design §6).
 * Sending to `*` leaks a message to whatever else is listening on the host
 * page; accepting without checking `event.origin` accepts from anyone.
 *
 * The ban is made STRUCTURAL, not a lint rule or a comment: `TargetOrigin`
 * is a nominal brand that only `parseTargetOrigin` can produce, and
 * `parseTargetOrigin("*")` throws. Every function in this package that sends
 * or checks a message (`safe-post-message.ts`) accepts a `TargetOrigin`, not
 * a raw `string` — so passing `"*"` (or any other unvalidated string) is a
 * compile error at the call site, not a runtime footgun a reviewer has to
 * catch by reading a diff.
 */
export type TargetOrigin = string & { readonly __brand: "TargetOrigin" };

// A browser origin is exactly `scheme://host[:port]` — no path, no query,
// no fragment, no trailing slash. This intentionally matches the shape of
// `window.location.origin` / `event.origin`, both of which never carry more
// than this.
const ORIGIN_PATTERN = /^https?:\/\/[^/?#\s]+$/;

/**
 * Parses and validates a candidate origin string into a `TargetOrigin`.
 * Throws — never returns a fallback or a sentinel — because every caller of
 * this function is about to make a security-relevant decision (who to send
 * to, who to accept from) and a silently-wrong origin is strictly worse
 * than a loud failure the loader can catch and report.
 */
export function parseTargetOrigin(candidate: string): TargetOrigin {
  if (candidate === "*") {
    throw new Error(
      'targetOrigin "*" is banned: it broadcasts a message to every listener on the host page, not just the intended peer.',
    );
  }
  if (!ORIGIN_PATTERN.test(candidate)) {
    throw new Error(`"${candidate}" is not a valid origin (expected "scheme://host[:port]", no path).`);
  }
  return candidate as TargetOrigin;
}
