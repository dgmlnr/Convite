import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, PlayerId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND, SENA_SIGNALS } from "@hexdev/truco-engine";
import { renderSenaPicker } from "./senas.js";
import { TABLE_STYLE_ID, ensureTableStyles } from "./table-styles.js";

const PLAYER = "player-a" as PlayerId;

/**
 * The picker's own node is created fresh by `table.ts` inside the action bar
 * on every broadcast; `surface` stands in for the node it hangs under —
 * `table.ts`'s `.hexdev-truco-shell-layout`, likewise rebuilt per render and
 * dropped when the widget tears a match down. They are separate here because
 * the picker's dismissal listeners live on the SECOND one, and the whole
 * point of that choice is that it is not `document`.
 */
let surface = document.createElement("div");

afterEach(() => {
  surface.remove();
});

/** One broadcast: the previous render's subtree goes, a new one takes its
 * place. Modelled on `table.ts` exactly — it drops the old `layout` before it
 * builds the new one, so nothing from the previous render is still attached
 * while the next picker is being mounted. */
function freshContainer(): HTMLElement {
  surface.remove();
  surface = document.createElement("div");
  document.body.appendChild(surface);
  return surface.appendChild(document.createElement("div"));
}

describe("renderSenaPicker — discoverable without being noisy (2v2 only, absent entirely in 1v1)", () => {
  it("renders NOTHING at all when no send-sena action is legal AND the quota is untouched — the exact way 1v1 stays silent, no separate feature flag needed", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [{ type: "call-truco", playerId: PLAYER, level: "truco" }];

    renderSenaPicker(el, legal, () => {}, { remaining: MAX_SENAS_PER_HAND }, surface);

    expect(el.children).toHaveLength(0);
  });

  it("renders a single collapsed toggle button when señas are legal — the six signals are NOT shown until the player opens it (never noisy)", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [
      { type: "send-sena", playerId: PLAYER, signal: "asDeEspada" },
      { type: "send-sena", playerId: PLAYER, signal: "asDeBasto" },
      { type: "send-sena", playerId: PLAYER, signal: "sieteDeEspada" },
      { type: "send-sena", playerId: PLAYER, signal: "sieteDeOro" },
      { type: "send-sena", playerId: PLAYER, signal: "tres" },
      { type: "send-sena", playerId: PLAYER, signal: "dos" },
    ];

    renderSenaPicker(el, legal, () => {}, { remaining: MAX_SENAS_PER_HAND }, surface);

    expect(el.querySelectorAll('button[data-action="senas-toggle"]')).toHaveLength(1);
    expect(el.querySelectorAll('button[data-action="send-sena"]')).toHaveLength(0);
  });

  it("clicking the toggle reveals exactly one button per legal seña, labeled in authentic Spanish Truco vocabulary", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [
      { type: "send-sena", playerId: PLAYER, signal: "asDeEspada" },
      { type: "send-sena", playerId: PLAYER, signal: "tres" },
    ];

    renderSenaPicker(el, legal, () => {}, { remaining: MAX_SENAS_PER_HAND }, surface);
    el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!.click();

    const buttons = [...el.querySelectorAll<HTMLButtonElement>('button[data-action="send-sena"]')];
    expect(buttons.map((b) => b.textContent)).toEqual(["As de espada", "Tres"]);
  });

  it("marks the toggle's own open state, so the picker reads as an open selector rather than a floating strip", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [{ type: "send-sena", playerId: PLAYER, signal: "asDeEspada" }];

    renderSenaPicker(el, legal, () => {}, { remaining: MAX_SENAS_PER_HAND }, surface);
    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;

    // Collapsed: the attribute must be PRESENT and false, never absent —
    // it is both the a11y contract (a control that owns a revealable
    // region always announces its state) and the styling hook the open
    // toggle's own active treatment selects on.
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking a seña button dispatches EXACTLY that legal action", () => {
    const el = freshContainer();
    const asDeEspada: Action = { type: "send-sena", playerId: PLAYER, signal: "asDeEspada" };
    const dispatch = vi.fn();

    renderSenaPicker(el, [asDeEspada], dispatch, { remaining: MAX_SENAS_PER_HAND }, surface);
    el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!.click();
    el.querySelector<HTMLButtonElement>('button[data-action="send-sena"]')!.click();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith(asDeEspada);
  });
});

/**
 * The per-hand cap's UI half (truco-engine's `MAX_SENAS_PER_HAND`).
 *
 * THE TRAP THIS SUITE EXISTS FOR: `getLegalSenaActions` goes empty at the cap,
 * and the picker's own long-standing rule is "no legal seña, render nothing".
 * Composed naively those two make the entire Señas button VANISH the moment a
 * player spends their third seña — mid-hand, with no explanation. That reads
 * as a broken UI, not as a rule. A rule the player cannot see is not a rule
 * they can play around, so the control has to STAY and say what happened.
 */
describe("renderSenaPicker — at the per-hand cap the control stays put and says so, never disappears", () => {
  const SIX_LEGAL: readonly Action[] = [
    { type: "send-sena", playerId: PLAYER, signal: "asDeEspada" },
    { type: "send-sena", playerId: PLAYER, signal: "asDeBasto" },
    { type: "send-sena", playerId: PLAYER, signal: "sieteDeEspada" },
    { type: "send-sena", playerId: PLAYER, signal: "sieteDeOro" },
    { type: "send-sena", playerId: PLAYER, signal: "tres" },
    { type: "send-sena", playerId: PLAYER, signal: "dos" },
  ];

  it("keeps the toggle on screen once the quota is spent — disabled, not absent (the vanishing-button bug)", () => {
    const el = freshContainer();

    // Exactly the state the engine produces at the cap: no legal send-sena
    // left, and zero remaining.
    renderSenaPicker(el, [], () => {}, { remaining: 0 }, surface);

    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]');
    expect(toggle, "the Señas control must survive the cap, not vanish mid-hand").not.toBeNull();
    expect(toggle!.disabled).toBe(true);
  });

  it("says the quota is spent, in the table's own register", () => {
    const el = freshContainer();

    renderSenaPicker(el, [], () => {}, { remaining: 0 }, surface);

    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;
    // The VISIBLE label alone: the visually-hidden reason span (WCAG 2.1.1,
    // its own suite below) also joins textContent but never the painted band.
    expect(toggle.firstChild?.textContent).toBe("Sin señas");
    // The reason, for anyone who cannot infer it from the label alone — it
    // costs the fixed-height action band nothing, unlike a second line of copy.
    expect(toggle.title).toBe(`Ya hiciste las ${MAX_SENAS_PER_HAND} señas de la mano`);
  });

  it("counts down on the button itself, so the cap is visible BEFORE it bites", () => {
    // THE NUMBER MOVED TWICE BEFORE IT LANDED HERE, and the trail is worth
    // leaving. Asking your partner spends this same allowance, so it briefly
    // got a button of its own: two controls each reading "(n)" looked like two
    // budgets, and moving the count to a chip between them looked like a
    // stray digit. Both were reported. The shape that works is ONE control —
    // this one — holding both spends behind its own toggle, which makes the
    // number unambiguously the toggle's own again.
    for (const remaining of [MAX_SENAS_PER_HAND, 2, 1]) {
      const el = freshContainer();

      renderSenaPicker(el, SIX_LEGAL, () => {}, { remaining }, surface);

      const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;
      expect(toggle.textContent).toBe(`Seña/Consulta (${remaining})`);
      expect(toggle.disabled).toBe(false);
      el.remove();
    }
  });

  it("still opens normally while quota remains — the cap changes the count, never the affordance", () => {
    const el = freshContainer();

    renderSenaPicker(el, SIX_LEGAL, () => {}, { remaining: 1 }, surface);
    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;
    toggle.click();

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // All six on the LAST seña of the quota too: the cap limits HOW MANY,
    // never WHICH (truco-engine's own bluffing rule).
    expect(el.querySelectorAll('button[data-action="send-sena"]')).toHaveLength(6);
  });

  it("cannot be opened at the cap — there is nothing behind it, so it claims no expandable region either", () => {
    const el = freshContainer();

    renderSenaPicker(el, [], () => {}, { remaining: 0 }, surface);
    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;
    toggle.click();

    expect(el.querySelectorAll('button[data-action="send-sena"]')).toHaveLength(0);
    expect(toggle.hasAttribute("aria-expanded")).toBe(false);
  });

  it("keeps the container's own class in every state, so the fixed action band never collapses", () => {
    for (const [legal, remaining] of [[SIX_LEGAL, MAX_SENAS_PER_HAND], [[], 0], [[], MAX_SENAS_PER_HAND]] as const) {
      const el = freshContainer();

      renderSenaPicker(el, legal, () => {}, { remaining }, surface);

      expect(el.className).toBe("hexdev-truco-senas");
      el.remove();
    }
  });
});

describe("renderSenaPicker — the toggle names the region it owns (WCAG 4.1.2: aria-expanded without aria-controls is a state with no referent)", () => {
  it("links the toggle to its popover row via aria-controls, collapsed and open alike", () => {
    const el = freshContainer();
    const legal: readonly Action[] = [{ type: "send-sena", playerId: PLAYER, signal: "asDeEspada" }];

    renderSenaPicker(el, legal, () => {}, { remaining: MAX_SENAS_PER_HAND }, surface);

    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;
    const row = el.querySelector<HTMLElement>(".hexdev-truco-senas-row")!;
    const controls = toggle.getAttribute("aria-controls");
    expect(controls).not.toBeNull();
    expect(row.id).toBe(controls);

    toggle.click();
    expect(toggle.getAttribute("aria-controls")).toBe(row.id);
  });
});

describe("renderSenaPicker — the spent reason is real text, not only a title tooltip (WCAG 2.1.1: title is unreachable by keyboard and unreliable for screen readers)", () => {
  it("carries the spent reason as visually-hidden text inside the disabled toggle itself", () => {
    const el = freshContainer();

    renderSenaPicker(el, [], () => {}, { remaining: 0 }, surface);

    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;
    const reason = toggle.querySelector<HTMLElement>(".hexdev-truco-visually-hidden");
    expect(reason).not.toBeNull();
    expect(reason!.textContent).toBe(`. Ya hiciste las ${MAX_SENAS_PER_HAND} señas de la mano`);
    // The FLATTENED accessible name, exactly as an AT assembles it: label and
    // reason must read as two sentences, never run together into
    // "Sin señasYa hiciste..." — the separator lives inside the hidden span
    // so the painted label stays untouched.
    expect(toggle.textContent).toBe(`Sin señas. Ya hiciste las ${MAX_SENAS_PER_HAND} señas de la mano`);
  });
});

interface TrackedListener {
  readonly target: EventTarget;
  readonly type: string;
  readonly listener: EventListenerOrEventListenerObject | null;
}

/**
 * Makes listener registration OBSERVABLE, which is the only way this file can
 * PROVE the absence of a leak instead of describing one. Every
 * `addEventListener` in the process goes through these two prototype methods,
 * so wrapping them and keeping the live set — added minus removed — lets a
 * test ask the one question that matters after the widget has torn everything
 * down: is anything still listening on a target that is still attached?
 *
 * `restore` is not optional housekeeping: these are global prototypes, and a
 * test that leaves them wrapped poisons every test after it.
 */
function trackListeners(): {
  liveOn: (target: EventTarget) => number;
  liveOnAttachedTargets: () => readonly TrackedListener[];
  restore: () => void;
} {
  const live: TrackedListener[] = [];
  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;

  EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    live.push({ target: this, type, listener });
    originalAdd.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    const index = live.findIndex((entry) => entry.target === this && entry.type === type && entry.listener === listener);
    if (index !== -1) live.splice(index, 1);
    originalRemove.call(this, type, listener, options);
  };

  return {
    liveOn: (target) => live.filter((entry) => entry.target === target).length,
    // A DOM node reports attached only while it hangs off the document; a
    // `Document` or a `Window` reports attached forever. That is exactly the
    // distinction this suite needs — a listener on a DETACHED node dies with
    // the unreachable tree that holds it, a listener on anything still
    // attached does not.
    liveOnAttachedTargets: () => live.filter((entry) => !(entry.target instanceof Node) || entry.target.isConnected),
    restore: () => {
      EventTarget.prototype.addEventListener = originalAdd;
      EventTarget.prototype.removeEventListener = originalRemove;
    },
  };
}

/**
 * DISMISSAL. The picker is a popover, and a popover whose only exit is the
 * control that opened it is a trap: a player who opens it by accident
 * mid-hand, or who thinks better of signalling, has to hunt down that exact
 * button again on a felt where the cards are what they are looking at.
 *
 * THE MECHANISM IS THE HARD PART, not the gesture. This renderer has no
 * unmount hook — `table.ts` rebuilds the whole table on every broadcast, and
 * `main.ts` tears the container down when a match is left with no render
 * following — so a `document`-level listener registered here would leak one
 * closure over a detached tree per broadcast, with nothing left alive to
 * remove it.
 *
 * So the picker never touches `document` at all. Its dismissal listeners go
 * on the per-render subtree the picker itself lives in (`table.ts` hands it
 * `.hexdev-truco-shell-layout`), which means they are discarded by precisely
 * the two events that discard the picker: the next render, and teardown. The
 * last two tests here prove that by COUNTING registrations rather than
 * asserting the property in prose.
 */
describe("renderSenaPicker — dismissal, and a listener that cannot outlive its own render", () => {
  const SIX_LEGAL: readonly Action[] = [
    { type: "send-sena", playerId: PLAYER, signal: "asDeEspada" },
    { type: "send-sena", playerId: PLAYER, signal: "asDeBasto" },
    { type: "send-sena", playerId: PLAYER, signal: "sieteDeEspada" },
    { type: "send-sena", playerId: PLAYER, signal: "sieteDeOro" },
    { type: "send-sena", playerId: PLAYER, signal: "tres" },
    { type: "send-sena", playerId: PLAYER, signal: "dos" },
  ];

  /** Mounts an open picker plus one sibling standing in for everything else
   * on the surface a player might click instead — a card, a call button, bare
   * felt. Returns the pieces every test below reaches for. */
  function openPicker(dispatch: (action: Action) => void = (): void => {}): {
    el: HTMLElement;
    toggle: HTMLButtonElement;
    row: HTMLElement;
    elsewhere: HTMLElement;
  } {
    const el = freshContainer();
    const elsewhere = surface.appendChild(document.createElement("div"));
    renderSenaPicker(el, SIX_LEGAL, dispatch, { remaining: MAX_SENAS_PER_HAND }, surface);
    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;
    toggle.click();
    return { el, toggle, row: el.querySelector<HTMLElement>(".hexdev-truco-senas-row")!, elsewhere };
  }

  const isOpen = (toggle: HTMLButtonElement, el: HTMLElement): boolean =>
    toggle.getAttribute("aria-expanded") === "true" && el.querySelectorAll('button[data-action="send-sena"]').length === 6;

  it("closes when a click lands outside it, so thinking better of a seña costs one tap anywhere", () => {
    const { el, toggle, elsewhere } = openPicker();
    expect(isOpen(toggle, el)).toBe(true);

    elsewhere.click();

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(el.querySelectorAll('button[data-action="send-sena"]')).toHaveLength(0);
  });

  it("closes on Escape — the same intent as clicking away, and the only dismissal a keyboard player has at all", () => {
    const { el, toggle } = openPicker();

    toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(el.querySelectorAll('button[data-action="send-sena"]')).toHaveLength(0);
  });

  it("ignores every other key, so typing in the widget never eats the picker", () => {
    const { el, toggle } = openPicker();

    for (const key of ["Enter", " ", "a", "Tab", "ArrowDown"]) {
      toggle.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }

    expect(isOpen(toggle, el)).toBe(true);
  });

  it("hands focus back to the toggle when Escape closes it from inside, so a keyboard player is never dropped on the body", () => {
    const { el, toggle, row } = openPicker();
    const sena = row.querySelector<HTMLButtonElement>('button[data-action="send-sena"]')!;
    sena.focus();

    sena.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    // The node that had focus is one of the six the close just destroyed; had
    // nothing caught it, focus would have fallen to <body> and the player's
    // place in the bar would be gone.
    expect(el.ownerDocument.activeElement).toBe(toggle);
  });

  it("does not read the very click that OPENS it as an outside click", () => {
    // The ordering trap: the toggle's own handler runs first and registers the
    // dismissal listener, and that listener is then reached by the SAME click
    // still bubbling upward. Opening must survive its own opening click.
    const { el, toggle } = openPicker();

    expect(isOpen(toggle, el)).toBe(true);
  });

  it("closes exactly once when the toggle itself is clicked — never close-then-reopen", () => {
    const { el, toggle } = openPicker();

    toggle.click();

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(el.querySelectorAll('button[data-action="send-sena"]')).toHaveLength(0);

    // And it still reopens on the next click, at full strength: a dismissal
    // that quietly disarms the toggle would be worse than no dismissal.
    toggle.click();
    expect(isOpen(toggle, el)).toBe(true);
  });

  it("still sends a seña when one is clicked — an inside click is never swallowed as an outside one", () => {
    const dispatch = vi.fn();
    const { row } = openPicker(dispatch);

    row.querySelector<HTMLButtonElement>('button[data-signal="sieteDeOro"]')!.click();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "send-sena", playerId: PLAYER, signal: "sieteDeOro" });
  });

  it("decides inside/outside by DOM containment, never by geometry — the row is absolutely positioned and escapes its box", () => {
    const { el, toggle, row, elsewhere } = openPicker();
    // A sheet laid over the whole surface, the open picker included: anything
    // asking "did the click land within the picker's rectangle?" would read a
    // click here as inside, because it geometrically IS.
    elsewhere.style.cssText = "position:absolute;inset:0";

    // The row itself is the mirror case — `position: absolute`, deliberately
    // out of the action bar's own scroll box, so its rectangle is nowhere near
    // the container's. It is inside by the tree, and that is what counts.
    row.click();
    expect(isOpen(toggle, el), "a click on the picker's own row is inside it, wherever it is painted").toBe(true);

    elsewhere.click();
    expect(toggle.getAttribute("aria-expanded"), "overlapping the picker does not make a node part of it").toBe("false");
  });

  it("holds its dismissal listeners ONLY while it is open", () => {
    const tracker = trackListeners();
    try {
      const el = freshContainer();
      renderSenaPicker(el, SIX_LEGAL, () => {}, { remaining: MAX_SENAS_PER_HAND }, surface);
      const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;

      expect(tracker.liveOn(surface), "a closed picker listens to nothing").toBe(0);

      toggle.click();
      expect(tracker.liveOn(surface), "an open picker listens for the click away and for Escape").toBe(2);

      toggle.click();
      expect(tracker.liveOn(surface), "closing gives the listeners back").toBe(0);
    } finally {
      tracker.restore();
    }
  });

  it("leaves no live listener behind after any number of renders, nor after the container is torn down", () => {
    const tracker = trackListeners();
    try {
      // Every broadcast rebuilds the table, and the worst case is the one
      // where the player has the picker OPEN each time the next one lands.
      for (let broadcast = 0; broadcast < 8; broadcast += 1) {
        const el = freshContainer();
        renderSenaPicker(el, SIX_LEGAL, () => {}, { remaining: MAX_SENAS_PER_HAND }, surface);
        el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!.click();
        expect(tracker.liveOn(surface), "the mechanism really did arm itself, so the count below means something").toBe(2);
      }

      // The teardown this renderer gets no hook for: `main.ts` empties the
      // widget root when a match is left, and NO render follows it.
      document.body.replaceChildren();

      expect(
        tracker.liveOnAttachedTargets().map((entry) => `${entry.target.constructor.name}#${entry.type}`),
        "nothing may still be listening on a target that outlived the torn-down table",
      ).toEqual([]);
      expect(tracker.liveOn(document), "the picker must never register on `document`").toBe(0);
      expect(tracker.liveOn(window), "nor on `window`").toBe(0);
    } finally {
      tracker.restore();
    }
  });
});

/**
 * WCAG 2.5.5 target size (AAA, B15). The six señas were 32px tall against the
 * 44px every other control on this table already offers — the smallest tap
 * targets in the product, on the one surface a player uses under time pressure.
 *
 * Cheap here and nowhere else: this popover is OUT OF FLOW (absolutely
 * positioned against the felt, FU-1), so growing it costs the fixed action
 * band nothing and shifts no in-flow box. The band-height contract and the
 * "all six painted inside every ancestor clip" fence in
 * table-zone-overlap.browser.test.ts are what prove that claim across all four
 * tiers; this test owns only the number.
 */
describe("señas signal buttons meet the 44px target size (WCAG 2.5.5)", () => {
  const SIX_LEGAL: readonly Action[] = SENA_SIGNALS.map((signal) => ({ type: "send-sena", playerId: PLAYER, signal }));

  it("gives every signal the same 44px floor the rest of the table's controls have", () => {
    ensureTableStyles(document);
    const el = freshContainer();
    renderSenaPicker(el, SIX_LEGAL, () => {}, { remaining: MAX_SENAS_PER_HAND }, surface);
    el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!.click();

    const signals = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-sena")];
    expect(signals).toHaveLength(6);
    for (const signal of signals) {
      expect(signal.getBoundingClientRect().height, `seña "${signal.textContent}"`).toBeGreaterThanOrEqual(44);
    }
    document.getElementById(TABLE_STYLE_ID)?.remove();
  });
});
