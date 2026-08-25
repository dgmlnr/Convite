import type { BotStrategy } from "@hexdev/platform-contract";

/**
 * The pause before a bot acts (spec: "Tunable Bot Move Latency") — an
 * instant bot feels artificial and, for the hard tier, would starve the
 * determinized search of any perceived "thinking" pause.
 *
 * IT IS ALSO THE READING WINDOW, which is what set this number. The pause
 * happens BEFORE the bot's own move lands, so what a player is actually
 * doing during it is reading whatever the PREVIOUS move put on screen. At
 * 1000ms that window was too short, reported from real play as "los turnos
 * pasan muy rápido entre jugadores y los textos son muy rápidos también" —
 * and worst in 2v2, where three bots chain their calls one after another and
 * a whole envido/truco exchange resolved in about three seconds.
 *
 * 2400ms, RAISED FROM 1800 when the per-seat call chip arrived. The transient
 * notices this pause has to let a player read run 2000ms (seña, and now the
 * call chip) to 4200ms (the envido reveal), and a bot that can act again in
 * less than that replaces a notice before it has been read. 1800 was chosen
 * to protect the shortest of them and did not: it is 200ms UNDER the 2000
 * the chip needs, so a second call could land while the first was still up.
 *
 * The chip is the one that matters most, because it is the only thing on the
 * table that says WHICH seat spoke — reported from real 2v2 play as "los
 * cantos de los bots son descontrolados", with the follow-up naming the
 * number: "se debe mostrar por 2 segundos para dar tiempo a leerlo... después
 * pasa al siguiente jugador". So 2400 is that 2000 plus a beat, and the beat
 * is the point: two consecutive calls have to read as two events with a gap
 * between them, not as one crossfading into the next.
 *
 * It still does not cover the longest notice, deliberately — the envido
 * reveal outlives one bot turn on purpose.
 *
 * THE COUPLING IS REAL AND CANNOT BE EXPRESSED IN CODE FROM HERE. That 2000
 * lives in truco-ui (DEFAULT_SEAT_CALL_NOTICE_MS), and this package does not
 * depend on it — nor should it, since a bot has no business importing a
 * renderer. Both constants carry the other's number and this reason; if
 * either moves, the other has to be looked at.
 *
 * Made visible only by this session's own join fix: before it, a bot's
 * opening arrived as one silent batch after the join completed, so nothing
 * about its pacing was observable at all.
 *
 * Tunable via the wrapper's own parameter; this is only the default.
 */
export const DEFAULT_THINKING_DELAY_MS = 2400;

/**
 * The longer beat, for a move that is SPOKEN rather than played.
 *
 * ONE PAUSE WAS NEVER RIGHT FOR BOTH KINDS OF MOVE. Playing a card is
 * self-evident: the card lands face up on the table and stays there, so it
 * needs no reading time at all beyond seeing it arrive. A call is a claim
 * that appears, is marked on a seat, and then goes away -- and in 2v2 three
 * bots can make them one after another. Reported twice from real play, the
 * second time after this file had already been raised once: "siguen siendo
 * demasiado rápidos".
 *
 * WHY IT ATTACHES TO THE ACTION AND NOT TO THE MOMENT AFTER IT. This pause
 * happens BEFORE a bot's own move lands, so what it actually protects is
 * whatever the PREVIOUS move put on screen (see the constant above). A
 * response therefore shelters the call it answers, and a call shelters
 * whatever preceded it -- which is exactly the chain that was running
 * together. Card play keeps the base pause, so a hand of twelve cards does
 * not turn into a minute of waiting to buy calmness the cards never needed.
 */
export const SPOKEN_MOVE_DELAY_MS = 3600;

export type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps ANY `BotStrategy` with a deliberate pause — SEPARATE from the
 * strategy itself (design §9 / spec: "lives in the controller wrapper, not
 * the strategy, so strategy unit tests stay instant"). `sleep` is injected
 * (default: a real `setTimeout`) purely so this wrapper's own tests never
 * need to wait in real time, mirroring this project's established
 * Clock-injection discipline (`createRateLimiter`, `createPresenceSweeper`).
 * Runs the strategy and the delay CONCURRENTLY (`Promise.all`), so total
 * latency is `max(strategyTime, delayMs)`, not their sum — a slow hard-tier
 * search never stacks extra wait time on top of the presentation pause.
 */
export function withThinkingDelay<TView, TAction>(
  strategy: BotStrategy<TView, TAction>,
  delayMs: number = DEFAULT_THINKING_DELAY_MS,
  sleep: Sleep = realSleep,
  /**
   * The TOTAL pause for a specific chosen action, when this kind of move
   * deserves more room than the default. `delayMs` is the floor: a smaller
   * number here is ignored rather than honoured, so this can only ever slow
   * a move down, never sneak one through faster than the base pause.
   *
   * Optional because it is game knowledge: this module has no opinion about
   * which of a game's moves are spoken and which are played. `truco-module`
   * supplies that when it builds its bot.
   */
  delayForAction?: (action: TAction) => number,
): BotStrategy<TView, TAction> {
  return {
    async chooseAction(view, legalActions, budgetMs, answer) {
      // The base pause still runs CONCURRENTLY with the strategy, which is
      // the whole point of the original shape: total latency is
      // max(strategyTime, delayMs), never their sum. Only the top-up below
      // has to wait, because until the strategy answers there is no action
      // to classify.
      const [action] = await Promise.all([
        Promise.resolve(strategy.chooseAction(view, legalActions, budgetMs, answer)),
        sleep(delayMs),
      ]);
      const total = delayForAction?.(action) ?? delayMs;
      if (total > delayMs) await sleep(total - delayMs);
      return action;
    },
  };
}
