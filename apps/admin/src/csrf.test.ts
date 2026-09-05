import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./csrf.js";

const SELF_ORIGIN = "http://localhost:2572";

/**
 * `isSameOriginRequest` (design §11.2's CSRF second half, tasks 8b.5/8b.6):
 * a real cross-origin `<form>` POST — no JavaScript, no CORS preflight, the
 * exact shape a `SameSite=Strict` cookie is defense-in-depth for on older
 * browsers — still carries the request's OWN origin evidence on the wire,
 * either as `Origin` or, once trimmed by the default
 * `strict-origin-when-cross-origin` referrer policy, as `Referer`. This
 * fence mirrors `apps/mint-server/src/index.ts`'s own
 * `req.headers.origin ?? refererOrigin(req.headers.referer)` line exactly.
 */
describe("isSameOriginRequest", () => {
  it("accepts a matching Origin header", () => {
    expect(isSameOriginRequest(SELF_ORIGIN, undefined, SELF_ORIGIN)).toBe(true);
  });

  it("refuses a foreign Origin header (task 8b.5: a POST with a foreign Origin is refused)", () => {
    expect(isSameOriginRequest("https://evil.example", undefined, SELF_ORIGIN)).toBe(false);
  });

  it("falls back to a same-origin Referer when Origin is absent — the plain cross-origin navigation case (no Origin header at all)", () => {
    expect(isSameOriginRequest(undefined, `${SELF_ORIGIN}/some/page`, SELF_ORIGIN)).toBe(true);
  });

  it("refuses a foreign Referer when Origin is absent", () => {
    expect(isSameOriginRequest(undefined, "https://evil.example/steal", SELF_ORIGIN)).toBe(false);
  });

  it("refuses when NEITHER Origin nor Referer is present — fails closed, never treats silence as same-origin", () => {
    expect(isSameOriginRequest(undefined, undefined, SELF_ORIGIN)).toBe(false);
  });

  it("Origin wins over a conflicting Referer when both are present", () => {
    expect(isSameOriginRequest(SELF_ORIGIN, "https://evil.example/page", SELF_ORIGIN)).toBe(true);
  });

  it("refuses a malformed Referer that cannot be parsed into an origin", () => {
    expect(isSameOriginRequest(undefined, "not a url at all", SELF_ORIGIN)).toBe(false);
  });
});
