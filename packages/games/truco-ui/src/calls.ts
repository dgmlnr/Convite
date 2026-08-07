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

/**
 * Renders exactly one button per legal call action (spec: "Calls MUST be
 * shown only when legal, taken from the engine's legal actions"). No
 * legality is derived here or anywhere in this package — `legalActions` is
 * whatever `getLegalActions` already returned, unfiltered by any local rule.
 * Clicking a button dispatches THAT EXACT action object, never a
 * reconstructed one, so there is no seam where the UI could invent an action
 * the engine never offered.
 */
export function renderCalls(container: HTMLElement, legalActions: readonly Action[], dispatch: (action: Action) => void): void {
  container.replaceChildren();
  for (const action of legalActions) {
    const label = labelFor(action);
    if (label === null) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hexdev-truco-call";
    button.dataset.action = action.type;
    button.textContent = label;
    button.addEventListener("click", () => dispatch(action));
    container.appendChild(button);
  }
}
