import { ensureChromeStyles } from "./chrome-styles.js";
import { STRINGS } from "./i18n.js";

/** Replaces the container's content with a single status paragraph — the
 * same shape `main.ts`'s own former ad-hoc `renderStatus` closure used, now
 * extracted so it is unit-testable on its own. Chrome-styled (design §10):
 * this is the frame around the game, never the table's own identity. */
export function renderStatusMessage(container: HTMLElement, message: string): void {
  ensureChromeStyles(container.ownerDocument);
  container.replaceChildren();
  container.className = "hexdev-gamify-chrome";
  const el = document.createElement("p");
  el.className = "hexdev-chrome-status";
  el.textContent = message;
  container.appendChild(el);
}

/**
 * Surfaces a failed join to the player instead of leaving the UI doing
 * nothing at all (bug fix, obs 2968/issue 2: a rejected join used to look
 * exactly like a broken button — no message, no way forward). Shows the
 * message AND a "Reintentar" button; `onRetry` is whatever the caller wants
 * to happen on a second attempt (`main.ts` re-runs the exact same action).
 */
export function renderErrorWithRetry(container: HTMLElement, message: string, onRetry: () => void): void {
  ensureChromeStyles(container.ownerDocument);
  container.replaceChildren();
  container.className = "hexdev-gamify-chrome";
  const el = document.createElement("p");
  el.className = "hexdev-chrome-status";
  el.textContent = message;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "retry";
  button.textContent = STRINGS.retry;
  button.addEventListener("click", onRetry);
  container.append(el, button);
}
