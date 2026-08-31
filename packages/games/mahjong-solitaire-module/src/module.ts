import { getLegalActions as boardLegalActions, getOutcome as boardOutcome, layBoard } from "@hexdev/mahjong-solitaire-engine";
import type { MatchState as BoardState, RemovePairAction, TileId } from "@hexdev/mahjong-solitaire-engine";
import type { ApplyResult, GameModule, JsonValue, MatchOutcome, PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import { dealBoard } from "./deal.js";
import type { DealBoardAction } from "./deal.js";

/**
 * A solitaire match: one seat, one board, and whether the player walked away.
 *
 * WHY THE BOARD IS NULLABLE, AND WHY THAT IS NOT OPTIONAL. `createMatch` runs
 * before any entropy exists — the deal arrives afterwards, as a system action,
 * exactly the way `escoba-module`'s `state.hand` starts `null` and is filled by
 * `start-hand`. It cannot be an already-laid board of 144 nulls either: to the
 * engine an all-null board is a CLEARED one, and `getOutcome` would report the
 * player as having won a match that never started. So "no board yet" and "board
 * finished" have to be different states, and this is the field that tells them
 * apart. (Design D7's data flow draws the module state AS the engine board;
 * that shape cannot be built — see the apply report.)
 *
 * WHY `abandoned` IS STORED WHEN NOTHING ELSE IS. The engine keeps no `won`,
 * `lost` or `deadlocked` field, on purpose: all three are derivable from the
 * tiles, and a stored copy is a second source of truth that can drift. "The
 * player left the table" is NOT derivable from the tiles — a board somebody
 * abandoned is bit-for-bit a board somebody is still thinking about — so it is
 * an event that has to be recorded, and recording it is not the same mistake.
 * `module.test.ts` reads the key set back off a state a producer built, so a
 * fourth field could not be added quietly.
 */
export interface SolitaireMatchState {
  readonly playerId: PlayerId;
  readonly board: BoardState | null;
  readonly abandoned: boolean;
}

/** What a seat left for good means for this game, in the game's own words.
 * Carries no data: the state it applies to already knows whose board it is. */
export interface AbandonBoardAction {
  readonly type: "abandon-board";
  readonly playerId: PlayerId;
}

export type MahjongSolitaireAction = DealBoardAction | RemovePairAction | AbandonBoardAction;

/** Nothing to tune: the layout is fixed and difficulty is the generator's own
 * choice policy, not a lobby knob. Empty for the same reason
 * `EscobaMatchConfig` is. */
export type MahjongSolitaireConfig = Record<string, never>;

/** A solitaire hides nothing, so the view is the board — the port requires a
 * view type, not a secret. `getViewFor` therefore ignores who is asking, and
 * that is a property of THIS game rather than a shortcut: there is no second
 * seat to hide anything from. */
export interface SolitairePlayerView {
  readonly playerId: PlayerId;
  readonly tiles: readonly (TileId | null)[] | null;
}

function createMatch(_config: MahjongSolitaireConfig, seats: readonly SeatAssignment[]): SolitaireMatchState {
  const seat = seats.find((candidate) => candidate.seat === 0);
  if (seats.length !== 1 || seat === undefined) {
    throw new Error(`mahjong-solitario requires exactly seat 0 and nothing else, got ${JSON.stringify(seats)}`);
  }
  return { playerId: seat.playerId, board: null, abandoned: false };
}

/**
 * Cleared board, the player wins. Tiles left with no free pair, nobody wins.
 * Seat abandoned, nobody wins. Anything else, the match is still going.
 *
 * The two "nobody wins" branches report the SAME `{ winnerIds: [] }`, which is
 * `MatchOutcome`'s own documented wording for "a solo match abandoned
 * unsolved" — a board nobody finished is a board nobody finished, whether the
 * player ran out of moves or ran out of patience.
 *
 * `abandoned` is read FIRST only because `applyAction` refuses to abandon a
 * match that has already ended, so the two can never both be true. Nothing
 * else here is stored: the win and the deadlock are the engine's, derived from
 * the tiles on every call.
 */
function getOutcome(state: SolitaireMatchState): MatchOutcome | null {
  if (state.abandoned) return { winnerIds: [] };
  if (state.board === null) return null;
  return boardOutcome(state.board);
}

/**
 * The three things that can happen to a solitaire board: it gets laid out, a
 * pair comes off it, or the player leaves.
 *
 * LEGALITY IS THE ENGINE'S, ALWAYS. A removal is accepted only if the engine
 * already offered that exact pair, so the left-or-right freedom rule and the
 * match relation live in exactly one place and this module never re-states
 * them. What is left here is the part that is not a rule at all: blanking two
 * entries of a copied array.
 */
function applyAction(state: SolitaireMatchState, action: MahjongSolitaireAction): ApplyResult<SolitaireMatchState> {
  if (getOutcome(state) !== null) {
    return { ok: false, violation: { code: "match-over", message: "this match has already ended" } };
  }

  if (action.type === "deal-board") {
    if (state.board !== null) {
      return { ok: false, violation: { code: "board-already-dealt", message: "this match already has a board" } };
    }
    return { ok: true, state: { ...state, board: layBoard(state.playerId, action.placements) } };
  }

  if (action.type === "abandon-board") {
    return { ok: true, state: { ...state, abandoned: true } };
  }

  const board = state.board;
  if (board === null) {
    return { ok: false, violation: { code: "no-board", message: "no board has been dealt yet" } };
  }
  const offered = boardLegalActions(board, action.playerId).some((legal) => legal.a === action.a && legal.b === action.b);
  if (!offered) {
    return { ok: false, violation: { code: "illegal-pair", message: `positions ${String(action.a)} and ${String(action.b)} are not a free matching pair` } };
  }
  const tiles = [...board.tiles];
  tiles[action.a] = null;
  tiles[action.b] = null;
  return { ok: true, state: { ...state, board: { ...board, tiles } } };
}

/**
 * The pairs the player may take, and nothing else. `deal-board` and
 * `abandon-board` are never offered here: one belongs to the system actor and
 * the other to a player who is no longer at the table, which is the same
 * separation `escoba-module` keeps between `play-card` and `start-hand`.
 */
function getLegalActions(state: SolitaireMatchState, playerId: PlayerId): readonly MahjongSolitaireAction[] {
  if (state.abandoned || state.board === null) return [];
  return boardLegalActions(state.board, playerId);
}

/** Takes no viewer, and the missing parameter is the statement: a function of
 * `(state)` alone is still assignable to the port's `(state, playerId)`, so the
 * fact that this game shows everybody the same thing is in the signature rather
 * than in a comment beside an ignored argument. */
function getViewFor(state: SolitaireMatchState): SolitairePlayerView {
  return { playerId: state.playerId, tiles: state.board === null ? null : state.board.tiles };
}

const serialize = (state: SolitaireMatchState): JsonValue => JSON.parse(JSON.stringify(state)) as JsonValue;
const deserialize = (json: JsonValue): SolitaireMatchState => json as unknown as SolitaireMatchState;

/**
 * The deal, requested by the room and answered with data — the shape
 * `escoba-module`'s `requestEscobaSystemAction` established and design D7 asks
 * for by name. Fires exactly once per match: a board that exists is never
 * re-dealt, and there is no reshuffle in this game.
 */
export function requestMahjongSolitaireSystemAction(state: SolitaireMatchState, rng: RandomSource): DealBoardAction | null {
  if (getOutcome(state) !== null) return null;
  if (state.board !== null) return null;
  return dealBoard(rng);
}

/**
 * WHAT AN ABANDONED SEAT MEANS FOR THIS GAME — the answer slice 2 built its
 * seam to ask for.
 *
 * A transport's default is to hand a vacated seat to a bot and let the table
 * play on. That is right for truco and wrong here: there is no opponent, so
 * "take over the seat" would mean a bot grinding out a solitaire with nobody
 * watching, and this module supplies no `createBot` at all — the seat would
 * simply sit there, occupied by nobody, forever. So the game answers: the
 * board was left unfinished, and an unfinished board is a match nobody won.
 *
 * The transport applies this through `applyAction` like any other action and
 * then reads `getOutcome`; it never decides that a match ended and never
 * inspects what it was handed.
 *
 * IT READS ITS `playerId`. `null` for a seat that is not the one playing this
 * board, and `null` for a match that is already over — both are the same
 * fail-closed answer every provider in `platform-core`'s registry gives: "no
 * opinion, do whatever you would have done".
 */
export function getAbandonedSeatAction(state: SolitaireMatchState, playerId: PlayerId): AbandonBoardAction | null {
  if (playerId !== state.playerId) return null;
  if (getOutcome(state) !== null) return null;
  return { type: "abandon-board", playerId };
}

/**
 * NO `createBot`, and that is the whole point of slice 1 making it optional: a
 * game with one seat has no opponent for a bot to be. The conformance suite
 * skips the bot requirement by a named, executed test that asserts
 * `seatCount === 1`, so this absence is a declaration rather than an omission.
 */
export const mahjongSolitaireModule: GameModule<SolitaireMatchState, MahjongSolitaireAction, SolitairePlayerView, MahjongSolitaireConfig> = {
  id: "mahjong-solitario",
  metadata: { seatCount: 1, gameFamily: "mahjong-solitario", section: "fichas", displayNameKey: "games.mahjongSolitario.name", assetBase: "/games/mahjong-solitario" },
  configOptions: [],
  createMatch,
  applyAction,
  getLegalActions,
  getViewFor,
  getOutcome,
  serialize,
  deserialize,
};
