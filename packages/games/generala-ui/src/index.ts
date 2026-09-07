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
 * PARTIAL, AND SAYING SO. What exists today is one die drawn as a control and
 * the sheet the tray is laid out by. `createDieSlot` is deliberately NOT
 * exported: nothing outside this package composes a single die, and a public
 * export with zero consumers is the shape `escoba-ui`'s own barrel comment
 * argues against. Its consumer is the tray, one slice away.
 */
export { ensureTrayStyles, TRAY_STYLE_ID } from "./tray-styles.js";
