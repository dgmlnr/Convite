import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, buildLogoutCookieHeader, buildSessionCookieHeader, generateSessionToken, hashSessionToken, parseSessionCookie } from "./session-cookie.js";

describe("buildSessionCookieHeader — design §11.2's full attribute table", () => {
  it("carries every mandated attribute, secure by default", () => {
    const header = buildSessionCookieHeader("the-raw-token", { secure: true });
    expect(header).toContain(`${SESSION_COOKIE_NAME}=the-raw-token`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Path=/");
    expect(header).toContain(`Max-Age=${String(SESSION_MAX_AGE_SECONDS)}`);
    expect(header).toContain("Secure");
    // Domain is deliberately ABSENT — a host-only cookie.
    expect(header).not.toMatch(/Domain=/i);
  });

  it("drops Secure only when explicitly told to — the HEXDEV_ALLOW_DEV_DEFAULTS escape hatch, never a silent default", () => {
    const header = buildSessionCookieHeader("the-raw-token", { secure: false });
    expect(header).not.toContain("Secure");
    // Still HttpOnly/SameSite/Path/Max-Age even without Secure.
    expect(header).toContain("HttpOnly");
  });

  it("Max-Age is exactly 28800 (8 hours), matching design §11.2's absolute lifetime", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(28_800);
  });
});

describe("buildLogoutCookieHeader — Max-Age=0, empty value (tasks 8b.7/8b.8)", () => {
  it("clears the cookie client-side", () => {
    const header = buildLogoutCookieHeader({ secure: true });
    expect(header).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(header).toContain("Max-Age=0");
  });
});

describe("generateSessionToken / hashSessionToken", () => {
  it("two generated tokens differ — genuinely random, not a fixed value", () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });

  it("decodes to exactly 32 bytes (design §11.2: crypto.randomBytes(32))", () => {
    const token = generateSessionToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("hashSessionToken is deterministic and produces a 64-char lowercase hex string (SHA-256)", () => {
    const token = generateSessionToken();
    const hashA = hashSessionToken(token);
    const hashB = hashSessionToken(token);
    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
  });

  it("distinct tokens hash to distinct values — the database never learns the raw token from its hash (design §3)", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(hashSessionToken(a)).not.toBe(hashSessionToken(b));
  });

  it("the hash never equals or contains the raw token — one-way, not merely encoded", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
  });
});

describe("parseSessionCookie", () => {
  it("extracts the session token from a single-cookie header", () => {
    expect(parseSessionCookie(`${SESSION_COOKIE_NAME}=abc123`)).toBe("abc123");
  });

  it("finds the session cookie among several, regardless of position", () => {
    expect(parseSessionCookie(`other=1; ${SESSION_COOKIE_NAME}=abc123; third=2`)).toBe("abc123");
  });

  it("returns undefined when the header is absent", () => {
    expect(parseSessionCookie(undefined)).toBeUndefined();
  });

  it("returns undefined when the header names other cookies but not this one", () => {
    expect(parseSessionCookie("other=1; third=2")).toBeUndefined();
  });

  it("returns undefined for an empty cookie value (a cleared cookie sent back)", () => {
    expect(parseSessionCookie(`${SESSION_COOKIE_NAME}=`)).toBeUndefined();
  });
});
