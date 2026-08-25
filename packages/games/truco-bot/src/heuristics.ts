import { calculateEnvidoPoints, cardPower } from "@hexdev/truco-engine";
import type { Card, HandPlay, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";

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
 * The three cards this viewer was DEALT. Everything about the envido is
 * worth this, never `view.self.hand` on its own.
 *
 * `view.self.hand` shrinks as cards are played — right for the trick game,
 * wrong for every envido question, and wrong in the direction that loses
 * hands: the engine scores the dealt three (`dealtCardsFor`), so a bot
 * reading the remainder is arguing against a number nobody else is using.
 *
 * ONE HELPER FOR ALL THREE CALLERS (the call threshold, the declaration
 * choice, and the advice a partner gives) because they are the same question
 * asked at three moments, and the moments are exactly the ones where a card
 * may already be down. `currentTrickPlays` is enough to put them back for the
 * same reason it is in the engine: an envido is legal only while the first
 * trick is unresolved, so nothing has been swept out of it yet.
 */
export function dealtCardsOf(view: PlayerView): readonly Card[] {
  const played = (view.hand?.currentTrickPlays ?? []).filter((play) => play.playerId === view.self.playerId).map((play) => play.card);
  return played.length === 0 ? view.self.hand : [...view.self.hand, ...played];
}

/** `envidoPoints` over what the viewer was dealt — see `dealtCardsOf`. */
export function dealtEnvidoPoints(view: PlayerView): number {
  return calculateEnvidoPoints(dealtCardsOf(view));
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

/**
 * The PARTNER's best card already on the table this trick — the mirror image
 * of `strongestOpposingPlay`, on the bot's OWN side of the team line. Same
 * public information (`HandView.currentTrickPlays`), filtered to plays from
 * the bot's own team EXCLUDING the bot itself (a bot still choosing a card
 * has not played this trick, but the exclusion keeps the helper honest
 * instead of leaning on that invariant). `undefined` means "no partner play
 * to lean on" — ALWAYS the case in 1v1, where a team has exactly one player,
 * so every consumer branch gated on this result is unreachable there by
 * construction (the same 1v1-identical-behavior discipline
 * `strongestOpposingPlay` documents above).
 */
export function strongestPartnerPlay(selfPlayerId: PlayerId, selfTeamId: TeamId, currentTrickPlays: readonly HandPlay[]): Card | undefined {
  const partner = currentTrickPlays.filter((play) => play.teamId === selfTeamId && play.playerId !== selfPlayerId);
  if (partner.length === 0) return undefined;
  return partner.reduce((best, play) => (cardPower(play.card) > cardPower(best.card) ? play : best)).card;
}

/**
 * "The trick is already secured by my team": this bot acts LAST this trick —
 * every other seat's play is on the table (`currentTrickPlays` holds exactly
 * one play per teammate and opponent) — AND the partner's best play STRICTLY
 * beats the strongest opposing one. Strict, because an equal-power meeting
 * is a parda, not a win (`resolveTrick`: a team wins only when its best play
 * OUT-powers the other team's best). When this holds, the engine awards the
 * trick to this team no matter which card the bot adds, so "beat the
 * opposition" stops being a goal at all — the only card left to outdo is the
 * partner's own. Public information only, and in 1v1 it is `false` by
 * construction: no teammate exists to have played.
 */
export function isTrickSecuredByTeam(view: PlayerView): boolean {
  const plays = view.hand?.currentTrickPlays ?? [];
  if (plays.length !== view.teammates.length + view.opponents.length) return false;
  const partnerCard = strongestPartnerPlay(view.self.playerId, view.self.teamId, plays);
  if (partnerCard === undefined) return false;
  const opposingCard = strongestOpposingPlay(view.self.teamId, plays);
  if (opposingCard === undefined) return false;
  return cardPower(partnerCard) > cardPower(opposingCard);
}
