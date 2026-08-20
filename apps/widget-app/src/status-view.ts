import { ensureChromeStyles } from "./chrome-styles.js";
import { STRINGS } from "./i18n.js";

/**
 * WCAG 4.1.3 — the chrome's own announcer, and the one node on these screens
 * that must survive a render.
 *
 * Every function below replaces the container's content: "Buscando
 * jugadores…" lands, a join failure replaces it, a retry replaces that. On
 * screen each step is obvious; to a screen reader none of it happened, because
 * a live region is announced when its CONTENT CHANGES while it sits in the
 * accessibility tree, and a brand-new region that happens to contain text is
 * not a change to anything — it is a new region. The status card cannot be the
 * region for exactly that reason: it is rebuilt on every call.
 *
 * This is truco-ui's `announcer.ts` argument one layer up, and the mechanism
 * is deliberately the same rather than a second one. It is REBUILT here rather
 * than imported because the chrome must not depend on any one game's UI
 * package (`.dependency-cruiser.cjs`); what is shared is the discipline, not
 * the module — POLITE (none of this is an emergency), ATOMIC ("No pudimos
 * conectarte a la partida. Probá de nuevo." is one statement), and written
 * only on a real change so a repeated render is not a repeated announcement.
 *
 * Its LIFETIME is the chrome's status screens. `renderGameSelection` still
 * wipes the container wholesale, which is correct: leaving for the lobby ends
 * this conversation, and coming back opens a new one.
 */
const ANNOUNCER_NAME = "chrome-status";

function ensureAnnouncer(container: HTMLElement): HTMLElement {
  const existing = container.querySelector<HTMLElement>(`[data-announces="${ANNOUNCER_NAME}"]`);
  if (existing !== null && existing.parentElement === container) return existing;
  const announcer = container.ownerDocument.createElement("p");
  announcer.className = "hexdev-chrome-announcer";
  announcer.dataset.announces = ANNOUNCER_NAME;
  announcer.setAttribute("aria-live", "polite");
  announcer.setAttribute("aria-atomic", "true");
  // Pinned to its own default ("additions text"), which excludes removals —
  // stated explicitly so a later edit cannot quietly add `removals` and turn
  // every screen change into a second, meaningless announcement.
  announcer.setAttribute("aria-relevant", "additions text");
  container.appendChild(announcer);
  return announcer;
}

/**
 * Opens one chrome screen: styles the container, marks the view, and hands
 * back the fresh `.hexdev-chrome-content` wrapper to fill.
 *
 * Deliberately NOT `container.replaceChildren()`, which is what both callers
 * used to do. `replaceChildren` removes every child before re-inserting — even
 * a child handed straight back to it — so it cannot express "wipe all but
 * this one", and a region detached for even a single render is a region a
 * reader stops watching. Removing the others individually keeps it
 * continuously attached, the same correction `table.ts` already made on the
 * felt.
 */
function openScreen(container: HTMLElement, view: "status" | "error", message: string): HTMLElement {
  ensureChromeStyles(container.ownerDocument);
  const announcer = ensureAnnouncer(container);
  for (const child of [...container.children]) {
    if (child !== announcer) child.remove();
  }
  container.className = "hexdev-gamify-chrome";
  // WCR-1/WCR-3: gates the container-type declaration and the centered-card
  // treatment chrome-styles.ts's [data-chrome-view] rules apply.
  container.dataset.chromeView = view;

  // The equality guard is load-bearing, not an optimization: a caller may
  // re-render the same screen, and a reader that treats every write as a
  // change would repeat the sentence each time.
  if (announcer.textContent !== message) announcer.textContent = message;

  // The SAME .hexdev-chrome-content wrapper game-selection.ts introduces
  // (chrome-styles.ts defines it once) — no new CSS class here, just the same
  // centering mechanism applied to a single-card screen.
  const content = container.ownerDocument.createElement("div");
  content.className = "hexdev-chrome-content";
  container.appendChild(content);
  return content;
}

/** Replaces the container's content with a single status paragraph — the
 * same shape `main.ts`'s own former ad-hoc `renderStatus` closure used, now
 * extracted so it is unit-testable on its own. Chrome-styled (design §10):
 * this is the frame around the game, never the table's own identity. */
export function renderStatusMessage(container: HTMLElement, message: string): void {
  const content = openScreen(container, "status", message);
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
  const content = openScreen(container, "error", message);
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
