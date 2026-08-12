import { ensureChromeStyles } from "./chrome-styles.js";
import { STRINGS } from "./i18n.js";

/**
 * The live handle `main.ts` keeps across every subsequent `connection.onView`
 * message once this fallback is showing -- the button/listener/title/body
 * copy never need to change again, only the meta line's own live counter.
 */
export interface UnsupportedGameView {
  /** Mutates ONLY the meta line's textContent -- the button, its click
   * listener, and the title/body copy are untouched by every call. */
  readonly setUpdateCount: (count: number) => void;
}

/**
 * The unregistered-game fallback (design §10.2, WCR-3): a real match, a real
 * live `MatchConnection` -- just no renderer registered for this `gameId` in
 * this build's `gameUiRegistry` (see `main.ts`'s own `enterMatch`). Renders
 * as the SAME chrome/card language every other screen in this package uses
 * (`status-view.ts`'s `renderStatusMessage`/`renderErrorWithRetry` are the
 * template this follows: `.hexdev-gamify-chrome` > `.hexdev-chrome-content` >
 * `.hexdev-chrome-status` card), not the bare unstyled `<p>` dead end this
 * replaces -- and, unlike that former dead end, offers a real way back to
 * the lobby instead of leaving the player stranded.
 */
export function renderUnsupportedGame(container: HTMLElement, options: { readonly onBackToLobby: () => void }): UnsupportedGameView {
  ensureChromeStyles(container.ownerDocument);
  container.replaceChildren();
  container.className = "hexdev-gamify-chrome";
  // WCR-3: gates chrome-styles.ts's [data-chrome-view="unsupported"]
  // centered-card rule -- unreachable before this task (the PR6a review's
  // own "unreachable selector" SUGGESTION), since nothing ever set this
  // value until now.
  container.dataset.chromeView = "unsupported";

  const content = document.createElement("div");
  content.className = "hexdev-chrome-content";
  container.appendChild(content);

  // The status-card body: one card holding title + body copy + the live
  // meta line + the way back, same "status-card body" role
  // .hexdev-chrome-status already plays for status-view.ts's single-message
  // screens, just with more than one child this time.
  const card = document.createElement("div");
  card.className = "hexdev-chrome-status";
  content.appendChild(card);

  // Confirms the connection really is real (reusing the existing
  // matchConnected copy, same string the former dead end already showed) --
  // no new i18n key needed for this part.
  const title = document.createElement("h1");
  title.textContent = STRINGS.matchConnected;

  const body = document.createElement("p");
  body.textContent = STRINGS.gameNotAvailable;

  // The honest connection-is-real proof (PR6-T10): every genuine server
  // message bumps this, so a player (or a future debugger) can tell "stuck
  // because unsupported" apart from "stuck because actually disconnected".
  const meta = document.createElement("p");
  meta.textContent = STRINGS.liveUpdatesReceived(0);

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "back-to-lobby";
  button.textContent = STRINGS.backToLobby;
  button.addEventListener("click", options.onBackToLobby);

  card.append(title, body, meta, button);

  return {
    setUpdateCount: (count) => {
      meta.textContent = STRINGS.liveUpdatesReceived(count);
    },
  };
}
