/**
 * THE GENERALA BOARD — the L1 consumer `dice-ui` has been naming since it
 * shipped, and the tier where the two halves of this game finally meet.
 *
 * `generala-engine` says what a move IS; `dice-ui` says what a die LOOKS
 * LIKE; neither may import the other, and neither is allowed to learn the
 * other's job. This package composes them, and it is the only place in the
 * repository where both are in scope at once — which is why `DieFace` is
 * declared twice on purpose (D14) and meets here, exactly as
 * `escoba-engine`'s `Card` and `spanish-deck-ui`'s already do.
 *
 * L1, by rule as well as by intention (`l1-no-l2-l3`): it may reach down to
 * an engine and to an art package, and it may not reach up to a module, a
 * transport, the widget SDK or an app. A hold therefore cannot be validated
 * here even by accident — the only legality this package can read is an offer
 * list somebody hands it.
 *
 * PARTIAL, AND SAYING SO. The tray, the dice it holds, the control that
 * commits a hold, the planilla every seat reads and the region that says what
 * was thrown, what was written, what a servida throw is worth, who won and
 * the two ways out of a finished match are all here. It is no longer partial:
 * what is left is a board that mounts them. `createDieSlot` is deliberately NOT exported: nothing
 * outside this package composes a single die, and a public export with zero
 * consumers is the shape `escoba-ui`'s own barrel comment argues against.
 * `CATEGORY_LABELS` and `seatLabel` are not exported either, for the same
 * reason and one more: they are how the planilla and the announcer agree with
 * EACH OTHER, and a board naming a box its own third way is exactly the
 * disagreement sharing them exists to prevent.
 */
export { createGeneralaTray } from "./tray.js";
export type { GeneralaTrayElements, GeneralaTrayRender } from "./tray.js";
export { ensureTrayStyles, TRAY_STYLE_ID } from "./tray-styles.js";
export { renderGeneralaScorecard } from "./scorecard.js";
export type { GeneralaScorecardRender } from "./scorecard.js";
export { ensureScorecardStyles, SCORECARD_STYLE_ID } from "./scorecard-styles.js";
export { createGeneralaAnnouncer } from "./announcer.js";
export type { GeneralaAnnouncer } from "./announcer.js";
export { renderServidaCallout } from "./servida.js";
export { ensureServidaStyles, SERVIDA_STYLE_ID } from "./servida-styles.js";
export { renderGeneralaMatchOver } from "./match-over.js";
export type { GeneralaMatchOverActions, GeneralaMatchOverRender } from "./match-over.js";
export { ensureMatchOverStyles, MATCH_OVER_STYLE_ID } from "./match-over-styles.js";
