import { describe, expect, it, vi } from "vitest";
import { buildRenewUrl, renewSessionToken, type FetchLike } from "./session-renewal.js";

describe("buildRenewUrl (obs 2968: renew immediately before a join, never carrying the page-load bootstrap token around)", () => {
  it("builds the /session/renew request URL with the embed key and player id as query params", () => {
    expect(buildRenewUrl("pk_live_abc", "player-1")).toBe("/session/renew?k=pk_live_abc&p=player-1");
  });

  it("percent-encodes values that need it", () => {
    expect(buildRenewUrl("pk live", "player one")).toBe("/session/renew?k=pk+live&p=player+one");
  });
});

describe("renewSessionToken", () => {
  it("resolves with the fresh token from a successful renewal response", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => ({ ok: true, json: async () => ({ token: "fresh-token-123" }) }));

    const token = await renewSessionToken(fetchImpl, { embedKey: "pk_live_abc", playerId: "player-1" });

    expect(token).toBe("fresh-token-123");
    expect(fetchImpl).toHaveBeenCalledWith("/session/renew?k=pk_live_abc&p=player-1", { method: "POST" });
  });

  it("rejects when the server responds with a non-ok status (rate-limited, disallowed origin, unknown tenant)", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => ({ ok: false, json: async () => ({ error: "rate-limited" }) }));

    await expect(renewSessionToken(fetchImpl, { embedKey: "pk_live_abc", playerId: "player-1" })).rejects.toThrow();
  });

  it("rejects when the response body has no token field", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

    await expect(renewSessionToken(fetchImpl, { embedKey: "pk_live_abc", playerId: "player-1" })).rejects.toThrow();
  });
});
