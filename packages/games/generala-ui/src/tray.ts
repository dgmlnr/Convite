import { createCupElement, createDiceSound, ensureDiceStyles, setCupGesture } from "@hexdev/dice-ui";
import type { CupGesture, DiceSound } from "@hexdev/dice-ui";
import { DICE_COUNT } from "@hexdev/generala-engine";
import type { DieFace, GeneralaAction, HoldAction, PlayerView, Turn } from "@hexdev/generala-engine";

import { createDieSlot } from "./die-button.js";
import type { DieSlot } from "./die-button.js";
import { createMuteButton } from "./mute-button.js";
import type { MuteButton } from "./mute-button.js";
import { readSoundPreference, writeSoundPreference } from "./sound-preference.js";
import { ensureTrayStyles } from "./tray-styles.js";

/** Where the tray draws itself: the row of dice, and the control that throws
 * them. Two elements the caller mounts and keeps, never ones this renderer
 * creates — the same contract `escoba-ui`'s `MarkThenPlayElements` states, so
 * the board decides the layout and this file decides only what goes in it. */
export interface GeneralaTrayElements {
  readonly diceEl: HTMLElement;
  readonly rollEl: HTMLElement;
}

/**
 * THE VIEW AND NOT THE TURN, and the widening is one fact this tray could not
 * otherwise reach.
 *
 * `Turn` carries the seat that is PLAYING and says nothing about the seat
 * that is READING, so "is the table waiting on me" is unanswerable from it —
 * and that question is the whole of the cue below. `PlayerView` is the one
 * object holding both, and it is what the planilla and the announcer standing
 * beside this tray were already handed. Nothing else about the tray moved:
 * `view.turn` is the same object under a different name, and the offer list
 * is still the only authority on what may be pressed.
 */
export type GeneralaTrayRender = (
  elements: GeneralaTrayElements,
  view: PlayerView,
  legalActions: readonly GeneralaAction[],
  onHold: (action: HoldAction) => void,
) => void;

/**
 * The five faces this turn is showing, or the gaps where dice are still in
 * the cup.
 *
 * `awaiting-roll` carries `slots` — `null` in every position about to be
 * thrown — which is exactly the shape this tray draws, so no arithmetic
 * happens here. `servida-win` carries no dice at all: five of a kind off the
 * cup ends the match before anybody chooses anything, and there is nothing
 * left to show.
 */
function facesOf(turn: Turn): readonly (DieFace | null)[] {
  switch (turn.phase) {
    case "awaiting-roll":
      return turn.slots;
    case "deciding":
      return turn.dice;
    case "servida-win":
      return [];
  }
}

/**
 * WHAT THE CUBILETE IS DOING, WHICH IS THIS FILE'S JOB AND NOT `dice-ui`'S.
 *
 * A cup knows three poses and no rules (`CupGesture`); a phase is a rule.
 * They meet here, in one total switch over the same union `facesOf` above
 * already walks, so a fourth phase would stop this compiling rather than
 * silently leave the cup wherever it was.
 *
 * `awaiting-roll` IS THE SHAKE, whoever's turn it is. The cup is not dimmed
 * on the rival's go the way the dice are, and that asymmetry is the same one
 * `tray-styles.ts` already argues for the waiting slots: dimming the one
 * element reporting that something IS happening pays for this cue with that
 * one. The dim exists so a player does not reach for a control that will not
 * answer, and this is not a control at all — it is `aria-hidden` scenery.
 *
 * `servida-win` TIPS, and the reason is NOT that anybody gets a good look at
 * it. Checked rather than assumed: five of a kind off the cup gives the match
 * an outcome, `game-ui-registry.ts` reads `view.outcome !== null` in the same
 * render, and the match-over panel is `position: absolute; inset: 0` over a
 * `rgba(0, 0, 0, 0.45)` veil. So this gesture plays behind that veil, at a bit
 * over half brightness, with a verdict panel across the middle of it. Half
 * seen, not unseen — and either way not the drama it would be in the clear.
 *
 * It tips because the cup DID pour, and this function's whole job is to say
 * what the cubilete is doing. Answering `still` here would be encoding "and
 * something else is going to cover it" into a map from phase to pose — a
 * presentation decision made on behalf of a component this file cannot see,
 * which stops being right the day that overlay changes and fails silently
 * when it does. `facesOf` returning no dice is the engine's own statement
 * that the match ended as they landed, not that they never left.
 */
function gestureFor(turn: Turn): CupGesture {
  switch (turn.phase) {
    case "awaiting-roll":
      return "shaking";
    case "deciding":
    case "servida-win":
      return "tipping";
  }
}

function holdsIn(legalActions: readonly GeneralaAction[]): readonly HoldAction[] {
  return legalActions.filter((action): action is HoldAction => action.type === "hold");
}

/** The offer whose `keep` is exactly this selection — the ONE action a press
 * may commit. Written the way `escoba-ui`'s `matchingAction` is and for the
 * identical reason: a selection matching no offer commits nothing, so this UI
 * cannot dispatch an action the engine would refuse. */
function matchingHold(holds: readonly HoldAction[], held: ReadonlySet<number>): HoldAction | undefined {
  return holds.find((hold) => hold.keep.length === held.size && hold.keep.every((index) => held.has(index)));
}

/** Keeping all five asks to re-roll nothing: it burns a throw and changes no
 * die, which is not a move at a real table either. The engine does not offer
 * it (`KEEP_SETS` is 31 and never 32), so the control says why instead of
 * offering a "Tirar 0 dados" nobody meant. */
const KEEPING_ALL_FIVE = "Guardar los cinco no es una tirada";

function rollLabel(throwing: number): string {
  if (throwing === DICE_COUNT) return `Tirar los ${String(DICE_COUNT)} dados`;
  return throwing === 1 ? "Tirar 1 dado" : `Tirar ${String(throwing)} dados`;
}

/**
 * THE TRAY, AND THE ONE THING IT REFUSES TO DO.
 *
 * `dice-ui` ships a cup, and `createDiceCup(...).roll()` is deliberately NOT
 * called from anywhere in this package. Its own docstring says what it does —
 * it replaces the whole tray — which is right for five dice nobody is keeping
 * and destroys the game the moment a player holds one. It is not deleted and
 * not redesigned; it is simply not the thing a Generala board wants (D8).
 *
 * A HELD DIE IS THE SAME ELEMENT AFTERWARDS, and identity is keyed on the
 * FACE IN THE SLOT rather than on this closure's memory of what was held. A
 * held die's face is unchanged by construction — the roll splices
 * positionally into the empty slots — so the two rules agree, and the face is
 * the one of them that is still right after a reconnect, a replay, or a
 * broadcast this tray did not cause. Remembering the last hold instead would
 * be a second source of truth about the same fact, and the drift would only
 * ever show up as a die that flickered.
 *
 * PRESSES ACCUMULATE HERE; EXACTLY ONE ACTION LEAVES. A per-die press toggles
 * a pending selection and dispatches nothing. The action union forces that
 * rather than a preference doing it: there is exactly one `hold` per roll and
 * applying it TRANSITIONS THE PHASE, so five presses cannot be five actions.
 * The "Tirar" control is what commits, and it commits the engine's own offer
 * OBJECT — never a `keep` array this file assembled. Since PR #257 the room
 * admits an action only if `sameAction` matches one the game offered, and it
 * walks arrays BY INDEX (`match-room.ts:220-232`): `[1, 0]` is not `[0, 1]`.
 * Dispatching the offer makes the canonical ascending order a fact instead of
 * a convention this file would have to remember.
 *
 * THE TRAY READS THE OFFER LIST AND NEVER THE RULES. Whether a die may be
 * held at all is answered by one question — does this list contain any
 * `hold`? — rather than by this file learning what `rollsUsed === 3` means.
 * That is what makes it correct in three states it was never separately
 * taught: the third throw, another seat's turn, and the moment the cup is
 * shaking all answer the same way, because the engine offers nothing in any
 * of them.
 */
export function createGeneralaTray(): GeneralaTrayRender {
  const held = new Set<number>();
  let slots: DieSlot[] = [];
  let drawnFaces: readonly (DieFace | null)[] = [];
  /** The arguments of the render in force, so the toggle below reads the
   * CURRENT turn instead of the one that happened to build its element. A
   * held die survives re-renders, so a listener closing over its own render's
   * arguments would go stale exactly on the dice the player is keeping. */
  let roller: HTMLButtonElement | null = null;
  /** THE CUBILETE OUTLIVES THE CONTROL BESIDE IT, which is the whole reason
   * it is a second reference and not a child of the button. The throw control
   * is ABSENT — not disabled — whenever the engine offers no hold, and the
   * moment it offers none is exactly the moment the cup should be shaking. A
   * cup mounted inside that button would vanish on the only beat it exists
   * for. */
  let cup: HTMLElement | null = null;
  let mute: MuteButton | null = null;
  /**
   * THE GESTURE ALREADY DECLARED, kept so a sound fires on the TRANSITION and
   * not on the render. A board redraws on every broadcast and again on every
   * die a player presses, so a rattle triggered by "the phase is
   * awaiting-roll" would restart several times a throw. `setCupGesture` holds
   * the same idempotence for the drawing; this is its half for the audio, and
   * it is a separate variable rather than a read of the element because the
   * element is replaced whenever the board re-mounts.
   */
  let sounded: CupGesture | null = null;
  /**
   * BUILT LAZILY, ON THE FIRST RENDER THAT HAS A DOCUMENT. This factory takes
   * no arguments — `escoba-ui` and `truco-ui`'s renderers take none either —
   * so the `Window` this needs arrives with the first set of elements. It is
   * built once and kept: an `AudioContext` per render would be a resource
   * leak with a hard browser limit behind it.
   */
  let sound: DiceSound | null = null;
  let current: { elements: GeneralaTrayElements; view: PlayerView; legalActions: readonly GeneralaAction[]; onHold: (action: HoldAction) => void } | null = null;

  const redraw = (): void => {
    if (current !== null) render(current.elements, current.view, current.legalActions, current.onHold);
  };

  const toggle = (index: number): void => {
    // INSIDE THE GESTURE, which is the whole autoplay story. A browser only
    // lets a page start sounding from a handler for a real press; this is one,
    // and so is the throw below. Everything the player actually hears is
    // played hundreds of milliseconds later from a server broadcast, which is
    // no gesture at all — so if these two never ran, nothing would ever sound.
    sound?.unlock();
    if (held.has(index)) held.delete(index);
    else held.add(index);
    redraw();
  };

  const throwThem = (): void => {
    sound?.unlock();
    if (current === null) return;
    const offer = matchingHold(holdsIn(current.legalActions), held);
    if (offer === undefined) return;
    // Cleared BEFORE the round trip, exactly as `mark-then-play.ts` clears its
    // marks: the dice the player just gave up must stop looking held the
    // instant they press, not whenever the server's next broadcast lands.
    held.clear();
    redraw();
    current.onHold(offer);
  };

  const render: GeneralaTrayRender = (elements, view, legalActions, onHold) => {
    current = { elements, view, legalActions, onHold };
    const turn = view.turn;
    const doc = elements.diceEl.ownerDocument;
    ensureDiceStyles(doc);
    ensureTrayStyles(doc);
    elements.diceEl.className = "hexdev-generala-tray";
    // WHOSE TURN IT IS, SAID ONCE, ON THE ROW ITSELF. The sheet dims from
    // here rather than from a class per die, so a tray with three dice on the
    // table and two in the cup answers the question once instead of five
    // times. Written on every render and never cleared, because it is
    // total: one of the two values is always true.
    elements.diceEl.dataset.turn = turn.seat === view.self.seat ? "self" : "rival";

    const faces = facesOf(turn);
    // ARE THE ELEMENTS THIS CLOSURE HOLDS STILL IN THIS CONTAINER? Asked of
    // the DOM rather than of a remembered container reference, because the
    // two are not the same question: comparing the container catches a
    // renderer mounted somewhere else and misses one whose container somebody
    // emptied under it, and in that second case every `replaceWith` below
    // would land on a detached node and the tray would silently draw nothing.
    // `board.ts`'s own `surface.parentElement !== container` asks it this way
    // for the same reason. Every other path keeps whatever it can.
    if (slots.length !== faces.length || slots[0]?.node.parentElement !== elements.diceEl) {
      slots = faces.map((face, index) => createDieSlot(doc, face, index, toggle));
      elements.diceEl.replaceChildren(...slots.map((slot) => slot.node));
      drawnFaces = faces;
      held.clear();
    } else {
      let anyChanged = false;
      for (const [index, face] of faces.entries()) {
        if (face === drawnFaces[index]) continue;
        const replacement = createDieSlot(doc, face, index, toggle);
        slots[index]!.node.replaceWith(replacement.node);
        slots[index] = replacement;
        anyChanged = true;
      }
      drawnFaces = faces;
      // A selection is about THESE faces. The moment any of them changes the
      // player is deciding again, so a mark left over from the previous throw
      // would be a hold nobody chose.
      if (anyChanged) held.clear();
    }

    const holds = holdsIn(legalActions);
    for (const [index, slot] of slots.entries()) {
      if (slot.button === null) continue;
      slot.button.disabled = holds.length === 0;
      slot.button.setAttribute("aria-pressed", String(held.has(index)));
    }

    // THE CUBILETE FIRST, AND BEFORE THE EARLY RETURN BELOW. Asked of the DOM
    // rather than of a remembered reference, the same question `board.ts` and
    // the dice row above both ask and for the same reason: a container
    // somebody emptied under this closure leaves every reference it kept
    // looking valid while pointing at a detached node.
    sound ??= createDiceSound(doc.defaultView ?? {}, readSoundPreference(doc.defaultView));
    // `mute === null` IS PART OF THE CONDITION rather than a separate branch,
    // which is also what lets the compiler see that the control exists below.
    if (cup === null || mute === null || cup.parentElement !== elements.rollEl) {
      cup = createCupElement(doc);
      mute = createMuteButton(doc, () => {
        const next = !(sound?.isMuted() ?? true);
        sound?.setMuted(next);
        // TURNING IT BACK ON IS ITSELF A PRESS, so take it: a player who
        // muted before ever throwing and then changed their mind would
        // otherwise have unlocked nothing, and would sit through one more
        // silent throw waiting for a sound they just asked for.
        if (!next) sound?.unlock();
        writeSoundPreference(doc.defaultView, next);
        mute?.render(next);
      });
      // The control, if there was one, went with whatever emptied this box.
      elements.rollEl.replaceChildren(cup, mute.element);
      roller = null;
      // A REBUILT ROW HAS HEARD NOTHING. Forgetting this is what would make a
      // reconnect land mid-throw and stay silent for the rest of it.
      sounded = null;
    }
    mute.render(sound.isMuted());

    const gesture = gestureFor(turn);
    // ON THE TRANSITION, NEVER ON THE RENDER — see `sounded` above. The two
    // gestures that make a noise are the two beats of a throw, and each of
    // them happens once however many times the board redraws around it.
    if (gesture !== sounded) {
      if (gesture === "shaking") sound.rattle();
      else sound.tumble();
      sounded = gesture;
    }
    setCupGesture(cup, gesture);

    if (holds.length === 0) {
      // ABSENT, not disabled, and the asymmetry with the all-five case below
      // is the point. There the player is one press away from making it a
      // move again, so a greyed control is the truth. Here there is no throw
      // left to ask for at all, and an affordance for a move that does not
      // exist is worse than no affordance.
      //
      // THE CUP STAYS. What is gone is the offer, not the object: this is the
      // rival's turn, or a third throw already spent, or the beat between a
      // press and the dice landing — and in the last of those the cubilete is
      // the only thing on the board reporting that anything is happening at
      // all.
      roller?.remove();
      roller = null;
      return;
    }

    if (roller === null || roller.parentElement !== elements.rollEl) {
      roller = doc.createElement("button");
      roller.type = "button";
      roller.className = "hexdev-generala-roll";
      roller.addEventListener("click", throwThem);
      // Inserted BEFORE the mute control, never `replaceChildren` — that
      // would take the cup and the mute out on every throw and restart the
      // cup's gesture from a fresh element, which is the one thing
      // `setCupGesture`'s idempotence cannot protect against. Before rather
      // than after so the row reads cubilete, throw, sound: the two things
      // this turn is about, and then the furniture.
      elements.rollEl.insertBefore(roller, mute?.element ?? null);
    }
    const offer = matchingHold(holds, held);
    // Updated in place rather than rebuilt: a player who tabbed to this
    // control and then pressed a die would otherwise be dropped back onto the
    // body by the re-render their own press caused (WCAG 2.1.1/2.4.3, the
    // same defect `truco-ui`'s table renderer fences for by name).
    roller.disabled = offer === undefined;
    roller.textContent = offer === undefined ? KEEPING_ALL_FIVE : rollLabel(DICE_COUNT - held.size);
  };

  return render;
}
