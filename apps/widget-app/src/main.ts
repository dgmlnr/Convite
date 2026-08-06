import { parseTargetOrigin } from "@hexdev/widget-protocol";
import type { GameId } from "@hexdev/platform-contract";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";
import { fetchPresence, readInlineBootstrap, type CatalogEntry } from "./bootstrap-data.js";
import { connectToHost } from "./handshake.js";
import { STRINGS } from "./i18n.js";
import { applyThemeToRoot } from "./theme.js";
import { renderGameSelection } from "./game-selection.js";

/**
 * The widget-app composition root — wires the pieces every other module in
 * this package already tests in isolation (`handshake.ts`, `theme.ts`,
 * `bootstrap-data.ts`, `game-selection.ts`) into the one thing that actually
 * runs inside the iframe. Like `apps/server/src/index.ts`, this file is
 * deliberately thin and verified live (the manual end-to-end run in
 * apply-progress), not by a dedicated unit test of its own — there is no
 * production LOGIC here that isn't already covered where it lives.
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

  function renderMatchPlaceholder(): void {
    handshake.sendLayout("fullscreen");
    app!.replaceChildren();
    const el = document.createElement("p");
    el.textContent = STRINGS.matchPlaceholder;
    app!.appendChild(el);
  }

  async function boot(): Promise<void> {
    if (bootstrap === undefined) {
      // Defense in depth only: in practice the server never even loads this
      // script when the mint fails (embed-shell.ts omits the app script tag
      // entirely on failure), so this branch should be unreachable.
      renderError(STRINGS.loadError);
      return;
    }
    await renderSelection(bootstrap.catalog);
  }

  async function renderSelection(catalog: readonly CatalogEntry[]): Promise<void> {
    const presenceEntries = await Promise.all(catalog.map((entry) => fetchPresence(window.fetch.bind(window), entry.id)));
    const presenceByGame = new Map<GameId, readonly LobbyDisplayEntry[]>(catalog.map((entry, index) => [entry.id, presenceEntries[index] ?? []]));
    renderGameSelection(app!, catalog, presenceByGame, {
      // The in-match game UI (table, hand, calls) is explicitly NOT in this
      // unit — real room-joining needs the colyseus.js browser client, which
      // cannot be added here without putting colyseus in a second
      // package.json (a hard architectural rule this unit honors). Both
      // callbacks prove the ONE piece of real, buildable behavior available
      // right now: the "inline that expands" layout transition (design
      // §6/obs 2955), disclosed honestly rather than faked as a working join.
      onPlayVsPerson: () => renderMatchPlaceholder(),
      onPlayVsBot: () => renderMatchPlaceholder(),
    });
  }
}

main();
