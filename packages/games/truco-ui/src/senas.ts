import type { Action, SenaSignal } from "@hexdev/truco-engine";
import { SENA_LABELS, TABLE_STRINGS } from "./strings.js";

type SendSena = Extract<Action, { type: "send-sena" }>;

/**
 * The señas affordance (spec: "discoverable without being noisy"). Renders
 * NOTHING at all when no `send-sena` action is legal — the same convention
 * `renderCalls` already applies for a legality-gated action, and exactly
 * how 1v1 stays untouched: `getLegalSenaActions` never offers this action
 * outside a 2v2 match (a player with a teammate), so there is no separate
 * feature flag to check here, only the same legal-actions list every other
 * button already reads from.
 *
 * When señas ARE legal, shows exactly one small toggle button — never the
 * six signals up front, which would nag a player who does not care about
 * señas (spec's own explicit requirement). The six only appear once the
 * player deliberately opens it.
 */
export function renderSenaPicker(container: HTMLElement, legalActions: readonly Action[], dispatch: (action: Action) => void): void {
  container.replaceChildren();
  const legalSenas = legalActions.filter((action): action is SendSena => action.type === "send-sena");
  if (legalSenas.length === 0) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "hexdev-truco-senas-toggle";
  toggle.dataset.action = "senas-toggle";
  toggle.textContent = TABLE_STRINGS.senasToggle;

  const row = document.createElement("div");
  row.className = "hexdev-truco-senas-row";

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

  toggle.addEventListener("click", () => {
    open = !open;
    renderRow();
  });

  container.append(toggle, row);
}

/**
 * The teammate's most recent claimed signal (`TeammateView.lastSena`) —
 * structurally the ONLY place this can ever render from, since
 * `OpponentView` has no field capable of holding one at all (design §4's
 * redaction discipline, extended to señas). Renders nothing when the
 * teammate has not signaled this hand.
 */
export function renderPartnerSena(container: HTMLElement, signal: SenaSignal | null): void {
  container.replaceChildren();
  if (signal === null) return;
  container.className = "hexdev-truco-partner-sena";
  const label = document.createElement("span");
  label.textContent = `${TABLE_STRINGS.senaSentBy} ${SENA_LABELS[signal]}`;
  container.appendChild(label);
}
