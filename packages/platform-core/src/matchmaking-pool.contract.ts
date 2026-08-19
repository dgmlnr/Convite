import { describe, expect, it } from "vitest";
import type { MatchmakingPool, WaitingPlayer } from "./presence.js";

/**
 * Executable conformance suite for the `MatchmakingPool` port — same
 * discipline as `rate-limiter.contract.ts`/`jti-replay-guard.contract.ts`.
 * Both `presence.test.ts` (in-memory) and `redis-matchmaking-pool.redis.
 * test.ts` (real Redis) run this EXACT suite. The Redis test file ALSO runs
 * a test this shared contract cannot express — pairing across TWO SEPARATE
 * pool instances — since that is meaningless for a single in-memory `Map`.
 */
function player(n: number): WaitingPlayer {
  return { connectionId: `c${String(n)}`, playerId: `p${String(n)}` };
}

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

    it("tryPairSeats returns null when fewer than two players are waiting (seatCount 2)", async () => {
      const pool = create();
      await pool.join("truco-argentino", { pointsToWin: 15 }, player(1));
      expect(await pool.tryPairSeats("truco-argentino", { pointsToWin: 15 }, 2)).toBeNull();
    });

    it("tryPairSeats pops the two waiting players FIFO and removes both from the count (seatCount 2)", async () => {
      const pool = create();
      await pool.join("truco-argentino", { pointsToWin: 15 }, player(1));
      await pool.join("truco-argentino", { pointsToWin: 15 }, player(2));
      const group = await pool.tryPairSeats("truco-argentino", { pointsToWin: 15 }, 2);
      expect(group).toEqual({ players: [player(1), player(2)] });
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(0);
    });

    it("a third waiting player is unaffected by a 2-seat pop of the first two", async () => {
      const pool = create();
      await pool.join("truco-argentino", { pointsToWin: 15 }, player(1));
      await pool.join("truco-argentino", { pointsToWin: 15 }, player(2));
      await pool.join("truco-argentino", { pointsToWin: 15 }, player(3));
      await pool.tryPairSeats("truco-argentino", { pointsToWin: 15 }, 2);
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(1);
    });

    it("tryPairSeats returns null — and pops NOBODY — while fewer than seatCount are waiting (3 waiting, seatCount 4)", async () => {
      const pool = create();
      for (const n of [1, 2, 3]) await pool.join("truco-argentino", { pointsToWin: 15 }, player(n));
      expect(await pool.tryPairSeats("truco-argentino", { pointsToWin: 15 }, 4)).toBeNull();
      // Never a partial pop: the queue length is checked before ANY removal.
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(3);
    });

    it("tryPairSeats pops exactly seatCount players in FIFO order the moment the Nth joins (seatCount 4)", async () => {
      const pool = create();
      for (const n of [1, 2, 3, 4]) await pool.join("truco-argentino", { pointsToWin: 15 }, player(n));
      const group = await pool.tryPairSeats("truco-argentino", { pointsToWin: 15 }, 4);
      expect(group).toEqual({ players: [player(1), player(2), player(3), player(4)] });
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(0);
    });

    it("the (N+1)th waiter is untouched by a full group pop and heads the NEXT group", async () => {
      const pool = create();
      for (const n of [1, 2, 3, 4, 5]) await pool.join("truco-argentino", { pointsToWin: 15 }, player(n));
      await pool.tryPairSeats("truco-argentino", { pointsToWin: 15 }, 4);
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(1);
      for (const n of [6, 7, 8]) await pool.join("truco-argentino", { pointsToWin: 15 }, player(n));
      const group = await pool.tryPairSeats("truco-argentino", { pointsToWin: 15 }, 4);
      expect(group).toEqual({ players: [player(5), player(6), player(7), player(8)] });
    });

    it("drains exactly seatCount of a larger queue, preserving the remainder's FIFO position (seatCount 3 of 4 waiting)", async () => {
      const pool = create();
      for (const n of [1, 2, 3, 4]) await pool.join("truco-argentino", { pointsToWin: 15 }, player(n));
      const group = await pool.tryPairSeats("truco-argentino", { pointsToWin: 15 }, 3);
      expect(group).toEqual({ players: [player(1), player(2), player(3)] });
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(1);
      // The survivor is genuinely the 4th joiner, still first in line.
      await pool.join("truco-argentino", { pointsToWin: 15 }, player(5));
      const next = await pool.tryPairSeats("truco-argentino", { pointsToWin: 15 }, 2);
      expect(next).toEqual({ players: [player(4), player(5)] });
    });

    it("rejects a seatCount below 2 or a non-integer, and touches nothing (a 0/1-seat pop is always a caller bug)", async () => {
      const pool = create();
      await pool.join("truco-argentino", { pointsToWin: 15 }, player(1));
      await pool.join("truco-argentino", { pointsToWin: 15 }, player(2));
      for (const seatCount of [0, 1, -1, 2.5, Number.NaN]) {
        await expect(pool.tryPairSeats("truco-argentino", { pointsToWin: 15 }, seatCount)).rejects.toThrow(/seatCount/);
      }
      expect(await pool.count("truco-argentino", { pointsToWin: 15 })).toBe(2);
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
