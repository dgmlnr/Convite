import type { ApplyResult, BotStrategy, BotTier, GameModule, HiddenState, JsonValue, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import { applyDoubt, applyOpeningDrawRoll, applyRaise, applyRoundRoll, createMatch, getLegalActions, getOutcome, getViewFor, secretsFor } from "@hexdev/mentiroso-engine";
import type { MatchState, MentirosoAction, PlayerView } from "@hexdev/mentiroso-engine";
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
 * `legal-actions.ts`), plus the two system-action shapes `roll.ts` (work unit
 * C1) already materializes. Mirrors `TrucoModuleAction`/`GeneralaModuleAction`'s
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
 * The module's reducer (work unit C3/task 3.3): `roll.ts`'s own docblock
 * (work unit C1) named this file as the one that "will interpret both
 * actions, and that is also where a forged `playerId !== SYSTEM_ACTOR_ID`
 * must be refused" — the exact incident `truco-module/src/deal.ts` records
 * for a different game, closed here on day one instead.
 *
 * WHOSE ACTION THIS IS, ASKED BEFORE ANYTHING ELSE — mirrors
 * `generala-module`/`truco-module`/`escoba-module`'s identical guard: a
 * seated player submitting either system-action shape under their own
 * honest id must be refused, because a module is a pure reducer anyone may
 * call and "only the system rolls the dice" is a rule of the GAME, not of
 * the wire.
 *
 * THE MATCH-OVER GUARD, on every branch, mirrors `generala-module`'s own:
 * none of the four engine reducers this delegates to check `getOutcome`
 * themselves — that is a MATCH fact, not a RULE fact — so this layer is
 * where a finished match stops accepting anything at all.
 *
 * "doubt" resolves into the `showdown` phase and STOPS there.
 * `resolveShowdown` (`mentiroso-engine`, work unit B4) is deliberately NOT
 * chained in automatically here: no task in `sdd/mentiroso/tasks` assigns
 * adopting it, and `roll.ts`'s own `requestMentirosoSystemAction` (work unit
 * C1, already shipped) returns `null` for the `showdown` phase — so nothing
 * in this chain yet drives that transition automatically once a real match
 * is running. That is a genuine gap for Stage F1 (composition root) or a new
 * task to close, flagged here and in this unit's own apply-progress entry
 * rather than silently decided.
 */
export function applyAction(state: MatchState, action: MentirosoModuleAction): ApplyResult<MatchState> {
  if (action.type === "opening-draw-roll" || action.type === "round-roll") {
    if (action.playerId !== SYSTEM_ACTOR_ID) {
      return { ok: false, violation: { code: "not-a-system-actor", message: "only the system rolls the dice" } };
    }
    if (getOutcome(state) !== null) return MATCH_OVER;
    return action.type === "opening-draw-roll" ? applyOpeningDrawRoll(state, action.faces) : applyRoundRoll(state, action.diceBySeat);
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

/**
 * A PLACEHOLDER, replacing nothing yet and expecting to be replaced.
 *
 * `@hexdev/mentiroso-bot` (design's own Stage D, `sdd/mentiroso/tasks`
 * 4.1-4.4) does not exist yet, and `describeGameModule`'s own bot
 * requirement (`platform-contract/src/conformance.ts:265-285`) is
 * unconditional the moment `metadata.seatCount >= 2` — no exception for "the
 * real bot ships later". This repo already carries the exact precedent for
 * this exact situation: `truco-module/src/index.ts`'s own comment records
 * "Replaces PR9's `chooseFirstLegalAction` placeholder with the real tiers"
 * — the first legal action, unconditionally, replaced only once
 * `truco-bot`'s real tiers existed. This is that same placeholder, for the
 * same reason.
 *
 * A GENUINE task-order gap, not a silent choice: no task in
 * `sdd/mentiroso/tasks` currently assigns wiring the real bot into this
 * module once Stage D ships it — that adoption needs a task of its own,
 * mirroring the one that eventually replaced truco's own placeholder.
 */
function createBot(tier: BotTier): BotStrategy<PlayerView, MentirosoModuleAction> {
  void tier; // the placeholder ignores the tier entirely — see this function's own docblock
  return {
    chooseAction: (_view, legalActions) => {
      const [first] = legalActions;
      if (first === undefined) {
        throw new Error(
          "mentiroso-module: asked to choose from no legal actions — the ceiling always forces exactly one (doubt), so this position should be unreachable",
        );
      }
      return first;
    },
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
