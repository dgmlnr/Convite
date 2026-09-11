import { createDiceCup } from "@hexdev/dice-ui";
import type { DiceCupHandle } from "@hexdev/dice-ui";
import type { DieFace, PlayerView, RevealedRivalView, RivalView } from "@hexdev/mentiroso-engine";

import { tableLayout } from "./table-layout.js";

/**
 * Wires one `DiceCupHandle` (`@hexdev/dice-ui`, read-only, unmodified) per
 * seat onto the table (SDD `mentiroso`, work unit E2/task 5.2, design D5).
 *
 * `createDiceCup` IS REUSED EXACTLY AS SHIPPED, per design D5's own
 * reasoning: its `roll()` replaces the whole tray and keeps no die's
 * identity between rolls, which disqualified it for Generala's held dice
 * (`generala-ui/src/tray.ts` composes its own tray instead, for exactly that
 * reason) and is precisely right here — one roll per round, nothing kept
 * between rounds. Nothing in this file edits `dice-ui`; every difference
 * mentiroso needs is reachable through the handle it already returns.
 *
 * REDACTING A RIVAL IS NEVER CALLING `roll()` — never hiding a result after
 * the fact. Before `showdown`, a rival's projection is `RivalView`
 * (`@hexdev/mentiroso-engine`), which has no `dice` field AT ALL: there is
 * no value this file could pass to `roll()` even if it tried. The redaction
 * is the engine's (`getViewFor`, design D4); this file only has to not
 * invent data the view never carried, by gating every rival's `roll()` on
 * the one phase where `RevealedRivalView` (which DOES carry `dice`) exists.
 */
export type MentirosoCupsRender = (container: HTMLElement, view: PlayerView) => void;

/**
 * Ellipse radii, as a PERCENTAGE of the container's own box — the scaling
 * `table-layout.ts`'s own docblock deferred to this file: `tableLayout`
 * stays on a unit circle on purpose, so choosing an actual ellipse (rather
 * than a circle) is this rendering concern, not a geometry one.
 */
const TABLE_RADIUS_X_PERCENT = 42;
const TABLE_RADIUS_Y_PERCENT = 36;

/**
 * FOUND BY LOOKING (`cups.scene.test.ts`'s own six-seat showdown render,
 * per `AGENTS.md`'s "todos los defectos visuales... los encontró alguien
 * mirando"): `.hexdev-dice-root` at its native size — a cup beside five
 * `DIE_SCENE_SIZE`-boxed dice, roughly 1300px wide — is built for ONE
 * dominant tray on a page (`generala-ui`'s own single board). Centering
 * that native size on every one of six seats around the ellipse above
 * collides with the seat beside it the moment more than one seat carries a
 * full tray — which showdown does to every seat at once.
 *
 * MEASURED AGAINST THE ELLIPSE ITSELF, not guessed: an ellipse's
 * circumference (Ramanujan's approximation) at this file's own radii,
 * divided by the SIX seats mentiroso registers at most, is the actual arc
 * of table each seat gets before it reaches its neighbor's. A fragment
 * scaled to fit comfortably inside that arc — with margin, since two
 * neighbors' fragments both extend toward each other — is why this is a
 * fraction of the native size rather than 1 or an arbitrarily "small
 * enough" fraction: `0.32` is roughly `(circumference / 6) / nativeWidth`
 * at this file's own radii, leaving room on both sides of the seam.
 */
const SEAT_FRAGMENT_SCALE = 0.32;

/**
 * "N dados"/"1 dado"/"Sin dados" — the mark design D5 assigns an eliminated
 * seat ("shows a closed empty cup and a 'sin dados' mark"), generalized to
 * every rival: `diceCount` is PUBLIC (mentiroso-hidden-dice's own
 * R-RIVAL-SHAPE), so stating it is not a leak, and it is the only way a
 * viewer can tell "still in it, dice just hidden" apart from "eliminated" —
 * before showdown BOTH look like an empty, never-rolled cup otherwise.
 */
function diceStatusLabel(diceCount: number): string {
  if (diceCount === 0) return "Sin dados";
  if (diceCount === 1) return "1 dado";
  return `${String(diceCount)} dados`;
}

/** A seat-named replacement for `createDiceCup`'s default "Tirar los dados"
 * — design D5: "because the roll is a SYSTEM action and a button that does
 * nothing lies to a screen reader". Seats are shown 1-indexed, matching
 * every other player-facing count in this codebase (never the engine's own
 * 0-indexed `seat`). */
function rivalAriaLabel(seat: number): string {
  return `Cubilete del asiento ${String(seat + 1)}`;
}

/** Narrows a rival's projection to the ONE arm that actually carries dice
 * (design D4: `RevealedRivalView` only exists once `phase.kind ===
 * "showdown"`) — a type guard rather than a phase check, so a caller can
 * never accidentally read `.dice` off a `RivalView` the compiler would
 * otherwise let through as `undefined`. */
function isRevealed(rival: RivalView | RevealedRivalView): rival is RevealedRivalView {
  return "dice" in rival;
}

/** Own dice are visible to the viewer at every phase (`SelfView`), but the
 * VALUES are placeholders until the round has actually rolled
 * (`mentiroso-engine/src/state.ts`'s own `createMatch`: "nothing reads a
 * seat's dice VALUES until the bidding phase"). Rolling them any earlier
 * would toss the player's own cup over numbers that are not real yet. */
function ownDiceAreReal(phase: PlayerView["phase"]): boolean {
  return phase.kind === "bidding" || phase.kind === "showdown";
}

interface MountedCup {
  readonly wrapper: HTMLElement;
  readonly handle: DiceCupHandle;
  readonly status: HTMLElement;
  /** The last faces actually handed to `.roll()`, so an unchanged view does
   * not retoss the same dice on every re-render — `createDiceCup.roll()`
   * always rebuilds its tray, so calling it again with nothing new would
   * restart the toss animation for no reason. `null` means "never rolled
   * this match", the state a fresh `DiceCupHandle` starts in. */
  rolledKey: string | null;
}

function rollIfChanged(cup: MountedCup, faces: readonly DieFace[]): void {
  const key = faces.join(",");
  if (cup.rolledKey === key) return;
  cup.handle.roll(faces);
  cup.rolledKey = key;
}

/**
 * Builds the per-seat cup renderer. Returns a closure — the same shape
 * `createGeneralaTray`/`createMahjongBoardRenderer` already use — so the
 * caller mounts it once and calls it again on every new `PlayerView`.
 */
export function createMentirosoCups(): MentirosoCupsRender {
  let cups = new Map<number, MountedCup>();
  let mountedSeatCount = -1;

  function mount(container: HTMLElement, seatCount: number): void {
    container.replaceChildren();
    const next = new Map<number, MountedCup>();
    for (let seat = 0; seat < seatCount; seat += 1) {
      const wrapper = container.ownerDocument.createElement("div");
      wrapper.className = "hexdev-mentiroso-cup-wrapper";
      wrapper.dataset.seat = String(seat);
      wrapper.style.position = "absolute";
      // An absolutely positioned box with only `left` set (never `right`,
      // never an explicit `width`) is NOT sized by its own preferred content
      // width — CSS clamps its shrink-to-fit width to whatever space is left
      // between `left` and the containing block's right edge, which can be
      // far narrower than `.hexdev-dice-root`'s cup-plus-five-dice row wants,
      // folding it onto several rows instead of one. `max-content` opts out
      // of that clamp, keeping the fragment's own footprint regardless of
      // where its anchor lands — `translate()` below only repositions an
      // already-sized box, strictly after this decides the size.
      wrapper.style.width = "max-content";

      const handle = createDiceCup(container.ownerDocument, { onPress: () => {} });
      wrapper.appendChild(handle.element);

      const status = container.ownerDocument.createElement("div");
      status.className = "hexdev-mentiroso-cup-status";
      wrapper.appendChild(status);

      container.appendChild(wrapper);
      next.set(seat, { wrapper, handle, status, rolledKey: null });
    }
    cups = next;
    mountedSeatCount = seatCount;
  }

  return (container, view) => {
    const seatCount = 1 + view.rivals.length;
    if (mountedSeatCount !== seatCount) mount(container, seatCount);

    for (const position of tableLayout(view.self.seat, seatCount)) {
      const cup = cups.get(position.seat);
      if (cup === undefined) continue; // unreachable: `mount` seeds every seat `tableLayout` can name

      cup.wrapper.style.left = `${String(50 + position.x * TABLE_RADIUS_X_PERCENT)}%`;
      cup.wrapper.style.top = `${String(50 + position.y * TABLE_RADIUS_Y_PERCENT)}%`;
      cup.wrapper.style.transform = `translate(-50%, -50%) scale(${String(SEAT_FRAGMENT_SCALE)})`;

      if (position.seat === view.self.seat) {
        cup.handle.cupElement.disabled = false;
        // No status mark on the viewer's own seat at all (not merely an
        // empty one) — its dice are simply shown, never summarized as a
        // count, so there is nothing this mark would be saying.
        cup.status.remove();
        if (ownDiceAreReal(view.phase)) rollIfChanged(cup, view.self.dice);
        continue;
      }

      const rival = view.rivals.find((candidate) => candidate.seat === position.seat);
      if (rival === undefined) continue; // unreachable: `tableLayout` and `view.rivals` name the same seats

      cup.handle.cupElement.disabled = true;
      cup.handle.cupElement.setAttribute("aria-label", rivalAriaLabel(position.seat));
      if (cup.status.parentElement !== cup.wrapper) cup.wrapper.appendChild(cup.status);
      cup.status.textContent = diceStatusLabel(rival.diceCount);

      if (isRevealed(rival)) rollIfChanged(cup, rival.dice);
    }
  };
}
