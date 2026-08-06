import { describe, expect, it, vi } from "vitest";
import { fetchPresence, readInlineBootstrap } from "./bootstrap-data.js";

function fakeResponse(ok: boolean, body: unknown): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("readInlineBootstrap (widget-embed: the mint result arrives inlined in the HTML, not via a second fetch)", () => {
  // DISCOVERED via a real two-origin Playwright run (see apply-progress): a
  // SAME-ORIGIN fetch from inside the iframe back to its own server carries
  // no `Origin` header at all in a real browser, so the server cannot
  // validate tenant origin on that second request. The server now inlines
  // the already-minted result into the HTML response instead — this reads
  // that inlined global rather than making a network call at all.
  it("reads the bootstrap object the server inlined onto window", () => {
    const bootstrap = { token: "t1", playerId: "p1", catalog: [] };

    const result = readInlineBootstrap({ __HEXDEV_BOOTSTRAP__: bootstrap });

    expect(result).toEqual(bootstrap);
  });

  it("returns undefined when the server minted nothing (mint failed — nothing was inlined)", () => {
    const result = readInlineBootstrap({});

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
