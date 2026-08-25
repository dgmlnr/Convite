import { afterEach, describe, expect, it, vi } from "vitest";
import { createHeadToHeadMatch, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { DealInput, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * There is a way out of a match that is still being played.
 *
 * Until this, there was not. `onLeaveMatch` reached this renderer only as
 * `MatchEndInfo.onPlayAgain` — wired exclusively to the end-of-match overlay
 * — so a player who wanted to stop mid-match had no control at all, and in
 * fullscreen the widget covers the whole screen, so there was not even a
 * page to scroll back to. Reloading was the only exit.
 *
 * TWO STEPS, on purpose. This is not undoable: leaving hands the seat to a
 * bot (MatchRoom.handleQuit) and the match goes on without you. A single
 * tap on a control that sits over a live felt, next to buttons a player is
 * hitting quickly on a turn clock, is one misclick away from ending their
 * match. The first tap asks; the second acts; anything else cancels.
 *
 * OPTIONAL, and absent by default. A caller that passes no `onLeaveMatch`
 * gets no control — the fallback "connection is live" path and every test
 * in this package that renders a bare table must not sprout a button that
 * dispatches into nothing.
 */

const SELF = "leave-self" as PlayerId;
const OPPONENT = "leave-opponent" as PlayerId;
const TEAMMATE = "leave-teammate" as PlayerId;
const OPPONENT_2 = "leave-opponent-2" as PlayerId;

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

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

function mounted(width = 960): HTMLElement {
  container = document.createElement("div");
  container.style.width = `${String(width)}px`;
  document.body.appendChild(container);
  return container;
}

async function waitForArt(el: HTMLElement): Promise<void> {
  await Promise.all([...el.querySelectorAll("img")].map((img) => img.decode()));
}

type Render = ReturnType<typeof createMatchTableRenderer>;

/**
 * ONE renderer, reused across renders — the shape production actually has:
 * `game-ui-registry.ts` builds a renderer per MATCH and calls it on every
 * view. Building a fresh one per render would hand each call its own
 * closure, which would quietly make the re-render test below pass against a
 * renderer that had forgotten nothing because it had never remembered.
 */
async function renderTable(el: HTMLElement, onLeaveMatch: (() => void) | undefined, seats: "1v1" | "2v2" = "1v1", render: Render = createMatchTableRenderer()): Promise<Render> {
  const state =
    seats === "1v1"
      ? startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }), DEAL_1V1)
      : startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);
  render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {}, undefined, null, onLeaveMatch);
  await waitForArt(el);
  return render;
}

const leaveButton = (el: HTMLElement): HTMLButtonElement | null => el.querySelector<HTMLButtonElement>('button[data-action="leave-match"]');
const confirmButton = (el: HTMLElement): HTMLButtonElement | null => el.querySelector<HTMLButtonElement>('button[data-action="leave-match-confirm"]');
const cancelButton = (el: HTMLElement): HTMLButtonElement | null => el.querySelector<HTMLButtonElement>('button[data-action="leave-match-cancel"]');

describe("the leave control exists only when there is somewhere to go", () => {
  it("renders no control at all when the caller passes no onLeaveMatch", async () => {
    const el = mounted();
    await renderTable(el, undefined);
    expect(el.querySelector('[data-action^="leave-match"]')).toBeNull();
  });

  it.each(["1v1", "2v2"] as const)("%s: renders the control while the match is still being played", async (seats) => {
    const el = mounted();
    await renderTable(el, () => {}, seats);
    expect(leaveButton(el), "a player mid-match can always find the way out").not.toBeNull();
  });
});

describe("leaving takes two deliberate steps — it hands your seat to a bot and cannot be undone", () => {
  it("the first tap does NOT leave: it asks", async () => {
    const onLeaveMatch = vi.fn();
    const el = mounted();
    await renderTable(el, onLeaveMatch);

    leaveButton(el)!.click();

    expect(onLeaveMatch, "one tap must never end a match").not.toHaveBeenCalled();
    expect(confirmButton(el), "the confirmation is offered right where the player already is").not.toBeNull();
    expect(cancelButton(el)).not.toBeNull();
  });

  it("confirming leaves exactly once", async () => {
    const onLeaveMatch = vi.fn();
    const el = mounted();
    await renderTable(el, onLeaveMatch);

    leaveButton(el)!.click();
    confirmButton(el)!.click();

    expect(onLeaveMatch).toHaveBeenCalledOnce();
  });

  it("cancelling leaves nothing behind — no callback, and the control is back to its resting state", async () => {
    const onLeaveMatch = vi.fn();
    const el = mounted();
    await renderTable(el, onLeaveMatch);

    leaveButton(el)!.click();
    cancelButton(el)!.click();

    expect(onLeaveMatch).not.toHaveBeenCalled();
    expect(confirmButton(el)).toBeNull();
    expect(leaveButton(el), "asking and backing out returns you to where you started").not.toBeNull();
  });

  it("a re-render mid-question does not silently drop the question", async () => {
    // Every server view triggers a full re-render (table.ts replaces its
    // children), and views arrive continuously while a match is live — a
    // confirmation that vanished on the next opponent move would be
    // unusable in practice, which is the only condition it is ever used in.
    const onLeaveMatch = vi.fn();
    const el = mounted();
    const render = await renderTable(el, onLeaveMatch);

    leaveButton(el)!.click();
    await renderTable(el, onLeaveMatch, "1v1", render); // the SAME renderer, as production does

    expect(confirmButton(el), "the question survives the next view from the server").not.toBeNull();
    confirmButton(el)!.click();
    expect(onLeaveMatch).toHaveBeenCalledOnce();
  });
});

describe("the resting control is an exit, and reads as one without being read", () => {
  it("carries a door glyph AND a real accessible name — an icon alone names nothing", async () => {
    const el = mounted();
    await renderTable(el, () => {});

    const button = leaveButton(el)!;
    expect(button.querySelector("svg"), "the glyph is what makes it findable at a glance").not.toBeNull();
    // The icon is decorative: whatever names this control for a screen
    // reader has to be real text, not a shape.
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect((button.textContent ?? "").trim().length, "an accessible name, not just a picture").toBeGreaterThan(0);
  });

  it.each([375, 570, 960, 1280] as const)("%ipx: stays inside the shell's own box", async (width) => {
    // It floats absolutely over the shell, so nothing in normal flow pushes
    // back if it grows.
    const el = mounted(width);
    await renderTable(el, () => {});
    const shell = el.getBoundingClientRect();
    const resting = el.querySelector(".hexdev-truco-leave")!.getBoundingClientRect();

    expect(resting.right, `resting control at ${String(width)}px`).toBeLessThanOrEqual(shell.right + 1);
    expect(resting.top).toBeGreaterThanOrEqual(shell.top - 1);
    expect(resting.left).toBeGreaterThanOrEqual(shell.left - 1);
  });
});

describe("asking is a real modal — the decision gets the screen, not a corner", () => {
  const dialog = (el: HTMLElement): HTMLElement | null => el.querySelector<HTMLElement>(".hexdev-truco-leave-dialog");

  it("announces itself as a modal dialog with a name a reader can speak", async () => {
    const el = mounted();
    await renderTable(el, () => {});
    leaveButton(el)!.click();

    const box = dialog(el);
    expect(box, "a modal, not a floating cluster of buttons").not.toBeNull();
    expect(box!.getAttribute("role")).toBe("dialog");
    expect(box!.getAttribute("aria-modal")).toBe("true");
    const labelledBy = box!.getAttribute("aria-labelledby");
    expect(labelledBy, "named by its own visible question, never a second copy of the text").not.toBeNull();
    expect(el.querySelector(`#${labelledBy!}`)?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it.each([375, 570, 960, 1280] as const)("%ipx: the dialog sits inside the widget at every size", async (width) => {
    const el = mounted(width);
    await renderTable(el, () => {});
    const shell = el.getBoundingClientRect();

    leaveButton(el)!.click();
    const box = dialog(el)!.getBoundingClientRect();
    expect(box.left, `dialog at ${String(width)}px`).toBeGreaterThanOrEqual(shell.left - 1);
    expect(box.right, `dialog at ${String(width)}px`).toBeLessThanOrEqual(shell.right + 1);
    expect(box.top, `dialog at ${String(width)}px`).toBeGreaterThanOrEqual(shell.top - 1);
    expect(box.bottom, `dialog at ${String(width)}px`).toBeLessThanOrEqual(shell.bottom + 1);
  });

  it("opens with focus on the SAFE answer", async () => {
    const el = mounted();
    await renderTable(el, () => {});

    leaveButton(el)!.click();

    // Whatever a stray Enter or Space lands on must be the one that keeps
    // the player in their match.
    expect(document.activeElement, "focus opens on 'keep playing', never on 'leave'").toBe(cancelButton(el));
  });

  it("does not steal focus back on every server view while it is open", async () => {
    const onLeaveMatch = vi.fn();
    const el = mounted();
    const render = await renderTable(el, onLeaveMatch);
    leaveButton(el)!.click();

    // A player who tabbed to the destructive answer must not be yanked back
    // to cancel every time the opponent moves — views arrive continuously.
    confirmButton(el)!.focus();
    await renderTable(el, onLeaveMatch, "1v1", render);

    expect(document.activeElement, "focus is placed on OPEN, not on every render").toBe(confirmButton(el));
  });

  it("Escape cancels — the universal way out of a dialog", async () => {
    const onLeaveMatch = vi.fn();
    const el = mounted();
    await renderTable(el, onLeaveMatch);
    leaveButton(el)!.click();

    dialog(el)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(onLeaveMatch).not.toHaveBeenCalled();
    expect(dialog(el), "Escape closes it").toBeNull();
  });

  it("clicking the backdrop cancels, and clicking the dialog itself does not", async () => {
    const onLeaveMatch = vi.fn();
    const el = mounted();
    await renderTable(el, onLeaveMatch);
    leaveButton(el)!.click();

    dialog(el)!.click();
    expect(dialog(el), "a click inside the card is not a click outside it").not.toBeNull();

    el.querySelector<HTMLElement>(".hexdev-truco-leave-backdrop")!.click();
    expect(onLeaveMatch).not.toHaveBeenCalled();
    expect(dialog(el)).toBeNull();
  });
});

describe("the control never costs the felt any height — the budget it would have to come out of is already spent", () => {
  it.each([375, 570, 960, 1280] as const)("%ipx: adding the control does not change the felt's height", async (width) => {
    const withoutEl = mounted(width);
    await renderTable(withoutEl, undefined);
    const without = withoutEl.querySelector(".hexdev-truco-table")!.getBoundingClientRect().height;
    withoutEl.remove();

    const withEl = mounted(width);
    await renderTable(withEl, () => {});
    const withControl = withEl.querySelector(".hexdev-truco-table")!.getBoundingClientRect().height;

    expect(withControl, `felt height at ${String(width)}px must not move when the leave control is present`).toBe(without);
  });
});
