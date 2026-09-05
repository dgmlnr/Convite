import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAuditEntries,
  getOperators,
  getTenantDetail,
  getTenants,
  postLogin,
  postLogout,
  postOperatorCreate,
  postOperatorDisable,
  postOperatorEnable,
  postPermissionGrant,
  postPermissionRevoke,
  postRotateEmbedKey,
  postTenantCreate,
  postTenantGames,
  postTenantOrigins,
  postTenantTheme,
  postTenantWindow,
} from "./api.js";

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
 * `postTenantCreate` (the gap slice 15 flagged but never built — `POST
 * /tenants`, permission `tenant.create`) — same fetch-stub discipline as
 * every client function above. Genuine RED, confirmed before it existed:
 * `postTenantCreate is not exported`.
 */
describe("postTenantCreate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the id to /tenants, same-origin, cookie-bearing, and returns the freshly created detail row", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ tenant: { id: "acme", embedKey: "pk_live_fresh", allowedOrigins: [], entitledGames: [], status: { kind: "no-window" } } }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await postTenantCreate("acme");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { readonly body: string }];
    expect(url).toBe("/tenants");
    expect(init).toMatchObject({ method: "POST", credentials: "include", headers: { "content-type": "application/json" } });
    expect(JSON.parse(init.body)).toEqual({ id: "acme" });
    expect(outcome).toEqual({ ok: true, tenant: { id: "acme", embedKey: "pk_live_fresh", allowedOrigins: [], entitledGames: [], status: { kind: "no-window" } } });
  });

  it("maps a 409 tenant-id-taken response, the reachable database-arbitrated collision, distinct from any other refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "tenant-id-taken" }), { status: 409 })),
    );
    await expect(postTenantCreate("acme")).resolves.toEqual({ ok: false, reason: "tenant-id-taken" });
  });

  it("maps a 409 embed-key-taken response distinctly, even though an operator can never type an embed key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "embed-key-taken" }), { status: 409 })),
    );
    await expect(postTenantCreate("acme")).resolves.toEqual({ ok: false, reason: "embed-key-taken" });
  });

  it("maps a 403 to missing-permission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "missing-permission" }), { status: 403 })),
    );
    await expect(postTenantCreate("acme")).resolves.toEqual({ ok: false, reason: "missing-permission" });
  });

  it("maps a 400 to invalid-payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "missing-tenant-id" }), { status: 400 })),
    );
    await expect(postTenantCreate("")).resolves.toEqual({ ok: false, reason: "invalid-payload" });
  });

  it("maps a thrown network failure to network-error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(postTenantCreate("acme")).resolves.toEqual({ ok: false, reason: "network-error" });
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

/**
 * `postTenantTheme` (task 15b.3/15b.4) — the only write client that carries
 * BACK `themeViolations` alongside the fresh tenant row, so the operator's
 * own screen can render them (design §2.3, moved off `console.warn`).
 * Genuine RED, confirmed before it existed: `postTenantTheme is not
 * exported`.
 */
describe("postTenantTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the theme object to /tenants/:id/theme and returns the tenant plus any themeViolations", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            tenant: { id: "acme", embedKey: "pk_live_acme", allowedOrigins: [], entitledGames: [], status: { kind: "no-window" } },
            themeViolations: [{ pair: "on-surface/surface", reason: "below-minimum", ratio: 1.07, dropped: ["--gx-color-surface", "--gx-color-on-surface"] }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await postTenantTheme("acme", { "--gx-color-on-surface": "#1a1a1a", "--gx-color-surface": "#14231d" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { readonly body: string }];
    expect(url).toBe("/tenants/acme/theme");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init.body)).toEqual({ theme: { "--gx-color-on-surface": "#1a1a1a", "--gx-color-surface": "#14231d" } });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.themeViolations).toHaveLength(1);
  });

  it("maps a 404 to unknown-tenant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "unknown-tenant" }), { status: 404 })),
    );
    await expect(postTenantTheme("ghost", {})).resolves.toEqual({ ok: false, reason: "unknown-tenant" });
  });
});

/**
 * `getOperators` (task 16a.1) — the operator directory both the operator
 * list AND the permission matrix screens read from. Same three-way session/
 * permission/network mapping `getTenants` already establishes; no
 * `unknown-tenant`-shaped fourth reason, since this route names no single
 * resource by id.
 */
describe("getOperators", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches /operators same-origin, cookie-bearing, and returns the parsed operator rows", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ operators: [{ id: "op-a", username: "ana", enabled: true, permissions: ["operators.manage"] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await getOperators();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/operators");
    expect(init).toMatchObject({ credentials: "include" });
    expect(outcome).toEqual({ ok: true, operators: [{ id: "op-a", username: "ana", enabled: true, permissions: ["operators.manage"] }] });
  });

  it("maps a 403 to missing-permission", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    await expect(getOperators()).resolves.toEqual({ ok: false, reason: "missing-permission" });
  });

  it("maps any other non-200 to no-session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    await expect(getOperators()).resolves.toEqual({ ok: false, reason: "no-session" });
  });

  it("maps a thrown network failure to network-error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(getOperators()).resolves.toEqual({ ok: false, reason: "network-error" });
  });
});

/**
 * `postOperatorCreate` (task 16a.2/16a.3) — surfaces the server's own
 * `username-taken` refusal (`operator-handlers.ts`'s own
 * `createOperatorCreateHandler`, 409) as its OWN distinct reason, the
 * identical "never collapse a real, expected refusal into a generic error"
 * discipline `postTenantCreate` already establishes for `tenant-id-taken`.
 */
describe("postOperatorCreate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts username and password to /operators, same-origin, cookie-bearing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "op-new", username: "beto" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await postOperatorCreate("beto", "correct horse battery staple");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { readonly body: string }];
    expect(url).toBe("/operators");
    expect(init).toMatchObject({ method: "POST", credentials: "include", headers: { "content-type": "application/json" } });
    expect(JSON.parse(init.body)).toEqual({ username: "beto", password: "correct horse battery staple" });
    expect(outcome).toEqual({ ok: true, id: "op-new", username: "beto" });
  });

  it("maps a 409 to username-taken, the server's own exact refusal reason (task 16a.2)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "username-taken" }), { status: 409 })));
    await expect(postOperatorCreate("ana", "whatever")).resolves.toEqual({ ok: false, reason: "username-taken" });
  });

  it("maps a 400 to invalid-payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "missing-fields" }), { status: 400 })));
    await expect(postOperatorCreate("", "")).resolves.toEqual({ ok: false, reason: "invalid-payload" });
  });

  it("maps a 403 to missing-permission", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    await expect(postOperatorCreate("ana", "whatever")).resolves.toEqual({ ok: false, reason: "missing-permission" });
  });

  it("maps a thrown network failure to network-error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(postOperatorCreate("ana", "whatever")).resolves.toEqual({ ok: false, reason: "network-error" });
  });
});

/**
 * `postOperatorDisable`/`postOperatorEnable` (task 16a.4) — both map the
 * SAME `last-account-manager` 409 the server's own guard can return
 * (`operator-handlers.ts`'s `createOperatorDisableHandler`), distinct from
 * any other refusal, so the screen can render the real constraint rather
 * than a generic error.
 */
describe("postOperatorDisable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /operators/:id/disable, same-origin, cookie-bearing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await postOperatorDisable("op-target");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/operators/op-target/disable");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(outcome).toEqual({ ok: true });
  });

  it("maps a 409 to last-account-manager, distinct from any other refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "last-account-manager" }), { status: 409 })));
    await expect(postOperatorDisable("op-sole-holder")).resolves.toEqual({ ok: false, reason: "last-account-manager" });
  });

  it("maps a 404 to unknown-operator", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "unknown-operator" }), { status: 404 })));
    await expect(postOperatorDisable("does-not-exist")).resolves.toEqual({ ok: false, reason: "unknown-operator" });
  });
});

describe("postOperatorEnable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /operators/:id/enable, same-origin, cookie-bearing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await postOperatorEnable("op-target");

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/operators/op-target/enable");
    expect(outcome).toEqual({ ok: true });
  });

  it("maps a 404 to unknown-operator", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "unknown-operator" }), { status: 404 })));
    await expect(postOperatorEnable("does-not-exist")).resolves.toEqual({ ok: false, reason: "unknown-operator" });
  });
});

/**
 * `postPermissionGrant`/`postPermissionRevoke` (task 16a.5) — the permission
 * matrix's own two mutating calls. `revoke` alone can surface
 * `last-account-manager` (`permission-handlers.ts`'s own
 * `createPermissionRevokeHandler`); `grant` cannot, since adding a holder
 * never shrinks the guarded set (the same argument that module's own
 * docstring already makes).
 */
describe("postPermissionGrant", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the permission to /operators/:id/permissions/grant, same-origin, cookie-bearing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await postPermissionGrant("op-target", "tenant.create");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { readonly body: string }];
    expect(url).toBe("/operators/op-target/permissions/grant");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init.body)).toEqual({ permission: "tenant.create" });
    expect(outcome).toEqual({ ok: true });
  });

  it("maps a 404 to unknown-operator", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "unknown-operator" }), { status: 404 })));
    await expect(postPermissionGrant("does-not-exist", "tenant.create")).resolves.toEqual({ ok: false, reason: "unknown-operator" });
  });
});

describe("postPermissionRevoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the permission to /operators/:id/permissions/revoke, same-origin, cookie-bearing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await postPermissionRevoke("op-target", "operators.manage");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { readonly body: string }];
    expect(url).toBe("/operators/op-target/permissions/revoke");
    expect(JSON.parse(init.body)).toEqual({ permission: "operators.manage" });
    expect(outcome).toEqual({ ok: true });
  });

  it("maps a 409 to last-account-manager, distinct from not-granted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "last-account-manager" }), { status: 409 })));
    await expect(postPermissionRevoke("op-sole-holder", "operators.manage")).resolves.toEqual({ ok: false, reason: "last-account-manager" });
  });

  it("maps a 404 to not-granted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "not-granted" }), { status: 404 })));
    await expect(postPermissionRevoke("op-target", "tenant.create")).resolves.toEqual({ ok: false, reason: "not-granted" });
  });
});

/**
 * `getAuditEntries` (task 16b.2) — `GET /audit`'s own four filters (actor,
 * tenant, action, date range) become query-string parameters, only when
 * present: an omitted/empty filter never appears in the URL at all, so a
 * request with no filters is a bare `GET /audit`, never `GET /audit?actor=`
 * with an empty value the server would have to special-case.
 */
describe("getAuditEntries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches /audit with no query string when no filter is given", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ entries: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await getAuditEntries();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/audit");
    expect(init).toMatchObject({ credentials: "include" });
    expect(outcome).toEqual({ ok: true, entries: [] });
  });

  it("filtering by target tenant shows only that tenant's entries — task 16b.1's own scenario, at the client layer", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ entries: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await getAuditEntries({ tenant: "acme" });

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/audit?tenant=acme");
  });

  it("combines every given filter into one query string, omitting anything empty or undefined", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ entries: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await getAuditEntries({ actor: "ana", tenant: "", action: "permission.granted", from: "2026-08-01T00:00:00.000Z" });

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/audit?actor=ana&action=permission.granted&from=2026-08-01T00%3A00%3A00.000Z");
  });

  it("returns the parsed entries verbatim on success", async () => {
    const entry = { id: 1, occurredAt: 1_700_000_000_000, actorUsername: "ana", action: "tenant.created", targetTenantId: "acme" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ entries: [entry] }), { status: 200 })));

    await expect(getAuditEntries()).resolves.toEqual({ ok: true, entries: [entry] });
  });

  it("maps a 403 to missing-permission", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    await expect(getAuditEntries()).resolves.toEqual({ ok: false, reason: "missing-permission" });
  });

  it("maps any other non-200 to no-session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    await expect(getAuditEntries()).resolves.toEqual({ ok: false, reason: "no-session" });
  });

  it("maps a thrown network failure to network-error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(getAuditEntries()).resolves.toEqual({ ok: false, reason: "network-error" });
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
