import type { Redis } from "ioredis";
import type { GameId } from "@hexdev/platform-contract";
import { GLOBAL_POOL_KEY, assertValidSeatCount, modalityKey, type MatchmakingPool, type ModalityConfig, type SeatGroup, type WaitingPlayer } from "./presence.js";

/**
 * Redis-backed `MatchmakingPool` (see `presence.ts`'s own docstring: this is
 * "exactly what breaks first under horizontal scale" — two real players
 * waiting on DIFFERENT processes for the same modality never pair; each
 * process shows the other a waiting count of 1, and both wait forever).
 *
 * NOTE on redundancy with Colyseus's own `RedisDriver`/`RedisPresence`
 * (apply prompt: "if Colyseus's Redis driver turns out to make one of our
 * ports redundant... SAY SO"): once `.filterBy(["gameId"])` selection is
 * cluster-aware (RedisDriver's shared room registry) and `remoteRoomCall`
 * (RedisPresence's pub/sub) forwards a join to whichever process actually
 * owns the matching `PresenceRoom`, BOTH clients usually end up inside the
 * SAME room instance regardless of which process they first connected to —
 * at which point even the IN-MEMORY pool would already pair them correctly,
 * because both `join`/`tryPairSeats` calls execute inside that one owning
 * process. This adapter is NOT redundant, though: Colyseus's own room
 * creation has no distributed lock — two processes racing to `joinOrCreate`
 * before the driver's cache reflects a just-created room CAN briefly create
 * TWO "presence" rooms for the same `gameId`, each with its own in-memory
 * queue, silently splitting players in exactly the shape this whole unit
 * exists to close (see the apply report's own finding for the full
 * argument). A Redis-backed pool closes that residual race by construction:
 * `tryPairSeats` reads from ONE shared queue no matter how many room
 * instances call it.
 *
 * Storage: one Redis LIST (FIFO order, matching the in-memory adapter's own
 * `queue.splice(0, seatCount)` pop order) plus one Redis HASH (`connectionId
 * -> WaitingPlayer JSON`, for O(1) membership/dedup and payload lookup) per
 * queue. Every mutating operation is a single Lua script (`EVAL`), so it
 * runs to completion on the Redis server without interleaving another
 * client's command — the same atomicity guarantee the in-memory adapter's
 * own "no `await` between read and mutate" gives a single process, now
 * enforced by Redis instead of the JS event loop.
 */
export interface RedisMatchmakingPoolOptions {
  readonly redis: Redis;
  /** Namespaces every key this pool touches — required for the same reason
   * as `RedisRateLimiterOptions.keyPrefix`. */
  readonly keyPrefix: string;
}

function queueBaseKey(gameId: GameId, modality: ModalityConfig, poolKey: string): string {
  return `${gameId}:${modalityKey(modality)}:${poolKey}`;
}

const JOIN_SCRIPT = `
local indexKey, listKey, dataKey = KEYS[1], KEYS[2], KEYS[3]
local base, connectionId, payload = ARGV[1], ARGV[2], ARGV[3]
if redis.call("HEXISTS", dataKey, connectionId) == 0 then
  redis.call("SADD", indexKey, base)
  redis.call("RPUSH", listKey, connectionId)
  redis.call("HSET", dataKey, connectionId, payload)
end
return 1
`;

const LEAVE_SCRIPT = `
local listKey, dataKey = KEYS[1], KEYS[2]
local connectionId = ARGV[1]
if redis.call("HEXISTS", dataKey, connectionId) == 1 then
  redis.call("LREM", listKey, 1, connectionId)
  redis.call("HDEL", dataKey, connectionId)
end
return 1
`;

// Atomic FIFO pop of exactly seatCount (ARGV[1]) waiting players — the
// cross-process equivalent of the in-memory adapter's
// `queue.splice(0, seatCount)`. Returns an empty array (never partial:
// LLEN is checked FIRST, inside the same script) when fewer than seatCount
// are waiting. Still ONE EVAL, so the whole loop runs to completion on the
// Redis server without interleaving another client's command.
const TRY_PAIR_SEATS_SCRIPT = `
local listKey, dataKey = KEYS[1], KEYS[2]
local seatCount = tonumber(ARGV[1])
if tonumber(redis.call("LLEN", listKey)) < seatCount then
  return {}
end
local payloads = {}
for index = 1, seatCount do
  local connectionId = redis.call("LPOP", listKey)
  payloads[index] = redis.call("HGET", dataKey, connectionId)
  redis.call("HDEL", dataKey, connectionId)
end
return payloads
`;

export function createRedisMatchmakingPool(options: RedisMatchmakingPoolOptions): MatchmakingPool {
  const { redis, keyPrefix } = options;
  const indexKey = `${keyPrefix}:index`;
  const listKey = (base: string) => `${keyPrefix}:${base}:list`;
  const dataKey = (base: string) => `${keyPrefix}:${base}:data`;

  return {
    async join(gameId, modality, player, poolKey = GLOBAL_POOL_KEY) {
      const base = queueBaseKey(gameId, modality, poolKey);
      await redis.eval(JOIN_SCRIPT, 3, indexKey, listKey(base), dataKey(base), base, player.connectionId, JSON.stringify(player));
    },
    async leave(gameId, modality, connectionId, poolKey = GLOBAL_POOL_KEY) {
      const base = queueBaseKey(gameId, modality, poolKey);
      await redis.eval(LEAVE_SCRIPT, 2, listKey(base), dataKey(base), connectionId);
    },
    async count(gameId, modality, poolKey = GLOBAL_POOL_KEY) {
      const base = queueBaseKey(gameId, modality, poolKey);
      return redis.llen(listKey(base));
    },
    async tryPairSeats(gameId, modality, seatCount, poolKey = GLOBAL_POOL_KEY) {
      assertValidSeatCount(seatCount);
      const base = queueBaseKey(gameId, modality, poolKey);
      const result = (await redis.eval(TRY_PAIR_SEATS_SCRIPT, 2, listKey(base), dataKey(base), seatCount)) as string[];
      if (result.length === 0) return null;
      const group: SeatGroup = { players: result.map((payload) => JSON.parse(payload) as WaitingPlayer) };
      return group;
    },
    // Iterates every queue this pool has EVER seen (the `indexKey` set —
    // stale/emptied queue base keys are never removed from it, a known,
    // deliberate tradeoff: correctness over eagerly pruning an index whose
    // worst case is "a few wasted SMEMBERS entries with an empty list",
    // never a wrong sweep result). Same shape as the in-memory adapter's own
    // "iterate every queue" sweep — `isAlive` already returns `true` for any
    // connectionId a given caller does not itself track (see
    // `PresenceRoom.sweepZombies`), so a process only ever removes entries
    // it actually owns, safely, even though every process sees every queue.
    async sweep(isAlive) {
      const bases = await redis.smembers(indexKey);
      for (const base of bases) {
        const connectionIds = await redis.lrange(listKey(base), 0, -1);
        for (const connectionId of connectionIds) {
          if (!(await isAlive(connectionId))) {
            await redis.eval(LEAVE_SCRIPT, 2, listKey(base), dataKey(base), connectionId);
          }
        }
      }
    },
  };
}
