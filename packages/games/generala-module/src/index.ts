import { applyPlayerAction, applyRoll, createMatch, getLegalActions, getOutcome, getViewFor } from "@hexdev/generala-engine";
import type { GeneralaAction, MatchState, PlayerView } from "@hexdev/generala-engine";
import { DEFAULT_THINKING_DELAY_MS, createBotStrategy, withThinkingDelay } from "@hexdev/generala-bot";
import type { ApplyResult, BotStrategy, BotTier, GameModule, JsonValue, PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import { SYSTEM_ACTOR_ID } from "./roll.js";
import type { RollDiceAction } from "./roll.js";

export type { RollDiceAction } from "./roll.js";
export { SYSTEM_ACTOR_ID, requestGeneralaSystemAction } from "./roll.js";

/**
 * THE WHOLE MODULE, and no longer a partial barrel.
 *
 * The file said, while it was being written, that what it was missing was "the
 * `generalaModule` object that carries all of it to the registry — its
 * metadata, its empty `configOptions`, its `createBot` and the conformance
 * suite that exercises the lot", and that none of it could land before the bot
 * `conformance.ts:114-134` makes mandatory at `seatCount >= 2`. `generala-bot`
 * landed, so it lands here.
 *
 * WHAT IS STILL NOT HERE IS THE REGISTRATION ITSELF. Nothing on either
 * composition root names this module yet, and the pairing with
 * `requestGeneralaSystemAction` and a `systemActionPauseMs` is a separate
 * slice's work. A module is not a registration; this file only makes one
 * possible.
 */

/**
 * Everything that can be applied to a Generala match, from either side of the
 * table.
 *
 * The union mirrors `TrucoModuleAction`: the engine's own player actions, plus
 * the one action the engine cannot own because it carries an actor and needs
 * externally materialized randomness. `roll-dice` is never in any seat's legal
 * list, so it reaches `applyAction` from exactly one caller — the transport,
 * with what `requestGeneralaSystemAction` drew.
 */
export type GeneralaModuleAction = GeneralaAction | RollDiceAction;

/**
 * A finished match takes nothing from anybody.
 *
 * Hoisted to a constant because both arms below need it and the two must not
 * drift into two different messages for one fact. `code` matches the wording
 * `truco-module`, `escoba-module` and `mahjong-solitaire-module` already use,
 * so a caller switching on refusals reads one vocabulary across every game.
 */
const MATCH_OVER: ApplyResult<MatchState> = { ok: false, violation: { code: "match-over", message: "this match has already ended" } };

/**
 * The module's reducer: the actor check, and then the engine.
 *
 * WHOSE ACTION THIS IS, ASKED BEFORE ANYTHING ELSE IT COULD DO (D4). This is
 * the refusal `truco-module/src/index.ts:83`, `escoba-module/src/index.ts:114`
 * and `mahjong-solitaire-module/src/module.ts:111` all carry, and Generala
 * ships it on day one rather than gaining it after an incident. The incident is
 * worth stating because it is what the line is for: `MatchRoom.handleAction`
 * used to check only that a submitted action's `playerId` matched the
 * authenticated seat before calling `applyAction`, so a seated player could
 * submit the game's own dealing action under their OWN honest id and choose the
 * deal. `SYSTEM_ACTOR_ID` never stopped that — a sentinel refuses a client
 * CLAIMING to be the system, not one acting as themselves.
 *
 * The room now also admits a submitted action only if `getLegalActions` offered
 * that exact action, and `roll-dice` is in nobody's list, ever. That is the
 * reason this guard is defence in depth rather than the reason it is
 * unnecessary: a module is a pure reducer anyone may call, and "only the system
 * throws the dice" is a rule of the GAME, not of the wire.
 *
 * THE MATCH-OVER GUARD IS NOT DECORATION EITHER, and Generala needs it more
 * than the card games do. `applyScore` hands the turn to the next seat after
 * the LAST box exactly as after the first — deliberately, so that "over" stays
 * derived from the cards — which leaves a finished match sitting in
 * `awaiting-roll`, structurally identical to a live one. `applyRoll` reads the
 * phase and nothing else, by design, so without this line a full board would
 * accept another throw and the seat would be offered 31 holds on a card with no
 * open box. The engine says so in its own words and leaves the terminal check
 * to this layer; `requestGeneralaSystemAction` makes the same check for the
 * same reason, on the other side of the same loop.
 *
 * EVERY RULE BELOW THAT IS NOT ABOUT AN ACTOR BELONGS TO THE ENGINE. Which
 * holds are well formed, which boxes are open, what a box is worth, when a turn
 * ends — none of it is re-stated here, so there is no second opinion to drift
 * from the first. `applyRoll` takes no `playerId` at all (D4), which is why a
 * forged throw cannot reach it even if this guard were deleted: there is no
 * argument in that signature for a forged actor to occupy.
 */
export function applyAction(state: MatchState, action: GeneralaModuleAction): ApplyResult<MatchState> {
  if (action.type === "roll-dice") {
    if (action.playerId !== SYSTEM_ACTOR_ID) {
      return { ok: false, violation: { code: "not-a-system-actor", message: "only the system throws the dice" } };
    }
    if (getOutcome(state) !== null) return MATCH_OVER;
    return applyRoll(state, action.faces);
  }

  if (getOutcome(state) !== null) return MATCH_OVER;
  return applyPlayerAction(state, action);
}

/**
 * Nothing to tune, and that is a rules decision rather than an oversight.
 *
 * `deriveModalities` cartesian-products every declared `ConfigOption` into an
 * independent matchmaking pool, so a single knob is a second lobby that has to
 * fill on its own. The one variant the popular ruleset actually offers — the
 * escalera al as, listed there as "opcional, a convenir de antemano" — is
 * therefore NOT offered: with no knob to turn, "to be agreed" is not on by
 * default. Empty for the same reason `EscobaMatchConfig` and
 * `MahjongSolitaireConfig` are.
 */
export type GeneralaMatchConfig = Record<string, never>;

/**
 * How many people sit at the registered table, stated ONCE.
 *
 * `metadata.seatCount` is what the lobby seats and `buildMatch` is what refuses
 * anything else, and the two disagreeing would mean a table the platform fills
 * and the module then throws on. A later `generala-3` is an additive second
 * registration against the same N-seat engine — `truco-module`'s own
 * `trucoModule2v2` shape — never a branch inside this one.
 */
const SEAT_COUNT = 2;

/**
 * Turn the platform's seat assignments into the engine's seat ORDER, and refuse
 * anything that is not a table.
 *
 * `SeatAssignment[]` arrives from the platform here and nowhere else, and this
 * is where a match is BUILT, so this is the only place either refusal below can
 * still be made cheaply. `truco-module/src/index.ts:37-42` and
 * `escoba-module/src/index.ts:29-33` already refuse a malformed seat list on
 * exactly this line.
 *
 * THE SEAT NUMBER IS THE ORDER, NOT THE ARRAY POSITION. `SeatAssignment.seat`
 * is the seat; the array is a carrier and the platform owes no ordering
 * guarantee about it. `seats.map((s) => s.playerId)` would work on every sorted
 * list and seat a table backwards on an unsorted one.
 *
 * TWO SEATS MAY NOT SHARE A `playerId`, and refusing it here is the whole
 * reason that is refusable at all. Downstream, two identical ids are not
 * distinguishable by anything: `getViewFor` resolves a seat with `indexOf` and
 * takes the first, so the second seat would be shown the first's view forever;
 * and `applyHold`/`applyScore` decide whose turn it is by comparing
 * `state.players[turn.seat]` against the action's author, which with two equal
 * ids passes for BOTH seats and lets the wrong one act. `generala-engine`'s own
 * `view.ts` names the hole and says the place to close it is where the table is
 * built — by the time a state exists, every consumer of it is already wrong.
 */
function buildMatch(seats: readonly SeatAssignment[]): MatchState {
  const bySeat = new Map(seats.map((assignment) => [assignment.seat, assignment.playerId]));
  const malformed = `generala seats ${String(SEAT_COUNT)} players, one at each of seats 0 to ${String(SEAT_COUNT - 1)}, and got ${JSON.stringify(seats)}`;

  const players: PlayerId[] = [];
  for (let seat = 0; seat < SEAT_COUNT; seat += 1) {
    const playerId = bySeat.get(seat);
    if (playerId === undefined) throw new Error(malformed);
    players.push(playerId);
  }
  // The loop above cannot see a seat number nobody asked for, and `bySeat`
  // silently collapses the same seat number twice — comparing the counts is
  // what catches both, and it is why the map is built before it is read.
  if (seats.length !== players.length) throw new Error(malformed);

  if (new Set(players).size !== players.length) {
    throw new Error(`generala needs a distinct player at every seat, and got ${JSON.stringify(seats)}`);
  }

  return createMatch(players);
}

/**
 * Real entropy for the bot's own choices, mirroring `truco-module` and
 * `escoba-module`'s identical `defaultRng`.
 *
 * It is NOT the game's randomness. The cup is thrown through
 * `requestGeneralaSystemAction`, with the rng the ROOM injects, and this source
 * never reaches it: `createBot` is a port member that takes a tier and nothing
 * else, so a bot that has to pick uniformly among 42 offers has to bring its
 * own. Generala's easy tier genuinely consults it, unlike escoba's.
 */
const defaultRng: RandomSource = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

/**
 * `GeneralaModuleAction` includes `roll-dice`; a tier is never offered one.
 *
 * `getLegalActions` returns the ENGINE's list and `roll-dice` is in nobody's,
 * ever, so this narrowing is total in practice — the same shape and the same
 * argument as `escoba-module`'s `toPlayCardActions` and `truco-module`'s
 * `toEngineActions`. It is a filter rather than a cast so that the day the
 * union grows an action a bot must not see, the type stops being satisfied
 * rather than the value quietly arriving.
 */
function toEngineActions(actions: readonly GeneralaModuleAction[]): readonly GeneralaAction[] {
  return actions.filter((action): action is GeneralaAction => action.type !== "roll-dice");
}

/**
 * MANDATORY, not optional, and `conformance.ts:114-134` is what makes it so: a
 * module declaring `seatCount >= 2` and supplying no `createBot` fails that
 * named, executed test. That is why bot-easy is slice 8 and this is slice 9 —
 * an ordering the tasks phase corrected out of the proposal.
 *
 * `withThinkingDelay` is `generala-bot`'s own, at its own default: the pause
 * runs CONCURRENTLY with the strategy, so total latency is
 * `max(strategyTime, delay)` and never the sum — which will matter when slice
 * 17's hard tier runs a real one-ply enumeration underneath it.
 *
 * THE `answer` ARGUMENT IS DELIBERATELY NOT FORWARDED. It carries what a bot
 * BOUGHT with a consult action, and Generala registers no consult channel at
 * all, so the transport has nothing to put there and no tier has anywhere to
 * read it from — `GeneralaTier` does not declare the parameter. Passing it
 * anyway would be inventing a seam this game does not have, and `generala-bot`
 * already reds a wrapper that reads it.
 */
function createBot(tier: BotTier): BotStrategy<PlayerView, GeneralaModuleAction> {
  const strategy = withThinkingDelay(createBotStrategy(tier, defaultRng), DEFAULT_THINKING_DELAY_MS);
  return {
    chooseAction: (view, legalActions, budgetMs) => strategy.chooseAction(view, toEngineActions(legalActions), budgetMs),
  };
}

/**
 * A round trip through JSON and back, the same two lines every shipped module
 * carries. `MatchState` holds nothing but numbers, strings, `null`s and arrays
 * of them — no `Date`, no `Map`, no class — which is what makes the identity
 * `deserialize(serialize(s))` equal `s` rather than approximately equal it, and
 * `conformance.ts` asserts exactly that on a state `createMatch` built.
 */
const serialize = (state: MatchState): JsonValue => JSON.parse(JSON.stringify(state)) as JsonValue;
const deserialize = (json: JsonValue): MatchState => json as unknown as MatchState;

/**
 * Generala, as the platform sees it.
 *
 * EVERY MEMBER BUT `createMatch`, `createBot` AND THE TWO JSON LINES IS THE
 * ENGINE'S, HANDED THROUGH UNWRAPPED. `getLegalActions`, `getViewFor` and
 * `getOutcome` are passed by reference rather than re-exported through a
 * lambda that narrows or reorders: the room admits a submitted action only when
 * `getLegalActions` offered that exact action, comparing arrays BY INDEX
 * (`match-room.ts`'s `sameAction`), so anything this layer did to the list on
 * its way past would make a legal hold unsubmittable. `getOutcome`'s two shapes
 * meet with no adapter because the engine's `MatchOutcome` and the platform's
 * are the same structure — which is the same reason the engine's `ApplyResult`
 * flows into the platform's, and not the reverse.
 *
 * `section: "dados"` IS A BOOT-TIME FENCE, not a label. `catalogGroupingOf`
 * falls back `section ?? gameFamily`, and `createGameModuleRegistry` throws at
 * composition when one family's entries resolve to two different sections —
 * which cannot fire with a single entry and fires the day a second Generala id
 * lands without it. Declared here so the second one has something to match.
 */
export const generalaModule: GameModule<MatchState, GeneralaModuleAction, PlayerView, GeneralaMatchConfig> = {
  id: "generala",
  metadata: { seatCount: SEAT_COUNT, gameFamily: "generala", section: "dados", displayNameKey: "games.generala.name", assetBase: "/games/generala" },
  configOptions: [],
  createMatch: (_config, seats) => buildMatch(seats),
  applyAction,
  getLegalActions,
  getViewFor,
  getOutcome,
  serialize,
  deserialize,
  createBot,
};
