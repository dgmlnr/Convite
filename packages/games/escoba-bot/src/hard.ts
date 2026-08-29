import type { BotStrategy, RandomSource } from "@hexdev/platform-contract";
import type { Card, PlayCardAction, PlayerView } from "@hexdev/escoba-engine";
import { SETENTA_VALUE, cardId, cardValue } from "@hexdev/escoba-engine";
import { evaluateAction, resultingTable } from "./heuristics.js";

const FIFTEEN = 15;
// Every card VALUE has exactly one card per suit (ranks 1-7 map 1:1 to
// their value; sota/caballo/rey collapse three ranks to value 8/9/10 —
// values.ts) — so any single value has exactly 4 cards in the deck,
// regardless of which value it is (design §M1's own parity argument).
const CARDS_PER_VALUE = 4;
// Dwarfs any possible escoba/7-de-oro/oros/card-count scalar swing (design
// §D9's own weighting discipline), so a safe move always beats a capture
// that hands the opponent an escoba of EQUAL OR LESSER raw value — but a
// genuinely bigger prize (our own escoba, the 7 de oro, crossing the oros
// threshold) can still outweigh it, exactly like a real player would risk
// the point for the bigger one.
const RISK_WEIGHT = 1000;
// A tie-breaker only (design §D8: "tracking its own setenta") — scaled well
// under one unit of `cardCount`, so it never overrides the escoba/7-de-oro/
// oros/card-count ladder, only chooses among ties left by it.
const SETENTA_WEIGHT = 0.01;

function scalar(view: PlayerView, action: PlayCardAction): number {
  const value = evaluateAction(view, action);
  return value.escoba * 10_000_000 + value.sieteDeOro * 1_000_000 + value.orosProgress * 10_000 + value.cardCount;
}

/**
 * How many cards of `value` are already ACCOUNTED FOR from this bot's own
 * public knowledge after `action` resolves: its own remaining hand, the
 * table left behind, EVERY team's capture pile (public — design §D2), and
 * whatever this very action just moved into a pile. Never touches anything
 * this bot was not given — no opponent hand, no stock, no teammate hand
 * (the contract bars all three, `contract.ts:60-89`).
 */
function accountedForValue(view: PlayerView, action: PlayCardAction, table: readonly Card[], value: number): number {
  const ownHandAfter = view.self.hand.filter((c) => cardId(c) !== cardId(action.card));
  const existingPiles = view.hand === null ? [] : Object.values(view.hand.piles).flat();
  const justMoved = action.captured.length > 0 ? [...action.captured, action.card] : [];
  return [...ownHandAfter, ...table, ...existingPiles, ...justMoved].filter((c) => cardValue(c) === value).length;
}

/**
 * design §D8: "normal's value MINUS the opponent's best 1-ply reply,
 * simulated 1 ply on the resulting table (does it leave a sum-15 subset?
 * does it leave exactly 15, handing an escoba?)". The one reply worth
 * pricing is a sweep: if the table this action leaves behind sums to a
 * value some UNSEEN card could complete to exactly 15 while capturing the
 * WHOLE remaining table, that unseen card (wherever it actually is — stock
 * or an opponent's hand, this bot cannot and does not need to tell which)
 * hands the next player an escoba. "Unseen" is counted from PUBLIC
 * information only (own hand, table, both teams' piles — never a hidden
 * hand), which is also where "counting the public piles" (design §D8)
 * does its work.
 */
function opponentEscobaRisk(view: PlayerView, action: PlayCardAction): 0 | 1 {
  const table = resultingTable(view, action);
  if (table.length === 0) return 0; // this action IS the sweep — nothing left to hand anyone
  const tableSum = table.reduce((total, c) => total + cardValue(c), 0);
  const needed = FIFTEEN - tableSum;
  if (needed < 1 || needed > 10) return 0; // no card value could ever complete this table to 15
  const unseen = CARDS_PER_VALUE - accountedForValue(view, action, table, needed);
  return unseen > 0 ? 1 : 0;
}

/** design §D8: "tracking its own setenta by suit" via `SETENTA_VALUE`
 * (`setenta.ts`) — the marginal improvement this action's captured cards
 * make to the team's own best card per suit. A tie-breaker (see
 * `SETENTA_WEIGHT`), not a new priority tier. */
function setentaBonus(view: PlayerView, action: PlayCardAction): number {
  if (action.captured.length === 0) return 0;
  const ownPile = view.hand === null ? [] : view.hand.piles[view.self.teamId];
  const bestBySuit = new Map<string, number>();
  for (const c of ownPile) bestBySuit.set(c.suit, Math.max(bestBySuit.get(c.suit) ?? 0, SETENTA_VALUE[c.rank]));
  let bonus = 0;
  for (const c of [...action.captured, action.card]) {
    const current = bestBySuit.get(c.suit) ?? 0;
    if (SETENTA_VALUE[c.rank] > current) bonus += SETENTA_VALUE[c.rank] - current;
  }
  return bonus;
}

function hardScore(view: PlayerView, action: PlayCardAction): number {
  return scalar(view, action) - RISK_WEIGHT * opponentEscobaRisk(view, action) + SETENTA_WEIGHT * setentaBonus(view, action);
}

export function createHardBot(rng: RandomSource): BotStrategy<PlayerView, PlayCardAction> {
  return {
    chooseAction(view, legalActions) {
      if (legalActions.length === 0) throw new Error("createHardBot: no legal actions to choose from");
      let bestScore = hardScore(view, legalActions[0]!);
      let tied: PlayCardAction[] = [legalActions[0]!];
      for (const action of legalActions.slice(1)) {
        const score = hardScore(view, action);
        if (score > bestScore) {
          bestScore = score;
          tied = [action];
        } else if (score === bestScore) {
          tied.push(action);
        }
      }
      return tied.length === 1 ? tied[0]! : tied[Math.floor(rng() * tied.length)]!;
    },
  };
}
