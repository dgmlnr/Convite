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
  // WCR-1/WCR-3: gates the container-type declaration and the centered-card
  // treatment chrome-styles.ts's [data-chrome-view="status"] rule applies.
  container.dataset.chromeView = "status";
  // Reuses the SAME .hexdev-chrome-content wrapper game-selection.ts
  // introduces (chrome-styles.ts defines it once) — no new CSS class here,
  // just the same centering mechanism applied to a single-card screen.
  const content = document.createElement("div");
  content.className = "hexdev-chrome-content";
  container.appendChild(content);
  const el = document.createElement("p");
  el.className = "hexdev-chrome-status";
  el.textContent = message;
  content.appendChild(el);
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
  container.dataset.chromeView = "error";
  const content = document.createElement("div");
  content.className = "hexdev-chrome-content";
  container.appendChild(content);
  const el = document.createElement("p");
  el.className = "hexdev-chrome-status";
  el.textContent = message;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "retry";
  button.textContent = STRINGS.retry;
  button.addEventListener("click", onRetry);
  content.append(el, button);
}
