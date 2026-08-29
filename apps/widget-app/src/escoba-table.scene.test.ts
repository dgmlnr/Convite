/// <reference types="@vitest/browser/matchers" />
import { afterEach, describe, expect, it } from "vitest";
import { applyAction, buildDeck, cardId, deal, getLegalActions, getViewFor } from "@hexdev/escoba-engine";
import type { Card, MatchState, Player, PlayerId, Team, TeamId } from "@hexdev/escoba-engine";
import type { GameId } from "@hexdev/platform-contract";
import { createGameUiRegistry } from "./game-ui-registry.js";
import type { GameUiEntry } from "./game-ui-registry.js";

/**
 * THE ESCOBA TABLE, MID-HAND, IN BOTH SEAT COUNTS.
 *
 * Scenes, never baselines: the images are gitignored and `pnpm visual:review`
 * rewrites them every run (`visual/decision-de-capturas-y-mediciones`).
 *
 * RENDERED THROUGH THE REGISTRY, not through `escoba-ui` directly, and that
 * is the whole reason these two scenes live in `apps/widget-app` rather than
 * beside `truco-ui`'s own table scenes. Truco ships ONE composed renderer
 * (`createMatchTableRenderer`), so a scene in that package already shows a
 * whole screen. Escoba's screen is COMPOSED here — `createEscobaRenderer`
 * stacks the scoreboard, the table, the hand, both piles, the running-sum
 * announcement and the hand-end breakdown — so the only place a whole escoba
 * screen exists is behind `createGameUiRegistry().get(...)`, which is also the
 * exact entry point `main.ts`'s `enterMatch` calls.
 *
 * EVERY STATE BELOW IS DEALT AND PLAYED BY THE REAL ENGINE. `deal` takes a
 * FIXED 40-card permutation and `applyAction` validates every move, so an
 * unreachable position cannot be screenshotted by accident: a wrong `captured`
 * subset, a card not in hand, a declined capture — each of those throws in
 * `play` below instead of quietly producing a pretty lie. What the engine
 * cannot produce on its own is the match SHELL (escoba has no
 * `createHeadToHeadMatch` factory), so teams and seats are declared here, the
 * same way `escoba-full-hand.browser.test.ts` already declares them.
 *
 * WHAT A PERSON SEES HERE IS WHAT A PLAYER SEES — nothing is dressed up for
 * the picture, and that is the whole value of these scenes.
 *
 * The first render proved it: escoba's table came out on bare white while
 * truco's sat on felt, because `createEscobaRenderer` replaces the container's
 * class outright and so never inherited `.convite-chrome`'s ground. No test
 * caught it — every escoba fence measures geometry, and a background has no
 * geometry. Only looking at a whole screen did. `escoba-ui` now paints its own
 * felt, the same way `truco-ui` does and for the same reason.
 */

const SELF = "escoba-scene-self" as PlayerId;
const RIVAL = "escoba-scene-rival" as PlayerId;
const PARTNER = "escoba-scene-partner" as PlayerId;
const RIVAL_TWO = "escoba-scene-rival-two" as PlayerId;

const OURS = "escoba-scene-ours" as TeamId;
const THEIRS = "escoba-scene-theirs" as TeamId;

/**
 * A real 40-card permutation whose first cards are the ones this scene needs.
 *
 * `deal` is "a pure function of one permutation" (design §D3) — it takes the
 * whole deck and never shuffles — so pinning only the opening cards and
 * letting the deck's own declared order supply the rest gives a genuine,
 * complete stock rather than a truncated array that could not have been dealt
 * from.
 */
function deckOpeningWith(opening: readonly Card[]): readonly Card[] {
  const pinned = new Set(opening.map(cardId));
  return [...opening, ...buildDeck().filter((card) => !pinned.has(cardId(card)))];
}

/** Every move goes through the real reducer, and an illegal one is a failed
 * fixture rather than a rendered fiction. */
function play(state: MatchState, playerId: PlayerId, card: Card, captured: readonly Card[]): MatchState {
  const result = applyAction(state, { type: "play-card", playerId, card, captured });
  if (!result.ok) throw new Error(`scene fixture setup: illegal action — ${result.violation.code}: ${result.violation.message}`);
  return result.state;
}

/**
 * A score neither side has to guess at, set on the constructed match before
 * the deal — the same convention `truco-ui`'s own scenes use for the identical
 * reason: a score only ever moves when a whole hand resolves, and playing four
 * complete hands to make a scoreboard read something other than 0/0 would say
 * nothing extra about the screen being looked at. The running total is real
 * engine state either way; only its starting point is declared.
 */

/* ── 1v1 ───────────────────────────────────────────────────────────────── */

/**
 * Chosen so the screen is LEGIBLE, not so the hand is balanced.
 *
 * Round-robin, two seats (art. 6.1 "de a una"): cards 0/2/4 go to seat 0,
 * cards 1/3/5 to seat 1, the next four go face up on the table and the rest
 * becomes stock. Written in exactly that order below so the layout of this
 * array IS the deal.
 *
 * The opening table sums to 20 — deliberately neither 15 nor 30, so no escoba
 * de muestra (art. 16.1/16.2) fires and the shot is an ordinary hand in
 * progress rather than a rules corner.
 */
const HEAD_TO_HEAD_DECK: readonly Card[] = deckOpeningWith([
  { suit: "oro", rank: 11 }, // seat 0 — caballo de oro, captures the six
  { suit: "copa", rank: 7 }, // seat 1 — takes the sota
  { suit: "basto", rank: 5 }, // seat 0 — still in hand
  { suit: "espada", rank: 3 }, // seat 1 — left face up
  { suit: "copa", rank: 1 }, // seat 0 — still in hand
  { suit: "basto", rank: 1 }, // seat 1 — never played here
  { suit: "copa", rank: 4 }, // table
  { suit: "espada", rank: 6 }, // table
  { suit: "basto", rank: 10 }, // table — sota, worth 8
  { suit: "oro", rank: 2 }, // table
]);

function headToHeadMatch(): MatchState {
  const teams: readonly [Team, Team] = [
    { id: OURS, playerIds: [SELF], score: 17 },
    { id: THEIRS, playerIds: [RIVAL], score: 12 },
  ];
  const players: readonly Player[] = [
    { id: SELF, teamId: OURS, seat: 0, hand: [] },
    { id: RIVAL, teamId: THEIRS, seat: 1, hand: [] },
  ];
  // Dealer on seat 0, so the seat to its right — seat 1, the rival — opens
  // (art. 6.1). Three plays later the turn is back with us, which is the
  // moment worth photographing.
  return { teams, players, dealerSeat: 0, hand: null, pointsToWin: 30 };
}

/**
 * Three real plays, chosen so every piece the screen has to show is actually
 * on it: cards still face up on the table, a hand to play from, BOTH teams'
 * capture piles non-empty, and the scoreboard mid-match.
 *
 *   1. the rival's siete de copa takes the sota de basto      (7 + 8 = 15)
 *   2. our caballo de oro takes the seis de espada            (9 + 6 = 15)
 *   3. the rival's tres de espada forms no fifteen and stays face up
 *
 * Our two remaining cards form no fifteen either, so both render as playable
 * rather than dimmed. That is a choice about the PICTURE and it is worth being
 * honest about: a card that must capture before it can be played is a real
 * state of this UI, it just renders at 45% opacity, which in a still image
 * reads as a defect instead of as a rule.
 */
function headToHeadMidHand(): MatchState {
  let state = deal(headToHeadMatch(), HEAD_TO_HEAD_DECK);
  state = play(state, RIVAL, { suit: "copa", rank: 7 }, [{ suit: "basto", rank: 10 }]);
  state = play(state, SELF, { suit: "oro", rank: 11 }, [{ suit: "espada", rank: 6 }]);
  state = play(state, RIVAL, { suit: "espada", rank: 3 }, []);
  return state;
}

/* ── 2v2 ───────────────────────────────────────────────────────────────── */

/**
 * Round-robin over FOUR seats: cards 0-3 are everyone's first card, 4-7 the
 * second, 8-11 the third, 12-15 the opening table. Partners sit across —
 * seats 0 and 2 are one team, seats 1 and 3 the other — so the array below
 * alternates sides on every line.
 *
 * Opening table sums to 19: again neither 15 nor 30, so no escoba de muestra.
 */
const TEAM_DECK: readonly Card[] = deckOpeningWith([
  { suit: "copa", rank: 10 }, // seat 0, us — sota, takes the seven
  { suit: "oro", rank: 6 }, // seat 1, them — takes the caballo
  { suit: "espada", rank: 12 }, // seat 2, our partner — rey, takes the five
  { suit: "basto", rank: 7 }, // seat 3, them — left face up, then taken
  { suit: "espada", rank: 2 }, // seat 0 — still in hand
  { suit: "copa", rank: 3 }, // seat 1 — left face up
  { suit: "basto", rank: 5 }, // seat 2 — left face up, then taken by the rivals
  { suit: "oro", rank: 12 }, // seat 3 — rey, takes that five
  { suit: "copa", rank: 6 }, // seat 0 — still in hand
  { suit: "basto", rank: 4 }, // seat 1 — never played here
  { suit: "espada", rank: 7 }, // seat 2 — never played here
  { suit: "copa", rank: 2 }, // seat 3 — never played here
  { suit: "espada", rank: 1 }, // table
  { suit: "copa", rank: 5 }, // table
  { suit: "basto", rank: 11 }, // table — caballo, worth 9
  { suit: "oro", rank: 4 }, // table
]);

function teamMatch(): MatchState {
  const teams: readonly [Team, Team] = [
    { id: OURS, playerIds: [SELF, PARTNER], score: 14 },
    { id: THEIRS, playerIds: [RIVAL, RIVAL_TWO], score: 19 },
  ];
  const players: readonly Player[] = [
    { id: SELF, teamId: OURS, seat: 0, hand: [] },
    { id: RIVAL, teamId: THEIRS, seat: 1, hand: [] },
    { id: PARTNER, teamId: OURS, seat: 2, hand: [] },
    { id: RIVAL_TWO, teamId: THEIRS, seat: 3, hand: [] },
  ];
  return { teams, players, dealerSeat: 0, hand: null, pointsToWin: 30 };
}

/**
 * Seven real plays — one full round plus most of a second — so that EACH pair
 * has captured with BOTH of its members. That is the point of this shot: piles
 * are keyed by `TeamId` from the engine outward (design §D2), so a pair shows
 * ONE pile holding what two different people took, never two piles side by
 * side. A screen where only one partner had ever captured would look identical
 * to a per-player pile and would prove nothing.
 *
 *   1. rival A's seis de oro takes the caballo de basto   (6 + 9 = 15)
 *   2. our partner's rey de espada takes the cinco de copa (10 + 5 = 15)
 *   3. rival B's siete de basto forms no fifteen, stays face up
 *   4. our sota de copa takes that very seven              (8 + 7 = 15)
 *   5. rival A's tres de copa stays face up
 *   6. our partner's cinco de basto stays face up
 *   7. rival B's rey de oro takes that five                (10 + 5 = 15)
 *
 * The turn comes back to us with two cards in hand, three face up on the
 * table, and four cards in each team's pile.
 */
function teamMidHand(): MatchState {
  let state = deal(teamMatch(), TEAM_DECK);
  state = play(state, RIVAL, { suit: "oro", rank: 6 }, [{ suit: "basto", rank: 11 }]);
  state = play(state, PARTNER, { suit: "espada", rank: 12 }, [{ suit: "copa", rank: 5 }]);
  state = play(state, RIVAL_TWO, { suit: "basto", rank: 7 }, []);
  state = play(state, SELF, { suit: "copa", rank: 10 }, [{ suit: "basto", rank: 7 }]);
  state = play(state, RIVAL, { suit: "copa", rank: 3 }, []);
  state = play(state, PARTNER, { suit: "basto", rank: 5 }, []);
  state = play(state, RIVAL_TWO, { suit: "oro", rank: 12 }, [{ suit: "basto", rank: 5 }]);
  return state;
}

/* ── the scenes ────────────────────────────────────────────────────────── */

const mounted: HTMLElement[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.remove();
});

/**
 * 375px — a phone, which is where this widget is embedded and the only width
 * at which the table's own container query picks its narrow card size. Width
 * only, never height: the real widget document declares no height on
 * `html`/`body` either, so an auto-height container is the FAITHFUL fixture
 * and nothing can clip.
 *
 * An INLINE width, not a class: `createEscobaRenderer` assigns
 * `container.className` outright, so a class set here would be gone by the
 * time anything is painted.
 */
function mountedContainer(): HTMLElement {
  const container = document.createElement("div");
  container.style.width = "375px";
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

/** The exact seam `main.ts` crosses to draw a live match: registry lookup,
 * then one fresh renderer per match. An unregistered id is a failed fixture,
 * never a silently blank scene. */
function escobaRenderer(gameId: GameId): ReturnType<GameUiEntry["createRenderer"]> {
  const entry = createGameUiRegistry().get(gameId);
  if (entry === undefined) throw new Error(`scene fixture setup: no renderer registered for ${gameId}`);
  return entry.createRenderer();
}

async function waitForArt(container: HTMLElement): Promise<void> {
  const images = [...container.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

describe("scene: the escoba table, mid-hand", () => {
  it("1v1: our turn, cards face up on the table, both capture piles started, the score mid-match", async () => {
    const container = mountedContainer();
    const state = headToHeadMidHand();

    escobaRenderer("escoba-de-15")(container, { view: getViewFor(state, SELF), legalActions: getLegalActions(state, SELF) }, () => {});
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("escoba-table-mid-hand");
  });

  it("2v2: the same screen with four players — and the pair's ONE combined pile, holding what both partners took", async () => {
    const container = mountedContainer();
    const state = teamMidHand();

    escobaRenderer("escoba-de-15-2v2")(container, { view: getViewFor(state, SELF), legalActions: getLegalActions(state, SELF) }, () => {});
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("escoba-table-2v2-mid-hand");
  });
});
