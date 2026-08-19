import { cardPower } from "@hexdev/truco-engine";
import type { Action, Card, PlayerView } from "@hexdev/truco-engine";
import type { BotStrategy, RandomSource } from "@hexdev/platform-contract";
import { sampleHiddenHands } from "./determinize.js";
import type { HiddenHands } from "./determinize.js";
import { envidoPoints, handPower, isTrickSecuredByTeam, scoreFollowingCardPlay, strongestOpposingPlay } from "./heuristics.js";

/** Number of determinizations sampled per decision — a tunable search
 * budget, same spirit as `budgetMs` on `BotStrategy.chooseAction`. Kept
 * small enough that even the seeded tournament (hundreds of hands) runs
 * comfortably inside the suite. */
const DEFAULT_SAMPLES = 24;

type RespondTruco = Extract<Action, { type: "respond-truco" }>;
type RespondEnvido = Extract<Action, { type: "respond-envido" }>;
type PlayCard = Extract<Action, { type: "play-card" }>;

/**
 * Fraction of sampled rounds the bot's TEAM outscores the opposing team on
 * `metric` — the core Monte Carlo primitive every call/response decision
 * below is built from (successor of the old own-hand-vs-worst-opponent
 * `winRate`; the two are provably the same thing in 1v1, see below).
 *
 * BOTH sides of the comparison are now the same team model: a side's value is
 * the metric of its strongest member's hand. For the OPPOSING side that is
 * what this decision always did — pick, per round, whichever sampled opponent
 * hand scores highest, pessimistic: assume the stronger of however many real
 * opponents exist is the relevant one. For the BOT'S side it is the round's
 * sampled partner hand joined in via `Math.max`, and the honesty argument
 * differs per metric:
 *
 * - envido: max-per-team is the ENGINE'S OWN RULE, not a proxy — all four
 *   declare and the best declaration wins (`resolveEnvidoDeclarations`), so
 *   `max(own, partner)` is exactly the quantity the showdown compares.
 * - truco (`handPower`, a SUM proxy for one hand's trick strength): the team
 *   analogue chosen is the STRONGER MEMBER'S handPower, not the union's top
 *   three and not the sum of both hands. `resolveTrick` scores each trick as
 *   the team's best play, so the stronger hand alone can contest every trick
 *   (three cards, three tricks) — its strength is a floor the team realizes
 *   with NO coordination assumed, which matters for a partner hand that is
 *   itself only a guess. Summing both hands would double-count (per trick
 *   only the better of the team's two cards can matter), and a top-3-of-the-
 *   union model would assume perfect play-order coordination with a hand the
 *   bot cannot see. Max-of-members is the minimal model that is symmetric
 *   with how the opposing side has always been scored here.
 *
 * In 1v1 (`round.partner === null`, exactly one opponent hand per round) both
 * maxes are the identity and this collapses to the exact comparison the old
 * `winRate`/`worstCaseOpposingHands` pair computed — the DISCLOSED
 * SIMPLIFICATION those carried ("does not model the bot's OWN teammate's hand
 * at all") is closed here, and closed only where a teammate exists to model.
 */
function teamWinRate(ownHand: readonly Card[], rounds: readonly HiddenHands[], metric: (hand: readonly Card[]) => number): number {
  const ownValue = metric(ownHand);
  const wins = rounds.filter((round) => {
    const sideValue = round.partner === null ? ownValue : Math.max(ownValue, metric(round.partner));
    const opposingValue = round.opponents.length === 0 ? metric([]) : Math.max(...round.opponents.map(metric));
    return sideValue > opposingValue;
  }).length;
  return wins / rounds.length;
}

function respondChoice<T extends RespondTruco | RespondEnvido>(group: readonly T[], favored: boolean): Action {
  return group.find((action) => action.response === (favored ? "quiero" : "no-quiero")) ?? group[0]!;
}

/**
 * Leading the trick: no opponent card is visible yet, so — unlike the
 * normal tier's static "always play weakest" habit — determinize the
 * opposing hand(s) and score each candidate by how often it beats the
 * STRONGEST card among ALL of them combined (pessimistic: assume whichever
 * opponent is about to act defends with their best available response —
 * generalizes cleanly from 1v1's single opponent to 2v2's two, since either
 * one might be the seat that actually follows).
 *
 * TIE-BREAK: that score is a COUNT of rounds won, so it discards card power —
 * two cards of different power land on the same count in roughly 18% of
 * leading decisions, and the count alone cannot separate them. It used to
 * fall through to `reduce`'s incumbent, i.e. whichever tied card came first
 * in `legalActions` — engine order, which is deal order (`card-play.ts` maps
 * `player.hand` straight through, and nothing sorts a hand), so the choice
 * was arbitrary with respect to power rather than wrong in a fixed direction.
 *
 * The count is monotone in `cardPower`: a stronger card beats every pool a
 * weaker one beats. So an equal count means the two cards won the very SAME
 * rounds, not merely as many — the stronger card is estimated to do nothing
 * extra THIS trick while being worth strictly more in the tricks still to
 * come (a tie needs 2+ cards in hand, so a later trick always exists). Play
 * the weaker one. That is `scoreFollowingCardPlay`'s "cheapest card that
 * still wins" applied to the leading branch, and the same conserve-strength
 * habit the normal tier already states outright for leading.
 *
 * Equal power ties resolve to the incumbent, keeping a seeded line stable.
 *
 * Deliberately NO partner-aware variant of this branch, and the reason is
 * worth pinning so nobody "closes the gap" again (native review WARNING,
 * review-1c7acbeec743da97): the state it would serve — the partner has
 * played this trick and no opponent has yet — is unreachable in this
 * engine. Teams are seat parity (`createTeamMatch`: seats 0/2 vs 1/3) and a
 * trick rotates strictly seat+1 (`card-play.ts`), so the seat playing
 * immediately before this bot is ALWAYS an opponent: whenever the bot is
 * not leading, an opposing play is already on the table and the follow
 * branch above handles it. This branch therefore only ever runs with an
 * empty trick, where the solo scoring is exactly right.
 */
function leadingCardPlayChoice(group: readonly PlayCard[], roundsOfOpposingHands: readonly (readonly (readonly Card[])[])[]): Action {
  const combinedPools = roundsOfOpposingHands.map((round) => round.flat());
  const score = (card: Card) => combinedPools.filter((pool) => pool.length > 0 && cardPower(card) > Math.max(...pool.map(cardPower))).length;
  return group.reduce((best, candidate) => {
    const margin = score(candidate.card) - score(best.card);
    if (margin !== 0) return margin > 0 ? candidate : best;
    return cardPower(candidate.card) < cardPower(best.card) ? candidate : best;
  });
}

export function createHardBot(rng: RandomSource, samples = DEFAULT_SAMPLES): BotStrategy<PlayerView, Action> {
  return {
    chooseAction(view, legalActions) {
      if (legalActions.length === 0) {
        throw new Error("createHardBot: no legal actions to choose from");
      }

      // One round = one sampled hand per REAL opponent (1 in 1v1, up to 2 in
      // 2v2) PLUS the partner's, all disjoint from one shared pool
      // (`sampleHiddenHands`, replacing `sampleAllOpponentHands`, which let
      // an opponent sample hold a card the partner actually held).
      const rounds = Array.from({ length: samples }, () => sampleHiddenHands(view, rng));

      const respondTruco = legalActions.filter((a): a is RespondTruco => a.type === "respond-truco");
      if (respondTruco.length > 0) {
        return respondChoice(respondTruco, teamWinRate(view.self.hand, rounds, handPower) > 0.5);
      }

      const respondEnvido = legalActions.filter((a): a is RespondEnvido => a.type === "respond-envido");
      if (respondEnvido.length > 0) {
        return respondChoice(respondEnvido, teamWinRate(view.self.hand, rounds, envidoPoints) > 0.5);
      }

      const reveal = legalActions.find((a) => a.type === "reveal-envido");
      if (reveal !== undefined) return reveal;

      const wantsToCallTruco = legalActions.find((a) => a.type === "call-truco");
      if (wantsToCallTruco !== undefined && teamWinRate(view.self.hand, rounds, handPower) > 0.5) return wantsToCallTruco;

      const wantsToCallEnvido = legalActions.find((a) => a.type === "call-envido");
      if (wantsToCallEnvido !== undefined && teamWinRate(view.self.hand, rounds, envidoPoints) > 0.5) return wantsToCallEnvido;

      const cardPlays = legalActions.filter((a): a is PlayCard => a.type === "play-card");
      if (cardPlays.length > 0) {
        // `strongestOpposingPlay` (heuristics.ts), not currentTrickPlays[0]:
        // in 2v2 the first play in the trick can be a TEAMMATE's, which must
        // never be read as "the card to beat" — see that function's own
        // docstring for the fixed bug and its 1v1-identical-behavior proof.
        const opponentCard = strongestOpposingPlay(view.self.teamId, view.hand?.currentTrickPlays ?? []);
        if (opponentCard !== undefined) {
          // The a1 team-coordination gap, closed (same gate as the normal
          // tier, same reason): the bot closes a trick its partner already
          // won — `resolveTrick` scores the TEAM's best play, so beating
          // `opponentCard` cheaply would only outdo the PARTNER. Dump the
          // cheapest card instead; equal power keeps the incumbent, the
          // same seeded-line stability rule as `leadingCardPlayChoice`.
          // `false` in every 1v1 state by construction — see the predicate.
          if (isTrickSecuredByTeam(view)) {
            return cardPlays.reduce((best, candidate) => (cardPower(candidate.card) < cardPower(best.card) ? candidate : best));
          }
          return cardPlays.reduce((best, candidate) =>
            scoreFollowingCardPlay(candidate.card, opponentCard) > scoreFollowingCardPlay(best.card, opponentCard) ? candidate : best,
          );
        }
        // No opposing card means an EMPTY trick, in 2v2 as much as in 1v1:
        // the seat before this bot is always an opponent (seat-parity teams,
        // strict seat+1 rotation), so a non-empty trick always has an
        // opposing play — see `leadingCardPlayChoice`'s docstring for why no
        // partner-aware variant of the leading score exists.
        //
        // Only the OPPONENT hands feed the leading score — its semantics are
        // untouched by this slice (the partner's sample is a call-decision
        // input, not a card-to-beat), and `sampleHiddenHands` deals opponents
        // FIRST, so within a round their draws are exactly what the old
        // sampler dealt. What does move in 2v2: the partner draws advance the
        // shared rng stream between rounds, so a given seed replays a
        // different — equally valid — set of rounds than pre-slice, and a
        // near-tie leading choice can land differently. Expected and
        // disclosed, not a semantic change. In 1v1 no partner is dealt and
        // the stream, rounds and decisions are byte-identical.
        return leadingCardPlayChoice(cardPlays, rounds.map((round) => round.opponents));
      }

      return legalActions[0]!;
    },
  };
}
