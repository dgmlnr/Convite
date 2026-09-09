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
   * A one-shot gesture is one-shot BECAUSE the attribute changed. This is the
   * mechanism `setCupGesture`'s own comment describes: a repeat write leaves
   * the running animation exactly where it was, which is what makes the
   * function safe to call from a render that fires on every keystroke of a
   * player picking dice.
   */
  it("does not restart a running gesture when the same state is declared again", async () => {
    const cup = mountCup();
    setCupGesture(cup, "shaking");
    await nextFrame();
    await nextFrame();
    const before = cup.getAnimations()[0]?.currentTime ?? 0;
    expect(Number(before), "expected the shake to have made progress").toBeGreaterThan(0);

    setCupGesture(cup, "shaking");
    const after = cup.getAnimations()[0]?.currentTime ?? 0;
    expect(Number(after)).toBeGreaterThanOrEqual(Number(before));
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
