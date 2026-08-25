import { TABLE_STRINGS } from "./strings.js";

export interface LeaveControlProps {
  /** Whether the confirmation dialog is open. Owned by the caller (table.ts's
   * own render closure) rather than by this module: every server view
   * re-renders the whole table, so state kept HERE would be destroyed by the
   * next opponent move — the one moment a player is most likely to be
   * mid-decision. */
  readonly asking: boolean;
  /** Move focus into the dialog. TRUE only on the render that OPENS it —
   * never on the re-renders that follow, or a player who tabbed to the
   * destructive answer would be yanked back to cancel every time the
   * opponent moved. */
  readonly focusOnOpen: boolean;
  readonly onAsk: () => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/** Unique per rendered dialog so `aria-labelledby` always points at THIS
 * dialog's own heading. A fixed id would be wrong the moment two tables
 * share a document, which the test suite does routinely and a future
 * multi-table page could do for real. */
let dialogSequence = 0;

/**
 * The door glyph.
 *
 * Decorative, and marked so: `aria-hidden` keeps it out of the accessible
 * name, which comes from the real text beside it. An icon carries the
 * meaning at a glance for everyone who can see it, and names nothing at all
 * for everyone who cannot — so it is never the only thing here.
 */
function doorIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("hexdev-truco-leave-icon");
  for (const d of [
    "M13 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h7", // the door, deliberately open on the side the arrow leaves through
    "M14.5 12H21", // the way out
    "M18 8.5 21.5 12 18 15.5",
  ]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  }
  return svg;
}

/**
 * The way out of a match that is still being played.
 *
 * A DOOR IN THE CORNER, AND A MODAL FOR THE DECISION. Leaving is not
 * undoable: `MatchRoom.handleQuit` hands the seat to a bot and the match
 * continues without this player. The resting control is therefore as quiet
 * as it can be while still being findable — a glyph everyone already reads
 * as "exit", tucked into the one corner no tier uses — and the decision
 * itself gets a real dialog, because a choice this permanent should not be
 * made in a control strip inches from the buttons a player is hitting on a
 * turn clock.
 *
 * The dialog says what happens, not "are you sure?". A player deciding
 * whether to leave needs to know what becomes of the table they are leaving;
 * an abstract confirmation teaches them nothing they did not already know
 * when they tapped.
 */
export function renderLeaveControl(host: HTMLElement, props: LeaveControlProps): void {
  host.replaceChildren();
  host.className = "hexdev-truco-leave";
  host.dataset.asking = String(props.asking);
  host.onkeydown = null;

  if (!props.asking) {
    const ask = host.appendChild(document.createElement("button"));
    ask.type = "button";
    ask.className = "hexdev-truco-leave-button hexdev-truco-leave-button--rest";
    ask.dataset.action = "leave-match";
    ask.appendChild(doorIcon());
    const label = ask.appendChild(document.createElement("span"));
    label.className = "hexdev-truco-leave-label";
    label.textContent = TABLE_STRINGS.leaveMatch;
    ask.addEventListener("click", props.onAsk);
    return;
  }

  // Escape, on the container rather than the dialog: focus may legitimately
  // sit on either, and a dialog you cannot dismiss with the one key everyone
  // tries is a trap however many buttons it offers.
  host.onkeydown = (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation(); // never let it reach anything else mid-decision
    props.onCancel();
  };

  // Clicking OUT of a dialog cancels it. The backdrop is a real element and
  // not a listener on the container, so "outside" is a fact of what was
  // clicked rather than a coordinate comparison that has to be kept correct.
  const backdrop = host.appendChild(document.createElement("div"));
  backdrop.className = "hexdev-truco-leave-backdrop";
  backdrop.addEventListener("click", props.onCancel);

  dialogSequence += 1;
  const titleId = `hexdev-truco-leave-title-${String(dialogSequence)}`;

  const dialog = host.appendChild(document.createElement("div"));
  dialog.className = "hexdev-truco-leave-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", titleId);

  const title = dialog.appendChild(document.createElement("h2"));
  title.className = "hexdev-truco-leave-title";
  title.id = titleId;
  title.textContent = TABLE_STRINGS.leaveMatchTitle;

  const body = dialog.appendChild(document.createElement("p"));
  body.className = "hexdev-truco-leave-body";
  body.textContent = TABLE_STRINGS.leaveMatchBody;

  const actions = dialog.appendChild(document.createElement("div"));
  actions.className = "hexdev-truco-leave-actions";

  // Cancel FIRST in the DOM, so Tab reaches the safe answer before the
  // destructive one — and it is what opens focused, below.
  const cancel = actions.appendChild(document.createElement("button"));
  cancel.type = "button";
  cancel.className = "hexdev-truco-leave-button hexdev-truco-leave-button--cancel";
  cancel.dataset.action = "leave-match-cancel";
  cancel.textContent = TABLE_STRINGS.leaveMatchCancel;
  cancel.addEventListener("click", props.onCancel);

  const confirm = actions.appendChild(document.createElement("button"));
  confirm.type = "button";
  confirm.className = "hexdev-truco-leave-button hexdev-truco-leave-button--confirm";
  confirm.dataset.action = "leave-match-confirm";
  confirm.appendChild(doorIcon());
  const confirmLabel = confirm.appendChild(document.createElement("span"));
  confirmLabel.className = "hexdev-truco-leave-label";
  confirmLabel.textContent = TABLE_STRINGS.leaveMatchConfirm;
  confirm.addEventListener("click", props.onConfirm);

  // On the SAFE answer: whatever a stray Enter or Space lands on has to be
  // the one that keeps the player in their match.
  if (props.focusOnOpen) cancel.focus();
}
