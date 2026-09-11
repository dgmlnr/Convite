import type { ApplyResult, BotStrategy, BotTier, GameModule, HiddenState, JsonValue, PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import { applyDoubt, applyOpeningDrawRoll, applyRaise, applyRoundRoll, createMatch, getLegalActions, getOutcome, getViewFor, resolveShowdown, secretsFor } from "@hexdev/mentiroso-engine";
import type { MatchState, MentirosoAction, PlayerView } from "@hexdev/mentiroso-engine";
import { DEFAULT_THINKING_DELAY_MS, createBotStrategy, withThinkingDelay } from "@hexdev/mentiroso-bot";
import { SYSTEM_ACTOR_ID, requestMentirosoSystemAction } from "./roll.js";
import type { MentirosoSystemAction, OpeningDrawRollAction, RoundRollAction } from "./roll.js";

export { SYSTEM_ACTOR_ID, requestMentirosoSystemAction };
export type { MentirosoSystemAction, OpeningDrawRollAction, RoundRollAction };

/**
 * `mentiroso-module`'s public barrel (SDD `mentiroso`, work unit C2/task
 * 3.2) — the FIRST export surface this package has, matching `truco-module`'s
 * own `index.ts` shape: re-export the system-action door (`roll.ts`, work
 * unit C1) above, and declare the ONE `hiddenState` every seat-count
 * registration will share, below.
 *
 * `mentirosoHiddenState` IS NOT CONSUMED HERE YET — the same
 * introduce-then-adopt split this whole chain has followed since work unit
 * A2. Work units 3.3/3.4 (the seat-count=2/4/6 `GameModule` registrations)
 * spread this exact binding into their own `hiddenState` field, mirroring
 * `truco-module/src/index.ts`'s own local `hiddenState` const — reused
 * unchanged across `trucoModule` and `trucoModule2v2` there, and across all
 * three mentiroso registrations here — "shared not copied" (design D4): two
 * copies of a redaction rule are two places for it to drift.
 *
 * Exported (unlike truco's private local const) so THIS unit's own
 * `index.test.ts` can run the real platform scan (`findLeakedSecrets`)
 * against it before any registration exists, and so 3.3/3.4 can import it
 * once `GameModule` construction moves to its own file. `secretsFor` is
 * handed straight through, never wrapped — `mentiroso-engine/src/view.ts`'s
 * own docblock names this exact unit as the place that happens "with no
 * adapter", and this file's own test asserts that by reference, not just by
 * behavior.
 */
export const mentirosoHiddenState: HiddenState<MatchState> = {
  kind: "hidden-per-seat",
  secretsFor,
};

/**
 * Everything that can be applied to a mentiroso match (SDD `mentiroso`, work
 * unit C3/task 3.3): the engine's own seated-player actions (`raise`/`doubt`,
 * `legal-actions.ts`), plus the three system-action shapes `roll.ts` (work
 * units C1 and 3.5) materializes. Mirrors `TrucoModuleAction`/`GeneralaModuleAction`'s
 * own split between "the engine's own actions" and "the action the engine
 * cannot own because it carries an actor and needs externally materialized
 * randomness".
 */
export type MentirosoModuleAction = MentirosoAction | MentirosoSystemAction;

/**
 * A finished match takes nothing from anybody — hoisted to a constant for
 * the same reason `generala-module/src/index.ts`'s own `MATCH_OVER` is: both
 * branches below need it, and the two must not drift into two different
 * messages for one fact.
 */
const MATCH_OVER: ApplyResult<MatchState> = { ok: false, violation: { code: "match-over", message: "this match has already ended" } };

/**
 * The module's reducer (work unit C3/task 3.3, extended by task 3.5):
 * `roll.ts`'s own docblock (work unit C1) named this file as the one that
 * "will interpret both actions, and that is also where a forged
 * `playerId !== SYSTEM_ACTOR_ID` must be refused" — the exact incident
 * `truco-module/src/deal.ts` records for a different game, closed here on
 * day one instead.
 *
 * WHOSE ACTION THIS IS, ASKED BEFORE ANYTHING ELSE — mirrors
 * `generala-module`/`truco-module`/`escoba-module`'s identical guard: a
 * seated player submitting any of the three system-action shapes under
 * their own honest id must be refused, because a module is a pure reducer
 * anyone may call and "only the system rolls the dice" is a rule of the
 * GAME, not of the wire.
 *
 * THE MATCH-OVER GUARD, on every branch, mirrors `generala-module`'s own:
 * none of the five engine reducers this delegates to check `getOutcome`
 * themselves — that is a MATCH fact, not a RULE fact — so this layer is
 * where a finished match stops accepting anything at all.
 *
 * "doubt" still resolves into the `showdown` phase and STOPS there, in this
 * SAME call — that has not changed. What task 3.5 adds is a THIRD system
 * action, `"showdown-resolve"` (`roll.ts`, this same unit), requested by
 * `requestMentirosoSystemAction` once the table sits in `showdown` with
 * nobody able to act, and applied HERE, delegating straight to the engine's
 * own `resolveShowdown` (`showdown.ts`, work unit B4) — the adopter that
 * unit's own docblock always said was missing.
 *
 * THIS IS DELIBERATELY NOT THE SAME THING AS CHAINING `resolveShowdown`
 * INSIDE THE "doubt" BRANCH ABOVE. Design D6: the showdown has to sit ON
 * SCREEN for `systemActionPauseMs` before it resolves, and that pause lives
 * in `MatchRoom.runAdvanceOnce`, applied BEFORE it applies whatever system
 * action it just requested. A resolution folded into the SAME call that
 * applied "doubt" would skip that pause entirely — the showdown would never
 * exist as a state a client actually renders. Requesting and applying the
 * resolution as its OWN, separate system action, on a LATER driving-loop
 * tick, is what keeps the pause in front of it. See `roll.ts`'s own top
 * docblock for the fuller argument.
 */
export function applyAction(state: MatchState, action: MentirosoModuleAction): ApplyResult<MatchState> {
  if (action.type === "opening-draw-roll" || action.type === "round-roll" || action.type === "showdown-resolve") {
    if (action.playerId !== SYSTEM_ACTOR_ID) {
      return { ok: false, violation: { code: "not-a-system-actor", message: "only the system rolls the dice" } };
    }
    if (getOutcome(state) !== null) return MATCH_OVER;
    if (action.type === "opening-draw-roll") return applyOpeningDrawRoll(state, action.faces);
    if (action.type === "round-roll") return applyRoundRoll(state, action.diceBySeat);
    return resolveShowdown(state);
  }

  if (getOutcome(state) !== null) return MATCH_OVER;
  return action.type === "raise" ? applyRaise(state, action) : applyDoubt(state, action);
}

/**
 * Nothing to tune — mirrors `GeneralaMatchConfig`/`EscobaMatchConfig`'s own
 * empty shape: the ruleset offers no knob beyond seat count, and seat count
 * is three SEPARATE registered ids (this one, and 3.4's), never a
 * `configOption` (`convite/mentiroso/reglas-decididas`: "2, 4 y 6 jugadores.
 * Tres registraciones separadas").
 */
export type MentirosoMatchConfig = Record<string, never>;

/** How many people sit at THIS registered table — mirrors
 * `generala-module/src/index.ts`'s own `SEAT_COUNT`, stated once so
 * `metadata.seatCount` and `buildMatch`'s own refusal cannot disagree. */
const SEAT_COUNT = 2;

/**
 * Turn the platform's seat assignments into the engine's seat order, and
 * refuse anything that is not a two-seat table — mirrors
 * `generala-module/src/index.ts`'s own `buildMatch` exactly (the same three
 * refusals: a missing seat, a malformed/extra seat, and a repeated player),
 * for the identical reason that file's own docblock states: two seats
 * sharing one `playerId` are not distinguishable by anything downstream
 * (`getViewFor`, `getLegalActions`'s own turn-seat lookup), and refusing it
 * here — where a state is BUILT — is the only place it is still cheap.
 */
function buildMatch(seats: readonly SeatAssignment[]): MatchState {
  const bySeat = new Map(seats.map((assignment) => [assignment.seat, assignment.playerId]));
  const malformed = `mentiroso-2 seats ${String(SEAT_COUNT)} players, one at each of seats 0 to ${String(SEAT_COUNT - 1)}, and got ${JSON.stringify(seats)}`;

  const players: PlayerId[] = [];
  for (let seat = 0; seat < SEAT_COUNT; seat += 1) {
    const playerId = bySeat.get(seat);
    if (playerId === undefined) throw new Error(malformed);
    players.push(playerId);
  }
  if (seats.length !== players.length) throw new Error(malformed);

  if (new Set(players).size !== players.length) {
    throw new Error(`mentiroso-2 needs a distinct player at every seat, and got ${JSON.stringify(seats)}`);
  }

  return createMatch(players);
}

/** Real crypto entropy for the two rng-consuming layers `normal`/`hard`
 * share (`chooseModulatedMentirosoAction`'s own doubt/raise coin flip) plus
 * `easy`'s own extra noise/minimal-raise draws — mirrors
 * `truco-module`/`escoba-module`/`generala-module`'s identical
 * `defaultRng`. */
const defaultRng: RandomSource = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

/**
 * `getLegalActions` (`legal-actions.ts`'s own docblock: "rolling is never on
 * this list and never will be") only ever offers `raise`/`doubt`, so this
 * narrowing is total in practice — the same shape and argument
 * `truco-module`'s own `toEngineActions`, `escoba-module`'s own
 * `toPlayCardActions`, and `generala-module`'s own `toEngineActions` already
 * use. A filter, not a cast, so the day this union grows a system action a
 * bot must never see, the type stops being satisfied instead of the value
 * quietly arriving.
 */
function toMentirosoActions(actions: readonly MentirosoModuleAction[]): readonly MentirosoAction[] {
  return actions.filter((action): action is MentirosoAction => action.type === "raise" || action.type === "doubt");
}

/**
 * THE REAL TIERS (SDD `mentiroso`, task 3.6), replacing the day-one
 * placeholder this docblock used to be. `@hexdev/mentiroso-bot` now ships
 * its own `createBotStrategy` (that package's own `index.ts`, this same
 * task's other half) — mirrors `truco-module`/`escoba-module`/
 * `generala-module`'s identical `createBot` shape: wrap the routed tier in
 * the shared thinking-delay presentation pause, then narrow this module's
 * own wider action union down to what a tier is allowed to see.
 *
 * This closes the exact task-order gap this file's own retired docblock
 * named — the same close `truco-module`'s own history records for its
 * "Replaces PR9's `chooseFirstLegalAction` placeholder with the real tiers".
 */
function createBot(tier: BotTier): BotStrategy<PlayerView, MentirosoModuleAction> {
  const strategy = withThinkingDelay(createBotStrategy(tier, defaultRng), DEFAULT_THINKING_DELAY_MS);
  return {
    chooseAction: (view, legalActions, budgetMs, answer) => strategy.chooseAction(view, toMentirosoActions(legalActions), budgetMs, answer),
  };
}

/** A round trip through JSON and back — the same two lines every shipped
 * module carries; `MatchState` holds nothing but numbers, strings and
 * arrays of them. */
const serialize = (state: MatchState): JsonValue => JSON.parse(JSON.stringify(state)) as JsonValue;
const deserialize = (json: JsonValue): MatchState => json as unknown as MatchState;

/**
 * Mentiroso, seated two — the FIRST of three registrations
 * (`sdd/mentiroso/tasks` 3.3; task 3.4 adopts this same shape at seat counts
 * 4 and 6). `getLegalActions`, `getViewFor` and `getOutcome` are the
 * engine's own functions, handed through unwrapped — mirrors
 * `generala-module`/`truco-module`'s identical discipline: the room admits a
 * submitted action only when `getLegalActions` offered that exact action,
 * so a wrapper that narrowed or reordered the list would make a legal move
 * unsubmittable.
 */
export const mentirosoModule: GameModule<MatchState, MentirosoModuleAction, PlayerView, MentirosoMatchConfig> = {
  id: "mentiroso-2",
  metadata: { seatCount: SEAT_COUNT, gameFamily: "mentiroso", section: "dados", displayNameKey: "games.mentiroso2.name", assetBase: "/games/mentiroso" },
  configOptions: [],
  createMatch: (_config, seats) => buildMatch(seats),
  applyAction,
  getLegalActions,
  getViewFor,
  hiddenState: mentirosoHiddenState,
  getOutcome,
  serialize,
  deserialize,
  createBot,
};

/** How many people sit at the SECOND registered table (SDD `mentiroso`, work
 * unit C4/task 3.4) — mirrors `SEAT_COUNT` above exactly, kept as its own
 * constant for the identical reason: this value must never drift from
 * `mentirosoModule4.metadata.seatCount`. */
const SEAT_COUNT_4 = 4;

/**
 * The 4-seat table's own `buildMatch` (work unit C4/task 3.4) — the SAME
 * three refusals as `buildMatch` above (a missing seat, a malformed/extra
 * seat, a repeated player), parametrized over `SEAT_COUNT_4` instead of
 * `SEAT_COUNT`.
 *
 * A SEPARATE function, not a shared helper parametrized over seat count,
 * mirroring `escoba-module`'s own `buildMatch`/`buildMatch2v2` and
 * `truco-module`'s own `createMatch`/`createMatch2v2`: each additional
 * seat-count registration in this repo owns its own table-building function,
 * never one shared across seat counts that could hide a divergence between
 * two supposedly-identical tables.
 */
function buildMatch4(seats: readonly SeatAssignment[]): MatchState {
  const bySeat = new Map(seats.map((assignment) => [assignment.seat, assignment.playerId]));
  const malformed = `mentiroso-4 seats ${String(SEAT_COUNT_4)} players, one at each of seats 0 to ${String(SEAT_COUNT_4 - 1)}, and got ${JSON.stringify(seats)}`;

  const players: PlayerId[] = [];
  for (let seat = 0; seat < SEAT_COUNT_4; seat += 1) {
    const playerId = bySeat.get(seat);
    if (playerId === undefined) throw new Error(malformed);
    players.push(playerId);
  }
  if (seats.length !== players.length) throw new Error(malformed);

  if (new Set(players).size !== players.length) {
    throw new Error(`mentiroso-4 needs a distinct player at every seat, and got ${JSON.stringify(seats)}`);
  }

  return createMatch(players);
}

/**
 * Mentiroso, seated four — the SECOND of three registrations
 * (`sdd/mentiroso/tasks` 3.4). Every read member is the engine's own
 * function, handed through unwrapped, for the identical reason
 * `mentirosoModule`'s own docblock states above.
 */
export const mentirosoModule4: GameModule<MatchState, MentirosoModuleAction, PlayerView, MentirosoMatchConfig> = {
  id: "mentiroso-4",
  metadata: { seatCount: SEAT_COUNT_4, gameFamily: "mentiroso", section: "dados", displayNameKey: "games.mentiroso4.name", assetBase: "/games/mentiroso" },
  configOptions: [],
  createMatch: (_config, seats) => buildMatch4(seats),
  applyAction,
  getLegalActions,
  getViewFor,
  hiddenState: mentirosoHiddenState,
  getOutcome,
  serialize,
  deserialize,
  createBot,
};

/** How many people sit at the THIRD registered table — mirrors
 * `SEAT_COUNT`/`SEAT_COUNT_4` above. */
const SEAT_COUNT_6 = 6;

/**
 * The 6-seat table's own `buildMatch` (work unit C4/task 3.4) — same shape
 * and same reasoning as `buildMatch4` above, at `SEAT_COUNT_6` instead.
 *
 * THIS is the registration `convite/mentiroso/reglas-decididas`' own
 * six-seat worked example ("30 dados") reaches through a live port: the
 * first table in this whole chain able to carry more than one eliminated
 * seat while the match still continues (six seats leaves three still
 * standing after three are eliminated, unlike `mentirosoModule`'s own two
 * seats, where eliminating the sole rival always ends the match in the same
 * step). `index.test.ts`'s own fixtures for this registration are built to
 * exercise exactly that — see this unit's own apply-progress record for the
 * turn-skip, ceiling, and interspersed-redaction fixtures this registration
 * is uniquely positioned to reach.
 */
function buildMatch6(seats: readonly SeatAssignment[]): MatchState {
  const bySeat = new Map(seats.map((assignment) => [assignment.seat, assignment.playerId]));
  const malformed = `mentiroso-6 seats ${String(SEAT_COUNT_6)} players, one at each of seats 0 to ${String(SEAT_COUNT_6 - 1)}, and got ${JSON.stringify(seats)}`;

  const players: PlayerId[] = [];
  for (let seat = 0; seat < SEAT_COUNT_6; seat += 1) {
    const playerId = bySeat.get(seat);
    if (playerId === undefined) throw new Error(malformed);
    players.push(playerId);
  }
  if (seats.length !== players.length) throw new Error(malformed);

  if (new Set(players).size !== players.length) {
    throw new Error(`mentiroso-6 needs a distinct player at every seat, and got ${JSON.stringify(seats)}`);
  }

  return createMatch(players);
}

/**
 * Mentiroso, seated six — the THIRD and last of the three registrations
 * `convite/mentiroso/reglas-decididas` calls for ("2, 4 y 6 jugadores. Tres
 * registraciones separadas").
 */
export const mentirosoModule6: GameModule<MatchState, MentirosoModuleAction, PlayerView, MentirosoMatchConfig> = {
  id: "mentiroso-6",
  metadata: { seatCount: SEAT_COUNT_6, gameFamily: "mentiroso", section: "dados", displayNameKey: "games.mentiroso6.name", assetBase: "/games/mentiroso" },
  configOptions: [],
  createMatch: (_config, seats) => buildMatch6(seats),
  applyAction,
  getLegalActions,
  getViewFor,
  hiddenState: mentirosoHiddenState,
  getOutcome,
  serialize,
  deserialize,
  createBot,
};
