import { describe, expect, it } from "vitest";
import type { PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import { escobaModule } from "@hexdev/escoba-module";
import type { StartHandAction } from "@hexdev/escoba-module";
import { buildDeck } from "@hexdev/escoba-engine";
import type { Card, MatchState, PlayCardAction } from "@hexdev/escoba-engine";
import { buildGameRegistry } from "./registry.js";

/**
 * Slice L.6 — THE LIVE CHECKPOINT, as an AUTOMATED end-to-end test rather
 * than a human `pnpm dev` session: drives a full escoba hand through the
 * REAL seams (the composition-root registry, the module, the system-action
 * deal, `applyAction`, scoring) with no escoba-ui code anywhere in the tree
 * — proving `main.ts`'s `renderUnsupportedGame` fallback is enough to make
 * the game playable end to end, exactly as the design's Migration/Rollout
 * note claims.
 *
 * `pnpm test:e2e` is a SEPARATE, opt-in Playwright suite (its own config's
 * header comment: "deliberately NOT... `pnpm test`"), so a real end-to-end
 * proof that runs on EVERY default `pnpm test` has to be a node-project
 * test instead — this file lives under `apps/**\/*.test.ts`, which
 * `vitest.config.ts`'s "node" project already includes by default.
 */
const GAME_ID = "escoba-de-15";
const PLAYER_A = "srv-hand-a" as PlayerId;
const PLAYER_B = "srv-hand-b" as PlayerId;
const SEATS: readonly SeatAssignment[] = [
  { seat: 0, playerId: PLAYER_A },
  { seat: 1, playerId: PLAYER_B },
];
// Fixed at 0: Fisher-Yates always swaps with index 0, so this is one
// specific, REPRODUCIBLE permutation — every assertion below reads the
// REAL output of that permutation, never a hand-guessed one.
const rng: RandomSource = () => 0;

/** Deals a fresh hand through the REAL registered composition root: the
 * `start-hand` action comes from `registry.getSystemAction`, exactly the
 * call `MatchRoom.runAdvanceOnce` makes in production (design §D3's data
 * flow), and is then applied through the module's own real reducer. */
function dealtMatch(): MatchState {
  const registry = buildGameRegistry();
  const fresh = escobaModule.createMatch({}, SEATS);
  const action = registry.getSystemAction(GAME_ID, fresh, rng) as StartHandAction | null;
  expect(action, "fixture setup: the registered escoba entry must produce a real start-hand deal").not.toBeNull();
  expect(action!.type).toBe("start-hand");
  const result = escobaModule.applyAction(fresh, action!);
  expect(result.ok, "fixture setup: the deal itself must be accepted").toBe(true);
  if (!result.ok) throw new Error("unreachable");
  return result.state;
}

describe("Slice L.6 checkpoint — a full escoba hand played end to end (registry -> module -> system-action deal -> applyAction -> scoring)", () => {
  it("the match joins and the system action deals 3 per player + 4 to the table (art. 6.1)", () => {
    const dealt = dealtMatch();
    const hand = dealt.hand!;
    expect(dealt.players.every((player) => player.hand.length === 3)).toBe(true);
    // this deterministic shuffle's opening table (values 8+9+10+1=28) is
    // neither an escoba de muestra (16.1, sum 15) nor a void double (16.2,
    // sum 30 with a 15+15 split) — ordinary deal, table kept as dealt.
    expect(hand.table).toHaveLength(4);
    expect(hand.stock).toHaveLength(40 - 3 * 2 - 4);
    expect(hand.escobas[dealt.teams[0].id]).toBe(0);
    expect(hand.escobas[dealt.teams[1].id]).toBe(0);
  });

  it("a capture is accepted and the captured cards land in the acting player's TEAM pile", () => {
    const dealt = dealtMatch();
    const acting = dealt.hand!.turn;
    const actingPlayer = dealt.players.find((player) => player.id === acting)!;
    const legal = escobaModule.getLegalActions(dealt, acting);
    const captureAction = legal.find((action): action is PlayCardAction => action.type === "play-card" && action.captured.length > 0);
    expect(captureAction, "fixture setup: this deterministic deal must offer at least one real capture").toBeDefined();

    const result = escobaModule.applyAction(dealt, captureAction!);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pile = result.state.hand!.piles[actingPlayer.teamId];
    for (const capturedCard of captureAction!.captured) {
      expect(pile).toContainEqual(capturedCard);
      expect(result.state.hand!.table).not.toContainEqual(capturedCard);
    }
    expect(pile).toContainEqual(captureAction!.card);
  });

  it("an illegal action is REJECTED with its expected violation code — a card that CAN capture 15 must not be declined (art. 21.2)", () => {
    const dealt = dealtMatch();
    const acting = dealt.hand!.turn;
    const legal = escobaModule.getLegalActions(dealt, acting);
    const captureAction = legal.find((action): action is PlayCardAction => action.type === "play-card" && action.captured.length > 0);
    expect(captureAction).toBeDefined();
    const declined: PlayCardAction = { type: "play-card", playerId: acting, card: captureAction!.card, captured: [] };

    const result = escobaModule.applyAction(dealt, declined);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation.code).toBe("capture-declined");
  });

  /**
   * Turn-fix follow-up (was BLOCKED / `it.fails` — see `escoba/el-turno-no-
   * avanzaba`): `escoba-engine`'s `applyAction` (packages/games/escoba-
   * engine/src/capture.ts) now advances `hand.turn` to the next seat on
   * EVERY accepted play (art. 6.1's dealing direction — see
   * `nextTurnPlayerId` in `capture.ts`). This is an ordinary `it` again,
   * asserting the same CORRECT behavior the old `it.fails` already
   * documented; it fails loudly if the fence ever regresses.
   */
  it("hand.turn hands off to the OTHER seat once the acting player's card is resolved", () => {
    const dealt = dealtMatch();
    const first = dealt.hand!.turn;
    const legal = escobaModule.getLegalActions(dealt, first);
    const anyAction = legal.find((action): action is PlayCardAction => action.type === "play-card")!;

    const after = escobaModule.applyAction(dealt, anyAction);
    if (!after.ok) throw new Error("fixture setup: the first play was rejected — cannot exercise the turn hand-off at all");
    const other = dealt.players.find((player) => player.id !== first)!.id;

    expect(after.state.hand!.turn, "hand.turn must change once the acting player's card is resolved").not.toBe(first);
    expect(escobaModule.getLegalActions(after.state, other).length, `${other}'s legal-action list must be non-empty once it is genuinely their turn`).toBeGreaterThan(0);
  });

  /**
   * THE SHAPE THAT WAS MISSING (`escoba/el-turno-no-avanzaba`): every
   * pre-existing engine/module/bot test hand-built its fixture with a FIXED
   * `hand.turn` and drove at most one real play per fixture — none of them
   * chained two real turns, so none could have caught the turn-advancement
   * defect. This test plays a WHOLE hand through the real reducer,
   * `applyAction`, letting every seat take its own turns in order (never
   * setting `turn` by hand past the initial deal), and asserts every seat
   * genuinely got to act at least once before the hand ends.
   */
  it("a whole hand plays out through every seat via the real reducer, never setting hand.turn by hand", () => {
    const dealt = dealtMatch();
    const seatCount = dealt.players.length;
    const actedSeats = new Set<PlayerId>();
    let state = dealt;
    let guard = 0;
    const GUARD_LIMIT = 200; // generous upper bound: 6 cards dealt + up to a few re-deals

    while (state.hand !== null && !state.hand.outcome?.decided) {
      guard += 1;
      if (guard > GUARD_LIMIT) throw new Error("fixture setup: the hand never reached an outcome — possible infinite loop");

      const acting = state.hand.turn;
      const legal = escobaModule.getLegalActions(state, acting);
      expect(legal.length, `${acting} has cards but no legal action was offered — turn/hand desync`).toBeGreaterThan(0);
      actedSeats.add(acting);

      const chosen = legal[0]!;
      const result = escobaModule.applyAction(state, chosen);
      expect(result.ok, "every action drawn from getLegalActions must be accepted").toBe(true);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
    }

    expect(state.hand!.outcome?.decided).toBe(true);
    expect(actedSeats.size, "every seat must have gotten to act at least once across the whole hand").toBe(seatCount);
    for (const player of dealt.players) {
      expect(actedSeats.has(player.id), `${player.id} never got a turn`).toBe(true);
    }
  });

  it("the mid-hand re-deal fires (through the real registered module) when hands empty and stock remains", () => {
    const registry = buildGameRegistry();
    const created = escobaModule.createMatch({}, SEATS);
    const [teamA, teamB] = created.teams;
    const lastCard: Card = { suit: "basto", rank: 3 };
    const stock = buildDeck().slice(0, 6); // exactly CARDS_PER_PLAYER * seatCount
    const almostDone: MatchState = {
      ...created,
      players: created.players.map((player) => (player.id === PLAYER_B ? { ...player, hand: [lastCard] } : player)),
      hand: {
        table: [],
        stock,
        piles: { [teamA.id]: [], [teamB.id]: [] },
        escobas: { [teamA.id]: 0, [teamB.id]: 0 },
        turn: PLAYER_B,
        lastCapturer: null,
        outcome: null,
      },
    };

    // `registry.get` erases the module's own type parameters (registry.ts's
    // own comment on `GameModuleRegistry`), so the actually-typed transition
    // below runs through `escobaModule` directly — this identity check is
    // what proves it is the SAME object the registry resolves for `GAME_ID`,
    // not a coincidentally-matching stand-in.
    expect(registry.get(GAME_ID)).toBe(escobaModule);
    const result = escobaModule.applyAction(almostDone, { type: "play-card", playerId: PLAYER_B, card: lastCard, captured: [] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.state;
    expect(state.players.every((player) => player.hand.length === 3)).toBe(true);
    expect(state.hand!.stock).toHaveLength(0);
    expect(state.hand!.outcome).toBeNull(); // a mid-hand continuation, never a hand end
  });

  it("the hand ends, leftovers go to the last capturer (not scored as an escoba), and scoreHand produces all five categories", () => {
    const registry = buildGameRegistry();
    const created = escobaModule.createMatch({}, SEATS);
    const [teamA, teamB] = created.teams;
    // Team A: 7 oros (>=6 wins oros), the siete de oro, and one card of the
    // other three suits each worth the setenta maximum (7=21) — a full
    // 4-suit setenta of 84, the regulation's own art. 12.2 worked example.
    const teamAPile: Card[] = [
      { suit: "oro", rank: 1 },
      { suit: "oro", rank: 2 },
      { suit: "oro", rank: 3 },
      { suit: "oro", rank: 4 },
      { suit: "oro", rank: 5 },
      { suit: "oro", rank: 6 },
      { suit: "oro", rank: 7 }, // siete de oro
      { suit: "espada", rank: 7 },
      { suit: "basto", rank: 7 },
      { suit: "copa", rank: 7 },
    ];
    // Team B: fewer cards, no oro at all, and only ONE suit — does not even
    // qualify to compete for la setenta (design §D5: "una carta por palo").
    const teamBPile: Card[] = [
      { suit: "basto", rank: 1 },
      { suit: "basto", rank: 2 },
    ];
    const leftover: Card = { suit: "espada", rank: 4 };
    const lastCard: Card = { suit: "copa", rank: 2 }; // forms no 15 with the lone leftover (4+2=6) — a legal, non-forming play

    const almostDone: MatchState = {
      ...created,
      players: created.players.map((player) => (player.id === PLAYER_B ? { ...player, hand: [lastCard] } : player)),
      hand: {
        table: [leftover],
        stock: [],
        piles: { [teamA.id]: teamAPile, [teamB.id]: teamBPile },
        escobas: { [teamA.id]: 1, [teamB.id]: 0 }, // one escoba already scored earlier this hand
        turn: PLAYER_B,
        lastCapturer: teamA.id,
        outcome: null,
      },
    };

    expect(registry.get(GAME_ID)).toBe(escobaModule);
    const result = escobaModule.applyAction(almostDone, { type: "play-card", playerId: PLAYER_B, card: lastCard, captured: [] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.state;
    expect(state.hand!.outcome?.decided).toBe(true);
    // the leftover cards (the pre-existing one plus PLAYER_B's own
    // non-forming last play) are swept to team A, the last capturer — and
    // the escoba count is UNCHANGED by that sweep (pagat by absence of a
    // local rule, design §D5's "Open Questions" #1).
    expect(state.hand!.piles[teamA.id]).toContainEqual(leftover);
    expect(state.hand!.piles[teamA.id]).toContainEqual(lastCard);
    expect(state.hand!.escobas[teamA.id]).toBe(1);
    // cartas + oros + setenta + siete de oro + the one pre-existing escoba.
    expect(state.teams.find((team) => team.id === teamA.id)!.score).toBe(teamA.score + 5);
    expect(state.teams.find((team) => team.id === teamB.id)!.score).toBe(teamB.score);
  });

  it("a bot can take a turn through createBot", async () => {
    const dealt = dealtMatch();
    const acting = dealt.hand!.turn;
    const legal = escobaModule.getLegalActions(dealt, acting);
    const view = escobaModule.getViewFor(dealt, acting);
    const bot = escobaModule.createBot("easy");

    const chosen = await bot.chooseAction(view, legal, 50);

    expect(legal).toContainEqual(chosen);
  });
});
