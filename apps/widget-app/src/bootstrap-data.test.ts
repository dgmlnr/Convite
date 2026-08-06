import { describe, expect, it, vi } from "vitest";
import { fetchBootstrap, fetchPresence } from "./bootstrap-data.js";

function fakeResponse(ok: boolean, body: unknown): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("fetchBootstrap (widget-embed: the iframe mints its own session via /embed)", () => {
  it("calls /embed with the current query string and an explicit JSON Accept header", async () => {
    const body = { token: "t1", playerId: "p1", catalog: [] };
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(true, body));

    const result = await fetchBootstrap(fetchImpl, "?k=pk_dev_local&o=https%3A%2F%2Ftenant.example");

    expect(fetchImpl).toHaveBeenCalledWith("/embed?k=pk_dev_local&o=https%3A%2F%2Ftenant.example", {
      headers: { Accept: "application/json" },
    });
    expect(result).toEqual(body);
  });

  it("returns undefined when the server rejects the request (e.g. 403 disallowed origin)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(false, { error: "origin-not-allowed" }));

    const result = await fetchBootstrap(fetchImpl, "?k=pk_dev_local&o=https%3A%2F%2Fevil.example");

    expect(result).toBeUndefined();
  });
});

describe("fetchPresence (spec: game-session — lobby presence counters)", () => {
  it("calls /presence with the given gameId and returns the parsed display entries", async () => {
    const entries = [{ modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false }];
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(true, entries));

    const result = await fetchPresence(fetchImpl, "truco-argentino");

    expect(fetchImpl).toHaveBeenCalledWith("/presence?gameId=truco-argentino");
    expect(result).toEqual(entries);
  });

  it("returns an empty array when the request fails, so the UI degrades instead of crashing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(false, { error: "unknown game" }));

    const result = await fetchPresence(fetchImpl, "not-a-real-game");

    expect(result).toEqual([]);
  });
});
