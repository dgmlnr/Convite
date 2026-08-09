import { calculateEnvidoPoints, cardPower } from "@hexdev/truco-engine";
import type { Card, HandPlay, TeamId } from "@hexdev/truco-engine";

/**
 * Sum of the real engine's card power across a hand — the bot's own proxy
 * for "how strong are these cards for winning tricks". Delegates to the
 * engine's `cardPower` (design: never reimplement rules the engine already
 * owns), never guesses at hidden state.
 */
export function handPower(hand: readonly Card[]): number {
  return hand.reduce((sum, card) => sum + cardPower(card), 0);
}

/** Thin re-export of the engine's own envido calculation — same reasoning
 * as `handPower`: the bot never reimplements a rule the engine already has. */
export function envidoPoints(hand: readonly Card[]): number {
  return calculateEnvidoPoints(hand);
}

/**
 * Scores playing `myCard` against an ALREADY-VISIBLE `opponentCard` (public
 * information — the opponent's card is exposed in `HandView.currentTrickPlays`
 * once played, unlike unplayed hand cards). No hidden-state guessing needed
 * here, so this is shared identically by every tier that faces this exact
 * situation: prefer the cheapest card that still wins, and if no card wins,
 * sacrifice the cheapest one rather than the strongest.
 */
export function scoreFollowingCardPlay(myCard: Card, opponentCard: Card): number {
  const diff = cardPower(myCard) - cardPower(opponentCard);
  if (diff > 0) return 1000 - cardPower(myCard);
  if (diff === 0) return 500 - cardPower(myCard);
  return -cardPower(myCard);
}

/**
 * The 2v2-safe replacement for `currentTrickPlays[0]` (a real bug named in
 * the design/apply-progress "assumes exactly one opponent" gap: every bot
 * tier used to read the FIRST play in the trick as if it were always THE
 * opponent's card — in 2v2 the first play can legitimately be a TEAMMATE's,
 * since seats alternate around the table, not strictly opponent/opponent).
 * Filters to plays from a DIFFERENT team than `selfTeamId`, and returns the
 * STRONGEST one — the card that actually has to be beaten, since either
 * opponent's play is the one this bot's own team must overcome. `undefined`
 * means "nothing to follow yet" (leading, or only a teammate has played),
 * the same signal `cardPlayChoice`/`hard.ts` already branch on.
 *
 * For 1v1, this is provably identical to the old `currentTrickPlays[0]`
 * read: a 1v1 team has exactly one player, so the only entry that can ever
 * be in `currentTrickPlays` before this bot's own turn is the opponent's.
 */
export function strongestOpposingPlay(selfTeamId: TeamId, currentTrickPlays: readonly HandPlay[]): Card | undefined {
  const opposing = currentTrickPlays.filter((play) => play.teamId !== selfTeamId);
  if (opposing.length === 0) return undefined;
  return opposing.reduce((best, play) => (cardPower(play.card) > cardPower(best.card) ? play : best)).card;
}
