import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { buildDeck, getLegalActions, getViewFor } from "@hexdev/escoba-engine";
import type { Card, MatchState, Player, PlayerId, Team, TeamId } from "@hexdev/escoba-engine";
import {
  createHeadToHeadMatch,
  createTeamMatch,
  getLegalActions as trucoLegalActions,
  getViewFor as trucoViewFor,
  startHand,
} from "@hexdev/truco-engine";
import type { DealInput, PlayerId as TrucoPlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "@hexdev/truco-ui";
import type { GameId } from "@hexdev/platform-contract";
import { createGameUiRegistry, matchRenderContextFor } from "./game-ui-registry.js";

/**
 * A CARD SLOT KEEPS ITS SHAPE WHEN THE SCREEN IS ROTATED.
 *
 * WHAT THIS DOES NOT CLAIM. Both games paint their art with
 * `object-fit: contain`, and contain preserves the intrinsic ratio by
 * definition — the browser guarantees the ARTWORK can never be stretched, so
 * a fence asserting that would be asserting a browser invariant and would
 * pass no matter what this repo did. What can deform is the SLOT the art
 * sits in, and that is what is measured below.
 *
 * WHY THE SLOT MATTERS ANYWAY. In escoba the slot is flush with the art
 * (`aspect-ratio` + `height: auto`), so a slot that changes shape opens
 * letterbox gaps where there were none and the card stops being card-shaped.
 * In truco the slot is deliberately wider than the art and the surplus is
 * transparent, so a slot that changes shape moves every card's position and
 * the hand stops lining up. Different symptom, same cause.
 *
 * WHY ROTATION IS THE INTERESTING AXIS. The widget never measures its own
 * box — it has container queries and no `matchMedia`, so "landscape" is not
 * a thing it can perceive. Rotation reaches it only as A WIDER CONTAINER,
 * which moves the width tier. A tier is supposed to change how BIG a card is
 * and nothing else; this file is what says so out loud. `rg '@container'`
 * finds no orientation or height query today, and if one is ever added, the
 * rows below are where its side effects surface.
 *
 * NO HARDCODED RATIO, ON PURPOSE. The assertion is that the ratios AGREE,
 * never that they equal some number written here. A fence that restates
 * today's ratio cannot tell "the layout held its shape" from "the layout and
 * the fence were changed together" — the failure mode this repo has already
 * hit more than once.
 */

/**
 * Sub-pixel noise, not a fudge factor. Chromium lays out in 1/64px units, so
 * a measured height carries up to 1/64px of rounding and the ratio it implies
 * carries about `ratio^2 / (64 * width)`. The narrowest card any screen below
 * draws is ~28px, which puts the floor near 0.00022. This allowance is ~9x
 * that, while real deformation — a squashed tier, a stray explicit height —
 * lands in the percent range, 30x wider still. If a future layout draws cards
 * much narrower than 28px, this number stops being derived and has to be
 * recomputed rather than merely raised.
 */
const SUBPIXEL_ALLOWANCE = 0.002;

const SELF = "slot-self" as PlayerId;
const RIVAL = "slot-rival" as PlayerId;
const PARTNER = "slot-partner" as PlayerId;
const RIVAL_TWO = "slot-rival-two" as PlayerId;
const OURS = "slot-ours" as TeamId;
const THEIRS = "slot-theirs" as TeamId;

const T_SELF = "slot-t-self" as TrucoPlayerId;
const T_OPPONENT = "slot-t-opponent" as TrucoPlayerId;
const T_TEAMMATE = "slot-t-teammate" as TrucoPlayerId;
const T_OPPONENT_2 = "slot-t-opponent-2" as TrucoPlayerId;

/** The attribute `handshake.ts` stamps when it tells the host to go
 * fullscreen. `enterMatch` sends it before the first card is drawn, so every
 * live match is laid out under it. A literal on purpose: rename the contract
 * and this fence must fail rather than quietly stop covering anything. */
const LAYOUT_ATTRIBUTE = "data-hexdev-layout";

type Seats = "1v1" | "2v2";

const ESCOBA_GAME_ID: Readonly<Record<Seats, GameId>> = {
  "1v1": "escoba-de-15" as GameId,
  "2v2": "escoba-de-15-2v2" as GameId,
};

const TRUCO_DEAL: Readonly<Record<Seats, DealInput>> = {
  "1v1": [
    [
      { suit: "espada", rank: 1 },
      { suit: "basto", rank: 4 },
      { suit: "espada", rank: 7 },
    ],
    [
      { suit: "espada", rank: 4 },
      { suit: "basto", rank: 1 },
      { suit: "oro", rank: 4 },
    ],
  ],
  "2v2": [
    [
      { suit: "espada", rank: 1 },
      { suit: "basto", rank: 4 },
      { suit: "espada", rank: 3 },
    ],
    [
      { suit: "basto", rank: 5 },
      { suit: "oro", rank: 1 },
      { suit: "basto", rank: 6 },
    ],
    [
      { suit: "oro", rank: 4 },
      { suit: "copa", rank: 4 },
      { suit: "basto", rank: 4 },
    ],
    [
      { suit: "copa", rank: 5 },
      { suit: "oro", rank: 6 },
      { suit: "copa", rank: 7 },
    ],
  ],
};

/**
 * A hand in progress, dealt straight from the deck's declared order rather
 * than played out: this file measures GEOMETRY, and the only thing a fixture
 * has to get right is how many cards sit in each region.
 * `escoba-viewport-fit.browser.test.ts` declares its states the same way, for
 * the same reason — escoba has no `createHeadToHeadMatch` factory.
 */
function escobaState(seats: Seats): MatchState {
  const seatOrder: readonly PlayerId[] = seats === "1v1" ? [SELF, RIVAL] : [SELF, RIVAL, PARTNER, RIVAL_TWO];
  const teams: readonly [Team, Team] = [
    { id: OURS, playerIds: seatOrder.filter((_, seat) => seat % 2 === 0), score: 17 },
    { id: THEIRS, playerIds: seatOrder.filter((_, seat) => seat % 2 === 1), score: 12 },
  ];
  const deck = buildDeck();
  let taken = 0;
  const next = (count: number): readonly Card[] => deck.slice(taken, (taken += count));
  const piles: Record<TeamId, readonly Card[]> = { [OURS]: next(4), [THEIRS]: next(4) };
  const table = next(4);
  const players: readonly Player[] = seatOrder.map((id, seat) => ({
    id,
    teamId: seat % 2 === 0 ? OURS : THEIRS,
    seat,
    hand: [...next(3)],
  }));
  return {
    teams,
    players,
    dealerSeat: 0,
    hand: {
      table: [...table],
      stock: [...deck.slice(taken)],
      piles,
      escobas: { [OURS]: 2, [THEIRS]: 1 },
      turn: SELF,
      lastCapturer: OURS,
      outcome: { decided: false },
    },
    pointsToWin: 30,
  };
}

let container: HTMLElement;

afterEach(async () => {
  container.remove();
  document.documentElement.removeAttribute(LAYOUT_ATTRIBUTE);
  await page.viewport(414, 896); // visual/README.md's own default
});

/**
 * The fullscreen box, reproduced: `applyLayoutMode` pins the widget with
 * `position: fixed; inset: 0`, and the attribute goes on BEFORE the first
 * render so the layout is measured under it rather than re-measured after.
 */
async function mountFullscreen(w: number, h: number): Promise<HTMLElement> {
  await page.viewport(w, h);
  document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
  container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  document.body.appendChild(container);
  return container;
}

/**
 * Every card slot on screen, as width/height. The `<img>` IS the slot in both
 * games — escoba sizes it directly, truco stretches it to fill the button —
 * so one selector covers both without either game having to expose anything
 * for the sake of being measured.
 */
async function slotRatios(el: HTMLElement): Promise<readonly number[]> {
  await Promise.all([...el.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
  return [...el.querySelectorAll<HTMLImageElement>("img")]
    .map((img) => img.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => rect.width / rect.height);
}

async function escobaSlots(seats: Seats, w: number, h: number): Promise<readonly number[]> {
  const el = await mountFullscreen(w, h);
  const entry = createGameUiRegistry().get(ESCOBA_GAME_ID[seats]);
  if (entry === undefined) throw new Error(`fence setup: no renderer for ${ESCOBA_GAME_ID[seats]}`);
  const state = escobaState(seats);
  entry.createRenderer(matchRenderContextFor("joined", Date.now))(el, { view: getViewFor(state, SELF), legalActions: getLegalActions(state, SELF) }, () => {});
  return slotRatios(el);
}

async function trucoSlots(seats: Seats, w: number, h: number): Promise<readonly number[]> {
  const el = await mountFullscreen(w, h);
  const state =
    seats === "1v1"
      ? startHand(
          createHeadToHeadMatch({ playerAId: T_SELF, playerBId: T_OPPONENT, pointsToWin: 30, dealerSeat: 1 }),
          TRUCO_DEAL["1v1"],
        )
      : startHand(
          createTeamMatch({ seatOrder: [T_SELF, T_OPPONENT, T_TEAMMATE, T_OPPONENT_2], pointsToWin: 30, dealerSeat: 3 }),
          TRUCO_DEAL["2v2"],
        );
  createMatchTableRenderer()(el, trucoViewFor(state, T_SELF), trucoLegalActions(state, T_SELF), () => {});
  return slotRatios(el);
}

/**
 * Real phones, the same window pair in both orientations. 390x844 is the
 * iPhone 14's own portrait; 844x390 is that exact phone rotated, which is the
 * shape `escoba-viewport-fit.browser.test.ts` already names as the one that
 * picks escoba's LARGEST card and TALLEST layout.
 */
const PORTRAIT = { w: 390, h: 844 } as const;
const LANDSCAPE = { w: 844, h: 390 } as const;

function spread(ratios: readonly number[]): number {
  return Math.max(...ratios) - Math.min(...ratios);
}

describe("a card slot keeps its shape when the phone is rotated", () => {
  for (const seats of ["1v1", "2v2"] as const) {
    it(`escoba ${seats} draws one slot shape in both orientations`, async () => {
      const portrait = await escobaSlots(seats, PORTRAIT.w, PORTRAIT.h);
      container.remove();
      const landscape = await escobaSlots(seats, LANDSCAPE.w, LANDSCAPE.h);

      // A screen that drew no cards would pass every assertion below by
      // having nothing to disagree about.
      expect(portrait.length).toBeGreaterThan(0);
      expect(landscape.length).toBeGreaterThan(0);

      expect(spread([...portrait, ...landscape])).toBeLessThan(SUBPIXEL_ALLOWANCE);
    });

    it(`truco ${seats} draws one slot shape in both orientations`, async () => {
      const portrait = await trucoSlots(seats, PORTRAIT.w, PORTRAIT.h);
      container.remove();
      const landscape = await trucoSlots(seats, LANDSCAPE.w, LANDSCAPE.h);

      expect(portrait.length).toBeGreaterThan(0);
      expect(landscape.length).toBeGreaterThan(0);

      expect(spread([...portrait, ...landscape])).toBeLessThan(SUBPIXEL_ALLOWANCE);
    });
  }
});
