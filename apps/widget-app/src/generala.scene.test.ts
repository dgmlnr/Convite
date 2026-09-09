/// <reference types="@vitest/browser/matchers" />
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { applyPlayerAction, applyRoll, createMatch, getLegalActions, getViewFor } from "@hexdev/generala-engine";
import type { ApplyResult, CategoryId, DieFace, MatchState, PlayerId } from "@hexdev/generala-engine";
import type { GameId } from "@hexdev/platform-contract";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";

import type { CatalogEntry } from "./bootstrap-data.js";
import type { GameSection } from "./game-sections.js";
import { renderGameList } from "./game-list.js";
import { renderGameSelection } from "./game-screen.js";
import { createGameUiRegistry, matchRenderContextFor } from "./game-ui-registry.js";

/**
 * EVERY GENERALA SCREEN, RENDERED SO A PERSON CAN LOOK AT IT.
 *
 * Scenes, not baselines: nothing here is compared against anything and
 * `pnpm visual:review` rewrites them on every run. They exist because this
 * repository has a written record of aesthetic defects found by looking and
 * none found by tests — a 1.07:1 contrast, an English row header on an
 * all-Spanish card, dice that did not rotate, an overlay that cancelled its
 * own positioning, and a preview `0` that was indistinguishable from a box
 * somebody had spent at `0`. Every one of those passed its suite.
 *
 * THIS IS THE FIRST TIME THE GAME EXISTS AS A SCREEN. Eighteen slices built
 * an engine, a module, three bot tiers, five presentation pieces and two
 * registrations; the board that mounts them landed with this one. So the
 * subjects below are not a sample of a screen that has been reviewed before —
 * they are the whole game, seen for the first time.
 *
 * EVERY STATE IS PLAYED BY THE REAL ENGINE. `applyRoll` and
 * `applyPlayerAction` validate every step, so an unreachable position cannot
 * be photographed by accident: a servida on the wrong throw, a category
 * already written, a hold the engine would refuse — each throws in the helper
 * below instead of quietly producing a pretty lie.
 *
 * RENDERED THROUGH THE REGISTRY, which is the entry point `main.ts` calls, so
 * what is in the picture is what a player gets.
 */

const LAYOUT_ATTRIBUTE = "data-hexdev-layout";
const GENERALA = "generala" as GameId;
const SEAT = "generala-scene-self" as PlayerId;
const RIVAL = "generala-scene-rival" as PlayerId;
const SEATS: readonly PlayerId[] = [SEAT, RIVAL];

const GENERALA_ENTRY: CatalogEntry = {
  id: GENERALA,
  gameFamily: "generala",
  section: "dados",
  displayNameKey: "games.generala.name",
  seatCount: 2,
  configOptions: [],
};

/** The presence shape every two-seat game's card is drawn from: nobody
 * waiting, and the bot fallback offered. */
const GENERALA_PRESENCE = new Map<GameId, readonly LobbyDisplayEntry[]>([[GENERALA, [{ modality: {}, waitingCount: undefined, promoteBotFallback: true }]]]);

const mounted: HTMLElement[] = [];

afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  document.documentElement.removeAttribute(LAYOUT_ATTRIBUTE);
  await page.viewport(414, 896);
});

function mountedContainer(width: number): HTMLElement {
  const container = document.createElement("div");
  container.style.width = `${String(width)}px`;
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

function accept(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`scene fixture setup: the engine refused a step — ${result.violation.code}: ${result.violation.message}`);
  return result.state;
}

/** Roll these five faces for whoever is on turn and write the box named,
 * using the engine's OWN offer — a category it would not accept fails loudly
 * here rather than producing a card nobody could have reached. */
function playTurn(state: MatchState, faces: readonly DieFace[], category: CategoryId): MatchState {
  const rolled = accept(applyRoll(state, faces));
  const turn = rolled.turn;
  if (turn.phase !== "deciding") throw new Error(`scene fixture setup: expected to be deciding after a roll, and the turn is ${turn.phase}`);
  const actor = rolled.players[turn.seat]!;
  const offer = getLegalActions(rolled, actor).find((action) => action.type === "score" && action.category === category);
  if (offer === undefined) throw new Error(`scene fixture setup: the engine did not offer ${category} to seat ${String(turn.seat)}`);
  return accept(applyPlayerAction(rolled, offer));
}

/**
 * The match box as `enterMatch` leaves it: fullscreen, pinned to the
 * viewport, nothing else on screen — the same frame the solitaire's own
 * scenes use, and the reason the picture shows a board rather than a widget
 * floating in a test page.
 */
async function boardScreen(state: MatchState, size: readonly [number, number], turnDeadline: number | null = null): Promise<HTMLElement> {
  await page.viewport(size[0], size[1]);
  document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  document.body.appendChild(container);
  mounted.push(container);

  // THE CLOCK IS FROZEN, WHICH IS THE ONLY WAY A COUNTDOWN CAN BE
  // PHOTOGRAPHED. `matchRenderContextFor` carries a `now` for exactly this,
  // and a deadline measured from that same zero renders the same string on
  // every run — a scene that read the wall clock would produce a different
  // image every time it was looked at.
  const render = createGameUiRegistry().get(GENERALA)!.createRenderer(matchRenderContextFor("joined", () => 0));
  render(container, { view: getViewFor(state, SEAT), legalActions: getLegalActions(state, SEAT), turnDeadline }, () => {}, () => {}, () => {});
  await Promise.all([...container.querySelectorAll("img")].map((image) => image.decode()));
  return container;
}

/**
 * FOUR TURNS, chosen so the planilla shows all three things a box can be at
 * once — open, written with a number, and crossed out at zero.
 *
 * That trio is the subject. Two of them used to render identically (a preview
 * `0`, a box crossed at `0`, and a written box were one bare number), and the
 * strike-through that tells them apart was added by looking rather than by
 * any assertion. This is the picture that says whether it worked.
 */
function midMatch(): MatchState {
  let state = createMatch(SEATS);
  // Seat 0 writes a real number; seat 1 answers with one.
  state = playTurn(state, [5, 5, 5, 2, 1], "fives");
  state = playTurn(state, [3, 3, 6, 6, 6], "sixes");
  // Seat 0 crosses out a box at zero, and it is the doble because that is the
  // only box a zero may go in on a card with nothing spent yet (ruleset §Orden
  // obligatorio de tachado) — which makes it exactly the sacrifice a real card
  // fills up with first.
  state = playTurn(state, [4, 4, 6, 3, 2], "generala-doble");
  // Seat 1 takes the full.
  state = playTurn(state, [2, 2, 2, 5, 5], "full");
  return state;
}

describe("scene: the board, which is the screen this whole change was for", () => {
  it("a phone mid-turn (375): the tray, the throw, and the planilla under it", async () => {
    const container = await boardScreen(accept(applyRoll(midMatch(), [4, 4, 1, 6, 3])), [375, 812], 47_000);
    await expect.element(container).toMatchScreenshot("generala-board-narrow");
  });

  it("a desktop (1280): the same table with room to lay it out", async () => {
    const container = await boardScreen(accept(applyRoll(midMatch(), [4, 4, 1, 6, 3])), [1280, 900], 47_000);
    await expect.element(container).toMatchScreenshot("generala-board-wide");
  });

  /* THE FIRST THROW OF A TURN, which is the only one a servida can happen on
   * and therefore the only one the callout appears on. It shows up once per
   * turn for a whole match, so what this picture is for is whether it reads
   * as a note or as an alarm. */
  it("a servida throw: the callout that says this one is worth more", async () => {
    const container = await boardScreen(accept(applyRoll(midMatch(), [6, 6, 6, 6, 2])), [375, 812], 58_000);
    await expect.element(container).toMatchScreenshot("generala-board-servida");
  });

  /* A FRESH MATCH BEFORE ANYTHING IS THROWN. Twenty-two open boxes and five
   * empty slots where the dice will land — the emptiest this screen ever is,
   * and the state a player meets first. */
  it("the opening: an empty card and a cup that has not been shaken", async () => {
    const container = await boardScreen(createMatch(SEATS), [375, 812], 60_000);
    await expect.element(container).toMatchScreenshot("generala-board-opening");
  });

  /* THE RIVAL'S TURN, WHICH EVERY OTHER PICTURE IN THIS FILE LEAVES OUT.
   *
   * `midMatch` and all three scenes above land on seat 0, so half of every
   * match this game plays had never been photographed. It is also the only
   * state in which the two turn cues are visible at all: the rival's column
   * carries the shading and the accent heading, the dice on the table are
   * dimmed because they are not this seat's to hold, and the throw control is
   * simply absent. What this picture is for is whether those three together
   * read as "wait" rather than as "broken" — and, since the clock landed, of
   * whether a rival's time visibly running out reads as information about the
   * game rather than as pressure on somebody who cannot act on it. That was
   * the decision this scene exists to check: both clocks are shown, and this
   * is the half of it nobody had seen. */
  it("the rival's turn: their dice on the table, their column lit, their clock running, and nothing here to press", async () => {
    const passed = playTurn(midMatch(), [2, 2, 4, 5, 1], "twos");
    const container = await boardScreen(accept(applyRoll(passed, [6, 6, 3, 3, 1])), [375, 812], 22_000);
    await expect.element(container).toMatchScreenshot("generala-board-rival-turn");
  });
});

describe("scene: the screen that ends the match", () => {
  /* A WHOLE MATCH, PLAYED. Eleven categories for both seats, every one
   * written through the engine's own offer, so the overlay below reports a
   * real result over a real finished card rather than a declared outcome. */
  it("the verdict, over the card that produced it", async () => {
    let state = createMatch(SEATS);
    const script: readonly (readonly [readonly DieFace[], CategoryId])[] = [
      [[1, 1, 1, 4, 5], "ones"],
      [[2, 2, 6, 6, 3], "twos"],
      [[3, 3, 3, 1, 5], "threes"],
      [[4, 4, 4, 2, 1], "fours"],
      [[5, 5, 5, 3, 2], "fives"],
      [[6, 6, 6, 1, 2], "sixes"],
      [[1, 2, 3, 4, 5], "escalera"],
      [[2, 2, 2, 5, 5], "full"],
      [[3, 3, 3, 3, 6], "poker"],
      // The doble before the generala, because both are written at zero here
      // and a zero goes in the highest-paying open box: with only these two
      // left the ladder reaches the doble first.
      [[5, 5, 1, 2, 3], "generala-doble"],
      [[4, 4, 4, 1, 2], "generala"],
    ];
    // Each pair is played twice, once per seat, so both cards fill together
    // and the turn returns to seat 0 for the next category.
    for (const [faces, category] of script) {
      state = playTurn(state, faces, category);
      state = playTurn(state, faces, category);
    }
    const container = await boardScreen(state, [375, 812]);
    await expect.element(container).toMatchScreenshot("generala-board-match-over");
  });
});

/**
 * SCREEN ONE WITH ITS THIRD SHELF, and the contrast is the subject: two
 * shelves of games drawn as fanned rectangles beside one whose art is three
 * square dice. `cardArt` takes URLs and lays them out as a fan with a fixed
 * `height: auto`, so a square face is not a card and this is the only place
 * that shows what that actually looks like.
 */
describe("scene: the front door, with the shelf the dice put on it", () => {
  const cartaEntry = (id: string, family: string, key: string, seatCount = 2): CatalogEntry => ({
    id: id as GameId,
    gameFamily: family,
    section: "cartas",
    displayNameKey: key,
    seatCount,
    configOptions: [],
  });
  const SOLO_ENTRY: CatalogEntry = {
    id: "mahjong-solitario" as GameId,
    gameFamily: "mahjong-solitario",
    section: "fichas",
    displayNameKey: "games.mahjongSolitario.name",
    seatCount: 1,
    configOptions: [],
  };
  const SHELVES: readonly GameSection[] = [
    {
      id: "cartas",
      families: [
        { id: "truco", entries: [cartaEntry("truco-argentino", "truco", "games.truco.name"), cartaEntry("truco-argentino-2v2", "truco", "games.truco2v2.name", 4)] },
        { id: "escoba", entries: [cartaEntry("escoba-de-15", "escoba", "games.escoba.name")] },
      ],
    },
    { id: "fichas", families: [{ id: "mahjong-solitario", entries: [SOLO_ENTRY] }] },
    { id: "dados", families: [{ id: "generala", entries: [GENERALA_ENTRY] }] },
  ];

  it("wide (1024px): three shelves, and the dice beside the cards and the tiles", async () => {
    await page.viewport(1024 + 120, 1500);
    const container = mountedContainer(1024);
    renderGameList(container, SHELVES, { onOpenGame: () => {} });
    await Promise.all([...container.querySelectorAll("img")].map((image) => image.decode()));
    await expect.element(container).toMatchScreenshot("generala-front-door-wide");
  });

  it("narrow (375px): the shelves stack, and the dice card holds its own", async () => {
    await page.viewport(414, 1600);
    const container = mountedContainer(375);
    renderGameList(container, SHELVES, { onOpenGame: () => {} });
    await Promise.all([...container.querySelectorAll("img")].map((image) => image.decode()));
    await expect.element(container).toMatchScreenshot("generala-front-door-narrow");
  });
});

describe("scene: the dice game's own screen two", () => {
  it("one modality, so one line of summary and two ways in", async () => {
    await page.viewport(414, 896);
    const container = mountedContainer(375);
    renderGameSelection(container, [GENERALA_ENTRY], GENERALA_ENTRY.gameFamily, GENERALA_PRESENCE, { onPlayVsPerson: () => {}, onPlayVsBot: () => {} });
    await Promise.all([...container.querySelectorAll("img")].map((image) => image.decode()));
    await expect.element(container).toMatchScreenshot("generala-game-screen-narrow");
  });
});
