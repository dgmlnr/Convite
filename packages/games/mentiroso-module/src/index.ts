import type { HiddenState } from "@hexdev/platform-contract";
import type { MatchState } from "@hexdev/mentiroso-engine";
import { secretsFor } from "@hexdev/mentiroso-engine";
import { SYSTEM_ACTOR_ID, requestMentirosoSystemAction } from "./roll.js";
import type { MentirosoSystemAction, OpeningDrawRollAction, RoundRollAction } from "./roll.js";

export { SYSTEM_ACTOR_ID, requestMentirosoSystemAction };
export type { MentirosoSystemAction, OpeningDrawRollAction, RoundRollAction };

/**
 * `mentiroso-module`'s public barrel (SDD `mentiroso`, work unit C2/task
 * 3.2) — the FIRST export surface this package has, matching `truco-module`'s
 * own `index.ts` shape: re-export the system-action door (`roll.ts`, work
 * unit C1) above, and declare the ONE `hiddenState` every seat-count
 * registration will share, below.
 *
 * `mentirosoHiddenState` IS NOT CONSUMED HERE YET — the same
 * introduce-then-adopt split this whole chain has followed since work unit
 * A2. Work units 3.3/3.4 (the seat-count=2/4/6 `GameModule` registrations)
 * spread this exact binding into their own `hiddenState` field, mirroring
 * `truco-module/src/index.ts`'s own local `hiddenState` const — reused
 * unchanged across `trucoModule` and `trucoModule2v2` there, and across all
 * three mentiroso registrations here — "shared not copied" (design D4): two
 * copies of a redaction rule are two places for it to drift.
 *
 * Exported (unlike truco's private local const) so THIS unit's own
 * `index.test.ts` can run the real platform scan (`findLeakedSecrets`)
 * against it before any registration exists, and so 3.3/3.4 can import it
 * once `GameModule` construction moves to its own file. `secretsFor` is
 * handed straight through, never wrapped — `mentiroso-engine/src/view.ts`'s
 * own docblock names this exact unit as the place that happens "with no
 * adapter", and this file's own test asserts that by reference, not just by
 * behavior.
 */
export const mentirosoHiddenState: HiddenState<MatchState> = {
  kind: "hidden-per-seat",
  secretsFor,
};
