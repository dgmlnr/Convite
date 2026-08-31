import { describe, expect, it } from "vitest";
import { mahjongMatchOverMessage } from "./match-over.js";
import type { MahjongOutcomeInfo } from "./match-over.js";

/** Every tile came off: the engine names the solo player. */
const CLEARED: MahjongOutcomeInfo = { winnerIds: ["solo"] };
/** Tiles remain and no free pair matches: the engine names nobody. */
const DEADLOCKED: MahjongOutcomeInfo = { winnerIds: [] };

/**
 * THE COPY IS TYPED OUT HERE, ON PURPOSE, and it is the one place in this
 * package where a test repeats a production literal instead of importing it.
 *
 * R15's rule is that a fence must not inspect a value the test file itself
 * assembled — but these sentences are not derived from anything in this
 * repository. They are a product decision pinned word for word in the change's
 * own artifacts, and a fence that asserted `message === MAHJONG_STRINGS.x`
 * would agree with any rewording at all, which is exactly the failure mode
 * "verbatim" exists to prevent. So the external value is carried here and
 * compared, the same way `TILE_ART_SOURCES` is audited against a manifest
 * rather than against itself (R19).
 */
const DEADLOCK_COPY = "Te quedaste sin pares. Siempre hay una salida — probá otro.";

describe("the board was cleared", () => {
  it("says how long it took", () => {
    expect(mahjongMatchOverMessage({ outcome: CLEARED, elapsedMs: 272_000 })).toBe("Lo resolviste en 4:32.");
  });

  it("the figure comes from the elapsed time and not from a constant", () => {
    // R6/rung 3: a message that ignored its argument would pass the case
    // above. Two different durations have to read differently.
    expect(mahjongMatchOverMessage({ outcome: CLEARED, elapsedMs: 65_000 })).toBe("Lo resolviste en 1:05.");
  });

  describe("and there is no honest figure to report", () => {
    /**
     * `elapsedMs: null` is what a RESUMED match hands this function —
     * `createChronometer` returns no chronometer at all on that path, so the
     * caller is holding nothing to pass. The sentence loses the figure and
     * keeps everything else: same verb, same tone, no apology, and above all
     * no number a player could read as a result.
     */
    it("it says the same thing without one", () => {
      expect(mahjongMatchOverMessage({ outcome: CLEARED, elapsedMs: null })).toBe("Lo resolviste.");
    });

    it("and there is no digit anywhere in it", () => {
      // The scenario as the spec words it: "the completion message contains
      // no elapsed-time figure". Asserted as a property rather than as one
      // more string equality, so a future rewording cannot smuggle one back.
      expect(mahjongMatchOverMessage({ outcome: CLEARED, elapsedMs: null })).not.toMatch(/[0-9]/);
    });

    it("the two are each other's discriminator", () => {
      // Neither scenario is worth anything alone: "never show a time" passes
      // the resumed case, and "always show a time" passes the fresh one.
      // Both, side by side, admit only the rule that reads `elapsedMs`.
      const joined = mahjongMatchOverMessage({ outcome: CLEARED, elapsedMs: 272_000 });
      const resumed = mahjongMatchOverMessage({ outcome: CLEARED, elapsedMs: null });
      expect(joined).toMatch(/[0-9]/);
      expect(resumed).not.toMatch(/[0-9]/);
      expect(joined).not.toBe(resumed);
    });
  });
});

describe("the board is deadlocked", () => {
  it("says the pinned sentence, word for word", () => {
    expect(mahjongMatchOverMessage({ outcome: DEADLOCKED, elapsedMs: null })).toBe(DEADLOCK_COPY);
  });

  describe("and it never carries the time, even when there is one", () => {
    /**
     * GETTING STUCK IS NOT AN ACHIEVEMENT TO TIMESTAMP. A player who ran out
     * of pairs after eleven minutes is not being told that they were
     * eleven-minutes bad at it; the sentence offers another board instead.
     *
     * R18 IS WHY `elapsedMs` IS NOT `null` IN THESE TWO. A refusal fence is
     * vacuous unless the thing it refuses actually exists: handing this a
     * deadlock with no elapsed time would pass against an implementation that
     * happily prints whatever it is given, because there would be nothing to
     * print. The rejected input has to be present for the rejection to mean
     * anything.
     */
    it("a real elapsed time, offered and refused", () => {
      expect(mahjongMatchOverMessage({ outcome: DEADLOCKED, elapsedMs: 683_000 })).toBe(DEADLOCK_COPY);
    });

    it("no digit reaches it", () => {
      expect(mahjongMatchOverMessage({ outcome: DEADLOCKED, elapsedMs: 683_000 })).not.toMatch(/[0-9]/);
    });

    it("and the same elapsed time WOULD have been printed on a cleared board", () => {
      // The anti-vacuity guard for the two above, sized against the value
      // they refuse rather than against a neighbour's literal (R14): 683,000
      // is a duration this codebase can and does render.
      expect(mahjongMatchOverMessage({ outcome: CLEARED, elapsedMs: 683_000 })).toBe("Lo resolviste en 11:23.");
    });
  });

  it("a deadlock and a clear do not say the same thing", () => {
    expect(mahjongMatchOverMessage({ outcome: DEADLOCKED, elapsedMs: null })).not.toBe(mahjongMatchOverMessage({ outcome: CLEARED, elapsedMs: null }));
  });
});

describe("what decides which sentence", () => {
  /**
   * THE WINNER LIST, AND NOTHING ELSE. This is a ONE-SEAT game: the engine's
   * `getOutcome` names the solo player when every tile is removed and nobody
   * when tiles remain with no free matching pair, so "is the list empty" is
   * the entire question. There is no `selfPlayerId` parameter here for the
   * same reason there is no opponent — a non-empty list in a solitaire has
   * exactly one thing it can mean.
   */
  it("an empty winner list is the deadlock, whoever the player is", () => {
    expect(mahjongMatchOverMessage({ outcome: { winnerIds: [] }, elapsedMs: 1_000 })).toBe(DEADLOCK_COPY);
  });

  it("a non-empty winner list is the clear, whoever is in it", () => {
    expect(mahjongMatchOverMessage({ outcome: { winnerIds: ["alguien-mas"] }, elapsedMs: 1_000 })).toBe("Lo resolviste en 0:01.");
  });
});
