import { describe, expect, it } from "vitest";
import type { MatchmakingPool } from "./presence.js";

/**
 * Executable conformance suite for the `MatchmakingPool` port — same
 * discipline as `rate-limiter.contract.ts`/`jti-replay-guard.contract.ts`.
 * Both `presence.test.ts` (in-memory) and `redis-matchmaking-pool.redis.
 * test.ts` (real Redis) run this EXACT suite. The Redis test file ALSO runs
 * a test this shared contract cannot express — pairing across TWO SEPARATE
 * pool instances — since that is meaningless for a single in-memory `Map`.
 */
export function describeMatchmakingPoolContract(name: string, create: () => MatchmakingPool): void {
  describe(`MatchmakingPool contract — ${name}`, () => {
    it("counts 0 for a modality nobody has joined", async () => {
      const pool = create();
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(0);
    });

    it("count reflects the waiting collection after a join, and drops after leave", async () => {
      const pool = create();
      await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(1);
      await pool.leave("truco-argentino", { pointsToWin: 15 }, "c1");
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(0);
    });

    it("joining the same connectionId twice does not double the count (idempotent join)", async () => {
      const pool = create();
      await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
      await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(1);
    });

    it("keeps different modalities/games/poolKeys independent", async () => {
      const pool = create();
      await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
      expect(await pool.count("truco-argentino", { pointsToWin: 30 })).toBe(0);
      expect(await pool.count("generala", { pointsToWin: 15 })).toBe(0);
      expect(await pool.count("truco-argentino", { pointsToWin: 15 }, "tenant-a")).toBe(0);
    });

    it("tryPair returns null when fewer than two players are waiting", async () => {
      const pool = create();
      await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
      expect(await pool.tryPair("truco-argentino", { pointsToWin: 15 })).toBeNull();
    });

    it("tryPair pairs the two waiting players FIFO and removes both from the count", async () => {
      const pool = create();
      await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
      await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c2", playerId: "p2" });
      const pairing = await pool.tryPair("truco-argentino", { pointsToWin: 15 });
      expect(pairing).toEqual({ a: { connectionId: "c1", playerId: "p1" }, b: { connectionId: "c2", playerId: "p2" } });
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(0);
    });

    it("a third waiting player is unaffected by a pairing of the first two", async () => {
      const pool = create();
      await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" });
      await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c2", playerId: "p2" });
      await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "c3", playerId: "p3" });
      await pool.tryPair("truco-argentino", { pointsToWin: 15 });
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(1);
    });

    it("sweep removes only the entry the caller reports as no longer alive", async () => {
      const pool = create();
      await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "zombie", playerId: "p1" });
      await pool.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "alive", playerId: "p2" });
      await pool.sweep((connectionId) => connectionId !== "zombie");
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(1);
    });
  });
}
