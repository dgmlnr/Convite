import { LAYOUT, isFree } from "@hexdev/mahjong-solitaire-engine";
import type { BoardTiles } from "./board-identity.js";

/**
 * Which positions the player may pick up right now — the board's own answer
 * to "is this tile reachable", separate from "does it have a partner".
 *
 * WHY THIS EXISTS AT ALL. `legalActions` names PAIRS, so a tile that is free
 * with no free twin appears in none of them and is, to a client reading only
 * that list, indistinguishable from a tile buried under three layers. The
 * board needs both facts and the wire carries one, so the second is derived
 * here from data the client already holds.
 *
 * DERIVED RATHER THAN SENT, and that is a scope decision rather than a
 * preference. Shipping a free-position list would mean a new field on the
 * payload every game shares — `platform-contract`, the transport, and each
 * module's own projection — to serve one game's presentation. `isFree` takes
 * its occupancy AS AN ARGUMENT precisely so more than one caller can ask
 * (`freedom.ts` records that as design D7, for play and for reverse
 * generation); a renderer holding the board is one such caller.
 *
 * IT DECIDES NOTHING AND AUTHORISES NOTHING. A selection is a highlight. The
 * removal it may lead to is still checked against the server's own offer, by
 * `resolvePress` on the way out and by `applyAction` on arrival — so the worst
 * a disagreement here could produce is a tile that lights up and then refuses
 * to pair, never a move the server did not sanction.
 *
 * `BoardTiles` IS THE OCCUPANCY, once its holes are dropped: the array carries
 * one slot per layout position and `null` where a tile has been taken. That
 * correspondence is the only thing this function knows that the engine does
 * not, and `liftable.test.ts` pins it against `isFree` position by position
 * rather than restating the freedom rule.
 */
export function liftablePositions(tiles: BoardTiles): ReadonlySet<number> {
  const occupied = new Set<number>();
  for (let position = 0; position < LAYOUT.length; position += 1) {
    if (tiles[position] != null) occupied.add(position);
  }

  const liftable = new Set<number>();
  for (const position of occupied) {
    if (isFree(position, occupied)) liftable.add(position);
  }
  return liftable;
}
