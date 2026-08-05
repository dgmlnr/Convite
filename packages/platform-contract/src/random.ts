/**
 * A source of entropy in `[0, 1)`, shaped exactly like `Math.random`. Lives
 * here (L0, zero deps) rather than in `platform-core` or a game package so
 * both a registry (`platform-core`) and a game's own system-action factory
 * (e.g. `truco-module`) can share ONE type with no new dependency edge.
 *
 * This is deliberately NOT a `GameModule` port member (see apply-progress's
 * system-action design note): the engine never randomizes, and the port
 * stays free of anything only the server-side entropy source needs.
 */
export type RandomSource = () => number;
