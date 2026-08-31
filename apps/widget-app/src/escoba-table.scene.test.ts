/// <reference types="@vitest/browser/matchers" />
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { applyAction, buildDeck, cardId, deal, getLegalActions, getViewFor } from "@hexdev/escoba-engine";
import type { Card, MatchState, Player, PlayerId, Team, TeamId } from "@hexdev/escoba-engine";
import type { GameId } from "@hexdev/platform-contract";
import { createGameUiRegistry, matchRenderContextFor } from "./game-ui-registry.js";
import type { GameUiEntry } from "./game-ui-registry.js";

/**
 * THE ESCOBA TABLE, MID-HAND, IN BOTH SEAT COUNTS — AND IN EVERY SHAPE THE
 * SIDE RAIL TAKES.
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
 *
 * IT DOES CONTAIN A REAL ESCOBA, three plays in, and that is deliberate too:
 * an escoba is marked on screen with a face-up card (art. 14.1,
 * `scoreboard.ts`), and a notation nobody ever photographs is a notation
 * nobody ever looks at. The deal below hands seat 0 a tres so that its play
 * sweeps the table clean.
 */
const HEAD_TO_HEAD_DECK: readonly Card[] = deckOpeningWith([
  { suit: "oro", rank: 11 }, // seat 0 — caballo de oro, still in hand
  { suit: "copa", rank: 7 }, // seat 1 — takes the sota
  { suit: "basto", rank: 5 }, // seat 0 — still in hand
  { suit: "copa", rank: 12 }, // seat 1 — left face up, then swept: ESCOBA
  { suit: "espada", rank: 3 }, // seat 0 — sweeps the table: ESCOBA
  { suit: "basto", rank: 1 }, // seat 1 — played only in the two-escoba state
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
 * on it: a card still face up on the table, a hand to play from, BOTH teams'
 * capture piles non-empty, the scoreboard mid-match — and one escoba on our
 * side against none on theirs, so a single shot carries both states of the
 * mark art. 14.1 asks for.
 *
 *   1. the rival's siete de copa takes the sota de basto      (7 + 8 = 15)
 *   2. our tres de espada takes the four, the six and the two (3 + 4 + 6 + 2 = 15)
 *      and that is the WHOLE table, so it is an ESCOBA
 *   3. the rival's rey de copa lands on an empty table and stays face up
 *
 * Our two remaining cards form no fifteen with it, so both render as playable
 * rather than dimmed. That is a choice about the PICTURE and it is worth being
 * honest about: a card that must capture before it can be played is a real
 * state of this UI, it just renders at 45% opacity, which in a still image
 * reads as a defect instead of as a rule.
 */
function headToHeadMidHand(): MatchState {
  let state = deal(headToHeadMatch(), HEAD_TO_HEAD_DECK);
  state = play(state, RIVAL, { suit: "copa", rank: 7 }, [{ suit: "basto", rank: 10 }]);
  state = play(
    state,
    SELF,
    { suit: "espada", rank: 3 },
    [
      { suit: "copa", rank: 4 },
      { suit: "espada", rank: 6 },
      { suit: "oro", rank: 2 },
    ],
  );
  state = play(state, RIVAL, { suit: "copa", rank: 12 }, []);
  return state;
}

/**
 * THE SAME HAND, TWO PLAYS LATER, AND THE ONLY THING THAT CHANGES IS THE
 * NOTATION.
 *
 * `scoreboard.ts` draws an escoba the way art. 14.1 asks for it — a card
 * turned face up across the pile — and every scene above photographs exactly
 * ONE of them, which is the count at which the mark is least legible: a lone
 * ivory chip beside a score reads as a badge nobody explained. A real hand
 * reaches two and three, and a notation is only judgeable at the counts it is
 * actually seen at. That is the whole reason this state exists.
 *
 *   4. our cinco de basto takes the rey de copa left face up above (5 + 10 = 15)
 *      and that is the whole table, so it is a SECOND ESCOBA
 *   5. the rival's as de basto lands on an empty table and stays face up
 *
 * Which leaves us two marks against the rivals' none, on one screen: the mark
 * at the count that was judged and the empty row it has to be distinguishable
 * from, side by side. The turn comes back to us holding the caballo de oro,
 * with nothing on the table to take it with — the same honest, playable state
 * the shot above is composed for.
 */
function headToHeadTwoEscobas(): MatchState {
  const swept = play(headToHeadMidHand(), SELF, { suit: "basto", rank: 5 }, [{ suit: "copa", rank: 12 }]);
  return play(swept, RIVAL, { suit: "basto", rank: 1 }, []);
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
  document.documentElement.removeAttribute("data-hexdev-layout");
});

/**
 * The container's width IS the subject of half this file, so it is an
 * argument rather than the constant it used to be: `.hexdev-escoba-layout`
 * is `container-type: inline-size`, so 375px and 768px are not the same
 * screen at two zoom levels — they are two different rails (`rail-styles.ts`
 * switches shape at 640 container-px) and two different card sizes
 * (`table-styles.ts` switches at 400 and 640).
 *
 * Width only, never height: the real widget document declares no height on
 * `html`/`body` either, so an auto-height container is the FAITHFUL fixture
 * and nothing can clip. That is also precisely why the landscape scenes
 * below are worth looking at — an auto-height box does not clip, it GROWS,
 * and what it grows past is the fold.
 *
 * An INLINE width, not a class: `createEscobaRenderer` assigns
 * `container.className` outright, so a class set here would be gone by the
 * time anything is painted.
 */
function mountedContainer(width: number): HTMLElement {
  const container = document.createElement("div");
  container.style.width = `${String(width)}px`;
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

/**
 * THE VIEWPORT IS SET BEFORE EVERY MOUNT, INCLUDING THE 375px ONES.
 *
 * Chromium never PAINTS what falls outside the viewport, and Browser Mode's
 * default is 414x896 — so a container wider than that renders correct CSS
 * (`getBoundingClientRect()` agrees) and photographs as solid white past
 * x≈414. `truco-ui/src/table-wide.scene.test.ts` found that the hard way and
 * documents it in full; this file inherits the lesson rather than the bug.
 *
 * Setting it EVERY time, not only in the wide scenes, is the second half:
 * `page.viewport(...)` is document state, and within one Browser Mode file
 * every test shares one real document — a viewport left at 888x700 by an
 * earlier test would silently redefine what a later "phone" scene means.
 * The narrow scenes therefore ask for 414x896 explicitly. It is the default,
 * so they photograph exactly as they always did; it is written down, so
 * their meaning no longer depends on where they sit in this file.
 *
 * The extra width over the container (`+120`) is truco's own margin, and it
 * is not decoration: `<body>` keeps its 8px UA margin here and a scrollbar
 * takes more, so a viewport merely EQUAL to the container still clips.
 *
 * THE VIEWPORT HEIGHT ALSO DECIDES HOW SHARP THE PICTURE IS, which is not
 * obvious and was measured, not assumed. Browser Mode renders the test
 * document in a window roughly 1280x720 and SCALES the iframe down to fit
 * whatever viewport was asked for, so the capture comes out at
 * `min(1, 1280 / width, 720 / height)` of life size: a 1200px-tall viewport
 * photographs everything at 0.6, and a 768px column of small text at 0.6 is
 * a picture that cannot answer the question it was taken to answer. Nothing
 * below asks for more height than its own content plus headroom.
 *
 * Which is safe for every scene below that mounts INLINE, and only those.
 * Inline, escoba's layout is still a pure function of the CONTAINER's inline
 * size, so two runs at the same width and different viewport heights lay out
 * identically and only the capture differs. It stopped being true of the
 * package as a whole the day `table-styles.ts` grew its fullscreen height
 * cap: under `[data-hexdev-layout="fullscreen"]` the card really does read
 * `100dvh`, exactly as `truco-ui`'s always has, which is why the landscape
 * pair at the bottom of this file pins a viewport height it means.
 */
const PHONE = { width: 414, height: 896 } as const;

/**
 * A tablet in portrait — comfortably past the rail's 640 container-px switch
 * and comfortably short of the 1280 one, so what this photographs is the
 * 168px column and not the 200px one.
 *
 * 700px of viewport, not 1200: the whole widget measures 364px tall here, so
 * 700 paints all of it twice over, and it is the number that keeps the
 * capture at 1:1 rather than 0.6 (see above). At 0.6 a 168px column of 12px
 * text is 100px of mush.
 */
const TABLET = { container: 768, width: 768 + 120, height: 700 } as const;

/**
 * A phone ROTATED: 844 wide, and — the part that matters — 390 tall.
 *
 * FULLSCREEN, unlike every other scene in this file, because that is the only
 * mode a live escoba match is ever drawn in (`main.ts`'s `enterMatch` calls
 * `sendLayout("fullscreen")` before a card is dealt) and the only mode the
 * height cap in `escoba-ui/src/table-styles.ts` applies in. Inline, the host
 * sizes the iframe to the height the widget reported, so `100dvh` would be a
 * function of this very layout; fullscreen, the box IS the window. Mounted
 * the way `applyLayoutMode` mounts it — `position: fixed; inset: 0` — so the
 * container is 844 rather than the 828 the inline scenes use.
 *
 * THE VIEWPORT IS 390 AND NOT 640, which reverses this scene's own earlier
 * reasoning on purpose. A viewport taller than the fold used to be the trick
 * that made the overflow visible: the PNG's own height WAS the measurement,
 * because Chromium paints nothing past the fold and 390 of screen cannot tell
 * a layout that fits from one that overflows by 200px. That job now belongs
 * to `escoba-viewport-fit.browser.test.ts`, which measures rectangles and is
 * unbothered by the fold. What is left for a picture is the question no
 * measurement answers: the cap trades card size for fit, and only an eye can
 * say whether what is left is still a card you would play a hand with. That
 * question needs `100dvh` to mean 390, so the viewport is 390.
 */
const LANDSCAPE = { width: 844, height: 390 } as const;

/** The attribute `handshake.ts` stamps on its own document root when it puts
 * the widget in fullscreen — the switch the height cap keys off. */
const LAYOUT_ATTRIBUTE = "data-hexdev-layout";

/** The fullscreen box, reproduced: pinned to the viewport, with the attribute
 * set BEFORE the first render so the cap is in effect for the initial layout
 * rather than applied to an already-measured one. */
function mountedFullscreen(): HTMLElement {
  document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
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
  return entry.createRenderer(matchRenderContextFor("joined", Date.now));
}

/** One screen, drawn exactly the way `main.ts` draws one: the registry's
 * renderer, this seat's redacted view, this seat's legal actions, and a
 * dispatch nothing here ever calls. */
function renderScreen(container: HTMLElement, gameId: GameId, state: MatchState): void {
  escobaRenderer(gameId)(container, { view: getViewFor(state, SELF), legalActions: getLegalActions(state, SELF) }, () => {});
}

async function waitForArt(container: HTMLElement): Promise<void> {
  const images = [...container.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

/**
 * The handle, on a rail that is really still SHUT.
 *
 * `[aria-expanded="false"]` is in the selector on purpose, and it is the
 * whole reason this is a function: a scene that photographs an open drawer
 * has to have opened it, and a fixture that found an already-open rail and
 * clicked it would photograph a CLOSED one and never say a word. Missing
 * handle, or a handle that no longer reports itself shut, is a failed
 * fixture here rather than a picture of the wrong state.
 */
function closedRailTab(container: HTMLElement): HTMLButtonElement {
  const tab = container.querySelector<HTMLButtonElement>('button.hexdev-escoba-rail-tab[aria-expanded="false"]');
  if (tab === null) throw new Error("scene fixture setup: no closed rail handle on this screen");
  return tab;
}

describe("scene: the escoba table, mid-hand", () => {
  it("1v1: our turn, cards face up on the table, both capture piles started, the score mid-match", async () => {
    await page.viewport(PHONE.width, PHONE.height);
    const container = mountedContainer(375);

    renderScreen(container, "escoba-de-15", headToHeadMidHand());
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("escoba-table-mid-hand");
  });

  it("2v2: the same screen with four players — and the pair's ONE combined pile, holding what both partners took", async () => {
    await page.viewport(PHONE.width, PHONE.height);
    const container = mountedContainer(375);

    renderScreen(container, "escoba-de-15-2v2", teamMidHand());
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("escoba-table-2v2-mid-hand");
  });
});

/**
 * THE RAIL, IN THE TWO SHAPES THE SCENES ABOVE CANNOT SHOW.
 *
 * The two screens above photograph the rail SHUT — a 26px handle down the
 * right edge, which is one of the three states it has and the least
 * interesting of them. The other two are the ones that were hard, and both
 * of them were already rendered once, looked at, and thrown away: the run
 * that produced them is what found the drawer reading the score THROUGH a
 * sota at `rgba(0,0,0,.34)` (`rail-styles.ts` now says "a drawer covers what
 * it covers") and what found `space-between` at 220px pulling a team's score
 * away from its own escoba count as though the two numbers were unrelated.
 * Both corrections are permanent; the only way to SEE either was not.
 *
 * That is the whole argument for this block. A state that had to be rendered
 * once to make a decision will have to be rendered again the next time
 * anyone touches the rail, and a scene is the cheapest possible way of
 * making that true forever — it asserts nothing, so it can never be a false
 * alarm, and it costs one screenshot.
 *
 * NO ASSERTIONS, DELIBERATELY, and the geometry is genuinely covered
 * elsewhere: `rail.browser.test.ts` fences the control (the aria pair, the
 * unique body ids, the container-query-not-media-query rule) and says in its
 * own words that the two SHAPES "belong to the scenes and to the eye". What
 * no `getBoundingClientRect()` fences is whether a drawer that provably
 * covers 64cqw covers the wrong 64cqw — that is a judgement, and judgements
 * need a picture (`visual/decision-de-capturas-y-mediciones`).
 */
describe("scene: the escoba side rail, opened and unfolded", () => {
  it("1v1, phone: the tanteador drawer OPEN over the felt — really pressed, never a hand-set data-open", async () => {
    await page.viewport(PHONE.width, PHONE.height);
    const container = mountedContainer(375);

    renderScreen(container, "escoba-de-15", headToHeadMidHand());
    await waitForArt(container);
    // A REAL POINTER, not `tabEl.click()`. The difference is not ceremony:
    // `.hexdev-escoba-side-rail` is `pointer-events: none` so the markable
    // cards under it stay tappable, and only `> *` gets them back. A
    // synthetic `.click()` calls the listener regardless of who would
    // actually have received the tap and would photograph an open drawer on
    // a handle nobody could open; a driver click has to hit-test its way
    // there first. Setting `data-open` by hand would prove even less — the
    // CSS, and none of the control.
    await userEvent.click(closedRailTab(container));

    await expect.element(container).toMatchScreenshot("escoba-table-rail-open");
  });

  it("2v2, phone: the same drawer with four seats in it — the tallest this thing ever gets on a phone", async () => {
    await page.viewport(PHONE.width, PHONE.height);
    const container = mountedContainer(375);

    // The denser of the two drawers, and the reason this is not a redundant
    // copy of the shot above: `renderEscobaStatus` lists every OTHER seat,
    // so a pairs match puts three chips in the column where mano a mano puts
    // one. If an open drawer is ever going to bury the cards, it buries them
    // here first.
    renderScreen(container, "escoba-de-15-2v2", teamMidHand());
    await waitForArt(container);
    await userEvent.click(closedRailTab(container));

    await expect.element(container).toMatchScreenshot("escoba-table-2v2-rail-open");
  });

  it("1v1, tablet: the rail as a permanent 168px COLUMN, handle gone, nothing to open", async () => {
    await page.viewport(TABLET.width, TABLET.height);
    const container = mountedContainer(TABLET.container);

    // NO CLICK HERE, and that is the state under examination: the rail is
    // still `data-open="false"` (nothing ever opened it), and past 640
    // container-px `rail-styles.ts` shows the body anyway and hides the
    // handle — "a drawer shut on a phone must not stay shut where there is
    // no drawer". A scene that clicked first would photograph the same
    // pixels and prove that rule was never exercised.
    //
    // 1v1 on purpose: the LEAST populated column this rail can be handed —
    // two scores and one seat chip in 168px — and therefore the one where
    // "a permanent column" is most at risk of reading as empty furniture.
    renderScreen(container, "escoba-de-15", headToHeadMidHand());
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("escoba-table-rail-column");
  });

  it("2v2, tablet: the same column with something in it — four seats, two scores, the stock", async () => {
    await page.viewport(TABLET.width, TABLET.height);
    const container = mountedContainer(TABLET.container);

    renderScreen(container, "escoba-de-15-2v2", teamMidHand());
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("escoba-table-2v2-rail-column");
  });
});

/**
 * THE ESCOBA MARKS, AT THE COUNT A REAL HAND REACHES.
 *
 * Every other scene in this file carries exactly one mark, and one was the
 * count at which the notation was judged and found ambiguous — a small ivory
 * chip beside a score. Two or three was the open question, and the only way to
 * settle it is to draw two and look, so this is the same 1v1 hand two plays
 * further on (`headToHeadTwoEscobas`).
 *
 * THE TABLET COLUMN, and not a phone: the tanteador is where the marks live,
 * and on a phone that is a drawer somebody has to open first. Past 640
 * container-px it is a permanent column, so the notation is simply on screen —
 * two marks on our row, none on the rivals', which is the comparison the
 * judgement actually needs.
 */
describe("scene: the escoba marks, at two", () => {
  it("1v1, tablet: two escobas on our row and none on theirs, in the rail's own column", async () => {
    await page.viewport(TABLET.width, TABLET.height);
    const container = mountedContainer(TABLET.container);

    renderScreen(container, "escoba-de-15", headToHeadTwoEscobas());
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("escoba-table-two-escobas");
  });
});

/**
 * THE PHONE, ROTATED — the one axis every other scene in this repo leaves
 * unexamined, and the one the height cap is paid for out of.
 *
 * What rotation takes away is HEIGHT: 390px, against the 896 every other
 * scene here has enjoyed. Escoba spends that axis on a status line, the
 * face-up table, the hand, both piles and the running sum, and until the cap
 * it spent it without looking: 72px cards at the wide tier were 72px whatever
 * room was left below them, and the widget measured 391.48px inside 390.
 *
 * `escoba-ui/src/table-styles.ts` now derives the card as `min(the width
 * tier, the height that fits)`, so these two are the picture of the price.
 * They decide nothing — a scene asserts nothing, and the fit itself is
 * measured in `escoba-viewport-fit.browser.test.ts` — but a cap that buys a
 * fit by making the cards unreadable is a worse bug than the overflow it
 * prevents, and only an eye can call that.
 */
describe("scene: the escoba table on a phone in landscape — fullscreen, 390 of height to spend", () => {
  it("1v1: everything the table stacks, against the 390px a rotated phone actually has", async () => {
    await page.viewport(LANDSCAPE.width, LANDSCAPE.height);
    const container = mountedFullscreen();

    renderScreen(container, "escoba-de-15", headToHeadMidHand());
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("escoba-table-landscape");
  });

  it("2v2: the same rotation with four seats and two four-card piles — more to stack, the same 390px", async () => {
    await page.viewport(LANDSCAPE.width, LANDSCAPE.height);
    const container = mountedFullscreen();

    renderScreen(container, "escoba-de-15-2v2", teamMidHand());
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("escoba-table-2v2-landscape");
  });
});
