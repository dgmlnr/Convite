import type { Action } from "@hexdev/truco-engine";
import { CALL_LABELS } from "./strings.js";

/** Every call this row can label — deliberately excludes `play-card`, which
 * renders on the hand itself (tapping a card), not as a call button. */
function labelFor(action: Action): string | null {
  if (action.type === "call-truco") return CALL_LABELS[action.level];
  if (action.type === "call-envido") return CALL_LABELS[action.level];
  if (action.type === "respond-truco" || action.type === "respond-envido") {
    return action.response === "quiero" ? CALL_LABELS.quiero : CALL_LABELS.noQuiero;
  }
  if (action.type === "reveal-envido") return CALL_LABELS.revealEnvido;
  return null; // play-card — not a "call"
}

/** Answering an already-open call (quiero/no quiero) is a different kind of
 * decision from opening or escalating one (truco/envido/mostrar envido) —
 * spec: "they should not read as one undifferentiated row". */
function isResponse(action: Action): boolean {
  return action.type === "respond-truco" || action.type === "respond-envido";
}

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
  container.replaceChildren();
  const responses = legalActions.filter(isResponse);
  const openings = legalActions.filter((action) => !isResponse(action));

  const responseGroup = buildGroup(responses, "response", dispatch);
  const openingGroup = buildGroup(openings, "opening", dispatch);
  if (responseGroup !== null) container.appendChild(responseGroup);
  if (openingGroup !== null) container.appendChild(openingGroup);
}
