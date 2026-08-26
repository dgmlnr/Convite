import { cardPower } from "@hexdev/truco-engine";
import type { Action, PlayerView } from "@hexdev/truco-engine";
import type { BotStrategy, RandomSource } from "@hexdev/platform-contract";
import { dealtEnvidoPoints, handPower, isTrickSecuredByTeam, scoreFollowingCardPlay, strongestOpposingPlay } from "./heuristics.js";
import { chooseSenaEmission } from "./sena-emission.js";
import { askPartnerAboutEnvido } from "./ask-partner.js";
import { chooseEnvidoDeclaration } from "./declare-envido.js";

/** Heuristic thresholds (bot domain knowledge, not the engine's real point
 * values — see `heuristics.ts`). Roughly the midpoint of a 3-card hand's
 * possible power/envido range; "aggressive" is set clearly above it so a
 * proactive call is only volunteered with a genuinely strong hand. */
const ACCEPT_TRUCO_THRESHOLD = 22;
const AGGRESSIVE_TRUCO_THRESHOLD = 28;
const ACCEPT_ENVIDO_THRESHOLD = 23;
const AGGRESSIVE_ENVIDO_THRESHOLD = 27;

/** How often the tier signals when it holds something worth claiming and a
 * seña is on offer — moderate, and always HONEST (`bluffRate` 0): the normal
 * tier plays a solid partner, not a deceptive one; bluffed señas are the
 * hard tier's edge. Like the thresholds above, a judgement knob — nothing
 * downstream derives it. */
const SENA_EMIT_RATE = 0.35;

type RespondTruco = Extract<Action, { type: "respond-truco" }>;
type RespondEnvido = Extract<Action, { type: "respond-envido" }>;
type PlayCard = Extract<Action, { type: "play-card" }>;

function respondTrucoChoice(view: PlayerView, group: readonly RespondTruco[]): Action {
  const accept = handPower(view.self.hand) >= ACCEPT_TRUCO_THRESHOLD;
  return group.find((action) => action.response === (accept ? "quiero" : "no-quiero")) ?? group[0]!;
}

function respondEnvidoChoice(view: PlayerView, group: readonly RespondEnvido[]): Action {
  const accept = dealtEnvidoPoints(view) >= ACCEPT_ENVIDO_THRESHOLD;
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

export function createNormalBot(rng: RandomSource): BotStrategy<PlayerView, Action> {
  return {
    chooseAction(view, legalActions, _budgetMs, answer) {
      if (legalActions.length === 0) {
        throw new Error("createNormalBot: no legal actions to choose from");
      }

      // Before the ladder: maybe flash the partner a seña (2v2 only — the
      // engine never offers `send-sena` without a teammate, and the gate
      // consumes NO rng when none is offered, so every 1v1 decision below is
      // byte-identical to the pre-emission tier). Deliberately ahead of the
      // respond branches too: señas stay legal while a truco/envido response
      // is pending, and flashing BEFORE answering is legitimate truco — the
      // partner learns the hand before the quiero lands. The answer still
      // arrives on the very next drive (the loop re-invokes after a
      // non-blocking action), quota-bounded as always. Termination is argued
      // once, in `chooseSenaEmission`'s own docstring.
      // What this bot is about to play, worked out BEFORE the seña gate so it
      // can be kept out of the signal. `cardPlayChoice` reads no randomness,
      // so asking it early leaves every existing decision in this tier
      // byte-identical.
      const playsNow = legalActions.filter((a): a is PlayCard => a.type === "play-card");
      const aboutToPlay = playsNow.length > 0 ? (cardPlayChoice(view, playsNow) as PlayCard).card : undefined;
      const sena = chooseSenaEmission(view, legalActions, rng, { emitRate: SENA_EMIT_RATE, bluffRate: 0 }, aboutToPlay);
      if (sena !== undefined) return sena;

      const respondTruco = legalActions.filter((a): a is RespondTruco => a.type === "respond-truco");
      if (respondTruco.length > 0) return respondTrucoChoice(view, respondTruco);

      const respondEnvido = legalActions.filter((a): a is RespondEnvido => a.type === "respond-envido");
      if (respondEnvido.length > 0) return respondEnvidoChoice(view, respondEnvido);

      const declaring = chooseEnvidoDeclaration(view, legalActions);
      if (declaring !== undefined) return declaring;

      const wantsToCallTruco = legalActions.find((a) => a.type === "call-truco");
      if (wantsToCallTruco !== undefined && handPower(view.self.hand) >= AGGRESSIVE_TRUCO_THRESHOLD) return wantsToCallTruco;

      const wantsToCallEnvido = legalActions.find((a) => a.type === "call-envido");
      if (wantsToCallEnvido !== undefined && dealtEnvidoPoints(view) >= AGGRESSIVE_ENVIDO_THRESHOLD) return wantsToCallEnvido;

      // Its own hand did not justify the call — but only a pie may open one,
      // and the seat holding the tantos may be the partner who is not allowed
      // to speak. Ask before letting it go. (`ask-partner.ts` owns the "have
      // I asked / was I answered" bookkeeping, and asks at most once.)
      const aboutTheEnvido = askPartnerAboutEnvido(legalActions, answer);
      if (aboutTheEnvido !== undefined) return aboutTheEnvido;

      const cardPlays = legalActions.filter((a): a is PlayCard => a.type === "play-card");
      if (cardPlays.length > 0) return cardPlayChoice(view, cardPlays);

      // Nothing better is legal — take whatever call is left rather than
      // fail, preferring ANY non-seña whatever order the list arrives in.
      // The `??` arm is not a leak: when señas are the only legal actions,
      // returning one is the contract's only legal answer (`chooseAction`
      // must pick from the list). The gate above deliberately refuses that
      // state; this arm honors the contract instead. Unreachable through
      // the transport, which only drives a bot holding a blocking action —
      // pinned by test.
      return legalActions.find((a) => a.type !== "send-sena") ?? legalActions[0]!;
    },
  };
}
