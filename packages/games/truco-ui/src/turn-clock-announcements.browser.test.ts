/**
 * The turn clock's SCREEN-READER half — the coarse announcements the visible
 * pill deliberately never makes.
 *
 * `turn-clock.browser.test.ts` fences the trap: a number that changes once a
 * second must never reach a live region, so the pill is `aria-hidden` and
 * lives outside every announcer's subtree. What that left a screen-reader
 * user with was NOTHING — no sign a clock exists, no warning that time is
 * about to run out. This file fences the replacement: a fourth polite region
 * (`data-announces="turn-clock"`) that speaks at most TWICE per timed turn of
 * the LOCAL player — the total when their turn starts, one warning when the
 * coarse threshold is crossed — and never once for anybody else's turn. Two
 * sentences a minute is information; sixty is noise, and the exact-count
 * assertions below are what keep the second from ever creeping back in.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

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

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  container.style.width = "700px";
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
 * the visible clock's own tests already use: `now` makes every threshold
 * deterministic, the tick interval makes the test not wait real seconds. */
function clockedRenderer(now: () => number) {
  return createMatchTableRenderer({ now, turnClockTickMs: 5 });
}

const regionOf = (el: HTMLElement): HTMLElement | null => el.querySelector<HTMLElement>('[data-announces="turn-clock"]');
const clockOf = (el: HTMLElement): HTMLElement | null => el.querySelector<HTMLElement>(".hexdev-truco-turn-clock");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("turn-clock announcements — the total, said once, when MY timed turn starts", () => {
  it("announces the total when my turn starts on the clock — the sentence the aria-hidden pill never speaks", () => {
    const el = freshContainer();
    const render = clockedRenderer(() => T0);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);

    expect(regionOf(el)!.textContent).toBe("Tenés 60 segundos para jugar");
  });

  it("does not re-announce on a re-broadcast of the same turn — the region's text node survives untouched", () => {
    const el = freshContainer();
    const render = clockedRenderer(() => T0);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);
    const region = regionOf(el)!;
    const textNode = region.firstChild;

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);

    expect(region.textContent).toBe("Tenés 60 segundos para jugar");
    expect(region.firstChild, "an unchanged announcement must not have its text node replaced").toBe(textNode);
  });

  it("announces no time at all on an untimed table — there is no clock to describe", () => {
    const el = freshContainer();
    const render = clockedRenderer(() => T0);

    render(el, baseView(), [], () => {});

    expect(regionOf(el)!.textContent).toBe("");
  });
});

describe("turn-clock announcements — one coarse warning at the threshold, never a per-second feed", () => {
  it("crossing the threshold announces once — and only once, tick after tick, all the way down", async () => {
    const el = freshContainer();
    let now = T0;
    const render = clockedRenderer(() => now);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);
    const region = regionOf(el)!;

    // Every write to the region from here on is a mutation record. The exact
    // count at the end is the whole point of this feature: one threshold, one
    // record — a second record per tick is the per-second spam being fenced.
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(region, { childList: true, characterData: true, subtree: true });

    // Well above the threshold the region must not move at all, however many
    // times the visible pill redraws underneath it.
    for (const at of [15_000, 30_000, 49_000]) {
      now = T0 + at;
      await sleep(20);
      expect(region.textContent).toBe("Tenés 60 segundos para jugar");
    }
    // The visible number really is moving — otherwise the stability above
    // would pass on a clock that never ticked at all.
    expect(clockOf(el)!.textContent).not.toBe("1:00");

    now = T0 + 50_500; // 9.5s remaining — the 10-second threshold is crossed
    await sleep(20);
    expect(region.textContent).toBe("Quedan 10 segundos");

    // And then silence, tick after tick, down to the wire: same sentence,
    // same text node — an untouched region, not one rewritten identically.
    const spoken = region.firstChild;
    for (const at of [52_000, 55_000, 57_000, 59_000]) {
      now = T0 + at;
      await sleep(20);
      expect(region.textContent).toBe("Quedan 10 segundos");
      expect(region.firstChild, "an untouched region must keep its very text node").toBe(spoken);
    }

    records.push(...observer.takeRecords());
    observer.disconnect();
    expect(records, "one threshold, one mutation — anything more is per-second spam").toHaveLength(1);
  });

  it("skips the warning when the turn already starts under the threshold — the low total said once is the warning", async () => {
    const el = freshContainer();
    let now = T0;
    const render = clockedRenderer(() => now);

    render(el, baseView(), [], () => {}, undefined, T0 + 8_000);
    const region = regionOf(el)!;
    expect(region.textContent).toBe("Tenés 8 segundos para jugar");

    const records: MutationRecord[] = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(region, { childList: true, characterData: true, subtree: true });

    for (const at of [3_000, 5_000, 6_800]) {
      now = T0 + at;
      await sleep(20);
      expect(region.textContent).toBe("Tenés 8 segundos para jugar");
    }

    records.push(...observer.takeRecords());
    observer.disconnect();
    expect(records, "a 'Quedan 10 segundos' after 'Tenés 8 segundos' would be a warning about MORE time than the turn has").toHaveLength(0);
  });
});

describe("turn-clock announcements — only the LOCAL player's clock is their business", () => {
  it("announces nothing for another seat's timed turn, even as their clock crosses every threshold", async () => {
    const el = freshContainer();
    let now = T0;
    const render = clockedRenderer(() => now);

    render(el, baseView({ hand: { ...baseView().hand!, turnSeat: 1 } }), [], () => {}, undefined, T0 + 60_000);
    const region = regionOf(el)!;
    expect(region.textContent).toBe("");

    for (const at of [30_000, 50_500, 59_000]) {
      now = T0 + at;
      await sleep(20);
      expect(region.textContent, "a rival's countdown announced every turn is spam, not access").toBe("");
    }
  });

  it("falls silent when the turn passes to another seat — clearing is a removal, which a polite region does not speak", () => {
    const el = freshContainer();
    const render = clockedRenderer(() => T0);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);
    expect(regionOf(el)!.textContent).toBe("Tenés 60 segundos para jugar");

    render(el, baseView({ hand: { ...baseView().hand!, turnSeat: 1 } }), [], () => {}, undefined, T0 + 60_000);
    expect(regionOf(el)!.textContent).toBe("");
  });
});

describe("turn-clock announcements — the region itself", () => {
  it("is polite and atomic — a time warning waits its turn, it never talks over a truco call", () => {
    const el = freshContainer();
    const render = clockedRenderer(() => T0);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);
    const region = regionOf(el)!;

    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
  });

  it("is visually hidden but never display:none — which would drop it from the accessibility tree and silence it", () => {
    const el = freshContainer();
    const render = clockedRenderer(() => T0);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);
    const region = regionOf(el)!;
    const style = getComputedStyle(region);

    expect(style.display).not.toBe("none");
    expect(style.visibility).not.toBe("hidden");
    // The house treatment (.hexdev-truco-announcer): out of flow and clipped,
    // so it can never move a height fence nor show up in a screenshot.
    expect(style.position).toBe("absolute");
    expect(style.clipPath).toBe("inset(50%)");
    expect(region.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  });

  it("survives a re-render as the SAME node — a live region rebuilt per render can never announce", () => {
    const el = freshContainer();
    const render = clockedRenderer(() => T0);

    render(el, baseView(), [], () => {}, undefined, T0 + 60_000);
    const first = regionOf(el);
    expect(first, "the region must exist from the very first render").not.toBeNull();

    render(el, baseView({ hand: { ...baseView().hand!, turnSeat: 1 } }), [], () => {}, undefined, T0 + 45_000);

    expect(regionOf(el), "the region node's identity must be preserved across renders").toBe(first);
    expect(first!.isConnected, "the region must stay attached, never detached and re-added").toBe(true);
  });
});
