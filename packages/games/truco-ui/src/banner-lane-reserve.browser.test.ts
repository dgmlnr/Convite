import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createHeadToHeadMatch, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Action, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * `--hx-band-banner` is ONE number, and it is sized against what the lane
 * actually holds.
 *
 * WHAT WAS BROKEN. The reserve used to be a ladder of five literals --
 * 60/76/80/84/112 across the tier queries -- and every one of them was
 * arguing about the same occupant: the pending-call pill, whose caller text
 * WRAPPED, and wrapped at a different width in each query. Sizing a shared
 * lane against the one thing in it that wraps is how a 112px reserve ends up
 * holding a 50px strip: the pill has since moved out of this lane entirely
 * (it paints on the seat that spoke, `.hexdev-truco-seat-call`), and nobody
 * re-measured. The felt went on paying for it at every tier.
 *
 * WHY A FENCE AND NOT JUST A SMALLER NUMBER. The failure mode is symmetric
 * and only one half of it is loud. Too small clips text -- somebody sees it.
 * Too large is silent: the felt is simply taller than it needs to be forever,
 * which is exactly the state this replaced. So this file asserts BOTH edges,
 * and the upper one is the one that pays: it is what makes the next person
 * who needs "a bit more room" re-measure the occupant instead of nudging the
 * reserve, and what makes a reintroduced per-tier override fail out loud.
 *
 * THE THIRD ASSERTION -- constant across width, per seat count -- is not
 * stylistic. A per-tier ladder cannot be verified by reading, because each
 * rung is only reachable inside its own container query; the ladder above
 * survived precisely because checking it meant mounting at five widths, which
 * nothing did. The seat-count split it still allows is the one difference
 * that is real: `table.ts` mounts exactly two things into the lane, and the
 * senas strip is 2v2-only because 1v1 has no partner to signal to. Width
 * changes what the lane's text is SET IN, never what it CONTAINS.
 */

const SELF = "blr-self" as PlayerId;
const OPPONENT = "blr-opponent" as PlayerId;
const TEAMMATE = "blr-teammate" as PlayerId;
const OPPONENT_2 = "blr-opponent-2" as PlayerId;

const DEAL_2V2: DealInput = [
  [{ suit: "espada", rank: 1 }, { suit: "basto", rank: 4 }, { suit: "espada", rank: 3 }],
  [{ suit: "basto", rank: 5 }, { suit: "oro", rank: 1 }, { suit: "basto", rank: 6 }],
  [{ suit: "oro", rank: 4 }, { suit: "copa", rank: 4 }, { suit: "basto", rank: 4 }],
  [{ suit: "copa", rank: 5 }, { suit: "basto", rank: 3 }, { suit: "copa", rank: 6 }],
];
const DEAL_1V1: DealInput = [DEAL_2V2[0]!, DEAL_2V2[1]!];

/** Every width tier `table-styles.ts` defines, plus the ultra-wide desktop. */
const WIDTHS = [375, 700, 960, 1280, 1550] as const;

/**
 * The reserve's headroom over its tallest occupant. 56px against a 50px
 * strip is 12%; the ceiling is deliberately close, because the whole point
 * is that "just add a few pixels" has to become a measurement.
 */
const MAX_HEADROOM_RATIO = 1.3;

const EVERY_PLAYER = [SELF, OPPONENT, TEAMMATE, OPPONENT_2] as const;

function commit(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${action.type}: ${result.violation}`);
  return result.state;
}

/** Walks the floor one card at a time until `type` is on offer to somebody. */
function walkUntilOffered(state: MatchState, type: Action["type"]): MatchState {
  let current = state;
  for (let guard = 0; guard <= EVERY_PLAYER.length; guard += 1) {
    if (EVERY_PLAYER.some((player) => getLegalActions(current, player).some((action) => action.type === type))) return current;
    const onTheClock = current.players.find((player) => player.seat === current.hand?.turnSeat);
    const card = onTheClock === undefined ? undefined : getLegalActions(current, onTheClock.id).find((action) => action.type === "play-card");
    if (card === undefined) break;
    current = commit(current, card);
  }
  return current;
}

/** Whoever the engine currently offers this action to — seat order is not this file's subject. */
function offered(state: MatchState, type: Action["type"], response?: "quiero" | "no-quiero"): Action {
  const action = EVERY_PLAYER.flatMap((player) => getLegalActions(state, player)).find(
    (candidate) => candidate.type === type && (response === undefined || ("response" in candidate && candidate.response === response)),
  );
  if (action === undefined) throw new Error(`no seat can ${type}${response === undefined ? "" : ` with ${response}`}`);
  return action;
}

function heightOf(host: HTMLElement, selector: string): number | null {
  const element = host.querySelector<HTMLElement>(selector);
  return element === null ? null : element.getBoundingClientRect().height;
}

const mounted: HTMLElement[] = [];

function mount(width: number): HTMLElement {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.appendChild(host);
  mounted.push(host);
  return host;
}

afterEach(() => {
  for (const host of mounted.splice(0)) host.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
});

/**
 * Drives one mount to each state that puts something in the banner lane and
 * reports the reserve alongside the tallest occupant measured.
 */
function measureLane(width: number, seats: "1v1" | "2v2"): { readonly reserve: number; readonly occupants: ReadonlyMap<string, number> } {
  const isTeams = seats === "2v2";
  const host = mount(width);
  const render = createMatchTableRenderer({ senaNoticeMs: 60_000, handOutcomeBannerMs: 60_000 });
  const start = startHand(
    isTeams
      ? createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 0 })
      : createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 0 }),
    isTeams ? DEAL_2V2 : DEAL_1V1,
  );
  render(host, getViewFor(start, SELF), getLegalActions(start, SELF), () => {});

  const occupants = new Map<string, number>();

  if (isTeams) {
    const signalled = commit(start, { type: "send-sena", playerId: TEAMMATE, signal: "asDeEspada" });
    render(host, getViewFor(signalled, SELF), getLegalActions(signalled, SELF), () => {});
    const sena = heightOf(host, ".hexdev-truco-sena-notice");
    if (sena === null) throw new Error("the senas strip never mounted");
    occupants.set("senas strip", sena);
  }

  // An envido refused, then a truco refused, ends the hand at once: the
  // end-of-hand banner is the lane's other occupant, at its wordiest. In 2v2
  // only a PIE may open an envido and a pie is never the mano, so the floor
  // is walked until somebody is actually offered the call.
  let ended = walkUntilOffered(start, "call-envido");
  ended = commit(ended, offered(ended, "call-envido"));
  ended = commit(ended, offered(ended, "respond-envido", "no-quiero"));
  ended = commit(ended, offered(ended, "call-truco"));
  ended = commit(ended, offered(ended, "respond-truco", "no-quiero"));
  render(host, getViewFor(ended, SELF), getLegalActions(ended, SELF), () => {});
  const outcome = heightOf(host, ".hexdev-truco-hand-outcome");
  if (outcome === null) throw new Error("the end-of-hand banner never mounted");
  occupants.set("end-of-hand banner", outcome);

  const felt = host.querySelector<HTMLElement>(".hexdev-truco-table");
  if (felt === null) throw new Error("the felt never mounted");
  const reserve = Number.parseFloat(getComputedStyle(felt).getPropertyValue("--hx-band-banner"));
  if (!Number.isFinite(reserve)) throw new Error("--hx-band-banner is not a length");

  return { reserve, occupants };
}

describe.each(WIDTHS)("the banner lane is sized against what it holds — %ipx", (width) => {
  describe.each(["1v1", "2v2"] as const)("%s", (seats) => {
    it("every occupant fits inside the reserve", () => {
      const { reserve, occupants } = measureLane(width, seats);
      for (const [name, height] of occupants) {
        expect(height, `${seats} @${width}px: the ${name} is ${height}px inside a ${reserve}px lane, so it paints over the trick above it`).toBeLessThanOrEqual(reserve);
      }
    });

    it("the reserve is not paying for an occupant that left", () => {
      const { reserve, occupants } = measureLane(width, seats);
      const tallest = Math.max(...occupants.values());
      expect(
        reserve,
        `${seats} @${width}px: the lane reserves ${reserve}px for a tallest occupant of ${tallest}px. ` +
          `Every pixel over that is felt height nobody can use. Re-measure the occupant instead of raising this — ` +
          `and if something in this lane WRAPS, fix the wrap: sizing the lane around a wrap is the ladder this fence replaced.`,
      ).toBeLessThanOrEqual(tallest * MAX_HEADROOM_RATIO);
    });
  });
});

describe.each(["1v1", "2v2"] as const)("the reserve does not vary with width — %s", (seats) => {
  it("resolves to the same value at every tier", () => {
    const reserves = WIDTHS.map((width) => [`@${width}px`, measureLane(width, seats).reserve] as const);
    const distinct = [...new Set(reserves.map(([, reserve]) => reserve))];
    expect(
      distinct,
      `${seats}: --hx-band-banner resolved to ${distinct.length} different values across widths (${reserves.map(([label, reserve]) => `${label}=${reserve}`).join(", ")}). ` +
        `The lane holds the same things at every width, so its reserve must too. Splitting by SEAT COUNT is allowed — the señas strip is 2v2-only — but a width-keyed override is unverifiable by reading, which is how the last ladder survived.`,
    ).toHaveLength(1);
  });
});
