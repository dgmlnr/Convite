import { describe, expect, it } from "vitest";
import { createSessionTokenVerifier } from "@hexdev/platform-core";
import { loadServerConfig } from "./config.js";

/** Every non-secret-focused test below needs the explicit dev opt-in — the
 * secret guard now fails loudly by default (hardening: public surface,
 * obs 2945), not only in `NODE_ENV=production`. */
const DEV_OPT_IN = { HEXDEV_ALLOW_DEV_DEFAULTS: "true" };

describe("loadServerConfig", () => {
  it("uses HEXDEV_SESSION_PUBLIC_KEY from the environment when present, even in production", () => {
    const config = loadServerConfig({ NODE_ENV: "production", HEXDEV_SESSION_PUBLIC_KEY: "a-real-public-key" });
    expect(config.sessionPublicKey).toBe("a-real-public-key");
  });

  it("defaults the port, falling back when PORT is unset", () => {
    expect(loadServerConfig(DEV_OPT_IN).port).toBeGreaterThan(0);
  });

  it("reads PORT from the environment when set", () => {
    expect(loadServerConfig({ ...DEV_OPT_IN, PORT: "4001" }).port).toBe(4001);
  });

  it("falls back to a single dev tenant when HEXDEV_TENANTS_JSON is unset", () => {
    const config = loadServerConfig(DEV_OPT_IN);
    expect(config.tenants.length).toBeGreaterThan(0);
    expect(config.tenants[0]?.entitledGames).toContain("truco-argentino");
  });

  /**
   * Slice L.2/L.3 — ONE test for THIS composition root, deliberately not a
   * fixture shared with `apps/mint-server`'s own `config.test.ts`: the two
   * roots are independently configured `DEV_TENANT`s, and mutation row 20
   * (below, `registry.entitled-games.mutation.test.ts` — see also this
   * file's own coverage) proves they can drift apart from each other without
   * either fence noticing the other's breakage.
   */
  it("entitles the dev tenant to BOTH escoba ids (slice L: the match role's own composition root)", () => {
    const config = loadServerConfig(DEV_OPT_IN);
    expect(config.tenants[0]?.entitledGames).toContain("escoba-de-15");
    expect(config.tenants[0]?.entitledGames).toContain("escoba-de-15-2v2");
  });

  it("parses tenant records from HEXDEV_TENANTS_JSON when set", () => {
    const tenants = [{ id: "t1", embedKey: "pk_x", allowedOrigins: ["https://a.example"], entitledGames: ["truco-argentino"] }];
    const config = loadServerConfig({ ...DEV_OPT_IN, HEXDEV_TENANTS_JSON: JSON.stringify(tenants) });
    expect(config.tenants).toEqual(tenants);
  });

  it("defaults the rate-limit setting for room join — the only surface this role still exposes", () => {
    const config = loadServerConfig(DEV_OPT_IN);
    expect(config.joinIpRateLimit.limit).toBeGreaterThan(0);
  });

  it("defaults allowedWidgetOrigins to this server's own dev origin (MatchRoom.onAuth's re-validation target — see MatchRoomAuthOptions's own docstring for why this is the WIDGET's origin, not a tenant's)", () => {
    const config = loadServerConfig({ ...DEV_OPT_IN, PORT: "4001" });
    expect(config.allowedWidgetOrigins).toContain("http://localhost:4001");
  });

  it("reads HEXDEV_WIDGET_ORIGIN as a comma-separated list when set, overriding the port-derived default", () => {
    const config = loadServerConfig({ ...DEV_OPT_IN, HEXDEV_WIDGET_ORIGIN: "https://play.hexdev.example,https://play-staging.hexdev.example" });
    expect(config.allowedWidgetOrigins).toEqual(["https://play.hexdev.example", "https://play-staging.hexdev.example"]);
  });

  it("reads rate-limit settings from the environment when set", () => {
    const config = loadServerConfig({ ...DEV_OPT_IN, HEXDEV_JOIN_IP_RATE_LIMIT: "5", HEXDEV_JOIN_IP_RATE_WINDOW_MS: "1000" });
    expect(config.joinIpRateLimit).toEqual({ limit: 5, windowMs: 1000 });
  });

  it("defaults redisUrl to undefined — no Redis, no new required config for a single-instance deploy", () => {
    expect(loadServerConfig(DEV_OPT_IN).redisUrl).toBeUndefined();
  });

  it("reads HEXDEV_REDIS_URL when set — the ONE knob that switches every port to its Redis-backed adapter together", () => {
    const config = loadServerConfig({ ...DEV_OPT_IN, HEXDEV_REDIS_URL: "redis://localhost:6379" });
    expect(config.redisUrl).toBe("redis://localhost:6379");
  });

  it("defaults publicAddress to undefined, and reads HEXDEV_PUBLIC_ADDRESS when set (this process's own reachable host:port for cross-instance room routing)", () => {
    expect(loadServerConfig(DEV_OPT_IN).publicAddress).toBeUndefined();
    expect(loadServerConfig({ ...DEV_OPT_IN, HEXDEV_PUBLIC_ADDRESS: "127.0.0.1:2568" }).publicAddress).toBe("127.0.0.1:2568");
  });

  it("defaults queueBotFillSeconds to 30, and reads HEXDEV_QUEUE_BOT_FILL_SECONDS when set (PR-2b: how long a >2-seat queue waits before bot-fill degradation)", () => {
    expect(loadServerConfig(DEV_OPT_IN).queueBotFillSeconds).toBe(30);
    expect(loadServerConfig({ ...DEV_OPT_IN, HEXDEV_QUEUE_BOT_FILL_SECONDS: "5" }).queueBotFillSeconds).toBe(5);
  });
});

describe("loadServerConfig — fail-loud by default (hardening: public surface, obs 2945)", () => {
  it("refuses to start with no session secret and no explicit dev opt-in, regardless of NODE_ENV", () => {
    expect(() => loadServerConfig({})).toThrow(/HEXDEV_SESSION_PUBLIC_KEY/);
    expect(() => loadServerConfig({ NODE_ENV: "staging" })).toThrow(/HEXDEV_SESSION_PUBLIC_KEY/);
    expect(() => loadServerConfig({ NODE_ENV: "prod" })).toThrow(/HEXDEV_SESSION_PUBLIC_KEY/);
  });

  it("only falls back to the dev signing key when HEXDEV_ALLOW_DEV_DEFAULTS is explicitly set", () => {
    // The dev default is now a validly-shaped Ed25519 seed (opaque base64url,
    // not a human-readable string) — same "obviously insecure, checked into
    // source, never reachable in production" property as before, just no
    // longer literally spelled "dev-only" in the value itself. Asserting a
    // NON-EMPTY string here (any string would satisfy `/dev-only/i` on the
    // OLD HMAC secret; the real "is this really the fallback" proof is
    // config.ts's own docstring identifying exactly which constant this is).
    const config = loadServerConfig(DEV_OPT_IN);
    expect(config.sessionPublicKey.length).toBeGreaterThan(0);
    expect(config.sessionPublicKey).not.toBe("a-real-public-key");
  });

  it("still refuses to start in production even with the dev opt-in flag set", () => {
    expect(() => loadServerConfig({ NODE_ENV: "production", ...DEV_OPT_IN })).toThrow(/production/);
  });

  it("refuses a non-numeric, zero, or negative HEXDEV_QUEUE_BOT_FILL_SECONDS — a NaN/non-positive threshold would silently bot-fill every >2-seat queue on its first sweep tick", () => {
    for (const value of ["abc", "-5", "0"]) {
      expect(() => loadServerConfig({ ...DEV_OPT_IN, HEXDEV_QUEUE_BOT_FILL_SECONDS: value })).toThrow(/HEXDEV_QUEUE_BOT_FILL_SECONDS/);
    }
  });
});

describe("loadServerConfig + createSessionTokenIssuer — the FULL boot path refuses a malformed signing key (deviation-closing brief: 'a missing or malformed key in production must refuse to boot')", () => {
  it("loadServerConfig accepts ANY present string (presence only, not shape) — malformed shape is caught downstream, at key-import time", () => {
    // Deliberately NOT a valid 32-byte Ed25519 seed once base64url-decoded —
    // `loadServerConfig` itself does not reject this (see its own docstring:
    // shape validation is `createSessionTokenIssuer`'s job).
    const config = loadServerConfig({ NODE_ENV: "production", HEXDEV_SESSION_PUBLIC_KEY: "not-a-real-key" });
    expect(config.sessionPublicKey).toBe("not-a-real-key");
  });

  it("createSessionTokenVerifier refuses the malformed key loadServerConfig passed through — the composition root's top-level `await` (index.ts) turns this into a boot crash, same convention as redis-client.ts's fail-loud connect", async () => {
    const config = loadServerConfig({ NODE_ENV: "production", HEXDEV_SESSION_PUBLIC_KEY: "not-a-real-key" });
    await expect(createSessionTokenVerifier(config.sessionPublicKey)).rejects.toThrow(/malformed/i);
  });
});

/**
 * The same guard `HEXDEV_QUEUE_BOT_FILL_SECONDS` already carries, applied to
 * the other numeric variables this config reads. NaN is the dangerous value:
 * it is not nullish, so it slips through `??`, and every comparison against
 * it is false — the process starts and misbehaves silently instead of
 * refusing. Found by the review of apps/mint-server, which had inherited the
 * same gap from this file.
 */
describe("loadServerConfig numeric guards", () => {
  const base = { HEXDEV_SESSION_PUBLIC_KEY: "KUWvW8s_-ytjibpR0k8JzH2priEPfeNvAWoomP5wfrw" };

  it("refuses a non-numeric PORT rather than listening on NaN", () => {
    expect(() => loadServerConfig({ ...base, PORT: "not-a-port" })).toThrow(/PORT/);
  });

  it("refuses a port outside the representable range", () => {
    expect(() => loadServerConfig({ ...base, PORT: "0" })).toThrow(/PORT/);
    expect(() => loadServerConfig({ ...base, PORT: "70000" })).toThrow(/PORT/);
  });

  it("refuses a non-numeric rate limit or window, naming the variable", () => {
    expect(() => loadServerConfig({ ...base, HEXDEV_JOIN_IP_RATE_WINDOW_MS: "soon" })).toThrow(/HEXDEV_JOIN_IP_RATE_WINDOW_MS/);
    expect(() => loadServerConfig({ ...base, HEXDEV_JOIN_IP_RATE_LIMIT: "lots" })).toThrow(/HEXDEV_JOIN_IP_RATE_LIMIT/);
    expect(() => loadServerConfig({ ...base, HEXDEV_SESSION_TTL_SECONDS: "ages" })).toThrow(/HEXDEV_SESSION_TTL_SECONDS/);
  });

  it("still accepts well-formed values", () => {
    const config = loadServerConfig({ ...base, PORT: "4000", HEXDEV_JOIN_IP_RATE_LIMIT: "5" });

    expect(config.port).toBe(4000);
    expect(config.joinIpRateLimit.limit).toBe(5);
  });

  /**
   * The gap this closes. `readTenants` used to check `Array.isArray` and then
   * cast — so a list whose ELEMENTS are wrong started the process and surfaced
   * much later as tenants that silently never match. Its own docstring claimed
   * the shape was checked; it was not.
   *
   * A bare string where a list of origins belongs is the dangerous case, not an
   * obviously wrong one: it is iterable, so an origin check would compare
   * against single CHARACTERS and reject every real origin without ever looking
   * broken.
   */
  it("refuses a tenant list whose ELEMENTS are the wrong shape, naming the offending index", () => {
    // Each shape asserts its OWN message. A shared regex would pass even if
    // every shape reported the same generic reason, which is the difference
    // between proving the guard discriminates and proving it merely throws.
    const badShapes: readonly { readonly tenants: unknown; readonly expected: RegExp }[] = [
      { tenants: [42], expected: /index 0 that is a number, not an object/ },
      { tenants: [{ id: "acme" }], expected: /index 0 whose "embedKey" is not a non-empty string/ },
      { tenants: [{ id: "acme", embedKey: "k", allowedOrigins: "https://acme.example", entitledGames: ["truco"] }], expected: /"allowedOrigins" is not an array of non-empty strings/ },
      { tenants: [{ id: "acme", embedKey: "k", allowedOrigins: ["https://acme.example"], entitledGames: "truco" }], expected: /"entitledGames" is not an array of non-empty strings/ },
      { tenants: [{ id: "", embedKey: "k", allowedOrigins: [], entitledGames: [] }], expected: /index 0 whose "id" is not a non-empty string/ },
      { tenants: [{ id: "acme", embedKey: "k", allowedOrigins: [""], entitledGames: ["truco"] }], expected: /"allowedOrigins" is not an array of non-empty strings/ },
    ];

    for (const { tenants, expected } of badShapes) {
      const load = (): unknown => loadServerConfig({ ...base, HEXDEV_TENANTS_JSON: JSON.stringify(tenants) });

      expect(load).toThrow(/HEXDEV_TENANTS_JSON/); // names the variable an operator must fix
      expect(load).toThrow(expected); // and names WHICH record, and why
    }
  });

  it("still accepts a well-formed tenant list, theme optional", () => {
    const withTheme = [{ id: "acme", embedKey: "k", allowedOrigins: ["https://acme.example"], entitledGames: ["truco"], theme: { feltColor: "#0b3d2e" } }];
    const withoutTheme = [{ id: "acme", embedKey: "k", allowedOrigins: ["https://acme.example"], entitledGames: ["truco"] }];

    expect(loadServerConfig({ ...base, HEXDEV_TENANTS_JSON: JSON.stringify(withTheme) }).tenants).toHaveLength(1);
    expect(loadServerConfig({ ...base, HEXDEV_TENANTS_JSON: JSON.stringify(withoutTheme) }).tenants).toHaveLength(1);
  });

  it("refuses a malformed HEXDEV_TENANTS_JSON with a message that names it", () => {
    expect(() => loadServerConfig({ ...base, HEXDEV_TENANTS_JSON: "{oops" })).toThrow(/HEXDEV_TENANTS_JSON/);
  });

  it("refuses a HEXDEV_TENANTS_JSON that parses but is not a list", () => {
    expect(() => loadServerConfig({ ...base, HEXDEV_TENANTS_JSON: '{"id":"solo"}' })).toThrow(/HEXDEV_TENANTS_JSON/);
  });
});

/**
 * The match role holds NO seed. That is the entire point of the split
 * (handoff §P4.3): compromising a match-serving replica must not be a way to
 * mint tokens for the whole fleet. These assertions are what stop a future
 * edit from quietly handing it minting power back.
 */
describe("the match role cannot mint", () => {
  const base = { HEXDEV_SESSION_PUBLIC_KEY: "KUWvW8s_-ytjibpR0k8JzH2priEPfeNvAWoomP5wfrw" };

  it("exposes no signing key at all", () => {
    expect(loadServerConfig(base)).not.toHaveProperty("sessionSigningKey");
  });

  it("ignores a signing key even when one is handed to it", () => {
    const config = loadServerConfig({ ...base, HEXDEV_SESSION_SIGNING_KEY: "a-seed-that-must-not-be-used" });

    expect(JSON.stringify(config)).not.toContain("a-seed-that-must-not-be-used");
  });

  /**
   * The front door moved to the minting role, so the knobs that shaped it
   * have no meaning here. Their absence is asserted so a future edit cannot
   * re-couple the two roles' configuration by accident.
   */
  it("carries no front-door rate limits", () => {
    const config = loadServerConfig(base);

    expect(config).not.toHaveProperty("embedIpRateLimit");
    expect(config).not.toHaveProperty("embedKeyRateLimit");
  });

  it("still carries what a match replica genuinely needs", () => {
    const config = loadServerConfig(base);

    expect(config.joinIpRateLimit.limit).toBeGreaterThan(0);
    expect(config.tenants).toHaveLength(1);
    expect(config.allowedWidgetOrigins).toHaveLength(1);
    expect(config.queueBotFillSeconds).toBeGreaterThan(0);
  });
});
