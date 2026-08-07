import { parseTargetOrigin } from "@hexdev/widget-protocol";
import type { GameId } from "@hexdev/platform-contract";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";
import { createTransportClient, joinMatchFromReservation, joinMatchmakingQueue, startBotMatch, watchPresence } from "@hexdev/transport-colyseus-client";
import type { ErasedAction, MatchConnection } from "@hexdev/transport-colyseus-client";
import { readInlineBootstrap, type CatalogEntry } from "./bootstrap-data.js";
import { createGameUiRegistry, type GameUiPayload } from "./game-ui-registry.js";
import { connectToHost } from "./handshake.js";
import { STRINGS } from "./i18n.js";
import { createDepartureGate, withFreshToken } from "./join-flow.js";
import { deriveWsEndpoint } from "./match-flow.js";
import { renewSessionToken } from "./session-renewal.js";
import { renderErrorWithRetry, renderStatusMessage } from "./status-view.js";
import { applyThemeToRoot } from "./theme.js";
import { renderGameSelection } from "./game-selection.js";

/**
 * The widget-app composition root — wires the pieces every other module in
 * this package already tests in isolation (`handshake.ts`, `theme.ts`,
 * `bootstrap-data.ts`, `match-flow.ts`, `game-selection.ts`, and
 * `@hexdev/transport-colyseus-client`'s own extensively-tested connection
 * logic) into the one thing that actually runs inside the iframe. Like
 * `apps/server/src/index.ts`, this file is deliberately thin and verified
 * live (the two-origin Playwright run in apply-progress), not by a
 * dedicated unit test of its own — there is no production LOGIC here that
 * isn't already covered where it lives.
 */
function main(): void {
  const app = document.getElementById("hexdev-gamify-app");
  if (app === null) return;

  const params = new URLSearchParams(window.location.search);
  const hostOriginRaw = params.get("o");
  if (hostOriginRaw === null || hostOriginRaw === "") return; // nothing to talk to
  // The SAME `k` this URL's own `/embed?k=&o=` navigation minted the
  // bootstrap session with — needed again for `/session/renew` (obs 2968),
  // never a secret (design §7: "same trust model as a Stripe publishable key").
  const embedKey = params.get("k");

  let hostOrigin: ReturnType<typeof parseTargetOrigin>;
  try {
    hostOrigin = parseTargetOrigin(hostOriginRaw);
  } catch {
    return; // malformed/untrusted origin value — refuse to proceed, same fail-closed posture as the loader
  }

  const handshake = connectToHost(window.parent, window, hostOrigin, (hostHello) => {
    applyThemeToRoot(document.documentElement, hostHello.payload.theme);
    void boot();
  });

  // Not a network call: the browser's own navigation to this URL is what
  // minted this session server-side (see readInlineBootstrap's doc comment
  // for why a second same-origin fetch cannot carry origin evidence).
  const bootstrap = readInlineBootstrap(window);

  const resizeObserver = new ResizeObserver(() => {
    handshake.sendResize(document.documentElement.scrollHeight);
  });
  resizeObserver.observe(document.documentElement);

  function renderError(message: string): void {
    app!.replaceChildren();
    const el = document.createElement("p");
    el.textContent = message;
    app!.appendChild(el);
  }

  const gameUiRegistry = createGameUiRegistry();

  /**
   * The real join succeeded — a genuine `MatchConnection` from
   * `@hexdev/transport-colyseus-client`, either the bot path (immediate) or
   * the human-pairing path (after `onPaired`). `gameUiRegistry` is the ONLY
   * place this composition root knows a specific game's id (design §5's own
   * `GameUiRegistry` concept, the UI-side mirror of
   * `platform-core/registry.ts`'s `GameModuleRegistry`): a registered game
   * gets its real table; anything else falls back to the smallest HONEST
   * proof the connection is live, never a broken blank screen.
   */
  function enterMatch(gameId: GameId, connection: MatchConnection<unknown>): void {
    handshake.sendLayout("fullscreen");
    app!.replaceChildren();

    const entry = gameUiRegistry.get(gameId);
    if (entry === undefined) {
      const title = document.createElement("p");
      title.textContent = STRINGS.matchConnected;
      const counter = document.createElement("p");
      let updates = 0;
      counter.textContent = STRINGS.liveUpdatesReceived(updates);
      app!.append(title, counter);
      connection.onView(() => {
        updates += 1;
        counter.textContent = STRINGS.liveUpdatesReceived(updates);
      });
      return;
    }

    const render = entry.createRenderer();
    connection.onView((payload) => render(app!, payload as GameUiPayload, (action) => connection.sendAction(action as ErasedAction)));
  }

  async function boot(): Promise<void> {
    if (bootstrap === undefined || embedKey === null) {
      // Defense in depth only: in practice the server never even loads this
      // script when the mint fails (embed-shell.ts omits the app script tag
      // entirely on failure), so this branch should be unreachable.
      renderError(STRINGS.loadError);
      return;
    }
    const client = createTransportClient(deriveWsEndpoint(window.location));
    await renderSelection(client, bootstrap.catalog, bootstrap.playerId, embedKey);
  }

  async function renderSelection(client: ReturnType<typeof createTransportClient>, catalog: readonly CatalogEntry[], playerId: string, embedKey: string): Promise<void> {
    const presenceByGame = new Map<GameId, readonly LobbyDisplayEntry[]>();

    // A FRESH token minted right before the join it is for (obs 2968), never
    // the `/embed` page-load bootstrap token: in a widget embedded inside
    // someone else's content, the player deciding to play minutes after the
    // page loaded is normal, not an edge case, and that token's short TTL
    // (correctly short, for security) would otherwise reject a completely
    // legitimate join. See `renewSessionToken`/`renewSessionForWidget`'s own
    // docstrings for why this still goes through the same origin allowlist
    // and rate limiting `/embed` already enforces, just checked against this
    // server's own widget origin instead of the tenant's host page.
    const renewToken = (): Promise<string> => renewSessionToken(window.fetch.bind(window), { embedKey, playerId });

    // Bug fix, found running a real live join (not assumed): the presence
    // watchers below stay subscribed for the whole connection lifetime, and
    // their "counts" handler used to unconditionally call `rerender()` —
    // wiping out a connected-match view or the retry-offering error view
    // with the plain selection screen again within about a second of either
    // appearing. Once the player has committed to a join there is nothing
    // left for a live count to usefully redraw (see `createDepartureGate`'s
    // own docstring).
    const departureGate = createDepartureGate();

    function rerender(): void {
      renderGameSelection(app!, catalog, presenceByGame, {
        onPlayVsPerson: (gameId, modality) => {
          departureGate.markDeparted();
          const attempt = (): void => {
            renderStatusMessage(app!, STRINGS.searchingOpponent);
            void withFreshToken(renewToken, (token) => joinMatchmakingQueue(client, { gameId, modality, playerId, token }))
              .then((queue) => {
                queue.onPaired((pairing) => {
                  void joinMatchFromReservation(client, pairing.reservation)
                    .then((connection) => enterMatch(gameId, connection))
                    .catch(() => renderErrorWithRetry(app!, STRINGS.joinFailed, attempt));
                });
                queue.onPairingFailed((message) => renderErrorWithRetry(app!, STRINGS.pairingFailed(message), attempt));
              })
              // Covers BOTH a failed renewal and a rejected queue join (e.g.
              // an invalid/expired token) — the bug this unit fixes: before
              // this, a rejection here left the UI doing nothing at all.
              .catch(() => renderErrorWithRetry(app!, STRINGS.joinFailed, attempt));
          };
          attempt();
        },
        onPlayVsBot: (gameId, modality, tier) => {
          departureGate.markDeparted();
          const attempt = (): void => {
            renderStatusMessage(app!, STRINGS.searchingOpponent);
            void withFreshToken(renewToken, (token) => startBotMatch(client, { gameId, config: modality, botTier: tier, playerId, token }))
              .then((connection) => enterMatch(gameId, connection))
              .catch(() => renderErrorWithRetry(app!, STRINGS.joinFailed, attempt));
          };
          attempt();
        },
      });
    }

    // Real websocket presence, replacing HTTP polling (spec: "Lobby
    // Presence Counters Per Point-Target Room" delivered live). One
    // watch-only connection per catalog game — never enqueued, never
    // paired (transport-colyseus's companion fix) — updates re-render the
    // whole selection screen on every live "counts" broadcast.
    for (const entry of catalog) {
      const watcher = await watchPresence(client, { gameId: entry.id, playerId });
      watcher.onCounts((display) => {
        presenceByGame.set(entry.id, display);
        if (!departureGate.hasDeparted()) rerender();
      });
    }
    rerender();
  }
}

main();
