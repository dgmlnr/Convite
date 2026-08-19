import { cardPower } from "@hexdev/truco-engine";
import type { Action, PlayerView } from "@hexdev/truco-engine";
import type { BotStrategy } from "@hexdev/platform-contract";
import { envidoPoints, handPower, isTrickSecuredByTeam, scoreFollowingCardPlay, strongestOpposingPlay } from "./heuristics.js";

/** Heuristic thresholds (bot domain knowledge, not the engine's real point
 * values — see `heuristics.ts`). Roughly the midpoint of a 3-card hand's
 * possible power/envido range; "aggressive" is set clearly above it so a
 * proactive call is only volunteered with a genuinely strong hand. */
const ACCEPT_TRUCO_THRESHOLD = 22;
const AGGRESSIVE_TRUCO_THRESHOLD = 28;
const ACCEPT_ENVIDO_THRESHOLD = 23;
const AGGRESSIVE_ENVIDO_THRESHOLD = 27;

type RespondTruco = Extract<Action, { type: "respond-truco" }>;
type RespondEnvido = Extract<Action, { type: "respond-envido" }>;
type PlayCard = Extract<Action, { type: "play-card" }>;

function respondTrucoChoice(view: PlayerView, group: readonly RespondTruco[]): Action {
  const accept = handPower(view.self.hand) >= ACCEPT_TRUCO_THRESHOLD;
  return group.find((action) => action.response === (accept ? "quiero" : "no-quiero")) ?? group[0]!;
}

function respondEnvidoChoice(view: PlayerView, group: readonly RespondEnvido[]): Action {
  const accept = envidoPoints(view.self.hand) >= ACCEPT_ENVIDO_THRESHOLD;
  return group.find((action) => action.response === (accept ? "quiero" : "no-quiero")) ?? group[0]!;
}

/** Light lookahead (design/spec: "normal: weighted heuristics with light
 * lookahead"): when an OPPOSING card for this trick is already visible
 * (public info, `HandView.currentTrickPlays` — via `strongestOpposingPlay`,
 * which correctly ignores a teammate's own earlier play in 2v2, see
 * heuristics.ts's own docstring on the bug this fixes), score exactly via
 * `scoreFollowingCardPlay`. Otherwise (leading the trick, OR only a
 * teammate has played so far) no hidden information is needed either — the
 * static, non-guessing habit is to conserve strength: play the weakest
 * card now, save strong cards for later tricks.
 *
 * One team-aware exception to "follow the opposing card": when this bot
 * CLOSES the trick and the partner's play already beats every opposing card
 * (`isTrickSecuredByTeam` — public info, still nothing sampled or guessed),
 * `resolveTrick` scores the TEAM's best play, so the trick is won whatever
 * this bot adds. "Beat it cheaply" would only outdo the bot's OWN partner,
 * burning a winner for zero tricks — so the opposing card is deliberately
 * ignored and the conserve-strength dump above applies instead. In 1v1 the
 * predicate is `false` by construction (no teammate can have played), so
 * that path is byte-identical to the old behavior there. */
function cardPlayChoice(view: PlayerView, group: readonly PlayCard[]): Action {
  const opponentCard = strongestOpposingPlay(view.self.teamId, view.hand?.currentTrickPlays ?? []);
  const cardToBeat = opponentCard !== undefined && !isTrickSecuredByTeam(view) ? opponentCard : undefined;
  return group.reduce((best, candidate) => {
    const bestScore = cardToBeat === undefined ? -cardPower(best.card) : scoreFollowingCardPlay(best.card, cardToBeat);
    const candidateScore = cardToBeat === undefined ? -cardPower(candidate.card) : scoreFollowingCardPlay(candidate.card, cardToBeat);
    return candidateScore > bestScore ? candidate : best;
  });
}

export function createNormalBot(): BotStrategy<PlayerView, Action> {
  return {
    chooseAction(view, legalActions) {
      if (legalActions.length === 0) {
        throw new Error("createNormalBot: no legal actions to choose from");
      }

      const respondTruco = legalActions.filter((a): a is RespondTruco => a.type === "respond-truco");
      if (respondTruco.length > 0) return respondTrucoChoice(view, respondTruco);

      const respondEnvido = legalActions.filter((a): a is RespondEnvido => a.type === "respond-envido");
      if (respondEnvido.length > 0) return respondEnvidoChoice(view, respondEnvido);

      const reveal = legalActions.find((a) => a.type === "reveal-envido");
      if (reveal !== undefined) return reveal;

      const wantsToCallTruco = legalActions.find((a) => a.type === "call-truco");
      if (wantsToCallTruco !== undefined && handPower(view.self.hand) >= AGGRESSIVE_TRUCO_THRESHOLD) return wantsToCallTruco;

      const wantsToCallEnvido = legalActions.find((a) => a.type === "call-envido");
      if (wantsToCallEnvido !== undefined && envidoPoints(view.self.hand) >= AGGRESSIVE_ENVIDO_THRESHOLD) return wantsToCallEnvido;

      const cardPlays = legalActions.filter((a): a is PlayCard => a.type === "play-card");
      if (cardPlays.length > 0) return cardPlayChoice(view, cardPlays);

      // Nothing better is legal — take whatever call is left rather than fail.
      return legalActions[0]!;
    },
  };
}
