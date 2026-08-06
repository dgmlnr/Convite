import type { GameId } from "@hexdev/platform-contract";
import type { GameModuleRegistry, MatchmakingPool, RateLimiter } from "@hexdev/platform-core";
import { deriveLobbyDisplay } from "@hexdev/platform-core";

export interface PresenceRequestDeps {
  readonly registry: GameModuleRegistry;
  readonly pool: MatchmakingPool;
  readonly poolKey?: string;
  readonly ipLimiter: RateLimiter;
}

export interface PresenceRequestResult {
  readonly status: number;
  readonly body: string;
}

/**
 * A polled HTTP snapshot of the lobby's waiting counts (spec: "Lobby
 * Presence Counters Per Point-Target Room"). DEVIATION FROM DESIGN §8'S OWN
 * PUSH-CHANNEL SKETCH, disclosed: design describes a live Colyseus
 * `PresenceRoom` broadcast; that requires the `colyseus.js` BROWSER client as
 * a NEW dependency inside `apps/widget-app`, which would put `colyseus` in a
 * SECOND `package.json` — a hard architectural rule this apply prompt states
 * explicitly ("colyseus in exactly one package.json"). This handler reuses
 * the SAME `MatchmakingPool` instance the real `PresenceRoom` already
 * mutates (both are wired to the one process-wide pool in the composition
 * root), so the counts are genuinely live, just pulled instead of pushed —
 * a real, if less immediate, data path, not a mock.
 *
 * The zero-counter UX rule itself is NOT reimplemented here: `deriveLobbyDisplay`
 * (already `platform-core`, already used by `PresenceRoom`'s own broadcast)
 * is the single source of truth for it, per its own docstring's instruction
 * not to re-decide the rule per consumer.
 */
export function handlePresenceRequest(url: URL, clientIp: string | undefined, deps: PresenceRequestDeps): PresenceRequestResult {
  const gameId = url.searchParams.get("gameId");
  if (gameId === null || gameId === "") {
    return { status: 400, body: JSON.stringify({ error: "missing gameId" }) };
  }
  if (clientIp !== undefined && !deps.ipLimiter.tryConsume(clientIp)) {
    return { status: 429, body: JSON.stringify({ error: "rate-limited" }) };
  }
  const module = deps.registry.get(gameId as GameId);
  if (module === undefined) {
    return { status: 404, body: JSON.stringify({ error: "unknown game" }) };
  }
  const display = deriveLobbyDisplay(gameId as GameId, module.configOptions, deps.pool, deps.poolKey);
  return { status: 200, body: JSON.stringify(display) };
}
