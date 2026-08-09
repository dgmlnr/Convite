import { describe, expect, it } from "vitest";
import type { ConfigOption } from "@hexdev/platform-contract";
import { createMatchmakingPool, createPresenceSweeper, deriveLobbyDisplay, deriveLobbyDisplayFromCounts, deriveModalities, modalityKey } from "./presence.js";
import { describeMatchmakingPoolContract } from "./matchmaking-pool.contract.js";

// Truco-shaped option, used ONLY to prove the mechanism handles it — never
// hardcoded as a special case (roadmap constraint, obs 2943).
const POINTS_TO_WIN: ConfigOption = { key: "pointsToWin", labelKey: "truco.pointsToWin", values: [15, 30], defaultValue: 15 };
// A second, differently-shaped option to prove the derivation is a real
// cartesian product, not special-cased to exactly one option.
const DIFFICULTY: ConfigOption = { key: "difficulty", labelKey: "escoba.difficulty", values: ["easy", "hard"], defaultValue: "easy" };

describe("deriveModalities (lobby rooms derived from configOptions, never hardcoded)", () => {
  it("yields exactly one modality — the empty config — for a game with zero configOptions (Generala has none)", () => {
    expect(deriveModalities([])).toEqual([{}]);
  });

  it("yields one modality per declared value for a single-option game (truco-shaped, but via the generic mechanism)", () => {
    expect(deriveModalities([POINTS_TO_WIN])).toEqual([{ pointsToWin: 15 }, { pointsToWin: 30 }]);
  });

  it("yields the cartesian product across multiple configOptions — proves this is not special-cased to one option", () => {
    const modalities = deriveModalities([POINTS_TO_WIN, DIFFICULTY]);
    expect(modalities).toHaveLength(4);
    expect(modalities).toContainEqual({ pointsToWin: 15, difficulty: "easy" });
    expect(modalities).toContainEqual({ pointsToWin: 30, difficulty: "hard" });
  });
});

describe("modalityKey", () => {
  it("produces the same key regardless of property insertion order", () => {
    expect(modalityKey({ pointsToWin: 15, difficulty: "easy" })).toBe(modalityKey({ difficulty: "easy", pointsToWin: 15 }));
  });

  it("produces a different key for a different value", () => {
    expect(modalityKey({ pointsToWin: 15 })).not.toBe(modalityKey({ pointsToWin: 30 }));
  });
});

describe("createMatchmakingPool — derived counters (never incremented/decremented)", () => {
  it("counts 0 for a modality nobody has joined", async () => {
    const pool = createMatchmakingPool();
    expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(0);
  });

  it("count reflects the length of the authoritative waiting collection after a join", async () => {
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
    expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(1);
  });

  it("count drops after leave — derived from the collection shrinking, not a decrement", async () => {
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
    await pool.leave("truco-argentino", { pointsToWin: 15 }, "c1");
    expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(0);
  });

  it("keeps different modalities of the same game independent (spec: 15 and 30 point counters are independent)", async () => {
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c2", playerId: "p2" });
    expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(2);
    expect(await pool.count("truco-argentino", { pointsToWin: 30 })).toBe(0);
  });

  it("keeps different games independent even with structurally-equal modalities", async () => {
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", {}, { connectionId: "c1", playerId: "p1" });
    expect(await pool.count("generala", {})).toBe(0);
  });

  it("scopes queues by poolKey — a different poolKey does not share a queue (per-tenant flip, spec: config value)", async () => {
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" }, "tenant-a");
    expect(await pool.count("truco-argentino", { pointsToWin: 15 }, "tenant-b")).toBe(0);
    expect(await pool.count("truco-argentino", { pointsToWin: 15 }, "tenant-a")).toBe(1);
  });

  it("defaults every call to the SAME global poolKey — cross-tenant matchmaking is the v1 default", async () => {
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
    expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(1); // no poolKey passed: same default queue
  });

  it("tryPair returns null when fewer than two players are waiting", async () => {
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
    expect(await pool.tryPair("truco-argentino", { pointsToWin: 15 })).toBeNull();
  });

  it("tryPair pairs the two waiting players and removes both from the count (spec: matched players leave the waiting count)", async () => {
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c2", playerId: "p2" });
    const pairing = await pool.tryPair("truco-argentino", { pointsToWin: 15 });
    expect(pairing).toEqual({ a: { connectionId: "c1", playerId: "p1" }, b: { connectionId: "c2", playerId: "p2" } });
    expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(0);
  });

  it("sweep removes an entry the caller reports as no longer alive, and nothing else", async () => {
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "zombie", playerId: "p1" });
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "alive", playerId: "p2" });
    await pool.sweep((connectionId) => connectionId !== "zombie");
    expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(1);
  });
});

describe("createPresenceSweeper — Clock-injected interval, never Date.now() directly", () => {
  function fakeClock(startMs = 0) {
    let now = startMs;
    return { now: () => now, advance: (ms: number) => (now += ms) };
  }

  it("does not sweep before the configured interval has elapsed", async () => {
    const clock = fakeClock();
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "zombie", playerId: "p1" });
    const sweeper = createPresenceSweeper({ intervalMs: 10_000, clock: clock.now });
    clock.advance(9_999);
    await sweeper.maybeSweep(pool, () => false);
    expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(1); // not yet swept
  });

  it("sweeps once the configured interval has elapsed, using the injected clock's value", async () => {
    const clock = fakeClock();
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "zombie", playerId: "p1" });
    const sweeper = createPresenceSweeper({ intervalMs: 10_000, clock: clock.now });
    clock.advance(10_000);
    await sweeper.maybeSweep(pool, () => false);
    expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(0);
  });

  it("honors a DIFFERENT interval VALUE, not just a boolean elapsed/not-elapsed branch (doubling the interval doubles the wait)", async () => {
    const clock = fakeClock();
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "zombie", playerId: "p1" });
    const sweeper = createPresenceSweeper({ intervalMs: 20_000, clock: clock.now });
    clock.advance(10_000); // would have swept under the 10s interval, must NOT sweep under 20s
    await sweeper.maybeSweep(pool, () => false);
    expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(1);
    clock.advance(10_000); // now 20s total has elapsed
    await sweeper.maybeSweep(pool, () => false);
    expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(0);
  });
});

describe("deriveLobbyDisplay — zero-counter UX rule (obs 2919: decided product rule, not a default)", () => {
  it("hides the counter and flags the bot fallback when zero players are waiting", async () => {
    const pool = createMatchmakingPool();
    const display = await deriveLobbyDisplay("truco-argentino", [POINTS_TO_WIN], pool);
    const thirty = display.find((entry) => entry.modality.pointsToWin === 30);
    expect(thirty).toEqual({ modality: { pointsToWin: 30 }, waitingCount: undefined, promoteBotFallback: true });
  });

  it("shows the real count and clears the bot fallback the moment a waiting player exists (spec: appears at 1)", async () => {
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 30 }, { connectionId: "c1", playerId: "p1" });
    const display = await deriveLobbyDisplay("truco-argentino", [POINTS_TO_WIN], pool);
    const thirty = display.find((entry) => entry.modality.pointsToWin === 30);
    expect(thirty).toEqual({ modality: { pointsToWin: 30 }, waitingCount: 1, promoteBotFallback: false });
  });

  it("derives one display entry per modality, independent of each other (spec: 15/30 independent)", async () => {
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c2", playerId: "p2" });
    const display = await deriveLobbyDisplay("truco-argentino", [POINTS_TO_WIN], pool);
    expect(display).toHaveLength(2);
    expect(display.find((entry) => entry.modality.pointsToWin === 15)?.waitingCount).toBe(2);
    expect(display.find((entry) => entry.modality.pointsToWin === 30)?.waitingCount).toBeUndefined();
  });
});

describe("deriveLobbyDisplayFromCounts — the same zero-counter rule, extracted for a raw-counts consumer (transport-colyseus-client: a live WebSocket broadcast has no MatchmakingPool to read, only the raw {modality,waitingCount}[] payload PresenceRoom already sends)", () => {
  it("applies the identical rule deriveLobbyDisplay itself now delegates to, given raw counts instead of a pool", () => {
    const display = deriveLobbyDisplayFromCounts([
      { modality: { pointsToWin: 15 }, waitingCount: 2 },
      { modality: { pointsToWin: 30 }, waitingCount: 0 },
    ]);
    expect(display).toEqual([
      { modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false },
      { modality: { pointsToWin: 30 }, waitingCount: undefined, promoteBotFallback: true },
    ]);
  });

  it("is the exact function deriveLobbyDisplay calls internally: identical output for the same pool-derived counts", async () => {
    const pool = createMatchmakingPool();
    await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
    const viaPool = await deriveLobbyDisplay("truco-argentino", [POINTS_TO_WIN], pool);
    const viaRawCounts = deriveLobbyDisplayFromCounts(
      await Promise.all(deriveModalities([POINTS_TO_WIN]).map(async (modality) => ({ modality, waitingCount: await pool.count("truco-argentino", modality) }))),
    );
    expect(viaRawCounts).toEqual(viaPool);
  });
});

// The shared conformance suite (matchmaking-pool.contract.ts), run here
// against THIS adapter — the same suite `redis-matchmaking-pool.redis.
// test.ts` runs against the Redis adapter.
describeMatchmakingPoolContract("in-memory", () => createMatchmakingPool());
