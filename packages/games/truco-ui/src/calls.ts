import type { Action } from "@hexdev/truco-engine";
import { CALL_LABELS, TABLE_STRINGS } from "./strings.js";

/** Every call this row can label — deliberately excludes `play-card`, which
 * renders on the hand itself (tapping a card), not as a call button. */
function labelFor(action: Action): string | null {
  if (action.type === "call-truco") return CALL_LABELS[action.level];
  if (action.type === "call-envido") return CALL_LABELS[action.level];
  if (action.type === "respond-truco" || action.type === "respond-envido") {
    return action.response === "quiero" ? CALL_LABELS.quiero : CALL_LABELS.noQuiero;
  }
  if (action.type === "declare-envido") return action.declaration === "points" ? TABLE_STRINGS.declareMine : TABLE_STRINGS.sonBuenas;
  return null; // play-card — not a "call"
}

/** Answering an already-open call (quiero/no quiero) is a different kind of
 * decision from opening or escalating one (truco/envido/mostrar envido) —
 * spec: "they should not read as one undifferentiated row". */
function isResponse(action: Action): boolean {
  return action.type === "respond-truco" || action.type === "respond-envido";
}

/** Which of the two chains an action belongs to, or null for anything that is
 * neither (play-card, consult, señas). */
function chainOf(action: Action): "truco" | "envido" | null {
  if (action.type === "call-truco" || action.type === "respond-truco") return "truco";
  if (action.type === "call-envido" || action.type === "respond-envido") return "envido";
  return null;
}

/**
 * WHETHER THE OPENING GROUP IS AN ESCALATION LADDER, asked of the actions
 * themselves rather than of their count or of the screen's width.
 *
 * The engine was asked what this group really holds, and it holds different
 * things depending on what is open:
 *
 *     truco pendiente ... [call-envido:envido]                        1 button
 *     envido escalado ... [envidoEnvido, realEnvido, faltaEnvido]     3 buttons
 *
 * Folding the first under "Subir" would be a lie: cantar envido while a truco
 * sits unanswered is not raising the truco, it is a different call entirely --
 * and it fits the band anyway. So the fold needs every opening to escalate the
 * SAME chain as the answer being owed, and at least two of them to be worth
 * folding at all.
 */
function foldsIntoLadder(responses: readonly Action[], openings: readonly Action[]): boolean {
  if (responses.length === 0 || openings.length < 2) return false;
  const owed = chainOf(responses[0]!);
  return owed !== null && openings.every((action) => chainOf(action) === owed);
}

/* Document-unique, and fresh per render: ids must not collide and this module
 * cannot know how many tables a document holds. Toggle and region are built in
 * the same render, so the pair can never dangle -- the same discipline
 * `senas.ts` states for its own picker. */
let ladderSequence = 0;

function buildGroup(actions: readonly Action[], kind: "response" | "opening", dispatch: (action: Action) => void): HTMLElement | null {
  const group = document.createElement("div");
  group.className = `hexdev-truco-calls-group hexdev-truco-calls-group--${kind}`;
  for (const action of actions) {
    const label = labelFor(action);
    if (label === null) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hexdev-truco-call";
    button.dataset.action = action.type;
    // Focus-continuity identity (focus-continuity.ts): data-action alone is
    // ambiguous inside a group — quiero and no-quiero are BOTH respond-truco,
    // and an envido chain offers several call-envido levels at once.
    // Restoring focus onto the wrong sibling would arm a different action
    // than the one the player was standing on, so each button carries the
    // full discriminant the action itself has.
    if (action.type === "respond-truco" || action.type === "respond-envido") button.dataset.response = action.response;
    if (action.type === "call-truco" || action.type === "call-envido") button.dataset.level = action.level;
    button.textContent = label;
    button.addEventListener("click", () => dispatch(action));
    group.appendChild(button);
  }
  return group.childElementCount > 0 ? group : null;
}

/**
 * Renders exactly one button per legal call action (spec: "Calls MUST be
 * shown only when legal, taken from the engine's legal actions"). No
 * legality is derived here or anywhere in this package — `legalActions` is
 * whatever `getLegalActions` already returned, unfiltered by any local rule.
 * Clicking a button dispatches THAT EXACT action object, never a
 * reconstructed one, so there is no seam where the UI could invent an action
 * the engine never offered.
 *
 * Grouped into two clusters, response first: answering a pending call reads
 * as a distinct decision from opening or escalating a new one. A group with
 * no legal actions is never rendered as an empty container.
 */
export function renderCalls(container: HTMLElement, legalActions: readonly Action[], dispatch: (action: Action) => void): void {
  /* READ BEFORE THE WIPE. Every server broadcast rebuilds this row, and a
   * ladder a player deliberately opened must not slam shut a fraction of a
   * second later -- the same defect the side rail's own `data-open` read
   * exists to prevent, and the same fix. */
  const wasOpen = container.querySelector('.hexdev-truco-calls-group[data-open="true"]') !== null;
  container.replaceChildren();
  const responses = legalActions.filter(isResponse);
  /* FILTERED TO WHAT BECOMES A BUTTON, and that is what makes the fold below
   * correct rather than merely plausible. The engine's real legal-actions list
   * carries play-card, send-sena and consult-partner too -- none of which this
   * row draws -- and a first version asked whether EVERY opening escalated the
   * owed chain against that unfiltered list. It never did, so the ladder never
   * folded on a real table while a unit test handed a clean array of calls and
   * passed. Measured at 320px: the group still wanted 383px and still hid 279
   * of them. */
  const openings = legalActions.filter((action) => !isResponse(action) && labelFor(action) !== null);

  const responseGroup = buildGroup(responses, "response", dispatch);
  const openingGroup = buildGroup(openings, "opening", dispatch);
  if (responseGroup !== null) container.appendChild(responseGroup);
  if (openingGroup !== null) {
    if (foldsIntoLadder(responses, openings)) fold(openingGroup, wasOpen);
    container.appendChild(openingGroup);
  }
}

/**
 * Turns an escalation group into one button plus a region it reveals.
 *
 * The revealed ladder is a POPOVER above the band, not more buttons inside it,
 * and that is the whole point rather than a detail: unfolded inline it would
 * need the room it never had -- 184px of owed answer plus 383px of ladder in
 * the 296 a 320px band has. Floating, it wraps over the felt and leaves the
 * answer underneath reachable the entire time, which is the same shape and the
 * same argument as `.hexdev-truco-senas-row`, the picker this table already
 * opens that way.
 *
 * From 900px up the band has room for all of it and the stylesheet unfolds the
 * ladder in place, toggle hidden. Decided in CSS because it is a question about
 * the box's width, and this package has never measured its own box -- see the
 * container-query note on `.hexdev-truco-table-shell` for why an embedded
 * widget cannot ask the viewport.
 */
function fold(group: HTMLElement, wasOpen: boolean): void {
  const ladder = document.createElement("div");
  ladder.className = "hexdev-truco-calls-ladder";
  ladder.id = `hexdev-truco-calls-ladder-${String(++ladderSequence)}`;
  ladder.append(...group.children);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "hexdev-truco-call hexdev-truco-escalate-toggle";
  toggle.dataset.action = "escalate-toggle";
  toggle.textContent = TABLE_STRINGS.escalateToggle;
  // WCAG 4.1.2: aria-expanded promises a revealable region, aria-controls is
  // what NAMES it. Both from the first render, never merely added on open.
  toggle.setAttribute("aria-expanded", String(wasOpen));
  toggle.setAttribute("aria-controls", ladder.id);
  toggle.addEventListener("click", () => {
    const open = group.dataset.open !== "true";
    group.dataset.open = String(open);
    toggle.setAttribute("aria-expanded", String(open));
  });

  group.dataset.fold = "true";
  group.dataset.open = String(wasOpen);
  group.append(toggle, ladder);
}
