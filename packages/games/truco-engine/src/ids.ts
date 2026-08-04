/**
 * Branded identifiers shared across the engine (design doc §4). Kept in
 * their own module so later slices (state, teams, players) reuse the exact
 * same nominal types instead of re-declaring compatible-looking strings.
 */
export type PlayerId = string & { readonly __brand: "PlayerId" };
export type TeamId = string & { readonly __brand: "TeamId" };
