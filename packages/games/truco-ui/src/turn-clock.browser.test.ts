/**
 * The per-turn countdown, and the accessibility trap it walks straight into.
 *
 * A countdown is text that changes ONCE A SECOND. This table carries four
 * ARIA live regions (`announcer.ts`), and a screen reader announces a live
 * region's content every time it changes — so a per-second number that lands
 * in, or under, one of them would be read out every single second for the
 * whole minute, which is not a degraded experience but an unusable one. The
 * fences below are what keep that from ever regressing: the ticking node is
 * `aria-hidden`, it has no `aria-live` ancestor, and ticking it repeatedly
 * leaves every narrative announcer's text byte-identical. The fourth region
 * ("turn-clock") is the sanctioned COARSE voice of this clock — at most two
 * sentences per timed turn, fenced in its own file
 * (`turn-clock-announcements.browser.test.ts`) and held here to exactly its
 * two sanctioned sentences, never a running number.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * Lands the deal before anything is measured.
 *
 * The table plays a short dealing animation on the first render of every hand
 * -- every card translated and scaled for about half a second -- so a rect
 * taken straight after render is the rect of a card still in the air. This
 * suite is about the SETTLED table, so it settles it: the same distinction
 * the animation itself draws, made explicit rather than waited out.
 */
function settleDeal(el: HTMLElement): void {
  el.querySelector(".hexdev-truco-table--dealing")?.classList.remove("hexdev-truco-table--dealing");
}

const SELF = "player-a" as PlayerId;
const OPPONENT = "player-b" as PlayerId;
const MY_TEAM = "player-a:team" as TeamId;
const OPPONENT_TEAM = "player-b:team" as TeamId;

/** A fixed instant, so every expectation below is about arithmetic this test
 * fully controls rather than about wall-clock time. */
const T0 = 1_700_000_000_000;

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

function freshContainer(width = "700px"): HTMLElement {
  container = document.createElement("div");
  container.style.width = width;
  document.body.appendChild(container);
  return container;
}

function baseView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    self: { playerId: SELF, teamId: MY_TEAM, seat: 0, hand: [{ suit: "espada", rank: 1 }], lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
    teammates: [],
    opponents: [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 3 }],
    teams: [
      { id: MY_TEAM, score: 4 },
      { id: OPPONENT_TEAM, score: 2 },
    ],
    hand: {
      manoSeat: 0,
      truco: { status: "none" },
      envido: { status: "none" },
      turnSeat: 0,
      currentTrickPlays: [],
      resolvedTrickPlays: [],
      callEvents: [],
      trickOutcomes: [],
      outcome: { decided: false },
    },
    config: { pointsToWin: 30 },
    dealerSeat: 1,
    ...overrides,
  };
}

/** Both timing inputs injected, the same duration/clock-injection discipline
 * `handOutcomeBannerMs`/`senaNoticeMs` already established here: `now` makes
 * the DISPLAYED number deterministic, the tick interval makes the test not
 * wait real seconds to see it change. */
function clockedRenderer(now: () => number) {
  return createMatchTableRenderer({ now, turnClockTickMs: 5 });
}

const clockOf = (el: HTMLElement): HTMLElement | null => el.querySelector<HTMLElement>(".hexdev-truco-turn-clock");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("turn countdown — one clock, on the seat that owes the move, visible to everyone", () => {
  it("renders the countdown inside the active seat's own turn badge", () => {
    const el = freshContainer();
    const render = clockedRenderer(() => T0);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);

    settleDeal(el);

    const badge = el.querySelector<HTMLElement>('[data-position="bottom"] .hexdev-truco-turn-badge')!;
    const clock = badge.querySelector<HTMLElement>(".hexdev-truco-turn-clock");
    expect(clock).not.toBeNull();
    expect(clock!.textContent).toBe("1:00");
    // The badge still says whose turn it is — the clock is added to that
    // sentence, it does not replace it.
    expect(badge.textContent).toContain("Tu turno");
  });

  it("follows the active seat — the opponent's badge carries the clock when the turn is theirs", () => {
    const el = freshContainer();
    const render = clockedRenderer(() => T0);

    render(el, baseView({ hand: { ...baseView().hand!, turnSeat: 1 } }), [], () => {}, undefined, T0 + 45_000);

    settleDeal(el);

    expect(el.querySelector('[data-position="bottom"] .hexdev-truco-turn-clock')).toBeNull();
    expect(el.querySelector<HTMLElement>('[data-position="top"] .hexdev-truco-turn-clock')!.textContent).toBe("0:45");
  });

  it("counts down on its own between broadcasts — no new view message is needed to move the number", async () => {
    const el = freshContainer();
    let now = T0;
    const render = clockedRenderer(() => now);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);

    settleDeal(el);
    expect(clockOf(el)!.textContent).toBe("1:00");

    now = T0 + 13_000;
    await sleep(40);
    expect(clockOf(el)!.textContent).toBe("0:47");

    now = T0 + 59_500;
    await sleep(40);
    expect(clockOf(el)!.textContent).toBe("0:01");
  });

  it("never shows a negative clock — an already-expired deadline reads zero, not '-0:03'", async () => {
    const el = freshContainer();
    let now = T0;
    const render = clockedRenderer(() => now);

    render(el, baseView(), [], () => {}, undefined, T0 + 2_000);

    settleDeal(el);
    now = T0 + 9_000;
    await sleep(40);

    expect(clockOf(el)!.textContent).toBe("0:00");
  });

  it("renders no countdown at all when there is no deadline — an untimed table is unchanged", () => {
    const el = freshContainer();
    const render = clockedRenderer(() => T0);

    render(el, baseView(), [], () => {});

    settleDeal(el);

    expect(clockOf(el)).toBeNull();
    expect(el.querySelector<HTMLElement>(".hexdev-truco-turn-badge")!.textContent).toBe("Tu turno");
  });

  it("drops the countdown when a later broadcast carries no deadline — a finished match stops ticking", async () => {
    const el = freshContainer();
    let now = T0;
    const render = clockedRenderer(() => now);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);

    settleDeal(el);
    expect(clockOf(el)).not.toBeNull();

    render(el, baseView(), [], () => {}, undefined, null);

    settleDeal(el);
    expect(clockOf(el)).toBeNull();

    // And the interval that was driving it is genuinely gone, not merely
    // pointing at a removed node: ticking on would throw or resurrect text.
    now = T0 + 30_000;
    await sleep(40);
    expect(clockOf(el)).toBeNull();
  });
});

describe("turn countdown — THE ACCESSIBILITY FENCE: a per-second number must never reach a live region", () => {
  it("marks the ticking number aria-hidden and keeps it out of every live region's subtree", () => {
    const el = freshContainer();
    const render = clockedRenderer(() => T0);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);

    settleDeal(el);

    const clock = clockOf(el)!;
    expect(clock.getAttribute("aria-hidden")).toBe("true");
    // No ancestor between the clock and the container may be a live region.
    for (let node = clock.parentElement; node !== null && node !== el.parentElement; node = node.parentElement) {
      expect(node.getAttribute("aria-live")).toBeNull();
    }
    // And stated the other way round, so the fence survives a future DOM move:
    // no live region anywhere in the tree contains this node.
    for (const region of el.querySelectorAll("[aria-live]")) {
      expect(region.contains(clock)).toBe(false);
    }
  });

  it("leaves every narrative announcer byte-identical while the clock ticks — a screen reader hears the turn once, never the seconds", async () => {
    const el = freshContainer();
    let now = T0;
    const render = clockedRenderer(() => now);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);

    settleDeal(el);

    const announcers = [...el.querySelectorAll<HTMLElement>("[data-announces]")];
    // hand-outcome, partner-sena, envido-reveal, turn, turn-clock,
    // pending-call, trick, match-over, consult — the count keeps this fence
    // complete: a renamed or added region that dodged the filter below would
    // tick-spam unpinned. It earned that keep: `envido-reveal` was added for
    // the reveal notice and this assertion is what caught it, before
    // anything else did; Slice 4b's own `consult` region is the same story.
    expect(announcers).toHaveLength(9);
    // The turn-clock region is the clock's own sanctioned coarse voice — held
    // to its two whole sentences below, never to byte-identity: that is the
    // one region a threshold crossing is ALLOWED to change, exactly once.
    const narrative = announcers.filter((region) => region.dataset.announces !== "turn-clock");
    const clockRegion = announcers.find((region) => region.dataset.announces === "turn-clock")!;
    const before = narrative.map((region) => `${region.dataset.announces}=${region.textContent}`);
    expect(before).toContain("turn=Tu turno");
    expect(clockRegion.textContent).toBe("Tenés 60 segundos para jugar");

    for (const at of [7_000, 21_000, 44_000]) {
      now = T0 + at;
      await sleep(20);
      // The visible number really is moving — otherwise this whole assertion
      // would pass on a clock that never ticked at all.
      expect(clockOf(el)!.textContent).not.toBe("1:00");
      expect(narrative.map((region) => `${region.dataset.announces}=${region.textContent}`)).toEqual(before);
      expect(clockRegion.textContent).toBe("Tenés 60 segundos para jugar");
    }

    // The final tick crosses the coarse threshold: the ONE sanctioned change,
    // a whole sentence — still never the seconds themselves.
    now = T0 + 59_000;
    await sleep(20);
    expect(narrative.map((region) => `${region.dataset.announces}=${region.textContent}`)).toEqual(before);
    expect(clockRegion.textContent).toBe("Quedan 10 segundos");
  });
});

describe("turn countdown — it must not move a single fenced pixel", () => {
  for (const width of [375, 700, 960, 1280]) {
    it(`adds no height and does not disturb the action bar at ${width}px`, () => {
      const el = freshContainer(`${width}px`);
      const render = clockedRenderer(() => T0);

      render(el, baseView(), [], () => {});

      settleDeal(el);
      const withoutClock = {
        shell: el.getBoundingClientRect().height,
        felt: el.querySelector<HTMLElement>(".hexdev-truco-table")!.getBoundingClientRect().height,
        actionBar: el.querySelector<HTMLElement>(".hexdev-truco-action-bar")!.getBoundingClientRect().height,
        badge: el.querySelector<HTMLElement>(".hexdev-truco-turn-badge")!.getBoundingClientRect(),
      };

      render(el, baseView(), [], () => {}, undefined, T0 + 60_000);

      settleDeal(el);
      const withClock = {
        shell: el.getBoundingClientRect().height,
        felt: el.querySelector<HTMLElement>(".hexdev-truco-table")!.getBoundingClientRect().height,
        actionBar: el.querySelector<HTMLElement>(".hexdev-truco-action-bar")!.getBoundingClientRect().height,
        badge: el.querySelector<HTMLElement>(".hexdev-truco-turn-badge")!.getBoundingClientRect(),
      };

      expect(withClock.shell).toBe(withoutClock.shell);
      expect(withClock.felt).toBe(withoutClock.felt);
      expect(withClock.actionBar).toBe(withoutClock.actionBar);
      // The badge is `position: absolute` (out of flow), so it cannot move a
      // height fence even if it grew — but it must not grow TALLER either,
      // or it would start reaching toward the band above it.
      expect(withClock.badge.height).toBe(withoutClock.badge.height);
      expect(withClock.badge.top).toBe(withoutClock.badge.top);
    });
  }

  it("keeps the badge horizontally centred on its anchor, so a wider pill grows symmetrically", () => {
    const el = freshContainer();
    const render = clockedRenderer(() => T0);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);

    settleDeal(el);

    const anchor = el.querySelector<HTMLElement>('[data-position="bottom"]')!.getBoundingClientRect();
    const badge = el.querySelector<HTMLElement>(".hexdev-truco-turn-badge")!.getBoundingClientRect();
    expect(Math.abs((badge.left + badge.right) / 2 - (anchor.left + anchor.right) / 2)).toBeLessThan(0.5);
  });

  it("never lets the countdown overlap the action bar (the zero-overlap mandate, extended to the clock)", () => {
    const el = freshContainer();
    const render = clockedRenderer(() => T0);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);

    settleDeal(el);

    const badge = el.querySelector<HTMLElement>(".hexdev-truco-turn-badge")!.getBoundingClientRect();
    const bar = el.querySelector<HTMLElement>(".hexdev-truco-action-bar")!.getBoundingClientRect();
    const overlaps = badge.left < bar.right - 0.5 && bar.left < badge.right - 0.5 && badge.top < bar.bottom - 0.5 && bar.top < badge.bottom - 0.5;
    expect(overlaps).toBe(false);
  });
});

/**
 * The badge must not sit on top of the cards it is about.
 *
 * Reported from real play, with a screenshot: "la indicación del turno con el
 * tiempo... está muy pegada a las cartas en la parte del número y no se llega
 * a ver bien porque lo tapa". Measured, the badge overlapped the top 9px of
 * whichever cards sat under it — and in a Spanish deck the rank index lives
 * in exactly that corner, so it was covering the one mark that says WHICH
 * card it is.
 *
 * It sat at `top: -11px` against an anchor whose height is its content: 11px
 * of a 20px badge above the edge, the other 9px inside, over the cards.
 *
 * FIXING IT MUST COST NO HEIGHT. This felt is vertically saturated — the
 * cards only reached their current size by reclaiming reserved pixels one at
 * a time — so pushing the hand down to make room would pay for a readable
 * badge with smaller cards. The badge stays out of flow; only where it hangs
 * changes.
 */
describe("the turn badge clears the cards it belongs to", () => {
  for (const width of [375, 570, 960, 1280]) {
    it(`does not cover any of the player's own cards at ${width}px`, () => {
      const el = freshContainer(`${width}px`);
      const render = clockedRenderer(() => T0);
      render(el, baseView(), [], () => {}, undefined, T0 + 60_000);
      settleDeal(el);

      const badge = el.querySelector<HTMLElement>(".hexdev-truco-turn-badge");
      if (badge === null) throw new Error("fence setup: no turn badge rendered");
      const box = badge.getBoundingClientRect();
      const cards = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-hand .hexdev-truco-card")];
      expect(cards.length, "fence setup: the player's own hand rendered").toBeGreaterThan(0);

      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        const overlapX = Math.min(box.right, rect.right) - Math.max(box.left, rect.left);
        const overlapY = Math.min(box.bottom, rect.bottom) - Math.max(box.top, rect.top);
        const overlaps = overlapX > 0 && overlapY > 0;
        expect(overlaps, `badge vs a card at ${String(width)}px — covering its top ${String(Math.round(overlapY))}px`).toBe(false);
      }
    });
  }
});
