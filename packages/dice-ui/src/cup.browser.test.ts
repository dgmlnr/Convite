import { afterEach, describe, expect, it } from "vitest";
import { getCupArtUrl } from "./art.js";
import { CUP_SHAKE_CYCLE_MS, CUP_TIP_DURATION_MS, ensureDiceStyles } from "./dice-styles.js";
import { CUP_GESTURE_ATTRIBUTE, createCupElement, setCupGesture } from "./cup.js";

const mounted: HTMLElement[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

function mountCup(): HTMLElement {
  ensureDiceStyles(document);
  const cup = createCupElement(document);
  document.body.appendChild(cup);
  mounted.push(cup);
  return cup;
}

/** One rendering opportunity — a CSS animation created in the same
 * synchronous task that reads it back is not guaranteed to exist yet. The
 * filmstrip scene's own `nextFrame` says the same thing at more length. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** Waits until the element's first animation has actually advanced, and
 * returns how far. Bounded, so a gesture that never starts fails as a zero
 * rather than as a hung test. */
async function progressed(element: HTMLElement): Promise<number> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const now = Number(element.getAnimations()[0]?.currentTime ?? 0);
    if (now > 0) return now;
    await nextFrame();
  }
  return 0;
}

describe("cup: a cubilete arrives already knowing what it is doing", () => {
  /**
   * `die.ts`'s write-order contract, applied to the one element beside it.
   * A cup that mounted with no gesture and got one on the next tick would
   * flash for a frame; a cup that mounted MID-gesture would play half of one
   * nobody asked for. Both are answered by the same rule: the answer is on
   * the element before the function returns.
   */
  it("carries a still gesture the instant it is built, before anything appends it", () => {
    const cup = createCupElement(document);
    expect(cup.getAttribute(CUP_GESTURE_ATTRIBUTE)).toBe("still");
    expect(cup.parentElement, "not appended yet — so this is genuinely the synchronous state").toBeNull();
  });

  it("paints the cup's own artwork and nothing else", () => {
    const cup = createCupElement(document);
    const img = cup.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe(getCupArtUrl().href);
  });

  /**
   * Decorative, and deliberately so: a board's live region already says the
   * dice are in the cup in words. See `createCupElement`'s own comment for
   * why a second vocabulary for the same fact is worse than none.
   */
  it("stays out of the accessibility tree — both the element and its image", () => {
    const cup = createCupElement(document);
    expect(cup.getAttribute("aria-hidden")).toBe("true");
    expect(cup.querySelector("img")!.getAttribute("alt")).toBe("");
  });

  it("is not a control: no button, no tabindex, no role a screen reader could land on", () => {
    const cup = createCupElement(document);
    expect(cup.tagName.toLowerCase()).toBe("div");
    expect(cup.hasAttribute("tabindex")).toBe(false);
    expect(cup.hasAttribute("role")).toBe(false);
  });
});

describe("cup: the gesture is a state, and the browser really animates it", () => {
  it.each([
    ["shaking", CUP_SHAKE_CYCLE_MS, "infinite"],
    ["tipping", CUP_TIP_DURATION_MS, "1"],
  ] as const)("%s runs the right keyframe, for the right duration, the right number of times", async (gesture, durationMs, iterations) => {
    const cup = mountCup();
    setCupGesture(cup, gesture);
    await nextFrame();

    const computed = window.getComputedStyle(cup);
    expect(computed.animationName).toBe(`hexdev-dice-cup-${gesture === "shaking" ? "shake" : "tip"}`);
    expect(computed.animationDuration).toBe(`${String(durationMs / 1000)}s`);
    expect(computed.animationIterationCount).toBe(iterations);
  });

  /**
   * THE NEGATIVE HALF, and it is the one that matters: `still` must be the
   * ABSENCE of an animation rather than a third keyframe that happens to hold
   * position. A rule for `still` would keep an animation attached forever on
   * a board that spends most of its time in exactly that state.
   */
  it("attaches no animation at all while the cup is still", async () => {
    const cup = mountCup();
    await nextFrame();
    expect(window.getComputedStyle(cup).animationName).toBe("none");
  });

  /**
   * THE OUTCOME, of the composed system — the function AND the browser
   * together. Deliberately NOT labelled as a test of `setCupGesture`'s own
   * early return, because it is not one: this stays green with that guard
   * deleted, MEASURED by deleting it. A CSS animation restarts only when its
   * computed `animation-name` list changes, so a redundant same-value write
   * would not have disturbed anything either. Naming the guard here would be
   * a fence measuring the wrong mechanism; the one below measures the guard.
   */
  it("leaves a running gesture exactly where it was when the same state is declared again", async () => {
    const cup = mountCup();
    setCupGesture(cup, "shaking");
    // POLLED, NOT COUNTED IN FRAMES. Two `requestAnimationFrame`s looked like
    // enough and are not: an animation's start time is pinned to a frame's
    // own timeline instant, so `currentTime` can legitimately still read 0
    // after the second one. It went red once, on an unrelated change, for
    // exactly that — a fence that fails on a busy machine is not a fence.
    const before = await progressed(cup);
    expect(before, "expected the shake to have made progress").toBeGreaterThan(0);

    setCupGesture(cup, "shaking");
    const after = cup.getAnimations()[0]?.currentTime ?? 0;
    expect(Number(after)).toBeGreaterThanOrEqual(Number(before));
  });

  /**
   * THE GUARD ITSELF, and it needed a different instrument to see at all.
   *
   * `setCupGesture` promises that calling it with an unchanged state writes
   * NOTHING — a promise about this function, made precisely so a caller does
   * not have to know the browser rule the test above depends on. A
   * `MutationObserver` on the attribute list is the one thing that can tell
   * the two apart: it reports every `setAttribute` call, including one whose
   * value is identical to what was already there, which is exactly the write
   * the guard exists to skip.
   *
   * A board renders its tray on every broadcast and again on every die a
   * player presses, so this is the difference between a handful of attribute
   * writes a turn and dozens.
   */
  it("writes nothing at all when the declared state has not changed", async () => {
    const cup = mountCup();
    setCupGesture(cup, "shaking");
    await nextFrame();

    let writes = 0;
    const observer = new MutationObserver((records) => {
      writes += records.length;
    });
    observer.observe(cup, { attributes: true, attributeFilter: [CUP_GESTURE_ATTRIBUTE] });

    setCupGesture(cup, "shaking");
    setCupGesture(cup, "shaking");
    setCupGesture(cup, "shaking");
    await nextFrame();
    expect(writes, "three redundant declarations must reach the DOM zero times").toBe(0);

    // The anti-vacuity half: the observer really is watching, so the zero
    // above is a measurement rather than a broken subscription.
    setCupGesture(cup, "tipping");
    await nextFrame();
    observer.disconnect();
    expect(writes).toBe(1);
  });

  it("swaps one gesture for the other, never runs both", async () => {
    const cup = mountCup();
    setCupGesture(cup, "shaking");
    await nextFrame();
    setCupGesture(cup, "tipping");
    await nextFrame();
    expect(cup.getAnimations().length).toBe(1);
    expect(window.getComputedStyle(cup).animationName).toBe("hexdev-dice-cup-tip");
  });

  /**
   * THE WHOLE REASON THE TIP CAN BE PLAYED AGAINST STATE THAT ARRIVES FROM A
   * SERVER: it leaves nothing behind. There is no fill mode, so when the
   * gesture finishes the element's own resting rule is simply what applies —
   * the identical argument `hexdev-dice-toss`'s `backwards` fill makes for a
   * die that must not be repainted after it lands.
   */
  it("returns the cup to its resting pose once the tip is over, with no fill mode holding it anywhere else", async () => {
    const cup = mountCup();
    await nextFrame();
    const atRest = window.getComputedStyle(cup).transform;

    setCupGesture(cup, "tipping");
    await nextFrame();
    const [animation] = cup.getAnimations();
    expect(animation, "expected a running tip").toBeDefined();
    animation!.finish();
    await nextFrame();

    expect(window.getComputedStyle(cup).transform).toBe(atRest);
  });
});
