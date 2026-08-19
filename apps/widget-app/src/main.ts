import { parseTargetOrigin } from "@hexdev/widget-protocol";
import type { GameId } from "@hexdev/platform-contract";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";
import { createTransportClient, joinMatchFromReservation, joinMatchmakingQueue, reconnectMatch, startBotMatch, watchPresence } from "@hexdev/transport-colyseus-client";
import type { ErasedAction, MatchConnection } from "@hexdev/transport-colyseus-client";
import { readInlineBootstrap, type CatalogEntry } from "./bootstrap-data.js";
import { createGameUiRegistry, type GameUiPayload } from "./game-ui-registry.js";
import { connectToHost } from "./handshake.js";
import {
  clearPersistedMatchSession,
  getBrowserStorage,
  persistMatchSession,
  persistPlayerId,
  readPersistedMatchSession,
  readPersistedPlayerId,
  type StorageLike,
} from "./identity-storage.js";
import { STRINGS } from "./i18n.js";
import { createDepartureGate, tryResumeSession, withFreshToken } from "./join-flow.js";
import { deriveWsEndpoint } from "./match-flow.js";
import { renewSessionToken } from "./session-renewal.js";
import { renderErrorWithRetry, renderStatusMessage } from "./status-view.js";
import { applyThemeToRoot } from "./theme.js";
import { renderGameSelection } from "./game-selection.js";
import { renderUnsupportedGame } from "./unsupported-game-view.js";

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

  // Not a network call: the browser's own navigation to this URL is what
  // minted this session server-side (see readInlineBootstrap's doc comment
  // for why a second same-origin fetch cannot carry origin evidence).
  const bootstrap = readInlineBootstrap(window);

  // PRIMARY theming path (design §10): the tenant's server-delivered theme
  // applies the moment it is readable, with ZERO loader involvement — it
  // does not wait for the `host-hello` postMessage handshake at all, unlike
  // the secondary host-override path below. This is what makes "zero loader
  // involvement" a real, checkable property rather than a claim: a tenant
  // with a configured theme and a host page that never sends ANY
  // `host-hello` at all (a stale/misbehaving loader build) still renders
  // themed.
  applyThemeToRoot(document.documentElement, bootstrap?.theme);

  // SECONDARY path: the host page's own `data-theme-*` override, forwarded
  // by the loader in `host-hello`. Applied SECOND, on top of the tenant
  // theme already set above — `applyThemeToRoot` only touches a CSS custom
  // property for a token PRESENT in its own argument (see its own
  // docstring), so this is a per-token override, not a wholesale replace: a
  // token the host page never mentions keeps the tenant's server value (see
  // `theme.browser.test.ts`'s own precedence-rule test for the exact proof
  // and its justification — the host page is the SAME tenant's own site,
  // not a third party, so letting it win per-token is more precise tenant
  // intent, not a trust violation).
  const handshake = connectToHost(window.parent, window, hostOrigin, (hostHello) => {
    applyThemeToRoot(document.documentElement, hostHello.payload.theme);
    void boot();
  });

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
  function enterMatch(gameId: GameId, connection: MatchConnection<unknown>, onLeaveMatch: () => void): void {
    handshake.sendLayout("fullscreen");
    app!.replaceChildren();

    const entry = gameUiRegistry.get(gameId);
    if (entry === undefined) {
      // WCR-3/PR6-T12: a real match, a real live connection -- just no
      // renderer registered for this gameId in this build. The chrome-styled
      // navigable screen (unsupported-game-view.ts) replaces the former bare
      // <p> dead end; onLeaveMatch already IS returnToSelection(connection)
      // at every call site below, so this wires straight through rather than
      // reimplementing any of its four steps.
      const view = renderUnsupportedGame(app!, { onBackToLobby: onLeaveMatch });
      let updates = 0;
      connection.onView(() => view.setUpdateCount(++updates));
      return;
    }

    const render = entry.createRenderer();
    connection.onView((payload) => render(app!, payload as GameUiPayload, (action) => connection.sendAction(action as ErasedAction), onLeaveMatch));
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
    const storage = getBrowserStorage(window);
    // Player identity survives a reload within THIS browser's own storage
    // partition (design §7: partitioned per top-level TENANT site by every
    // modern browser — the same anonymous person on two different tenants'
    // sites correctly stays two different players, storage partitioning's
    // own guarantee, not a bug this works around). Falls back to the fresh,
    // server-minted id THIS load's own `/embed` mint already produced when no
    // persisted id exists yet (first-ever visit) or storage is
    // blocked/unavailable — identical to today's behavior in either case.
    // The server remains sole authority either way: reusing an old id here
    // only changes WHICH already-permitted `/session/renew` call this load
    // makes later, never grants anything a fresh id could not already ask
    // for (see embed-handler.ts's own doc comment on why a client-supplied
    // id "names no privilege").
    const playerId = readPersistedPlayerId(storage) ?? bootstrap.playerId;
    persistPlayerId(storage, playerId);
    await renderSelection(client, bootstrap.catalog, playerId, embedKey, storage);
  }

  async function renderSelection(
    client: ReturnType<typeof createTransportClient>,
    catalog: readonly CatalogEntry[],
    playerId: string,
    embedKey: string,
    storage: StorageLike | undefined,
  ): Promise<void> {
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

    // The moment someone most wants another match is right after finishing
    // one (spec) — leaves the just-ended connection (fire-and-forget: the
    // server's own reconnection window is irrelevant to a genuine, consented
    // exit, same `leave(false)` default `match-connection.ts` already
    // documents), un-departs the gate so live presence updates resume
    // redrawing the selection screen, and redraws it immediately with
    // whatever counts are already known — never a re-fetch, never a second
    // `/embed` round trip.
    function returnToSelection(connection: MatchConnection<unknown>): void {
      void connection.leave();
      // The match this session's own reload-resume would otherwise try to
      // rejoin is over (a real ending, or a deliberate leave) — leaving the
      // entry behind would only cost one doomed `reconnectMatch` attempt on
      // a later boot (it fails closed, see the resume attempt below), never
      // a correctness issue, but there is no reason to keep it around.
      clearPersistedMatchSession(storage);
      handshake.sendLayout("inline"); // design §3: "inline that expands" — collapses back once there is no match to fill the screen with
      departureGate.reset();
      rerender();
    }

    function rerender(): void {
      renderGameSelection(app!, catalog, presenceByGame, {
        onPlayVsPerson: (gameId, modality) => {
          departureGate.markDeparted();
          const attempt = (): void => {
            renderStatusMessage(app!, STRINGS.searchingPlayers);
            void withFreshToken(renewToken, (token) => joinMatchmakingQueue(client, { gameId, modality, playerId, token }))
              .then((queue) => {
                queue.onPaired((pairing) => {
                  void joinMatchFromReservation(client, pairing.reservation)
                    .then((connection) => {
                      persistMatchSession(storage, { gameId, reconnectionToken: connection.reconnectionToken });
                      enterMatch(gameId, connection, () => returnToSelection(connection));
                    })
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
            renderStatusMessage(app!, STRINGS.searchingPlayers);
            void withFreshToken(renewToken, (token) => startBotMatch(client, { gameId, config: modality, botTier: tier, playerId, token }))
              .then((connection) => {
                persistMatchSession(storage, { gameId, reconnectionToken: connection.reconnectionToken });
                enterMatch(gameId, connection, () => returnToSelection(connection));
              })
              .catch(() => renderErrorWithRetry(app!, STRINGS.joinFailed, attempt));
          };
          attempt();
        },
      });
    }

    // Identity survives a reload (apply prompt): a match this SAME browser
    // was seated in before a reload gets ONE attempt to resume, BEFORE the
    // catalog is ever shown — a returning player mid-match should never see
    // the lobby flash by first. `reconnectMatch` is colyseus's OWN
    // reconnection-window path (`ClientLike.reconnect`), the exact SAME
    // server-side verification `MatchRoom.onLeave`'s `allowReconnection`
    // already requires for an in-tab network blip (spec "Disconnect,
    // Reconnection Window, and Bot Takeover") — this only widens WHEN that
    // proof can be presented (surviving a reload via storage, not merely a
    // live tab's own memory), never WHO can present it or what proves it: a
    // rejection (window expired, a bot already took the seat, the room is
    // gone) is not transient, so `tryResumeSession` swallows it and this
    // falls through to the ordinary catalog below, exactly as if no
    // persisted session had ever existed.
    const pendingSession = readPersistedMatchSession(storage);
    const resumed = await tryResumeSession(pendingSession, (session) => reconnectMatch(client, session.reconnectionToken));
    if (resumed !== undefined && pendingSession !== undefined) {
      departureGate.markDeparted();
      persistMatchSession(storage, { gameId: pendingSession.gameId, reconnectionToken: resumed.reconnectionToken });
      enterMatch(pendingSession.gameId as GameId, resumed, () => returnToSelection(resumed));
      return;
    }
    if (pendingSession !== undefined) clearPersistedMatchSession(storage);

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
