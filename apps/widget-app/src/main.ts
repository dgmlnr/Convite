import { parseTargetOrigin } from "@hexdev/widget-protocol";
import type { GameId } from "@hexdev/platform-contract";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";
import { createTransportClient, joinMatchFromReservation, joinMatchmakingQueue, startBotMatch, watchPresence } from "@hexdev/transport-colyseus-client";
import type { MatchConnection } from "@hexdev/transport-colyseus-client";
import { readInlineBootstrap, type CatalogEntry } from "./bootstrap-data.js";
import { connectToHost } from "./handshake.js";
import { STRINGS } from "./i18n.js";
import { deriveWsEndpoint } from "./match-flow.js";
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

  function renderStatus(message: string): void {
    app!.replaceChildren();
    const el = document.createElement("p");
    el.textContent = message;
    app!.appendChild(el);
  }

  /**
   * The real join succeeded — a genuine `MatchConnection` from
   * `@hexdev/transport-colyseus-client`, either the bot path (immediate) or
   * the human-pairing path (after `onPaired`). The actual in-match game
   * table (design's own explicit scope boundary, unchanged by this unit) is
   * NOT built here: this renders the smallest HONEST proof that the
   * connection is live and receiving real server-pushed state, generic
   * across any game (never inspects the view's shape — the port is
   * game-agnostic, per this unit's own requirement).
   */
  function enterMatch(connection: MatchConnection<unknown>): void {
    handshake.sendLayout("fullscreen");
    app!.replaceChildren();
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
  }

  async function boot(): Promise<void> {
    if (bootstrap === undefined) {
      // Defense in depth only: in practice the server never even loads this
      // script when the mint fails (embed-shell.ts omits the app script tag
      // entirely on failure), so this branch should be unreachable.
      renderError(STRINGS.loadError);
      return;
    }
    const client = createTransportClient(deriveWsEndpoint(window.location));
    await renderSelection(client, bootstrap.catalog, bootstrap.playerId, bootstrap.token);
  }

  async function renderSelection(client: ReturnType<typeof createTransportClient>, catalog: readonly CatalogEntry[], playerId: string, token: string): Promise<void> {
    const presenceByGame = new Map<GameId, readonly LobbyDisplayEntry[]>();

    function rerender(): void {
      renderGameSelection(app!, catalog, presenceByGame, {
        onPlayVsPerson: (gameId, modality) => {
          renderStatus(STRINGS.searchingOpponent);
          void joinMatchmakingQueue(client, { gameId, modality, playerId, token }).then((queue) => {
            queue.onPaired((pairing) => {
              void joinMatchFromReservation(client, pairing.reservation).then(enterMatch);
            });
            queue.onPairingFailed((message) => renderError(STRINGS.pairingFailed(message)));
          });
        },
        onPlayVsBot: (gameId, modality, tier) => {
          void startBotMatch(client, { gameId, config: modality, botTier: tier, playerId, token }).then(enterMatch);
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
        rerender();
      });
    }
    rerender();
  }
}

main();
