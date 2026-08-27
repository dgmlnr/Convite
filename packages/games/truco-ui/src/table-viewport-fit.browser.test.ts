import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createHeadToHeadMatch, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { DealInput, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * The widget FITS the window it was given — the desktop half of the promise
 * `PHONE_VIEWPORT_CEILING` already makes for phones.
 *
 * WHAT WAS BROKEN, measured live at 1550x837 before this file existed: the
 * felt rendered 910.59px tall inside an 837px window, so the player's own
 * hand sat 74px below the fold of a `position: fixed; inset: 0` container
 * the host page cannot scroll. `loader.ts` already documents that exact
 * hazard for the resize path it guards; nothing guarded the felt's own size.
 *
 * WHY EVERY EXISTING FENCE WAS GREEN. The widget's height was a pure
 * function of its WIDTH: `--truco-card-width` is chosen by `@container`
 * inline-size tier (108px from 1280px up), and every row of the felt is
 * derived from it. Available HEIGHT was never an input to that choice, so a
 * wide, short window — an ordinary laptop — took the largest cards and the
 * tallest layout. `table-height-budget.browser.test.ts`'s ceilings are
 * measured-times-1.08 growth alarms, not fit guarantees: 910.59px sat
 * comfortably under its 984px budget while not fitting the screen at all.
 * That file says so about itself, for the phone: "a comment claiming more
 * than anything enforced". This is the same debt, one axis over.
 *
 * WHY IT ONLY APPLIES IN FULLSCREEN. The widget is "inline that expands"
 * (`widget-sdk/src/mount.ts`, design §3). Inline, it MEASURES itself and the
 * host grants that height through a resize message — there is no ceiling to
 * respect and capping the cards would shrink them for no reason. Fullscreen,
 * the container is pinned to the viewport and the widget must fit or be
 * clipped. So the cap keys off the layout mode the app already broadcasts,
 * and this file asserts BOTH halves: fullscreen fits, inline is untouched.
 *
 * The second half is not a formality. Every visual baseline and every height
 * fence in this package mounts inline; if the cap leaked into that path it
 * would silently re-measure all of them.
 */

const SELF = "fit-vp-self" as PlayerId;
const OPPONENT = "fit-vp-opponent" as PlayerId;
const TEAMMATE = "fit-vp-teammate" as PlayerId;
const OPPONENT_2 = "fit-vp-opponent-2" as PlayerId;

const DEAL_1V1: DealInput = [
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
];

const DEAL_2V2: DealInput = [
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
    { suit: "basto", rank: 3 },
    { suit: "copa", rank: 6 },
  ],
];

/** The attribute the widget app stamps on its own document root whenever it
 * tells the host to switch layout mode (`apps/widget-app/src/handshake.ts`).
 * Named here as a literal on purpose: if that contract is renamed, this
 * fence must fail rather than quietly stop covering anything. */
const LAYOUT_ATTRIBUTE = "data-hexdev-layout";

let container: HTMLElement;

afterEach(async () => {
  container.remove();
  document.documentElement.removeAttribute(LAYOUT_ATTRIBUTE);
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
  await page.viewport(414, 896); // visual/README.md's own default
});

/**
 * The fullscreen box, reproduced: the container is the viewport, exactly as
 * `applyLayoutMode` makes it (`position: fixed; inset: 0`). The attribute is
 * set BEFORE the first render so the cap is in effect for the initial
 * layout, not applied to an already-measured one.
 */
async function mountedFullscreen(width: number, height: number): Promise<HTMLElement> {
  await page.viewport(width, height);
  document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
  container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  document.body.appendChild(container);
  return container;
}

async function waitForArt(el: HTMLElement): Promise<void> {
  const images = [...el.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

function renderMatch(el: HTMLElement, seats: "1v1" | "2v2"): void {
  const state =
    seats === "1v1"
      ? startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }), DEAL_1V1)
      : startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);
  createMatchTableRenderer()(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
}

/**
 * Real windows, not tier boundaries. The first is the exact size the bug was
 * reported at; the rest are ordinary laptop and small-desktop shapes, all
 * WIDE (so the widest card tier is selected) and SHORT (so that tier does not
 * fit). A landscape phone is included because it is the most extreme ratio a
 * real player reaches.
 */
const WINDOWS = [
  { w: 1550, h: 837, label: "the reported window" },
  { w: 1280, h: 720, label: "720p laptop" },
  { w: 1440, h: 810, label: "16:9 desktop" },
  { w: 1024, h: 640, label: "small laptop" },
  { w: 844, h: 390, label: "phone, landscape" },
  /* PORTRAIT PHONES, and their absence was a real hole. Every window above is
   * wider than it is tall, so the height fit never had to hold on the one
   * shape where height is the scarce axis -- and while the per-tier card size
   * capped the fit from above, nothing here could tell. The moment fullscreen
   * started sizing cards from the window itself, a 390x844 phone overflowed
   * by 68px. A list of five landscape windows is a list of one shape. */
  { w: 390, h: 844, label: "phone, portrait" },
  { w: 360, h: 780, label: "small phone, portrait" },
  /* THE SHORT PHONES, and their absence hid the empty half of the fit.
   *
   * Every portrait window above is 780px tall or more, where the table fills
   * what it is given. The screens people actually play a truco hand on in one
   * hand are shorter than that, and there the felt stopped well short: 568px
   * of screen holding a 489px table, 79px of empty cloth underneath. Reported
   * looking at it -- twice, in two sessions -- while this suite stayed green,
   * because it only ever asked whether the table OVERFLOWED. */
  { w: 320, h: 568, label: "iPhone SE, portrait" },
  { w: 360, h: 640, label: "short Android, portrait" },
] as const;

describe.each(WINDOWS)("the widget fits its own window — $w x $h ($label)", ({ w, h }) => {
  /**
   * THE OTHER HALF OF THE FIT, and nothing here was asserting it.
   *
   * Every fence above says the table must not OVERFLOW its window. None of
   * them says it must USE it, so a felt that stopped well short passed them
   * all: measured on a 305x568 phone, a 568px screen holding a 489px table and
   * 79px of empty cloth under it. Reported looking at it, twice, over two
   * different sessions -- and green the whole time.
   *
   * A widget told to take the whole screen has taken the whole screen or it
   * has not. Half of that contract was fenced and half was assumed.
   */
  it.each(["1v1", "2v2"] as const)("%s: the table fills the window it was given", async (seats) => {
    const el = await mountedFullscreen(w, h);
    renderMatch(el, seats);
    await waitForArt(el);

    const felt = el.querySelector(".hexdev-truco-table");
    if (felt === null) throw new Error("fence setup: felt not rendered");

    // Against the SHELL rather than the window: the shell is position: fixed
    // inset: 0, so the two agree, and measuring the shell keeps this honest if
    // a host ever gives the widget less than the whole screen.
    const shortfall = el.getBoundingClientRect().height - felt.getBoundingClientRect().height;
    expect(shortfall, `${seats} leaves ${String(Math.round(shortfall))}px of empty cloth under the table at ${String(w)}x${String(h)}`).toBeLessThanOrEqual(1);
  });

  it.each(["1v1", "2v2"] as const)("%s: nothing renders below the fold", async (seats) => {
    const el = await mountedFullscreen(w, h);
    renderMatch(el, seats);
    await waitForArt(el);

    // NOT the container's own height: table.ts makes the container itself
    // the shell (container.className = "hexdev-truco-table-shell"), and this
    // one is position: fixed; inset: 0, so its box is the viewport by
    // definition and asserting on it would pass no matter how far its
    // contents spilled. The felt is the thing that actually grew.
    const felt = el.querySelector(".hexdev-truco-table");
    if (felt === null) throw new Error("fence setup: felt not rendered");
    expect(felt.getBoundingClientRect().height, `${seats} felt height against a ${String(h)}px window`).toBeLessThanOrEqual(h);
    expect(el.scrollHeight, `${seats} content overflowing the fullscreen box at ${String(h)}px`).toBeLessThanOrEqual(el.clientHeight + 1);
    // The felt's own CONTENTS, not just its box. The two are different and the
    // difference already hid a real overflow: `.hexdev-truco-table` carries
    // `overflow: hidden`, so a felt whose rows add up to more than it has
    // still measures exactly its own height and still reports no scroll on
    // the shell — while clipping the table. Only scrollHeight against
    // clientHeight, ON THE FELT, can see it.
    expect(felt.scrollHeight, `${seats} felt rows overflowing the felt itself at ${String(h)}px`).toBeLessThanOrEqual(felt.clientHeight + 1);
  });

  it("the way out can actually be clicked", async () => {
    // Reported from real play: "el boton de salir no actua cuando le hago
    // click". Not covered, not disabled -- INTERCEPTED. The rail's own box
    // spans the whole right column including the corner the leave control
    // sits in, it carries a higher z-index, and it had been given the pointer
    // events back. Nothing looked wrong, which is why no rectangle fence
    // could have caught it: the two never overlap to the eye.
    //
    // It lives in THIS suite and not with the other rail fences because only
    // this one drives a real viewport: elementFromPoint answers in viewport
    // coordinates, and a harness that mounts a 1280px container inside a
    // 414px window is asking about a point nobody can see.
    const el = await mountedFullscreen(w, h);
    // The SIXTH argument mounts .hexdev-truco-leave at all: without an
    // onLeaveMatch there is no way out on the table, and this fence would
    // pass by measuring nothing.
    const state = startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);
    createMatchTableRenderer()(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {}, undefined, null, () => {});
    await waitForArt(el);

    const button = el.querySelector<HTMLElement>(".hexdev-truco-leave button");
    if (button === null) throw new Error("fence setup: the leave control rendered no button");
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));

    expect(
      hit !== null && (hit === button || button.contains(hit)),
      `the click at the button's own centre lands on ${hit === null ? "nothing" : `${hit.tagName}.${String(hit.className)}`}`,
    ).toBe(true);
  });

    it("the deck marker is fully inside the felt", async () => {
    // Found by looking at a portrait phone once the cards started sizing
    // themselves from the window: the deck is a fraction of a CARD, so it
    // grew with them, and it hangs off the side of the hand it belongs to --
    // straight past the felt's edge and off the screen.
    const el = await mountedFullscreen(w, h);
    // dealerSeat 3 makes seat 0 -- the VIEWER -- the mano, which puts the deck
    // on the seat before them; dealerSeat 0 puts it on the viewer's own seat,
    // at the bottom, which is the case the report came from and the one a
    // first version of this fence missed entirely.
    const state = startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 0 }), DEAL_2V2);
    createMatchTableRenderer()(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const deck = el.querySelector(".hexdev-truco-deck");
    const felt = el.querySelector(".hexdev-truco-table");
    if (deck === null || felt === null) throw new Error("fence setup: no deck or no felt");
    const d = deck.getBoundingClientRect();
    const f = felt.getBoundingClientRect();

    expect(d.width, "fence setup: the deck did not paint").toBeGreaterThan(0);
    expect(d.right, `deck right ${d.right.toFixed(0)}px vs the felt's own right edge ${f.right.toFixed(0)}px`).toBeLessThanOrEqual(f.right + 0.5);
    expect(d.left, `deck left ${d.left.toFixed(0)}px vs the felt's own left edge ${f.left.toFixed(0)}px`).toBeGreaterThanOrEqual(f.left - 0.5);
  });

    it("the player's own hand is fully inside the window, not merely the shell", async () => {
    const el = await mountedFullscreen(w, h);
    renderMatch(el, "1v1");
    await waitForArt(el);

    // The hand is the row that went below the fold in the real report, and
    // a shell that fits while clipping its own bottom row would satisfy the
    // assertion above and still be the reported bug.
    const hand = el.querySelector(".hexdev-truco-hand");
    if (hand === null) throw new Error("fence setup: player hand not rendered");
    expect(hand.getBoundingClientRect().bottom, `player hand bottom edge against a ${String(h)}px window`).toBeLessThanOrEqual(h + 1);
  });
});

/**
 * The other direction. The cap above stops the widget being TALLER than the
 * window; this stops it leaving a hole when it is SHORTER.
 *
 * On a tall, narrow phone the felt is content-sized and simply does not need
 * the whole screen — measured 587px of an 820px viewport at 400px wide. The
 * shell painted nothing, so the 233px underneath fell through to the
 * document canvas, which is white by default: a bright band under a green
 * table, on a widget that had just taken over the entire screen. The lobby
 * never showed it because `.convite-chrome` paints its own surface; the
 * match view replaced that element with the truco shell, which painted
 * nothing at all.
 */
describe("a widget SHORTER than its window still owns the whole screen", () => {
  /**
   * Mounted the way `apps/widget-app` really mounts it: a PLAIN BLOCK in
   * normal flow (`#convite-app`), inside a document that is itself the
   * viewport because the host pinned the iframe. Deliberately not
   * `mountedFullscreen`'s `position: fixed; inset: 0` container — that one
   * covers the viewport by construction, so a height assertion against it
   * would pass no matter what the shell did, which is exactly the shape of
   * fence that lets a bug like this ship.
   */
  async function mountedAsTheAppDoes(width: number, height: number): Promise<HTMLElement> {
    await page.viewport(width, height);
    document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
    container = document.createElement("div");
    container.style.width = `${String(width)}px`;
    document.body.appendChild(container);
    return container;
  }

  it.each([
    { w: 400, h: 820, label: "tall phone" },
    { w: 390, h: 900, label: "taller phone" },
    { w: 768, h: 1024, label: "portrait tablet" },
  ])("$label ($w x $h): the shell covers the viewport and paints it", async ({ w, h }) => {
    const el = await mountedAsTheAppDoes(w, h);
    renderMatch(el, "1v1");
    await waitForArt(el);

    const shell = el.getBoundingClientRect();
    expect(shell.height, "nothing of the window is left to the canvas underneath").toBeGreaterThanOrEqual(h - 1);

    const background = getComputedStyle(el).backgroundColor;
    expect(background, "a transparent shell IS the white band — the canvas shows through it").not.toBe("rgba(0, 0, 0, 0)");
    expect(background).not.toBe("transparent");
  });

  it("inline mode is left alone — filling the viewport there would fight the host's own resize", async () => {
    // Inline, the widget MEASURES itself and the host grants that height
    // (loader.ts's resize path). A shell that always claimed the viewport
    // would report a height it did not need, and the iframe could never
    // shrink back — a one-way ratchet on somebody else's page.
    await page.viewport(400, 820);
    container = document.createElement("div");
    container.style.width = "400px";
    document.body.appendChild(container);
    renderMatch(container, "1v1");
    await waitForArt(container);

    expect(container.getBoundingClientRect().height, "inline height still comes from the content").toBeLessThan(820);
  });
});

/**
 * A desktop window spends its height on the CARDS, not on chrome.
 *
 * The cap above stops the felt outgrowing the window; this stops the window
 * being wasted. Reported from real play: "la calidad de la imagen de las
 * cartas es pobre... se podrían ajustar mejor al tamaño disponible". Measured,
 * the cards were not low-resolution at all — the deck art is 322x520 and was
 * being drawn into a 94x144 box, a 3.6x DOWNSCALE. They were simply small,
 * and the reason was the felt's fixed overhead: at 1550x837 it spent 304px of
 * an 837px window on bands, gaps and padding before a single card was placed.
 *
 * THE CEILING IS THE ARTWORK, and that is the other half of this fence. The
 * committed deck is 520px tall (`tools/process-svg-deck.mjs`'s own
 * `-resize x520`, chosen as "roughly 2x the largest on-screen use"). A card
 * drawn taller than 260 CSS px would upscale on a 2x display — trading the
 * blur the player reported for a worse one. 170px of WIDTH is that same
 * bound expressed on the axis the token actually carries
 * (170 * 336/220 = 260). Past it, the assets have to be re-exported before
 * the layout may grow, and this assertion is what makes that a decision
 * rather than a regression.
 */
describe("a desktop window spends its height on the cards", () => {
  /** What the reported window must now afford. Measured at 94.3px before any
   * of this: the felt's own bands and padding, not the artwork, were what
   * kept the cards small. */
  const DESKTOP_CARD_FLOOR = 108;

  /** 520px of artwork / (336/220) / 2 for a HiDPI display. Growing past this
   * upscales the deck — see the block comment above. */
  const ARTWORK_CEILING = 170;

  /** Deliberately the player's OWN hand and not any card: the opponents'
   * face-down backs are sized separately (they carry no information and pay
   * for that with height), so measuring "a card" would measure whichever one
   * the DOM happened to put first. */
  function cardInOwnHand(el: HTMLElement): HTMLElement {
    const card = el.querySelector<HTMLElement>(".hexdev-truco-hand .hexdev-truco-card");
    if (card === null) throw new Error("fence setup: the player's own hand did not render");
    return card;
  }

  it("the reported 1550x837 window renders cards the player can actually read", async () => {
    const el = await mountedFullscreen(1550, 837);
    renderMatch(el, "1v1");
    await waitForArt(el);

    // The PLAYER'S OWN card, measured as rendered. A custom property computes
    // to its token stream and not to a length, so reading --truco-card-width
    // here hands back the literal "min(...)" and parses as NaN — which fails
    // every comparison for a reason that has nothing to do with the layout.
    const card = cardInOwnHand(el);
    expect(card.getBoundingClientRect().width, "card width at the window the report came from").toBeGreaterThanOrEqual(DESKTOP_CARD_FLOOR);
  });

  it.each(WINDOWS)("$w x $h: never grows past what the artwork can draw", async ({ w, h }) => {
    const el = await mountedFullscreen(w, h);
    renderMatch(el, "1v1");
    await waitForArt(el);

    expect(cardInOwnHand(el).getBoundingClientRect().width, `card width at ${String(w)}x${String(h)} vs the deck's own resolution`).toBeLessThanOrEqual(
      ARTWORK_CEILING,
    );
  });
});

describe("INLINE mode is untouched — the cap must never reach the path every other fence measures", () => {
  it.each(["1v1", "2v2"] as const)("%s: a short window does not change the inline card size", async (seats) => {
    // Same short window that forces the cap in fullscreen, but mounted the
    // way the rest of this package mounts: a plain block in normal flow,
    // with no layout-mode attribute at all.
    await page.viewport(1550, 837);
    container = document.createElement("div");
    container.style.width = "1280px";
    document.body.appendChild(container);
    renderMatch(container, seats);
    await waitForArt(container);

    const felt = container.querySelector(".hexdev-truco-table");
    if (felt === null) throw new Error("fence setup: felt not rendered");
    const cardWidth = getComputedStyle(felt).getPropertyValue("--truco-card-width").trim();
    const expected = seats === "1v1" ? "108px" : "100px";
    expect(cardWidth, `inline ${seats} card width at the 1280px tier must be the tier's own value`).toBe(expected);
  });
});

/**
 * THE EMBEDDED SHAPE, which every fence above was missing.
 *
 * `mountedFullscreen` gives its container `position: fixed; inset: 0`, and a
 * fixed box with inset 0 takes its height from the viewport in a way that made
 * the felt fill by itself. A widget embedded in someone's page is not that: it
 * is a RELATIVE box the host has given a height to, and there the same shell
 * left 79px of empty cloth under the table -- 568px of screen holding a 489px
 * felt. Measured in a live browser, in the running widget, while all of the
 * fullscreen fences above were green.
 *
 * The difference is one line of CSS and it was never asserted, because no
 * harness in this repo built a shell the way a host builds one.
 */
describe.each([
  { w: 320, h: 568, label: "iPhone SE" },
  { w: 360, h: 640, label: "short Android" },
  { w: 375, h: 667, label: "iPhone 8" },
  { w: 414, h: 736, label: "iPhone Plus" },
] as const)("the embedded table fills the box its host gave it — $label ($w x $h)", ({ w, h }) => {
  it.each(["1v1", "2v2"] as const)("%s: no empty cloth under the table", async (seats) => {
    await page.viewport(w, h);
    document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
    container = document.createElement("div");
    // NO height, and no fixed positioning -- and getting that right is the
    // whole reason this fence exists twice over.
    //
    // In the running widget the shell is sized by `min-height: 100dvh` and its
    // `height` stays INDEFINITE. That is what breaks the layout inside it: a
    // percentage height cannot resolve against an indefinite one, so the
    // layout falls back to its own content and leaves the rest of the screen
    // empty. Measured live at 305x568: a 568px shell holding a 489px table.
    //
    // Two earlier versions of this fence handed the container a definite
    // height -- once via `position: fixed; inset: 0`, once via an explicit
    // `height` -- and both made the percentage resolve, filled the shell by
    // construction, and passed at every size while the defect was on screen.
    // The bug lives in the indefinite case, so the fence has to live there.
    document.body.style.margin = "0";
    document.body.appendChild(container);
    renderMatch(container, seats);
    await waitForArt(container);

    const felt = container.querySelector(".hexdev-truco-table");
    if (felt === null) throw new Error("fence setup: felt not rendered");

    const shortfall = container.getBoundingClientRect().height - felt.getBoundingClientRect().height;
    expect(shortfall, `${seats} leaves ${String(Math.round(shortfall))}px of empty cloth under the table at ${String(w)}x${String(h)}`).toBeLessThanOrEqual(1);
  });

  it.each(["1v1", "2v2"] as const)("%s: nothing renders below the fold", async (seats) => {
    const el = await mountedFullscreen(w, h);
    renderMatch(el, seats);
    await waitForArt(el);

    // NOT the container's own height: table.ts makes the container itself
    // the shell (container.className = "hexdev-truco-table-shell"), and this
    // one is position: fixed; inset: 0, so its box is the viewport by
    // definition and asserting on it would pass no matter how far its
    // contents spilled. The felt is the thing that actually grew.
    const felt = el.querySelector(".hexdev-truco-table");
    if (felt === null) throw new Error("fence setup: felt not rendered");
    expect(felt.getBoundingClientRect().height, `${seats} felt height against a ${String(h)}px window`).toBeLessThanOrEqual(h);
    expect(el.scrollHeight, `${seats} content overflowing the fullscreen box at ${String(h)}px`).toBeLessThanOrEqual(el.clientHeight + 1);
    // The felt's own CONTENTS, not just its box. The two are different and the
    // difference already hid a real overflow: `.hexdev-truco-table` carries
    // `overflow: hidden`, so a felt whose rows add up to more than it has
    // still measures exactly its own height and still reports no scroll on
    // the shell — while clipping the table. Only scrollHeight against
    // clientHeight, ON THE FELT, can see it.
    expect(felt.scrollHeight, `${seats} felt rows overflowing the felt itself at ${String(h)}px`).toBeLessThanOrEqual(felt.clientHeight + 1);
  });

  it("the way out can actually be clicked", async () => {
    // Reported from real play: "el boton de salir no actua cuando le hago
    // click". Not covered, not disabled -- INTERCEPTED. The rail's own box
    // spans the whole right column including the corner the leave control
    // sits in, it carries a higher z-index, and it had been given the pointer
    // events back. Nothing looked wrong, which is why no rectangle fence
    // could have caught it: the two never overlap to the eye.
    //
    // It lives in THIS suite and not with the other rail fences because only
    // this one drives a real viewport: elementFromPoint answers in viewport
    // coordinates, and a harness that mounts a 1280px container inside a
    // 414px window is asking about a point nobody can see.
    const el = await mountedFullscreen(w, h);
    // The SIXTH argument mounts .hexdev-truco-leave at all: without an
    // onLeaveMatch there is no way out on the table, and this fence would
    // pass by measuring nothing.
    const state = startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);
    createMatchTableRenderer()(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {}, undefined, null, () => {});
    await waitForArt(el);

    const button = el.querySelector<HTMLElement>(".hexdev-truco-leave button");
    if (button === null) throw new Error("fence setup: the leave control rendered no button");
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));

    expect(
      hit !== null && (hit === button || button.contains(hit)),
      `the click at the button's own centre lands on ${hit === null ? "nothing" : `${hit.tagName}.${String(hit.className)}`}`,
    ).toBe(true);
  });

    it("the deck marker is fully inside the felt", async () => {
    // Found by looking at a portrait phone once the cards started sizing
    // themselves from the window: the deck is a fraction of a CARD, so it
    // grew with them, and it hangs off the side of the hand it belongs to --
    // straight past the felt's edge and off the screen.
    const el = await mountedFullscreen(w, h);
    // dealerSeat 3 makes seat 0 -- the VIEWER -- the mano, which puts the deck
    // on the seat before them; dealerSeat 0 puts it on the viewer's own seat,
    // at the bottom, which is the case the report came from and the one a
    // first version of this fence missed entirely.
    const state = startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 0 }), DEAL_2V2);
    createMatchTableRenderer()(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const deck = el.querySelector(".hexdev-truco-deck");
    const felt = el.querySelector(".hexdev-truco-table");
    if (deck === null || felt === null) throw new Error("fence setup: no deck or no felt");
    const d = deck.getBoundingClientRect();
    const f = felt.getBoundingClientRect();

    expect(d.width, "fence setup: the deck did not paint").toBeGreaterThan(0);
    expect(d.right, `deck right ${d.right.toFixed(0)}px vs the felt's own right edge ${f.right.toFixed(0)}px`).toBeLessThanOrEqual(f.right + 0.5);
    expect(d.left, `deck left ${d.left.toFixed(0)}px vs the felt's own left edge ${f.left.toFixed(0)}px`).toBeGreaterThanOrEqual(f.left - 0.5);
  });

    it("the player's own hand is fully inside the window, not merely the shell", async () => {
    const el = await mountedFullscreen(w, h);
    renderMatch(el, "1v1");
    await waitForArt(el);

    // The hand is the row that went below the fold in the real report, and
    // a shell that fits while clipping its own bottom row would satisfy the
    // assertion above and still be the reported bug.
    const hand = el.querySelector(".hexdev-truco-hand");
    if (hand === null) throw new Error("fence setup: player hand not rendered");
    expect(hand.getBoundingClientRect().bottom, `player hand bottom edge against a ${String(h)}px window`).toBeLessThanOrEqual(h + 1);
  });
});

/**
 * The other direction. The cap above stops the widget being TALLER than the
 * window; this stops it leaving a hole when it is SHORTER.
 *
 * On a tall, narrow phone the felt is content-sized and simply does not need
 * the whole screen — measured 587px of an 820px viewport at 400px wide. The
 * shell painted nothing, so the 233px underneath fell through to the
 * document canvas, which is white by default: a bright band under a green
 * table, on a widget that had just taken over the entire screen. The lobby
 * never showed it because `.convite-chrome` paints its own surface; the
 * match view replaced that element with the truco shell, which painted
 * nothing at all.
 */
describe("a widget SHORTER than its window still owns the whole screen", () => {
  /**
   * Mounted the way `apps/widget-app` really mounts it: a PLAIN BLOCK in
   * normal flow (`#convite-app`), inside a document that is itself the
   * viewport because the host pinned the iframe. Deliberately not
   * `mountedFullscreen`'s `position: fixed; inset: 0` container — that one
   * covers the viewport by construction, so a height assertion against it
   * would pass no matter what the shell did, which is exactly the shape of
   * fence that lets a bug like this ship.
   */
  async function mountedAsTheAppDoes(width: number, height: number): Promise<HTMLElement> {
    await page.viewport(width, height);
    document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
    container = document.createElement("div");
    container.style.width = `${String(width)}px`;
    document.body.appendChild(container);
    return container;
  }

  it.each([
    { w: 400, h: 820, label: "tall phone" },
    { w: 390, h: 900, label: "taller phone" },
    { w: 768, h: 1024, label: "portrait tablet" },
  ])("$label ($w x $h): the shell covers the viewport and paints it", async ({ w, h }) => {
    const el = await mountedAsTheAppDoes(w, h);
    renderMatch(el, "1v1");
    await waitForArt(el);

    const shell = el.getBoundingClientRect();
    expect(shell.height, "nothing of the window is left to the canvas underneath").toBeGreaterThanOrEqual(h - 1);

    const background = getComputedStyle(el).backgroundColor;
    expect(background, "a transparent shell IS the white band — the canvas shows through it").not.toBe("rgba(0, 0, 0, 0)");
    expect(background).not.toBe("transparent");
  });

  it("inline mode is left alone — filling the viewport there would fight the host's own resize", async () => {
    // Inline, the widget MEASURES itself and the host grants that height
    // (loader.ts's resize path). A shell that always claimed the viewport
    // would report a height it did not need, and the iframe could never
    // shrink back — a one-way ratchet on somebody else's page.
    await page.viewport(400, 820);
    container = document.createElement("div");
    container.style.width = "400px";
    document.body.appendChild(container);
    renderMatch(container, "1v1");
    await waitForArt(container);

    expect(container.getBoundingClientRect().height, "inline height still comes from the content").toBeLessThan(820);
  });
});

/**
 * A desktop window spends its height on the CARDS, not on chrome.
 *
 * The cap above stops the felt outgrowing the window; this stops the window
 * being wasted. Reported from real play: "la calidad de la imagen de las
 * cartas es pobre... se podrían ajustar mejor al tamaño disponible". Measured,
 * the cards were not low-resolution at all — the deck art is 322x520 and was
 * being drawn into a 94x144 box, a 3.6x DOWNSCALE. They were simply small,
 * and the reason was the felt's fixed overhead: at 1550x837 it spent 304px of
 * an 837px window on bands, gaps and padding before a single card was placed.
 *
 * THE CEILING IS THE ARTWORK, and that is the other half of this fence. The
 * committed deck is 520px tall (`tools/process-svg-deck.mjs`'s own
 * `-resize x520`, chosen as "roughly 2x the largest on-screen use"). A card
 * drawn taller than 260 CSS px would upscale on a 2x display — trading the
 * blur the player reported for a worse one. 170px of WIDTH is that same
 * bound expressed on the axis the token actually carries
 * (170 * 336/220 = 260). Past it, the assets have to be re-exported before
 * the layout may grow, and this assertion is what makes that a decision
 * rather than a regression.
 */
describe("a desktop window spends its height on the cards", () => {
  /** What the reported window must now afford. Measured at 94.3px before any
   * of this: the felt's own bands and padding, not the artwork, were what
   * kept the cards small. */
  const DESKTOP_CARD_FLOOR = 108;

  /** 520px of artwork / (336/220) / 2 for a HiDPI display. Growing past this
   * upscales the deck — see the block comment above. */
  const ARTWORK_CEILING = 170;

  /** Deliberately the player's OWN hand and not any card: the opponents'
   * face-down backs are sized separately (they carry no information and pay
   * for that with height), so measuring "a card" would measure whichever one
   * the DOM happened to put first. */
  function cardInOwnHand(el: HTMLElement): HTMLElement {
    const card = el.querySelector<HTMLElement>(".hexdev-truco-hand .hexdev-truco-card");
    if (card === null) throw new Error("fence setup: the player's own hand did not render");
    return card;
  }

  it("the reported 1550x837 window renders cards the player can actually read", async () => {
    const el = await mountedFullscreen(1550, 837);
    renderMatch(el, "1v1");
    await waitForArt(el);

    // The PLAYER'S OWN card, measured as rendered. A custom property computes
    // to its token stream and not to a length, so reading --truco-card-width
    // here hands back the literal "min(...)" and parses as NaN — which fails
    // every comparison for a reason that has nothing to do with the layout.
    const card = cardInOwnHand(el);
    expect(card.getBoundingClientRect().width, "card width at the window the report came from").toBeGreaterThanOrEqual(DESKTOP_CARD_FLOOR);
  });

  it.each(WINDOWS)("$w x $h: never grows past what the artwork can draw", async ({ w, h }) => {
    const el = await mountedFullscreen(w, h);
    renderMatch(el, "1v1");
    await waitForArt(el);

    expect(cardInOwnHand(el).getBoundingClientRect().width, `card width at ${String(w)}x${String(h)} vs the deck's own resolution`).toBeLessThanOrEqual(
      ARTWORK_CEILING,
    );
  });
});

describe("INLINE mode is untouched — the cap must never reach the path every other fence measures", () => {
  it.each(["1v1", "2v2"] as const)("%s: a short window does not change the inline card size", async (seats) => {
    // Same short window that forces the cap in fullscreen, but mounted the
    // way the rest of this package mounts: a plain block in normal flow,
    // with no layout-mode attribute at all.
    await page.viewport(1550, 837);
    container = document.createElement("div");
    container.style.width = "1280px";
    document.body.appendChild(container);
    renderMatch(container, seats);
    await waitForArt(container);

    const felt = container.querySelector(".hexdev-truco-table");
    if (felt === null) throw new Error("fence setup: felt not rendered");
    const cardWidth = getComputedStyle(felt).getPropertyValue("--truco-card-width").trim();
    const expected = seats === "1v1" ? "108px" : "100px";
    expect(cardWidth, `inline ${seats} card width at the 1280px tier must be the tier's own value`).toBe(expected);
  });
});

/**
 * THE EMBEDDED SHAPE, which every fence above was missing.
 *
 * `mountedFullscreen` gives its container `position: fixed; inset: 0`, and a
 * fixed box with inset 0 takes its height from the viewport in a way that made
 * the felt fill by itself. A widget embedded in someone's page is not that: it
 * is a RELATIVE box the host has given a height to, and there the same shell
 * left 79px of empty cloth under the table -- 568px of screen holding a 489px
 * felt. Measured in a live browser, in the running widget, while all of the
 * fullscreen fences above were green.
 *
 * The difference is one line of CSS and it was never asserted, because no
 * harness in this repo built a shell the way a host builds one.
 */
describe.each([
  { w: 320, h: 568, label: "iPhone SE" },
  { w: 360, h: 640, label: "short Android" },
  { w: 375, h: 667, label: "iPhone 8" },
  { w: 414, h: 736, label: "iPhone Plus" },
] as const)("the embedded table fills the box its host gave it — $label ($w x $h)", ({ w, h }) => {
  it.each(["1v1", "2v2"] as const)("%s: no empty cloth under the table", async (seats) => {
    await page.viewport(w, h);
    document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
    container = document.createElement("div");
    // NO height, and no fixed positioning -- and getting that right is the
    // whole reason this fence exists twice over.
    //
    // In the running widget the shell is sized by `min-height: 100dvh` and its
    // `height` stays INDEFINITE. That is what breaks the layout inside it: a
    // percentage height cannot resolve against an indefinite one, so the
    // layout falls back to its own content and leaves the rest of the screen
    // empty. Measured live at 305x568: a 568px shell holding a 489px table.
    //
    // Two earlier versions of this fence handed the container a definite
    // height -- once via `position: fixed; inset: 0`, once via an explicit
    // `height` -- and both made the percentage resolve, filled the shell by
    // construction, and passed at every size while the defect was on screen.
    // The bug lives in the indefinite case, so the fence has to live there.
    document.body.style.margin = "0";
    document.body.appendChild(container);
    renderMatch(container, seats);
    await waitForArt(container);

    const felt = container.querySelector(".hexdev-truco-table");
    if (felt === null) throw new Error("fence setup: felt not rendered");

    const shortfall = container.getBoundingClientRect().height - felt.getBoundingClientRect().height;
    expect(shortfall, `${seats} leaves ${String(Math.round(shortfall))}px of empty cloth under the table`).toBeLessThanOrEqual(1);
  });
});
