import type { TeamId } from "@hexdev/truco-engine";

/**
 * Turns a resolved trick's `winnerTeamId` (from `HandView.trickOutcomes`,
 * already computed by the engine's own `resolveTrick` — never re-judged
 * here) into the readable half of "obvious who won the trick". `table.ts`
 * pairs this with the last-seen played card for a moment before the next
 * trick starts.
 */
export function describeTrickOutcome(myTeamId: TeamId, winnerTeamId: TeamId | null): string {
  if (winnerTeamId === null) return "Baza parda";
  return winnerTeamId === myTeamId ? "Ganaste la baza" : "Ganó el rival";
}
