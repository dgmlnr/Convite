import { afterEach, describe, expect, it, vi } from "vitest";
import { postLogin } from "./api.js";

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
