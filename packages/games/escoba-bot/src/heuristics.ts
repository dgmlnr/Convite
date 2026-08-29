import type { Card, PlayCardAction, PlayerView, Suit } from "@hexdev/escoba-engine";
import { cardId } from "@hexdev/escoba-engine";

const ORO_SUIT: Suit = "oro";
const SIETE_DE_ORO_RANK = 7;
// art. 10.1's own threshold ("el que tenga como mínimo SEIS de ellos
// ganará") — mirrors `escoba-engine/src/scoring.ts`'s own `OROS_THRESHOLD`,
// not exported there, so redeclared here with the same citation. Same
// discipline as `setenta.ts`'s own comment about NOT reusing `cardValue`'s
// table: two modules independently encoding the same rule number is safer
// than a cross-layer import a bot has no other reason to take.
const OROS_THRESHOLD = 6;

function isSieteDeOro(c: Card): boolean {
  return c.rank === SIETE_DE_ORO_RANK && c.suit === ORO_SUIT;
}

/** The table this action would leave behind, computed from the CURRENT
 * public view — never from anything the bot was not given. */
export function resultingTable(view: PlayerView, action: PlayCardAction): readonly Card[] {
  const table = view.hand?.table ?? [];
  if (action.captured.length === 0) return [...table, action.card];
  const capturedIds = new Set(action.captured.map(cardId));
  return table.filter((c) => !capturedIds.has(cardId(c)));
}

/**
 * design §D8, the normal tier's one-ply value, in strict priority order:
 * escoba > 7 de oro > oros approaching six > card count. A stay-on-table
 * action (`captured: []`) scores 0 on every dimension — it changes nothing
 * about the table or either pile — "so it wins only when every capture is
 * worse" (design's own words). This is shared with the hard tier (design:
 * "normal's value MINUS the opponent's best 1-ply reply"), so both tiers
 * compare through the exact same ladder.
 */
export interface ActionValue {
  readonly escoba: 0 | 1;
  readonly sieteDeOro: 0 | 1;
  readonly orosProgress: number;
  readonly cardCount: number;
}

export function evaluateAction(view: PlayerView, action: PlayCardAction): ActionValue {
  if (action.captured.length === 0) return { escoba: 0, sieteDeOro: 0, orosProgress: 0, cardCount: 0 };

  const table = view.hand?.table ?? [];
  const gained = [...action.captured, action.card];
  const isEscoba = action.captured.length === table.length; // captured IS the whole table (art. 14.1)
  const currentOros = view.hand === null ? 0 : view.hand.piles[view.self.teamId].filter((c) => c.suit === ORO_SUIT).length;
  const gainedOros = gained.filter((c) => c.suit === ORO_SUIT).length;

  return {
    escoba: isEscoba ? 1 : 0,
    sieteDeOro: gained.some(isSieteDeOro) ? 1 : 0,
    orosProgress: gainedOros === 0 ? 0 : Math.min(currentOros + gainedOros, OROS_THRESHOLD),
    cardCount: gained.length,
  };
}

/** Positive when `a` beats `b`, following the same strict ladder
 * `evaluateAction` produces — never mixes dimensions into one number, so a
 * card-count edge can never outweigh an oros or escoba difference. */
export function compareActionValue(a: ActionValue, b: ActionValue): number {
  if (a.escoba !== b.escoba) return a.escoba - b.escoba;
  if (a.sieteDeOro !== b.sieteDeOro) return a.sieteDeOro - b.sieteDeOro;
  if (a.orosProgress !== b.orosProgress) return a.orosProgress - b.orosProgress;
  return a.cardCount - b.cardCount;
}

/** Picks the best-valued action, breaking exact ties with the injected
 * `rng` (design §D8: "used ONLY to break ties among equally-valued
 * actions, so tests are deterministic"). */
export function pickBestByValue<T>(
  legalActions: readonly T[],
  valueOf: (action: T) => ActionValue,
  rng: () => number,
): T {
  let bestValue = valueOf(legalActions[0]!);
  let tied: T[] = [legalActions[0]!];
  for (const action of legalActions.slice(1)) {
    const value = valueOf(action);
    const cmp = compareActionValue(value, bestValue);
    if (cmp > 0) {
      bestValue = value;
      tied = [action];
    } else if (cmp === 0) {
      tied.push(action);
    }
  }
  return tied.length === 1 ? tied[0]! : tied[Math.floor(rng() * tied.length)]!;
}
