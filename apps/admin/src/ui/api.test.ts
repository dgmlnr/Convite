import { afterEach, describe, expect, it, vi } from "vitest";
import { getTenantDetail, getTenants, postLogin, postLogout, postRotateEmbedKey, postTenantGames, postTenantOrigins, postTenantWindow } from "./api.js";

/**
 * `postLogin`'s own contract, proven with a stubbed `global.fetch` — this
 * module has no server to reach in the "node" vitest project, so the
 * property under test is the REQUEST SHAPE and the RESPONSE MAPPING, not a
 * live HTTP round trip (the manual runtime harness, run against a real
 * Postgres-backed admin process, is what proves the round trip for real —
 * see this slice's own apply-progress).
 *
 * Genuine RED, confirmed before `api.ts` existed: `Cannot find module
 * './api.js'`. A second genuine RED followed once the module existed but
 * called `fetch("/login", { method: "GET", ... })` by mistake — this
 * file's own "posts to the exact route, with the exact method" assertion
 * failed for real (`expected 'GET' to be 'POST'`) before the method literal
 * was corrected.
 */
describe("postLogin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts credentials to /login, same-origin, cookie-bearing", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await postLogin("ana", "hunter2");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { readonly body: string }];
    expect(url).toBe("/login");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
    });
    expect(JSON.parse(init.body)).toEqual({ username: "ana", password: "hunter2" });
  });

  it("maps a 200 response to ok:true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    await expect(postLogin("ana", "hunter2")).resolves.toEqual({ ok: true });
  });

  it("maps a 401 response to invalid-credentials, without naming which of the three server-side causes fired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid-credentials" }), { status: 401 })),
    );
    await expect(postLogin("ana", "wrong")).resolves.toEqual({ ok: false, reason: "invalid-credentials" });
  });

  it("maps a 429 response to rate-limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 429 })),
    );
    await expect(postLogin("ana", "hunter2")).resolves.toEqual({ ok: false, reason: "rate-limited" });
  });

  it("maps a thrown network failure to network-error, never an uncaught rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(postLogin("ana", "hunter2")).resolves.toEqual({ ok: false, reason: "network-error" });
  });
});

/**
 * `getTenants`'s own contract (task 14.4's browser-side counterpart) —
 * `GET /` doubles as this app's own session probe (this module's own
 * docstring on `TenantListOutcome`), so its three failure shapes matter as
 * much as its success shape.
 */
describe("getTenants", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches / same-origin, cookie-bearing, and returns the parsed tenant rows", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ tenants: [{ id: "acme", embedKey: "pk_live_acme", status: { kind: "active" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await getTenants();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/");
    expect(init).toMatchObject({ credentials: "include" });
    expect(outcome).toEqual({ ok: true, tenants: [{ id: "acme", embedKey: "pk_live_acme", status: { kind: "active" } }] });
  });

  it("maps a 401 (no live session) to no-session — this is how AppShell knows to show the login screen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "no-session" }), { status: 401 })),
    );
    await expect(getTenants()).resolves.toEqual({ ok: false, reason: "no-session" });
  });

  it("maps a 403 (authenticated, but lacking tenant.origins.edit) to missing-permission, distinct from no-session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "missing-permission" }), { status: 403 })),
    );
    await expect(getTenants()).resolves.toEqual({ ok: false, reason: "missing-permission" });
  });

  it("maps a thrown network failure to network-error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(getTenants()).resolves.toEqual({ ok: false, reason: "network-error" });
  });
});

/**
 * `getTenantDetail`'s own contract (slice 15's own necessary prerequisite) —
 * same fetch-stub discipline as `getTenants` above. Genuine RED, confirmed
 * before `getTenantDetail` existed: `getTenantDetail is not exported`.
 */
describe("getTenantDetail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches /tenants/:id, same-origin, cookie-bearing, URL-encoding the id", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ tenant: { id: "acme corp", embedKey: "pk_live_acme", allowedOrigins: [], entitledGames: [], status: { kind: "no-window" } } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await getTenantDetail("acme corp");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/tenants/acme%20corp");
    expect(init).toMatchObject({ credentials: "include" });
    expect(outcome).toEqual({ ok: true, tenant: { id: "acme corp", embedKey: "pk_live_acme", allowedOrigins: [], entitledGames: [], status: { kind: "no-window" } } });
  });

  it("maps a 404 to unknown-tenant, distinct from a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "unknown-tenant" }), { status: 404 })),
    );
    await expect(getTenantDetail("ghost")).resolves.toEqual({ ok: false, reason: "unknown-tenant" });
  });

  it("maps a 403 to missing-permission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "missing-permission" }), { status: 403 })),
    );
    await expect(getTenantDetail("acme")).resolves.toEqual({ ok: false, reason: "missing-permission" });
  });

  it("maps a thrown network failure to network-error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(getTenantDetail("acme")).resolves.toEqual({ ok: false, reason: "network-error" });
  });
});

/**
 * `postTenantOrigins`/`postTenantGames` (tasks 15a.1-15a.4) — same
 * fetch-stub discipline as every client function above. Genuine RED,
 * confirmed before either existed: `postTenantOrigins is not exported` /
 * `postTenantGames is not exported`.
 */
describe("postTenantOrigins", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the origins array to /tenants/:id/origins, same-origin, cookie-bearing, and returns the fresh detail row", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ tenant: { id: "acme", embedKey: "pk_live_acme", allowedOrigins: ["https://new.example"], entitledGames: [], status: { kind: "no-window" } } }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await postTenantOrigins("acme", ["https://new.example"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { readonly body: string }];
    expect(url).toBe("/tenants/acme/origins");
    expect(init).toMatchObject({ method: "POST", credentials: "include", headers: { "content-type": "application/json" } });
    expect(JSON.parse(init.body)).toEqual({ origins: ["https://new.example"] });
    expect(outcome).toEqual({ ok: true, tenant: { id: "acme", embedKey: "pk_live_acme", allowedOrigins: ["https://new.example"], entitledGames: [], status: { kind: "no-window" } } });
  });

  it("maps a 404 to unknown-tenant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "unknown-tenant" }), { status: 404 })),
    );
    await expect(postTenantOrigins("ghost", [])).resolves.toEqual({ ok: false, reason: "unknown-tenant" });
  });

  it("maps a 403 to missing-permission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "missing-permission" }), { status: 403 })),
    );
    await expect(postTenantOrigins("acme", [])).resolves.toEqual({ ok: false, reason: "missing-permission" });
  });

  it("maps a thrown network failure to network-error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(postTenantOrigins("acme", [])).resolves.toEqual({ ok: false, reason: "network-error" });
  });
});

/** `postTenantGames` (tasks 15a.3/15a.4) — structurally identical to
 * `postTenantOrigins`'s own suite above. Genuine RED, confirmed before it
 * existed: `postTenantGames is not exported`. */
describe("postTenantGames", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the games array to /tenants/:id/games, same-origin, cookie-bearing", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ tenant: { id: "acme", embedKey: "pk_live_acme", allowedOrigins: [], entitledGames: ["escoba"], status: { kind: "no-window" } } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await postTenantGames("acme", ["escoba"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { readonly body: string }];
    expect(url).toBe("/tenants/acme/games");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init.body)).toEqual({ games: ["escoba"] });
    expect(outcome).toEqual({ ok: true, tenant: { id: "acme", embedKey: "pk_live_acme", allowedOrigins: [], entitledGames: ["escoba"], status: { kind: "no-window" } } });
  });

  it("maps a 404 to unknown-tenant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "unknown-tenant" }), { status: 404 })),
    );
    await expect(postTenantGames("ghost", [])).resolves.toEqual({ ok: false, reason: "unknown-tenant" });
  });

  it("maps a thrown network failure to network-error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(postTenantGames("acme", [])).resolves.toEqual({ ok: false, reason: "network-error" });
  });
});

/**
 * `postTenantWindow` (tasks 15a.5/15a.6) — posts the ALREADY-CONVERTED ISO
 * date (the caller's own `argentineDateToIso`, never this module's job).
 * Genuine RED, confirmed before it existed: `postTenantWindow is not
 * exported`.
 */
describe("postTenantWindow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the ISO date to /tenants/:id/window", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ tenant: { id: "acme", embedKey: "pk_live_acme", allowedOrigins: [], entitledGames: [], status: { kind: "active" }, validUntilDisplay: "2026-08-30" } }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await postTenantWindow("acme", "2026-08-30");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { readonly body: string }];
    expect(url).toBe("/tenants/acme/window");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init.body)).toEqual({ validUntil: "2026-08-30" });
    expect(outcome.ok).toBe(true);
  });

  it("maps a 400 to invalid-payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid-window" }), { status: 400 })),
    );
    await expect(postTenantWindow("acme", "not-iso")).resolves.toEqual({ ok: false, reason: "invalid-payload" });
  });

  it("maps a 404 to unknown-tenant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "unknown-tenant" }), { status: 404 })),
    );
    await expect(postTenantWindow("ghost", "2026-08-30")).resolves.toEqual({ ok: false, reason: "unknown-tenant" });
  });
});

/**
 * `postRotateEmbedKey` (task 15b.1/15b.2) — posts with NO body at all (the
 * new key is entirely server-generated). Genuine RED, confirmed before it
 * existed: `postRotateEmbedKey is not exported`.
 */
describe("postRotateEmbedKey", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /tenants/:id/embed-key/rotate, same-origin, cookie-bearing, and returns the fresh key", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ tenant: { id: "acme", embedKey: "pk_live_freshly_rotated", allowedOrigins: [], entitledGames: [], status: { kind: "active" } } }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await postRotateEmbedKey("acme");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/tenants/acme/embed-key/rotate");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(outcome).toEqual({ ok: true, tenant: { id: "acme", embedKey: "pk_live_freshly_rotated", allowedOrigins: [], entitledGames: [], status: { kind: "active" } } });
  });

  it("maps a 404 to unknown-tenant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "unknown-tenant" }), { status: 404 })),
    );
    await expect(postRotateEmbedKey("ghost")).resolves.toEqual({ ok: false, reason: "unknown-tenant" });
  });

  it("maps a thrown network failure to network-error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(postRotateEmbedKey("acme")).resolves.toEqual({ ok: false, reason: "network-error" });
  });
});

describe("postLogout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /logout, same-origin, cookie-bearing", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await postLogout();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/logout");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
  });

  it("never throws, even when the network request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(postLogout()).resolves.toBeUndefined();
  });
});
