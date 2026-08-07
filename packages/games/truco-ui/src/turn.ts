import { TABLE_STRINGS } from "./strings.js";

/** `turnSeat` is `HandView.turnSeat`, or `null` between hands (no `hand` in
 * the view yet — `PlayerView.hand` is `null` until the next hand is dealt). */
export function isMyTurn(mySeat: number, turnSeat: number | null): boolean {
  return turnSeat !== null && turnSeat === mySeat;
}

/** Spec: "Turn feedback: whose turn it is must be obvious without reading" —
 * this string is the readable half of that; `table.ts` pairs it with a
 * purely visual highlight on the active seat's anchor so a player never has
 * to actually read it to know whose turn it is. */
export function describeTurn(mySeat: number, turnSeat: number | null): string {
  if (turnSeat === null) return "";
  return isMyTurn(mySeat, turnSeat) ? TABLE_STRINGS.yourTurn : TABLE_STRINGS.opponentTurn;
}
