import type { Action } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import { SENA_LABELS, TABLE_STRINGS } from "./strings.js";

type SendSena = Extract<Action, { type: "send-sena" }>;

/** Document-unique id source for the popover row (aria-controls below).
 * Module-level so two pickers in one document can never mint the same id;
 * monotonically growing across renders is harmless — each render re-links its
 * own fresh toggle/row pair. */
let senasRowSequence = 0;

/** The sender's own per-hand seña quota, straight off
 * `PlayerView["self"].senasRemaining` — the only view field that carries it
 * (truco-engine's `view.ts` explains why no one else may receive it). */
export interface SenaQuota {
  readonly remaining: number;
}

/**
 * The señas affordance (spec: "discoverable without being noisy"). Renders
 * NOTHING at all when no `send-sena` action is legal AND the quota is still
 * whole — the same convention `renderCalls` already applies for a
 * legality-gated action, and exactly how 1v1 stays untouched:
 * `getLegalSenaActions` never offers this action outside a 2v2 match (a
 * player with a teammate), so there is no separate feature flag to check
 * here, only the same legal-actions list every other button already reads
 * from.
 *
 * When señas ARE legal, shows exactly one small toggle button — never the
 * six signals up front, which would nag a player who does not care about
 * señas (spec's own explicit requirement). The six only appear once the
 * player deliberately opens it.
 *
 * THE QUOTA CLAUSE IS LOAD-BEARING, and it is why this function needed a
 * fourth argument at all. `getLegalSenaActions` goes empty at the per-hand
 * cap exactly as it does when the hand ends, so the "no legal seña, render
 * nothing" rule alone would make the whole Señas button VANISH the instant a
 * player spent their third seña — mid-hand, with no explanation, which reads
 * as a broken UI rather than as a rule. A rule the player cannot see is not
 * one they can play around. So an empty legal list is split in two by the
 * quota: still whole means señas are simply not on offer (1v1, no hand, hand
 * decided) and nothing is drawn, exactly as before; spent means the control
 * STAYS, disabled, saying which state it is in.
 *
 * The asymmetry that leaves behind is deliberate: a player who spent their
 * quota keeps the disabled chip until the next deal, including after the hand
 * is decided, while one who spent none sees nothing there. That is the honest
 * reading of each — the chip reports the player's own quota, and the quota is
 * genuinely spent in the first case and genuinely untouched in the second.
 *
 * The count is shown from the FIRST seña, not only at the cap: a limit a
 * player only discovers by hitting it is a trap, and the whole point of the
 * cap is that it should change how señas are spent, which it can only do if
 * it is visible while there are still some to spend.
 *
 * `dismissSurface` is what makes the picker DISMISSABLE, and it is a
 * parameter rather than a `document` lookup for one reason — see the block
 * comment on the listeners themselves further down.
 */
export function renderSenaPicker(
  container: HTMLElement,
  legalActions: readonly Action[],
  dispatch: (action: Action) => void,
  quota: SenaQuota,
  dismissSurface: HTMLElement,
): void {
  container.replaceChildren();
  // Stable window height (apply prompt): the class is set BEFORE the early
  // return below, not after — table.ts now mounts this container for the
  // whole 2v2 match (view.teammates.length > 0), even once send-sena stops
  // being legal (hand decided). Setting the class only in the "has content"
  // branch used to leave a bare, unclassed <div> in that state, which never
  // matched table-styles.ts's own .hexdev-truco-senas min-height rule and
  // collapsed to 0 — a real ~80px drop at the very last render of a played
  // hand, found by the height-stability test itself, not assumed.
  container.className = "hexdev-truco-senas";
  const legalSenas = legalActions.filter((action): action is SendSena => action.type === "send-sena");
  const spent = quota.remaining <= 0;
  if (legalSenas.length === 0 && !spent) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "hexdev-truco-senas-toggle";
  toggle.dataset.action = "senas-toggle";

  if (spent) {
    // No row, no listener, no `aria-expanded`: this button owns no revealable
    // region any more, and claiming one it cannot open would be a worse lie
    // to a screen reader than the vanishing button was to a sighted player.
    // `disabled` alone carries the state.
    toggle.textContent = TABLE_STRINGS.senasSpent;
    toggle.title = TABLE_STRINGS.senasSpentHint(MAX_SENAS_PER_HAND);
    toggle.disabled = true;
    // The REASON, as real text (WCAG 2.1.1): `title` only surfaces on pointer
    // hover — a keyboard user cannot hover, and screen readers expose title
    // inconsistently, doubly so on a disabled control. The visually-hidden
    // span joins the button's accessible name instead, so "Sin señas" always
    // arrives WITH its why. The title stays for the pointer users it already
    // serves. The leading ". " is load-bearing: an AT flattens the label text
    // node and this span into ONE name, and without a separator they run
    // together ("Sin señasYa hiciste..."). It lives inside the hidden span so
    // the painted label stays byte-identical.
    const reason = document.createElement("span");
    reason.className = "hexdev-truco-visually-hidden";
    reason.textContent = `. ${TABLE_STRINGS.senasSpentHint(MAX_SENAS_PER_HAND)}`;
    toggle.append(reason);
    container.append(toggle);
    return;
  }

  toggle.textContent = TABLE_STRINGS.senasToggle(quota.remaining);
  // Present from the first render, never merely added on open: a control
  // that owns a revealable region always announces its state. It is also
  // the hook table-styles.ts selects on to give the open toggle its own
  // active treatment, so a player can tell at a glance that the picker
  // above the bar belongs to this button (FU-1 eye review).
  toggle.setAttribute("aria-expanded", "false");

  const row = document.createElement("div");
  row.className = "hexdev-truco-senas-row";
  // WCAG 4.1.2: aria-expanded promises a revealable region, and aria-controls
  // is what NAMES it — without the link, assistive tech knows something
  // opened but not what or where. A fresh id per render (the sequence below)
  // rather than a fixed one: ids must be document-unique, and this module
  // cannot know how many pickers a document holds; toggle and row are built
  // together in the same render, so the pair can never dangle.
  row.id = `hexdev-truco-senas-row-${++senasRowSequence}`;
  toggle.setAttribute("aria-controls", row.id);

  let open = false;
  const renderRow = (): void => {
    row.replaceChildren();
    if (!open) return;
    for (const action of legalSenas) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hexdev-truco-sena";
      button.dataset.action = "send-sena";
      button.dataset.signal = action.signal;
      button.textContent = SENA_LABELS[action.signal];
      button.addEventListener("click", () => dispatch(action));
      row.appendChild(button);
    }
  };

  /**
   * WHERE THESE LIVE IS THE WHOLE DESIGN, and `document` is the one place
   * they must not.
   *
   * This renderer has NO UNMOUNT HOOK. `table.ts`'s `render` rebuilds the
   * entire table on every broadcast, and `main.ts` empties the widget root
   * when a match is left — with no render following it. A `document`-level
   * listener registered here would therefore leak one closure over a detached
   * tree per broadcast (dozens per hand, hundreds per match), and removing it
   * "on the next render" fixes only the first of those two paths: after
   * teardown there IS no next render, so the last one would sit on `document`
   * forever.
   *
   * So the lifetime is expressed STRUCTURALLY instead of being managed.
   * `dismissSurface` is the per-render subtree this picker itself hangs
   * under (`table.ts` passes its `.hexdev-truco-shell-layout`, built fresh
   * every render and dropped both by the next one and by teardown). A
   * listener there cannot outlive the picker, because the node it is
   * registered on is thrown away by exactly the two events that throw the
   * picker away — and a listener on an unreachable detached node is collected
   * with the tree that holds it, not left behind on a live one.
   *
   * That is the OPPOSITE of `announcer.ts`'s shape, deliberately and for the
   * same underlying reason. An announcement is a change to a region that
   * PERSISTS, so those nodes are built once and must survive the render; a
   * popover's dismissal is meaningless the moment its popover is gone, so it
   * must NOT survive it. Both are answers to "there is no unmount hook"; they
   * differ because the two things want opposite lifetimes. The turn clock's
   * interval in `table.ts` takes the third road — re-armed per render and
   * self-healing on a detached node — because a timer fires itself and can
   * notice; a listener that waits for an event no one will ever send cannot.
   */
  const onSurfaceClick = (event: MouseEvent): void => {
    // DOM CONTAINMENT, never geometry. The row is `position: absolute` and
    // deliberately escapes the action bar's own scroll box (table-styles.ts),
    // so "is this click inside the picker" is a question about the tree, not
    // about rectangles — a hit test would call a click on the felt beneath
    // the open row "inside" and a click on the row itself "outside".
    //
    // It is also what keeps the toggle's own click honest. That click runs
    // the toggle's handler FIRST, which registers this listener, and then
    // keeps bubbling until it reaches the surface — where a listener added
    // mid-dispatch on a not-yet-reached ancestor genuinely does fire. The
    // containment check is what stops the opening click from being read as an
    // outside click and closing what it just opened.
    if (event.target instanceof Node && container.contains(event.target)) return;
    setOpen(false);
  };

  const onSurfaceKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    // Focus moves BEFORE the close, not after, and the order is load-bearing.
    // A keyboard player who tabbed into the row is standing on one of the six
    // buttons the close is about to destroy; handing them back to the toggle
    // returns them to the control that owns the region they just closed
    // instead of dropping them on <body> with their place in the action bar
    // gone. Doing it afterwards looks equivalent and is not — removing the
    // focused node triggers the browser's own focus fix-up, which can land
    // AFTER our `focus()` call and undo it (it does, in Chromium). Never
    // removing the focused node in the first place sidesteps the race.
    //
    // A player whose focus was elsewhere keeps it: Escape closes the picker,
    // it does not summon it.
    const focused = container.ownerDocument.activeElement;
    if (focused !== null && container.contains(focused)) toggle.focus();
    setOpen(false);
  };

  const setOpen = (next: boolean): void => {
    if (open === next) return;
    open = next;
    toggle.setAttribute("aria-expanded", String(open));
    renderRow();
    // Armed only while there is something to dismiss: a closed picker holds
    // no listener at all, which is what makes "no listener survives N
    // renders" a fact about every render rather than about tidy bookkeeping.
    if (open) {
      dismissSurface.addEventListener("click", onSurfaceClick);
      dismissSurface.addEventListener("keydown", onSurfaceKeydown);
    } else {
      dismissSurface.removeEventListener("click", onSurfaceClick);
      dismissSurface.removeEventListener("keydown", onSurfaceKeydown);
    }
  };

  toggle.addEventListener("click", () => setOpen(!open));

  container.append(toggle, row);
}
